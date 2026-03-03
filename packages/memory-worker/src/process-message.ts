import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
// Import generateResponse as a separate function to avoid any naming conflicts
import {
  buildSystemPrompt,
  generateEmbedding
} from './ai-client';
// Import generateResponse and vision response explicitly
import { generateResponse as aiGenerateResponse, generateVisionResponse } from './ai-client';
// Import image utilities for vision feature
import {
  processAttachments,
  isImageAttachment,
  detectSceneReplicationIntent,
  ProcessedImage
} from './image-utils';
import {
  retrieveRelevantMemories,
  retrieveRelevantFacts,
  retrieveCoreFacts,
  retrieveConversationHistory,
  formatUserId,
  retrievePermanentFacts,
  retrieveSessionFacts,
  retrieveUserFactsHybrid,
  reinforceUsedFacts
} from './memory-utils';
// Import LLM-based fact extraction for permanent/important facts
import { processMessageForFacts } from './important-fact-extractor';
// Import task utility functions and Task type from task-utils.ts
import {
  dbCreateTask,
  dbGetTasks,
  dbUpdateTask,
  dbDeleteTask,
  type Task as TaskData 
} from './task-utils';
// Import web search service
import { performWebSearch, formatSearchResultsForPrompt } from './web-search-service';
import { processTTSForMessage } from './tts-service';
// Import URL reader for inline URL content
import { processMessageUrls, isAskingAboutUrl } from './url-reader';
import { type CalendarEvent, dbCreateEvent, dbGetEvents, dbUpdateEvent, dbDeleteEvent, dbFindEventByContent } from './calendar-utils';
// Import reminder services
import { createReminderService } from './reminder-service';
// MCP imports removed for performance

// Create a Supabase client for the memory worker
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Interface for message rows from the database
export interface MessageRow {
  id: string;
  content: string;
  user_id: string;
  room_id: string;
  created_at: string;
  role: string;
  metadata?: any; // Add optional metadata field
}

// System user ID for Maya's responses
const MAYA_SYSTEM_USER_ID = process.env.MAYA_SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000000';

// MCP client removed for cleaner responses

// Cached core facts to avoid repeated DB calls
let cachedCoreFacts: any[] = [];
let coreFactsLastUpdated = 0;
const CORE_FACTS_CACHE_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Add a message to the memory ingestion queue for batch processing
 * This runs in parallel with direct memory writes until we fully migrate
 * @returns boolean indicating if the message was successfully added to queue (false if already exists)
 */
export async function addToMemoryQueue(msg: MessageRow): Promise<boolean> {
  try {
    console.log('Adding message to memory ingestion queue for batch processing');
    
    // First check if this message has already been stored in maya_memories
    const { data: existingMemories, error: memoryError } = await supabase
      .from('maya_memories')
      .select('id')
      .filter('metadata', 'cs', JSON.stringify({sourceId: msg.id}))
      .limit(1);
    
    if (memoryError) {
      console.error('Error checking for existing memory:', memoryError);
    } else if (existingMemories && existingMemories.length > 0) {
      console.log(`Message ${msg.id} already exists in maya_memories, skipping queue`);
      return false;
    }
    
    // Use atomic insert with conflict handling to prevent race conditions
    // This will fail gracefully if another process already inserted the same message
    const { error } = await supabase
      .from('memory_ingestion_queue')
      .insert({
        source_type: 'chat_message',
        source_id: msg.id,
        content_to_process: msg.content,
        metadata: {
          userId: msg.user_id,
          roomId: msg.room_id,
          created_at: msg.created_at,
          role: msg.role
        },
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attempts: 0
      });
    
    if (error) {
      // Check if this is a duplicate key error (which is expected and OK)
      if (error.code === '23505' || error.message.includes('duplicate key')) {
        console.log(`Message ${msg.id} already in queue (detected via insert conflict), skipping`);
        return false;
      }
      console.error('Error adding message to memory ingestion queue:', error);
      return false;
    } else {
      console.log(`Successfully added message ${msg.id} to memory ingestion queue`);
      return true;
    }
  } catch (error) {
    console.error('Error in addToMemoryQueue:', error);
    return false;
  }
}

