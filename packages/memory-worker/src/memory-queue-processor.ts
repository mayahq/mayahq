import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { v4 as uuidv4 } from 'uuid';
import { processMessage } from './process-message'; // Import processMessage for response generation
import { processMessageForFacts } from './important-fact-extractor'; // LLM-based fact extraction

// Maximum number of items to process in a single batch
const BATCH_SIZE = 20;
// Maximum number of retry attempts
const MAX_RETRY_ATTEMPTS = 5;

// System user ID for Maya - this will be used to check if responses are needed
const MAYA_SYSTEM_USER_ID = process.env.MAYA_SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000000';

// Should we generate responses (default yes unless explicitly disabled)
const RESPONSE_GENERATION_ENABLED = process.env.RESPONSE_GENERATION_ENABLED !== 'false';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Process a core fact message and store in maya_core_facts table
 */
async function processCoreFact(msg: any): Promise<void> {
  try {
    // Extract the fact content after the "core fact:" prefix
    const factContent = msg.content.substring(msg.content.toLowerCase().indexOf('core fact:') + 10).trim();
    
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
      const predicateIndex = parts.findIndex((part: string, index: number) => 
        index > 0 && predicateMatches.includes(part.toLowerCase())
      );
      
      if (predicateIndex > 0) {
        subject = parts.slice(0, predicateIndex).join(' ');
        predicate = parts[predicateIndex].toLowerCase();
        object = parts.slice(predicateIndex + 1).join(' ');
      }
    }
    
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
        last_updated: currentTimestamp,
        source_ref: {
          type: 'core-fact',
          memory: {
            input: msg.content,
            original_text: msg.content
          },
          user_info: {
            string_id: `admin-user-${formattedUserId}`
          },
          string_user_id: `admin-user-${formattedUserId}`,
          extraction_method: 'queue-processor'
        }
      });
    
    if (error) {
      console.error('Error storing core fact:', error);
    } else {
      console.log(`Successfully stored core fact with ID ${factId}`);
    }
  } catch (error) {
    console.error('Error processing core fact:', error);
  }
}

/**
 * Generate tags based on text content and tag definitions
 */
async function generateTags(content: string): Promise<string[]> {
  try {
    // Always add batch-processed tag
    const tags: string[] = ['batch_processed'];
    const contentLower = content.toLowerCase();
    
    // Get tag definitions from database
    const { data: tagDefs, error } = await supabase
      .from('tag_defs')
      .select('*')
      .eq('is_enabled', true);
      
    if (error) {
      console.error('Error fetching tag definitions:', error);
      return tags;
    }
    
    if (!tagDefs || tagDefs.length === 0) {
      return tags;
    }
    
    console.log(`Processing ${tagDefs.length} tag definitions...`);
    
    // Check content against tag definitions
    for (const tagDef of tagDefs) {
      // First check keyword matches
      let matched = false;
      
      // Check keywords
      if (tagDef.keywords && tagDef.keywords.length > 0) {
        for (const keyword of tagDef.keywords) {
          if (contentLower.includes(keyword.toLowerCase())) {
            matched = true;
            break;
          }
        }
      }
      
      // If no keyword match and regex is enabled, check regex patterns
      if (!matched && tagDef.is_regex && tagDef.regex_patterns && tagDef.regex_patterns.length > 0) {
        for (const pattern of tagDef.regex_patterns) {
          try {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(content)) {
              matched = true;
              break;
            }
          } catch (e) {
            console.error(`Invalid regex pattern in tag ${tagDef.slug}:`, e);
          }
        }
      }
      
      // Add tag if matched
      if (matched && !tags.includes(tagDef.slug)) {
        tags.push(tagDef.slug);
        console.log(`Added tag: ${tagDef.slug}`);
      }
    }
    
    return tags;
  } catch (e) {
    console.error('Error generating tags:', e);
    return ['batch_processed']; // Return default tag if any error
  }
}

/**
 * Fact type classification for permanent fact detection
 */
type FactType = 'general' | 'date' | 'plan' | 'relationship' | 'preference' | 'location' | 'important';