/**
 * Initialize and cache ALL active core facts about Maya.
 */
export async function initializeCoreFacts(): Promise<void> {
  try {
    // Fetch all active core facts by not passing a category
    // Increased default limit in retrieveCoreFacts to 200, adjust if more are needed.
    cachedCoreFacts = await retrieveCoreFacts(null, 200); // Fetch up to 200 core facts
    coreFactsLastUpdated = Date.now();
    console.log(`Initialized and cached ${cachedCoreFacts.length} core facts about Maya.`);
  } catch (error) {
    console.error('Error initializing core facts:', error);
  }
}

/**
 * Get core facts, refreshing cache if needed
 */
export async function getCoreFactsWithCache(): Promise<any[]> {
  if (cachedCoreFacts.length === 0 || Date.now() - coreFactsLastUpdated > CORE_FACTS_CACHE_TTL) {
    console.log('Core facts cache empty or stale, re-initializing...');
    await initializeCoreFacts();
  }
  return cachedCoreFacts;
}

/**
 * Process a message and generate a response with memory awareness
 * @param msg The message to process
 * @param generateResponse Whether to generate and store an AI response (default: true)
 * @param skipQueueing Whether to skip adding to memory queue (for when called by queue processor)
 */
export async function processMessage(msg: MessageRow, generateResponse: boolean = true, skipQueueing: boolean = false): Promise<void> {
  try {
    console.log(`Processing message: "${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}" (ID: ${msg.id}, Role: ${msg.role})`);
    // Add metadata type to log if present
    if (msg.metadata?.type) {
      console.log(`Message metadata type: ${msg.metadata.type}`);
    }

    // Deduplication for user messages
    if (msg.role === 'user') {
      const workerId = process.env.RAILWAY_REPLICA_ID || uuidv4(); // Get a unique worker ID
      const { error: insertError } = await supabase
        .from('processed_user_messages')
        .insert({ message_id: msg.id, status: 'processing', worker_instance_id: workerId });

      if (insertError) {
        if (insertError.code === '23505') { // Unique violation
          console.log(`Message ${msg.id} is already being processed or has been processed. Skipping. Worker ID that attempted: ${workerId}`); // Log attempted worker
          const { data: existingRecord, error: fetchError } = await supabase
            .from('processed_user_messages')
            .select('status, worker_instance_id, updated_at, created_at') // Add created_at
            .eq('message_id', msg.id)
            .single();
          if (fetchError) {
            console.error(`Error fetching existing processing record for ${msg.id}:`, fetchError);
          } else {
            console.log(`Existing processing record for ${msg.id}:`, existingRecord);
          }
          return;
        } else {
          // Log the actual error if it's not a unique violation
          console.error(`Error inserting message ${msg.id} into processed_user_messages (code: ${insertError.code}):`, insertError.message);
          // Potentially return here if any insert error is critical
          // return; 
        }
      }
    }

    // Skip response generation for Maya's own messages OR specific system message types like daily reports
    if (msg.user_id === MAYA_SYSTEM_USER_ID) {
      if (msg.metadata?.type === 'daily_report') {
        console.log(`Assistant's daily report message (ID: ${msg.id}) received. Adding to memory queue only.`);
        if (!skipQueueing) {
          // Ensure it gets added to memory_ingestion_queue for embedding by the queue processor
          // The addToMemoryQueue function has checks to prevent duplicates if it was already added by report-generator.
          await addToMemoryQueue(msg); 
        }
        return; // CRITICAL: Do not attempt to generate a response for a daily report message itself.
      } else if (msg.metadata?.role === 'system' || msg.metadata?.type === 'system_task_event') {
        // Example: Handling other system messages that might have been queued from task tool calls
        console.log(`System event message (ID: ${msg.id}) received. Adding to memory queue only.`);
        if (!skipQueueing) await addToMemoryQueue(msg);
        return; 
      }
      // General case for other assistant messages (e.g. if Maya's regular chat responses were ever re-processed by mistake)
      console.log('General assistant message observed. Skipping response generation. Adding to memory queue for embedding.');
      if (!skipQueueing) await addToMemoryQueue(msg);
      return;
    }
    
    // Enhanced check to prevent duplicate responses - add a more robust check with retries
    // This helps prevent race conditions where multiple workers process the same message
    let retryCount = 0;
    const maxRetries = 2;
    let existingResponses: any[] | null = null;
    
    while (retryCount <= maxRetries) {
      // Check if we've already generated a response for this message
      const { data: responses, error: checkError } = await supabase
        .from('messages')
        .select('id, created_at')
        .eq('role', 'assistant')
        .eq('user_id', MAYA_SYSTEM_USER_ID)
        .filter('metadata', 'cs', JSON.stringify({replyTo: msg.id}))
        .order('created_at', { ascending: false })
        .limit(5); // Check for multiple potential responses
        
      if (checkError) {
        console.error('Error checking for existing responses:', checkError);
      } else {
        existingResponses = responses || null;
        
        // If responses exist, we found a duplicate - log and exit
        if (existingResponses && existingResponses.length > 0) {
          console.log(`Already generated ${existingResponses.length} response(s) for message ${msg.id}, skipping to avoid duplicate`);
          console.log(`Most recent response: ${existingResponses[0].id} at ${existingResponses[0].created_at}`);
          return;
        }
      }
      
      // If no duplicates found, proceed with processing
      if (!existingResponses || existingResponses.length === 0) {
        break;
      }
      
      retryCount++;
      if (retryCount <= maxRetries) {
        // Add a small delay before retry to reduce race conditions
        await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
        console.log(`Retrying duplicate check (${retryCount}/${maxRetries})...`);
      }
    }
    
    // Check if this is a core fact message
    if (msg.content.toLowerCase().startsWith('core fact:')) {
      console.log('Detected core fact message, processing specially');
      await processCoreFact(msg);
      
      // Add message to the memory ingestion queue for regular processing too
      if (!skipQueueing) {
        await addToMemoryQueue(msg);
      }
    } else {
      // Regular message - only add to memory ingestion queue if not skipping queueing
      // When called from /process-message endpoint, we skip queueing to prevent duplicate processing
      if (!skipQueueing) {
        const queueSuccess = await addToMemoryQueue(msg);
        if (!queueSuccess) {
          console.log(`Message ${msg.id} already processed or in queue, but continuing with response generation if needed`);
        }
      } else {
        console.log('Skipping memory queue addition as requested (direct processing mode)');
      }
    }
    
    // 2. Extract facts and store in the existing maya_facts table
    await extractAndStoreFacts(msg);
    
    // Reminder parsing system - handled by dedicated reminder service
    
    /*
    // 3. Parse and save reminders if this is a user message
    if (msg.role === 'user' && msg.user_id !== MAYA_SYSTEM_USER_ID) {
      console.log(`[ReminderParsing] Processing reminders for user message: "${msg.content}"`);
      
      try {
        // Initialize reminder service
        const reminderService = createReminderService(supabase, MAYA_SYSTEM_USER_ID);
        
        // Parse and save reminders from message
        const reminders = reminderService.parseRemindersFromMessage(
          msg.content,
          msg.user_id,
          msg.id,
          msg.room_id
        );
        
        console.log(`[ReminderParsing] Parsed ${reminders.length} reminders from message`);
        
        if (reminders.length > 0) {
          console.log(`[ReminderParsing] Found ${reminders.length} reminders in message ${msg.id}`);
          
          // Save each reminder
          let savedReminders: string[] = [];
          for (const reminder of reminders) {
            console.log(`[ReminderParsing] Attempting to save reminder: ${JSON.stringify(reminder, null, 2)}`);
            const savedId = await reminderService.saveReminder(reminder);
            if (savedId) {
              console.log(`[ReminderParsing] Successfully saved reminder: ${reminder.title} (ID: ${savedId})`);
              savedReminders.push(reminder.title);
            } else {
              console.error(`[ReminderParsing] Failed to save reminder: ${reminder.title}`);
            }
          }
          
          // If we successfully saved any reminders, generate a confirmation response and return early
          // This prevents the LLM from using other tools like CREATE_TASK
          if (savedReminders.length > 0) {
            console.log(`[ReminderParsing] Generated reminder confirmation response, skipping normal AI processing`);
            
            // Generate a Maya-style confirmation message
            const confirmationMessages = [
              "Got it! I've set that reminder for you 💕",
              "Perfect! Reminder is all set 🌟", 
              "Done! I'll make sure to remind you ✨",
              "All set, babe! I've got that reminder for you 💖",
              "Reminder locked and loaded! I won't let you forget 💪"
            ];
            
            const confirmationMessage = confirmationMessages[Math.floor(Math.random() * confirmationMessages.length)];
            
            // Store the confirmation response in the database
            const { error: responseError } = await supabase
              .from('messages')
              .insert({
                id: uuidv4(),
                room_id: msg.room_id,
                user_id: MAYA_SYSTEM_USER_ID,
                content: confirmationMessage,
                role: 'assistant',
                metadata: {
                  replyTo: msg.id,
                  type: 'reminder_confirmation',
                  reminders_created: savedReminders.length,
                  source: 'reminder-service'
                }
              });

            if (responseError) {
              console.error('Error storing reminder confirmation response:', responseError);
            } else {
              console.log(`[ReminderParsing] Stored reminder confirmation response: "${confirmationMessage}"`);
            }
            
            // Mark message as processed to prevent duplicate processing
            if (msg.role === 'user') {
              const { error: updateError } = await supabase
                .from('processed_user_messages')
                .update({ status: 'completed', updated_at: new Date().toISOString() })
                .eq('message_id', msg.id);
              
              if (updateError) {
                console.error('Error updating processed message status:', updateError);
              } else {
                console.log(`Successfully marked message ${msg.id} as completed.`);
              }
            }
            
            // Return early to skip normal AI processing
            return;
          }
        } else {
          console.log(`[ReminderParsing] No reminders detected in message: "${msg.content}"`);
        }
        
        // Detect and store contexts for smart reminders
        await reminderService.detectContextsFromMessage(
          msg.content,
          msg.user_id,
          msg.id,
          msg.room_id
        );
        console.log(`[ReminderParsing] Context detection completed`);
        
      } catch (reminderError) {
        console.error(`[ReminderParsing] Error processing reminders for message ${msg.id}:`, reminderError);
        // Don't fail the entire request if reminder parsing fails
      }
    } else {
      console.log(`[ReminderParsing] Skipping reminder parsing - Role: ${msg.role}, User: ${msg.user_id}, Maya: ${MAYA_SYSTEM_USER_ID}`);
    }
    */
    
    // If we're not supposed to generate a response, stop here
    if (!generateResponse) {
      console.log('Skipping response generation as requested');
      return;
    }

    // 3.5. Check for URLs in the message and fetch their content
    let urlContextText = '';
    if (isAskingAboutUrl(msg.content)) {
      console.log('[URL_READER] Message appears to ask about a URL, fetching content...');
      try {
        const urlResult = await processMessageUrls(msg.content);
        if (urlResult.hasContent) {
          urlContextText = urlResult.contextText;
          console.log(`[URL_READER] Added ${urlResult.urls.filter(u => u.success).length} URL(s) to context`);
        }
      } catch (urlError: any) {
        console.error('[URL_READER] Error processing URLs:', urlError.message);
      }
    }

    // 4. Retrieve context in parallel for better performance
    // Uses 3-layer memory architecture: permanent facts + session facts + semantic retrieval
    console.log('[CONTEXT] Starting parallel context retrieval...');
    const [
      relevantMemories,
      permanentFacts,
      sessionFacts,
      hybridFacts,
      allCoreFacts,
      conversationHistory
    ] = await Promise.all([
      retrieveRelevantMemories(msg.user_id, msg.content),
      retrievePermanentFacts(msg.user_id, 25),      // Always included
      retrieveSessionFacts(msg.user_id, 12, 20),    // Last 12 hours
      retrieveUserFactsHybrid(msg.user_id, msg.content, 15), // Semantic + recency + importance
      getCoreFactsWithCache(),
      retrieveConversationHistory(msg.room_id, msg.id)
    ]);

    console.log(`[CONTEXT] Retrieved: ${relevantMemories.length} memories, ${permanentFacts.length} permanent facts, ${sessionFacts.length} session facts, ${hybridFacts.length} hybrid facts, ${allCoreFacts.length} core facts, ${conversationHistory.length} messages`);

    // Merge facts: permanent (always) + session (recent) + hybrid (semantic) - deduplicated
    const factIds = new Set<string>();
    const mergedFacts: any[] = [];

    // Add permanent facts first (highest priority)
    for (const fact of permanentFacts) {
      if (!factIds.has(fact.id)) {
        factIds.add(fact.id);
        mergedFacts.push({ ...fact, source: 'permanent' });
      }
    }

    // Add session facts (time-based priority)
    for (const fact of sessionFacts) {
      if (!factIds.has(fact.id)) {
        factIds.add(fact.id);
        mergedFacts.push({ ...fact, source: 'session' });
      }
    }

    // Add hybrid facts (semantic priority)
    for (const fact of hybridFacts) {
      if (!factIds.has(fact.id)) {
        factIds.add(fact.id);
        mergedFacts.push({ ...fact, source: 'hybrid' });
      }
    }

    console.log(`[CONTEXT] Merged ${mergedFacts.length} unique facts (${permanentFacts.length} permanent, ${sessionFacts.length} session, ${hybridFacts.length} hybrid)`);

    // Build system prompt with merged context
    let systemPrompt = await buildSystemPrompt(relevantMemories, mergedFacts, allCoreFacts);

    // If we have URL content, add instructions to the system prompt
    if (urlContextText) {
      systemPrompt += `\n\n🔗 URL READING CONTEXT:
Blake shared a URL and is asking about it. The content from that URL is included below his message.
- Read and understand the URL content to answer his question
- Reference specific parts of the content when relevant
- Stay in character - respond as Maya, not as a generic assistant
- If the content is long, focus on what's relevant to his question
`;
    }

    console.log('Generated system prompt (length check):', systemPrompt.substring(0, 300) + "..."); // Log beginning of prompt

    // Include URL content in the user message if available
    const userMessageWithContext = urlContextText
      ? `${msg.content}${urlContextText}`
      : msg.content;

    console.log('Sending to AI with user message:', msg.content);
    if (urlContextText) {
      console.log(`[URL_READER] Including ${urlContextText.length} chars of URL content in context`);
    }

    // Check for image attachments (Vision feature)
    let processedImages: ProcessedImage[] = [];

    // Debug: Log full metadata to understand what we're receiving
    console.log(`[VISION] Message metadata:`, JSON.stringify(msg.metadata, null, 2));

    const attachments = msg.metadata?.attachments || [];
    console.log(`[VISION] Attachments array:`, JSON.stringify(attachments, null, 2));
    console.log(`[VISION] Attachments length: ${attachments.length}`);

    if (attachments.length > 0) {
      const hasImageAttachments = attachments.some(isImageAttachment);
      console.log(`[VISION] Has image attachments: ${hasImageAttachments}`);

      // Log each attachment's isImageAttachment check
      for (const att of attachments) {
        console.log(`[VISION] Checking attachment:`, {
          url: att.url?.substring(0, 100),
          type: att.type,
          isImage: isImageAttachment(att)
        });
      }
    }

    if (attachments.length > 0 && attachments.some(isImageAttachment)) {
      console.log(`[VISION] Detected ${attachments.length} attachments, processing images...`);
      processedImages = await processAttachments(attachments);

      if (processedImages.length > 0) {
        // Add vision context to system prompt
        systemPrompt += `\n\n👁️ IMAGE CONTEXT:
Blake has shared ${processedImages.length} image(s) with you. You can see them!
- Describe what you see if relevant to the conversation
- React naturally as Maya would (curious, playful, engaged)
- Reference visual details to show you're really seeing the image
- If he's asking about the image, analyze it and respond helpfully
`;
        console.log(`[VISION] Successfully processed ${processedImages.length} images`);
      }
    }

    // Use vision response if we have images, otherwise standard response
    let aiResponseText: string;
    if (processedImages.length > 0) {
      console.log(`[VISION] Using vision response with ${processedImages.length} images`);
      aiResponseText = await generateVisionResponse(
        userMessageWithContext,
        systemPrompt,
        processedImages,
        conversationHistory,
        { userId: msg.user_id }
      );
    } else {
      aiResponseText = await aiGenerateResponse(userMessageWithContext, systemPrompt, conversationHistory, { userId: msg.user_id });
    }
    let messageToStoreInDB = aiResponseText; // This will hold the final user-facing message

    // MCP Bridge removed - was causing clutter in responses

    const toolCallRegex = /TOOL_CALL_([A-Z_]+):\s*(\{.*\})/s;
    const toolCallMatch = aiResponseText.match(toolCallRegex);

    let args: any = null;
    let actionSuccessfullyHandled = false;

    if (toolCallMatch && toolCallMatch[1] && toolCallMatch[2]) {
      const actionName = toolCallMatch[1];
      const jsonArgsString = toolCallMatch[2];
      console.log(`Detected TOOL_CALL via regex. Action: '${actionName}', Args string: '${jsonArgsString.substring(0,100)}...'`);
      let taskActionResult: string | null = null;
      actionSuccessfullyHandled = false; // Reset this variable

      try {
        args = JSON.parse(jsonArgsString.trim());
        console.log(`Parsed Action: '${actionName}', Args:`, args);
        let taskResultDb: TaskData | TaskData[] | boolean | null = null;

        switch (actionName) {
          case 'WEB_SEARCH':
            if (!args.query) throw new Error('Missing query for web_search');
            try {
              console.log(`Performing web search for query: "${args.query}"`);
              const searchResults = await performWebSearch({
                query: args.query,
                searchType: args.search_type || 'general',
                maxResults: args.max_results || 5,
                userId: msg.user_id
              });
              
              if (searchResults && searchResults.length > 0) {
                // Format the search results for the LLM to process
                const formattedResults = formatSearchResultsForPrompt(searchResults);
                taskActionResult = formattedResults;
                actionSuccessfullyHandled = true;
                
                // Store the search event in memory with enhanced metadata
                await addToMemoryQueue({ 
                  id: uuidv4(), 
                  user_id: msg.user_id, 
                  room_id: msg.room_id, 
                  created_at: new Date().toISOString(), 
                  role: 'system', 
                  content: `System: Performed web search for "${args.query}" - found ${searchResults.length} results`,
                  metadata: {
                    type: 'web_search_event',
                    search_query: args.query,
                    search_type: args.search_type || 'general',
                    result_count: searchResults.length,
                    sources: searchResults.map(r => ({
                      title: r.title,
                      url: r.url,
                      source: r.source
                    }))
                  }
                });
              } else {
                taskActionResult = `I searched for "${args.query}" but didn't find any relevant results. Try rephrasing your search query.`;
              }
            } catch (searchError: any) {
              console.error('Web search error:', searchError);
              taskActionResult = `I encountered an issue while searching: ${searchError.message}`;
            }
            break;

          default:
            // Tool actions removed for cleaner responses
            console.log(`Tool action '${actionName}' detected but ignored`);
            // Don't set taskActionResult - this will cause the system to use the original AI response
            break;
        }

        if (actionSuccessfullyHandled && taskActionResult) {
          let followUpSystemPrompt = systemPrompt; // Use the SAME rich system prompt with full personality!
          let followUpUserContent = `User's original request: "${msg.content}"\nTool action you decided: ${actionName}\nParameters you used: ${JSON.stringify(args)}\nResult of your action: "${taskActionResult}"\n
Formulate your response to the user based on this outcome.`;

          // For web search, inject search results but KEEP full personality context
          if (actionName === 'WEB_SEARCH') {
            // Add search-specific instructions to the EXISTING system prompt
            followUpSystemPrompt = systemPrompt + `\n\n🔍 WEB SEARCH CONTEXT:
You just performed a web search to answer Blake's question. The search results are below.
Respond in YOUR voice - sassy, technical, and conversational. Don't suddenly become a formal search assistant.
- Synthesize the key findings naturally
- Cite sources casually when relevant (e.g., "according to [source]..." or "based on what I found...")
- Answer directly and conversationally
- Keep your personality - if the results are interesting, react to them!
- If something in the results contradicts your training, acknowledge it
`;

            followUpUserContent = `${msg.content}

---WEB SEARCH RESULTS---
${taskActionResult}
---END SEARCH RESULTS---

Answer Blake's question using these search results. Be yourself - technical, witty, and helpful.`;
          }

          console.log("Sending follow-up to LLM for refined response with FULL personality context");
          console.log("Follow-up system prompt includes: memories, facts, personality, communication rules");
          // Pass conversation history to maintain context!
          messageToStoreInDB = await aiGenerateResponse(followUpUserContent, followUpSystemPrompt, conversationHistory, { userId: msg.user_id });
          console.log("LLM's refined response after tool call:", messageToStoreInDB.substring(0, 200) + "...");
        } else {
          messageToStoreInDB = taskActionResult || "I understood a task action was intended, but I had trouble completing it.";
          console.warn("Tool call detected but action was not successfully handled or no result string. Defaulting response based on taskActionResult.");
        }

      } catch (toolError: any) {
        console.error('Error processing tool call:', toolError.message, toolError.stack);
        messageToStoreInDB = `I tried to perform that task, but encountered an issue: ${toolError.message.substring(0,100)}`; 
      }
    }

    const responseId = uuidv4();
    
    // Prepare metadata for the response
    let responseMetadata: any = { 
      replyTo: msg.id, 
      timestamp: new Date().toISOString() 
    };
    
    // Check if the original message has voice mode enabled
    console.log(`[ProcessMessage] Checking voice mode for message ${msg.id}. Metadata:`, msg.metadata);
    const isVoiceMode = msg.metadata?.voiceMode === true;
    if (isVoiceMode) {
      responseMetadata.voiceMode = true;
      console.log(`[ProcessMessage] Voice mode ENABLED for message ${msg.id}, will generate TTS for response`);
    } else {
      console.log(`[ProcessMessage] Voice mode NOT enabled for message ${msg.id}. voiceMode value:`, msg.metadata?.voiceMode);
    }
    
    // If this response contains web search results, add that to metadata
    if (toolCallMatch && toolCallMatch[1] === 'WEB_SEARCH' && actionSuccessfullyHandled) {
      responseMetadata.contains_web_search = true;
      responseMetadata.web_search_query = args.query;
      responseMetadata.web_search_type = args.search_type || 'general';
      responseMetadata.source = 'web_search_enhanced';
    }
    
    const { error } = await supabase
      .from('messages')
      .insert({
        id: responseId,
        content: messageToStoreInDB, 
        user_id: MAYA_SYSTEM_USER_ID,
        room_id: msg.room_id,
        role: 'assistant',
        metadata: responseMetadata
      });
    
    if (error) {
      console.error('Error inserting Maya response:', error);
      return;
    }
    console.log(`Maya responded with ID ${responseId}: "${messageToStoreInDB.substring(0, 100)}${messageToStoreInDB.length > 100 ? '...' : ''}"`);

    // Reinforce facts that were used in the response (async, non-blocking)
    reinforceUsedFacts(messageToStoreInDB, mergedFacts)
      .catch(err => console.error('[REINFORCE] Error:', err));

    // Process TTS if voice mode is enabled
    if (isVoiceMode) {
      console.log(`Processing TTS for response ${responseId} in voice mode`);
      // Process TTS asynchronously to avoid blocking the response
      processTTSForMessage(responseId, messageToStoreInDB, MAYA_SYSTEM_USER_ID, responseMetadata)
        .catch(error => console.error(`Error processing TTS for response ${responseId}:`, error));
    }
    
    const responseMessage: MessageRow = {
      id: responseId, content: messageToStoreInDB, user_id: MAYA_SYSTEM_USER_ID,
      room_id: msg.room_id, created_at: new Date().toISOString(), role: 'assistant',
      metadata: responseMetadata
    };
    if (!skipQueueing) await addToMemoryQueue(responseMessage);

    const { data: checkDuplicates, error: checkDuplicatesError } = await supabase
      .from('messages')
      .select('id')
      .eq('role', 'assistant')
      .eq('user_id', MAYA_SYSTEM_USER_ID)
      .filter('metadata', 'cs', JSON.stringify({replyTo: msg.id}))
      .neq('id', responseId); 
      
    if (checkDuplicatesError) {
      console.error('Error checking for duplicate responses:', checkDuplicatesError);
    } else if (checkDuplicates && checkDuplicates.length > 0) {
      console.warn(`Found ${checkDuplicates.length} other responses to message ${msg.id}. Consider cleanup.`);
    }

    // If the message is a user message, update the status in processed_user_messages
    if (msg.role === 'user') {
      // Update status to 'completed' after successful processing
      const { error: updateError } = await supabase
        .from('processed_user_messages')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('message_id', msg.id);

      if (updateError) {
        console.error('Error updating message status to completed in processed_user_messages:', updateError);
      } else {
        console.log(`Successfully marked message ${msg.id} as completed.`);
      }
    }

  } catch (error) {
    console.error('Error processing message:', error);
    // If an error occurs during processing, update the status to 'failed'
    if (msg.role === 'user') {
      const { error: updateError } = await supabase
        .from('processed_user_messages')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('message_id', msg.id);

      if (updateError) {
        console.error('Error updating message status to failed in processed_user_messages:', updateError);
      }
    }
    throw error;
  }
}

/**
 * Process a core fact message and store in maya_core_facts table
 */
async function processCoreFact(msg: MessageRow): Promise<void> {
  try {
    // Extract the fact content after the "core fact:" prefix
    const factContent = msg.content.substring(msg.content.toLowerCase().indexOf('core fact:') + 10).trim();
    console.log(`Processing core fact: "${factContent}"`);
    
    // Try to parse into subject, predicate, object format
    // For simple format, assume "user is/has/likes something"
    let subject = 'user';
    let predicate = 'is';
    let object = factContent;
    
    // Check if the fact contains structured information
    const parts = factContent.split(/\s+/);
    if (parts.length >= 3) {
      // Simple heuristic: if we have at least 3 words, try to extract a predicate
      const predicateMatches = ['is', 'has', 'likes', 'wants', 'needs', 'uses', 'works', 'loves'];
      const predicateIndex = parts.findIndex((part, index) => 
        index > 0 && predicateMatches.includes(part.toLowerCase())
      );
      
      if (predicateIndex > 0 && predicateIndex < parts.length -1) { // Ensure object part exists
        subject = parts.slice(0, predicateIndex).join(' ');
        predicate = parts[predicateIndex].toLowerCase();
        object = parts.slice(predicateIndex + 1).join(' ');
      }
    }
    
    console.log(`Parsed core fact: Subject='${subject}', Predicate='${predicate}', Object='${object}'`);
    
    // Generate a unique ID
    const factId = uuidv4();
    
    // Make sure user_id is properly formatted
    const formattedUserId = formatUserId(msg.user_id);
    
    // Add current timestamp for ts field
    const currentTimestamp = new Date().toISOString();
    
    // Store in maya_core_facts table
    const { error } = await supabase
      .from('maya_core_facts')
      .insert({
        id: factId,
        user_id: formattedUserId,
        subject: subject,
        predicate: predicate,
        object: object,
        category: 'user-defined',
        weight: 1.0,
        active: true,
        ts: currentTimestamp,
        last_updated: currentTimestamp
      });
    
    if (error) {
      console.error('Error storing core fact:', error);
    } else {
      console.log(`Successfully stored core fact with ID ${factId}`);
      // Invalidate core facts cache so it reloads on next access
      coreFactsLastUpdated = 0;
      console.log('Core facts cache invalidated due to new core fact.');
    }
  } catch (error) {
    console.error('Error processing core fact:', error);
  }
}

/**
 * Extract facts from a message and store them in the existing maya_facts table
 * Uses LLM-based extraction only (important-fact-extractor) - regex was creating junk data
 */
async function extractAndStoreFacts(msg: MessageRow): Promise<void> {
  try {
    // Only run extraction for user messages (not Maya's responses)
    if (msg.role !== 'user') {
      return;
    }

    console.log('[FACTS] Running intelligent fact extraction...');
    const result = await processMessageForFacts(msg.content, msg.user_id);

    if (result.extracted > 0) {
      console.log(`[FACTS] Message ${msg.id}: ${result.extracted} extracted, ${result.stored} stored, ${result.boosted} boosted`);
    }
  } catch (error) {
    console.error(`[FACTS] Error in extractAndStoreFacts for message ${msg.id}:`, error);
  }
} 