interface ExtractedFact {
  subject: string;
  predicate: string;
  object: string;
  factType: FactType;
  isPermanent: boolean;
  rawMatch?: string;
}

/**
 * @deprecated UNUSED - Regex extraction creates junk facts with truncated values.
 * LLM-based extraction (processMessageForFacts) is now the only method.
 * Keeping this code for reference but it should not be called.
 */
function extractSimpleFacts(content: string): Array<ExtractedFact> {
  const facts: Array<ExtractedFact> = [];

  // Only extract facts from messages of sufficient length
  if (content.length < 10) {
    return facts;
  }

  // ==========================================================================
  // TIER 1: HIGH-PRIORITY PATTERNS (Dates, Plans, Timelines) - Always Permanent
  // ==========================================================================

  const highPriorityPatterns = [
    // Moving/relocating patterns
    {
      regex: /(?:we(?:'re| are)|I(?:'m| am)) (?:moving|relocating|going) to ([A-Za-z\s,]+?)(?:\s+in\s+(\d+)\s*(months?|years?|weeks?|days?))?/gi,
      predicate: 'moving_to',
      factType: 'plan' as FactType,
      isPermanent: true,
      extractTimeline: true
    },
    {
      regex: /(?:planning|plan) to (?:move|relocate|go) to ([A-Za-z\s,]+?)(?:\s+(?:in|by|before)\s+(.+?))?(?:\.|,|$)/gi,
      predicate: 'planning_move_to',
      factType: 'plan' as FactType,
      isPermanent: true
    },

    // Lease/housing patterns
    {
      regex: /(?:my\s+)?lease\s+(?:ends?|expires?|is\s+up)\s+(?:in|on|by)\s+([A-Za-z0-9\s,]+)/gi,
      predicate: 'lease_ends',
      factType: 'date' as FactType,
      isPermanent: true
    },
    {
      regex: /(?:my\s+)?(?:lease|contract|rental)\s+(?:is\s+)?(?:until|through|ends?)\s+([A-Za-z0-9\s,]+)/gi,
      predicate: 'lease_until',
      factType: 'date' as FactType,
      isPermanent: true
    },

    // Timeline patterns with specific dates
    {
      regex: /(?:in|by|before|after|around)\s+(\d+)\s*(months?|years?|weeks?)\s+(?:we|I)\s+(?:will|'ll|are going to|plan to)\s+(.+?)(?:\.|,|$)/gi,
      predicate: 'timeline_plan',
      factType: 'plan' as FactType,
      isPermanent: true,
      customExtract: true
    },
    {
      regex: /(?:by|in|on|before)\s+((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})\s+(?:we|I)\s+(?:will|'ll|want to|plan to|need to)\s+(.+?)(?:\.|,|$)/gi,
      predicate: 'date_plan',
      factType: 'date' as FactType,
      isPermanent: true
    },

    // Important life events
    {
      regex: /(?:we(?:'re| are)|I(?:'m| am)) (?:getting|going to get) (?:married|engaged|divorced)(?:\s+(?:in|on|by)\s+(.+?))?(?:\.|,|$)/gi,
      predicate: 'life_event',
      factType: 'plan' as FactType,
      isPermanent: true
    },
    {
      regex: /(?:we(?:'re| are)|I(?:'m| am)) (?:having|expecting) a (?:baby|child|kid)(?:\s+(?:in|on|by|around)\s+(.+?))?(?:\.|,|$)/gi,
      predicate: 'expecting_child',
      factType: 'plan' as FactType,
      isPermanent: true
    },
    {
      regex: /(?:starting|beginning|launching) (?:a\s+)?(?:new\s+)?(?:job|business|company|career)(?:\s+(?:at|with|in)\s+(.+?))?(?:\s+(?:in|on|by)\s+(.+?))?(?:\.|,|$)/gi,
      predicate: 'career_change',
      factType: 'plan' as FactType,
      isPermanent: true
    },
  ];

  // ==========================================================================
  // TIER 2: RELATIONSHIP PATTERNS - Permanent
  // ==========================================================================

  const relationshipPatterns = [
    {
      regex: /(?:my\s+)?(wife|husband|partner|girlfriend|boyfriend|fiancee?|spouse)\s+(?:is\s+)?(?:named\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
      predicate: 'has_partner',
      factType: 'relationship' as FactType,
      isPermanent: true
    },
    {
      regex: /(?:my\s+)?(mom|dad|mother|father|brother|sister|son|daughter|child|kid)\s+(?:is\s+)?(?:named\s+)?([A-Z][a-z]+)/gi,
      predicate: 'has_family_member',
      factType: 'relationship' as FactType,
      isPermanent: true
    },
    {
      regex: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+my\s+(wife|husband|partner|girlfriend|boyfriend|fiancee?|mom|dad|mother|father|brother|sister|son|daughter|friend|boss|colleague)/gi,
      predicate: 'relationship_is',
      factType: 'relationship' as FactType,
      isPermanent: true
    },
    {
      regex: /(?:I\s+)?(?:live|living)\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
      predicate: 'lives_with',
      factType: 'relationship' as FactType,
      isPermanent: true
    },
  ];

  // ==========================================================================
  // TIER 3: LOCATION & PREFERENCE PATTERNS - Some Permanent
  // ==========================================================================

  const locationPatterns = [
    {
      regex: /(?:I\s+)?(?:live|living)\s+in\s+([A-Za-z\s,]+?)(?:\.|,|$)/gi,
      predicate: 'lives_in',
      factType: 'location' as FactType,
      isPermanent: true
    },
    {
      regex: /(?:I(?:'m| am)|we(?:'re| are))\s+(?:from|originally from)\s+([A-Za-z\s,]+?)(?:\.|,|$)/gi,
      predicate: 'from',
      factType: 'location' as FactType,
      isPermanent: true
    },
    {
      regex: /(?:I\s+)?work\s+(?:at|for|in)\s+([A-Za-z0-9\s&,]+?)(?:\.|,|$)/gi,
      predicate: 'works_at',
      factType: 'location' as FactType,
      isPermanent: true
    },
  ];

  const preferencePatterns = [
    {
      regex: /(?:I(?:'m| am))\s+(allergic|intolerant)\s+to\s+([A-Za-z\s,]+?)(?:\.|,|$)/gi,
      predicate: 'allergic_to',
      factType: 'preference' as FactType,
      isPermanent: true  // Health info is permanent
    },
    {
      regex: /(?:I\s+)?(?:can't|cannot|don't)\s+eat\s+([A-Za-z\s,]+?)(?:\s+(?:because|due to))?/gi,
      predicate: 'dietary_restriction',
      factType: 'preference' as FactType,
      isPermanent: true
    },
    {
      regex: /(?:I(?:'m| am))\s+(vegetarian|vegan|pescatarian|gluten-free|lactose.?intolerant)/gi,
      predicate: 'dietary_type',
      factType: 'preference' as FactType,
      isPermanent: true
    },
  ];

  // ==========================================================================
  // TIER 4: GENERAL PATTERNS (Original patterns) - Not Permanent by Default
  // ==========================================================================

  const generalPatterns = [
    { regex: /I am ([\w\s]+)/gi, predicate: 'is', factType: 'general' as FactType, isPermanent: false },
    { regex: /I have ([\w\s]+)/gi, predicate: 'has', factType: 'general' as FactType, isPermanent: false },
    { regex: /I like ([\w\s]+)/gi, predicate: 'likes', factType: 'preference' as FactType, isPermanent: false },
    { regex: /I love ([\w\s]+)/gi, predicate: 'loves', factType: 'preference' as FactType, isPermanent: false },
    { regex: /I want ([\w\s]+)/gi, predicate: 'wants', factType: 'general' as FactType, isPermanent: false },
    { regex: /I need ([\w\s]+)/gi, predicate: 'needs', factType: 'general' as FactType, isPermanent: false },
    { regex: /I hate ([\w\s]+)/gi, predicate: 'hates', factType: 'preference' as FactType, isPermanent: false },
    { regex: /I work ([\w\s]+)/gi, predicate: 'works', factType: 'general' as FactType, isPermanent: false },
    { regex: /My name is ([\w\s]+)/gi, predicate: 'name_is', factType: 'relationship' as FactType, isPermanent: true },
  ];

  // Process high-priority patterns first
  for (const pattern of [...highPriorityPatterns, ...relationshipPatterns, ...locationPatterns, ...preferencePatterns]) {
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

    while ((match = regex.exec(content)) !== null) {
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }

      const object = match[1]?.trim() || '';
      if (object.length > 0) {
        // Build the full fact with any timeline info
        let fullObject = object;
        if (match[2]) {
          fullObject += ` ${match[2]}`;
        }
        if (match[3]) {
          fullObject += ` ${match[3]}`;
        }

        facts.push({
          subject: 'user',
          predicate: pattern.predicate,
          object: fullObject.trim(),
          factType: pattern.factType,
          isPermanent: pattern.isPermanent,
          rawMatch: match[0]
        });

        console.log(`[FACT EXTRACTED] Type: ${pattern.factType}, Permanent: ${pattern.isPermanent}, Predicate: ${pattern.predicate}, Object: ${fullObject.trim()}`);
      }
    }
  }

  // Process general patterns (only if we haven't already extracted something similar)
  for (const pattern of generalPatterns) {
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

    while ((match = regex.exec(content)) !== null) {
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }

      const object = match[1]?.trim() || '';
      if (object.length > 0) {
        // Check if we already have a similar fact
        const isDuplicate = facts.some(f =>
          f.object.toLowerCase().includes(object.toLowerCase()) ||
          object.toLowerCase().includes(f.object.toLowerCase())
        );

        if (!isDuplicate) {
          facts.push({
            subject: 'user',
            predicate: pattern.predicate,
            object: object,
            factType: pattern.factType,
            isPermanent: pattern.isPermanent
          });
        }
      }
    }
  }

  // Handle "My X is Y" pattern specially
  const myXisYRegex = /My (\w+) is ([\w\s]+)/gi;
  let myMatch;
  while ((myMatch = myXisYRegex.exec(content)) !== null) {
    if (myMatch.index === myXisYRegex.lastIndex) {
      myXisYRegex.lastIndex++;
    }

    const property = myMatch[1]?.toLowerCase() || 'property';
    const value = myMatch[2]?.trim() || '';

    if (value.length > 0) {
      const isDuplicate = facts.some(f => f.predicate === property && f.object === value);
      if (!isDuplicate) {
        // Determine if this should be permanent based on property type
        const permanentProperties = ['birthday', 'anniversary', 'address', 'email', 'phone'];
        const isPermanent = permanentProperties.includes(property);

        facts.push({
          subject: 'user',
          predicate: property,
          object: value,
          factType: isPermanent ? 'important' : 'general',
          isPermanent: isPermanent
        });
      }
    }
  }

  return facts;
}

/**
 * Format user ID correctly to match expected format
 */
function formatUserId(userId: string): string {
  // Ensure user ID is in the correct format
  return userId.replace(/-/g, '');
}

/**
 * Process a single queue item
 * @param item The queue item to process
 * @param skipMemoryStorage If true, skip storing in maya_memories (for items already stored by Supabase cron)
 */
async function processQueueItem(item: any, skipMemoryStorage: boolean = false): Promise<boolean> {
  try {
    console.log(`Processing item ${item.id} of type ${item.source_type}${skipMemoryStorage ? ' (memory already stored, LLM extraction only)' : ''}...`);
    console.log(`Item metadata: ${JSON.stringify(item.metadata)}`);

    // Check if item is from Maya (helpful for debugging)
    if (item.metadata.userId === MAYA_SYSTEM_USER_ID) {
      console.log(`This is Maya's message - ensuring it gets processed correctly`);
    }

    // Update status to processing
    const { error: updateError } = await supabase
      .from('memory_ingestion_queue')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString(),
        attempts: item.attempts + 1
      })
      .eq('id', item.id);
      
    if (updateError) {
      console.error(`Error updating item ${item.id} status to processing:`, updateError);
      return false;
    }
    
    // Process based on source_type
    if (item.source_type === 'chat_message') {
      // Check for core fact message and process it specially
      if (item.content_to_process.toLowerCase().startsWith('core fact:')) {
        console.log('Detected core fact in queue, processing specially');
        
        try {
          // Create message-like object for processCoreFact
          const messageObj = {
            id: item.source_id,
            content: item.content_to_process,
            user_id: item.metadata.userId,
            room_id: item.metadata.roomId,
            created_at: item.metadata.created_at || item.created_at,
            role: item.metadata.role
          };
          
          // Process the core fact
          await processCoreFact(messageObj);
        } catch (coreFactError: any) {
          console.error('Error processing core fact from queue:', coreFactError);
          // Continue with normal processing even if core fact processing fails
        }
      }
      
      // Format the user ID correctly
      const userId = item.metadata.userId || item.metadata.user_id;
      const formattedUserId = userId ? formatUserId(userId) : null;

      // Only store memory if not already stored by Supabase cron
      if (!skipMemoryStorage) {
        // Generate embedding for memory
        const embedding = await generateEmbedding(item.content_to_process);

        // Generate tags for this content
        const tags = await generateTags(item.content_to_process);
        console.log(`Generated tags for memory: ${tags.join(', ')}`);

        // Insert into maya_memories
        const memoryData: any = {
          content: item.content_to_process,
          metadata: {
            ...item.metadata,
            type: 'conversation',
            userId: formattedUserId,
            timestamp: new Date().toISOString(),
            isFallback: false,
            sourceType: item.source_type,
            sourceId: item.source_id,
            platform: 'batch-processor',
            cron_processed: false
          },
          importance: 0.5,
          created_at: item.created_at,
          tags: tags,  // Add the tags array
          embedding, // Add the embedding
          embedding_model: 'cohere/embed-english-v3.0',
          embedding_ver: 'v1'
        };

        const { error: memoryError } = await supabase
          .from('maya_memories')
          .insert(memoryData);

        if (memoryError) {
          throw new Error(`Error storing memory: ${memoryError.message}`);
        }

        // Update tag stats for each tag
        for (const tag of tags) {
          if (tag === 'batch_processed') continue; // Skip updating stats for system tag

          // Use the safe RPC function to update tag stats
          try {
            await supabase.rpc('increment_tag_stat', { tag_slug: tag });
          } catch (tagError) {
            console.error(`Error updating tag stat for ${tag}:`, tagError);
            // Continue processing, don't fail on tag stats errors
          }
        }
      } else {
        console.log(`Skipping memory storage for item ${item.id} - already stored by Supabase cron`);
      }

      // Extract and store facts using LLM-based extraction (much more accurate than regex)
      if (formattedUserId) {
        try {
          console.log('[FACTS] Using LLM-based fact extraction for message...');
          const factResult = await processMessageForFacts(
            item.content_to_process,
            formattedUserId
          );

          if (factResult.extracted > 0) {
            console.log(`[FACTS] LLM extracted ${factResult.extracted} facts: ${factResult.stored} new, ${factResult.boosted} boosted`);
          }
        } catch (factError: any) {
          // Don't fallback to regex - it creates junk facts with truncated values
          // Better to skip fact extraction than pollute the database
          console.error('[FACTS] LLM fact extraction failed, skipping:', factError.message);
        }
      } else {
        console.log('[FACTS] Skipping fact extraction - no user ID available');
      }
      
      // User message detected - processing for response generation
      if (item.metadata?.role === 'user') {
        console.log('User message detected - processing for memory embedding only (response handled by /process-message endpoint)');
        
        // Check if a response already exists
        const { data: existingResponses, error: checkError } = await supabase
          .from('messages')
          .select('id')
          .eq('role', 'assistant')
          .eq('user_id', MAYA_SYSTEM_USER_ID)
          .filter('metadata', 'cs', JSON.stringify({replyTo: item.source_id}))
          .limit(1);
          
        if (checkError) {
          console.error('Error checking for existing responses:', checkError);
        }
        
        if (existingResponses && existingResponses.length > 0) {
          console.log(`Response already exists for message ${item.source_id}, skipping response generation`);
          // Don't generate a response, just continue with memory processing
        } else {
          console.log(`No response found for message ${item.source_id}, but skipping response generation as it should be handled by /process-message endpoint`);
          // The /process-message endpoint should have already handled response generation
          // If it didn't, that's a separate issue to investigate
        }
        
        // Continue with memory processing only (no response generation)
      }
    }
    // Add other source types here as needed
    
    // Mark as completed
    const { error: completeError } = await supabase
      .from('memory_ingestion_queue')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
        processed_at: new Date().toISOString()
      })
      .eq('id', item.id);
      
    if (completeError) {
      console.error(`Error updating item ${item.id} status to completed:`, completeError);
      return false;
    }
    
    console.log(`Successfully processed item ${item.id}`);

    // After successfully processing a user message, look for responses from Maya that might need processing
    if (item.metadata.role === 'user' && 
        item.metadata.userId !== MAYA_SYSTEM_USER_ID) {
      
      console.log('Checking for any uncaught Maya responses for this message...');
      
      try {
        // Look for Maya's responses to this message that might not be in the queue yet
        const { data: mayaResponses, error: mayaError } = await supabase
          .from('messages')
          .select('id, content, created_at')
          .eq('role', 'assistant')
          .eq('user_id', MAYA_SYSTEM_USER_ID)
          .filter('metadata', 'cs', JSON.stringify({replyTo: item.source_id}))
          .order('created_at', { ascending: false })
          .limit(5);
          
        if (mayaError) {
          console.error('Error checking for Maya responses:', mayaError);
        } else if (mayaResponses && mayaResponses.length > 0) {
          console.log(`Found ${mayaResponses.length} Maya responses to check`);
          
          // Check each response to see if it's already in the queue
          for (const response of mayaResponses) {
            // Check if this response is already in the queue
            const { data: existingItems, error: checkError } = await supabase
              .from('memory_ingestion_queue')
              .select('id, status')
              .eq('source_type', 'chat_message')
              .eq('source_id', response.id)
              .limit(1);
            
            if (checkError) {
              console.error('Error checking for existing queue item:', checkError);
              continue;
            }
            
            // If already in queue and not failed, skip
            if (existingItems && existingItems.length > 0 && existingItems[0].status !== 'failed') {
              console.log(`Maya response ${response.id} already in queue with status ${existingItems[0].status}, skipping`);
              continue;
            }
            
            // Check if already processed in memories
            const { data: existingMemories, error: memoryError } = await supabase
              .from('maya_memories')
              .select('id')
              .filter('metadata', 'cs', JSON.stringify({sourceId: response.id}))
              .limit(1);
              
            if (memoryError) {
              console.error('Error checking for existing memory:', memoryError);
            } else if (existingMemories && existingMemories.length > 0) {
              console.log(`Maya response ${response.id} already exists in maya_memories, skipping queue`);
              continue;
            }
            
            // Add to queue if not already processed
            console.log(`Adding Maya response ${response.id} to memory ingestion queue`);
            
            const { error: queueError } = await supabase
              .from('memory_ingestion_queue')
              .insert({
                source_type: 'chat_message',
                source_id: response.id,
                content_to_process: response.content,
                metadata: {
                  userId: MAYA_SYSTEM_USER_ID,
                  roomId: item.metadata.roomId,
                  created_at: response.created_at,
                  role: 'assistant'
                },
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                attempts: 0
              });
              
            if (queueError) {
              console.error('Error adding Maya response to queue:', queueError);
            } else {
              console.log(`Successfully added Maya response ${response.id} to memory queue`);
            }
          }
        } else {
          console.log('No Maya responses found for this message');
        }
      } catch (responseError) {
        console.error('Error processing Maya responses:', responseError);
      }
    }

    return true;
  } catch (error: any) {
    console.error(`Error processing queue item ${item.id}:`, error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Item data:', JSON.stringify(item, null, 2));
    
    // Mark as failed if max retries reached, otherwise keep as pending
    const status = item.attempts >= MAX_RETRY_ATTEMPTS ? 'failed' : 'pending';
    
    // Record the error and update status
    const { error: failError } = await supabase
      .from('memory_ingestion_queue')
      .update({
        status,
        updated_at: new Date().toISOString(),
        last_error: error.message || 'Unknown error'
      })
      .eq('id', item.id);
      
    if (failError) {
      console.error(`Error updating item ${item.id} status:`, failError);
    }
    
    return false;
  }
}

/**
 * Process pending and memory_stored items in the memory ingestion queue
 *
 * Status workflow:
 * - pending: New items, need full processing (memory storage + LLM extraction)
 * - memory_stored: Items where memory was stored by Supabase cron, need LLM extraction only
 * - completed: Fully processed
 */
export async function processMemoryQueue(): Promise<{ processed: number, failed: number, total: number }> {
  console.log('Processing memory ingestion queue...');

  try {
    // Get pending items (need full processing)
    const { data: pendingItems, error: pendingError } = await supabase
      .from('memory_ingestion_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (pendingError) {
      console.error('Error fetching pending items:', pendingError);
      throw pendingError;
    }

    // Get memory_stored items (need LLM extraction only)
    const { data: memoryStoredItems, error: memoryStoredError } = await supabase
      .from('memory_ingestion_queue')
      .select('*')
      .eq('status', 'memory_stored')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (memoryStoredError) {
      console.error('Error fetching memory_stored items:', memoryStoredError);
      throw memoryStoredError;
    }

    const totalPending = pendingItems?.length || 0;
    const totalMemoryStored = memoryStoredItems?.length || 0;

    if (totalPending === 0 && totalMemoryStored === 0) {
      console.log('No items to process in queue');
      return { processed: 0, failed: 0, total: 0 };
    }

    console.log(`Found ${totalPending} pending items and ${totalMemoryStored} memory_stored items to process`);

    // Process each item
    let processedCount = 0;
    let failedCount = 0;

    // Process pending items (full processing)
    if (pendingItems && pendingItems.length > 0) {
      console.log(`Processing ${pendingItems.length} pending items (full processing)...`);
      for (const item of pendingItems) {
        const success = await processQueueItem(item, false);
        success ? processedCount++ : failedCount++;
      }
    }

    // Process memory_stored items (LLM extraction only)
    if (memoryStoredItems && memoryStoredItems.length > 0) {
      console.log(`Processing ${memoryStoredItems.length} memory_stored items (LLM extraction only)...`);
      for (const item of memoryStoredItems) {
        const success = await processQueueItem(item, true);
        success ? processedCount++ : failedCount++;
      }
    }

    console.log(`Processing complete. Processed: ${processedCount}, Failed: ${failedCount}`);

    return { processed: processedCount, failed: failedCount, total: totalPending + totalMemoryStored };
  } catch (error: any) {
    console.error('Error processing queue:', error);
    console.error('Error details:', error.message, error.stack);
    return { processed: 0, failed: 0, total: 0 };
  }
}

/**
 * Add an API endpoint handler to process the queue via HTTP
 */
export function setupQueueProcessingEndpoint(app: any) {
  app.post('/process-queue', async (req: any, res: any) => {
    console.log('Received request to process memory queue');
    
    try {
      const result = await processMemoryQueue();
      
      res.status(200).json({
        message: `Processed ${result.processed} items, ${result.failed} failed`,
        ...result
      });
    } catch (error) {
      console.error('Error processing memory queue:', error);
      res.status(500).json({ error: 'Failed to process memory queue' });
    }
  });
}

/**
 * Initialize a periodic queue processor
 * @param intervalSeconds How often to check the queue (in seconds)
 */
export function startQueueProcessor(intervalSeconds: number = 60) {
  console.log(`Starting memory queue processor with ${intervalSeconds}s interval`);
  
  // Initial processing
  processMemoryQueue().catch(err => console.error('Error in queue processor:', err));
  
  // Set up periodic processing
  const intervalId = setInterval(() => {
    processMemoryQueue().catch(err => console.error('Error in queue processor:', err));
  }, intervalSeconds * 1000);
  
  // Return the interval ID so it can be cleared if needed
  return intervalId;
} 