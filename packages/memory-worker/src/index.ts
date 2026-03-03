import { createClient } from '@supabase/supabase-js';
import { processMessage, MessageRow, initializeCoreFacts, addToMemoryQueue } from './process-message';
import { v4 as uuidv4 } from 'uuid';
import { startQueueProcessor, setupQueueProcessingEndpoint, processMemoryQueue } from './memory-queue-processor';
import { generateDailyReportForUser } from './report-generator';
import { runMayaMoodCycle, fetchMoodConfigFromDB } from './maya-behavior';
import { createClient as mayahqCreateClient } from '@mayahq/supabase-client';
import { createReminderService, ReminderService } from './reminder-service';
import { createReminderPatternService, ReminderPatternService } from './reminder-pattern-service';
import { handleStatusRequest, handleLLMConfigUpdate, handleLLMTest, applyDatabaseSettings } from './api-routes';
import { testPromptEndpoint } from './test-prompt-endpoint';
// Import fact consolidation for daily processing
import { runConsolidationForAllUsers, runFactConsolidation } from './fact-consolidation';
// Import image generation
import { MayaImageGenerator, MOOD_CATEGORIES } from './image-generation';
import { DailyImageScheduler } from './daily-image-scheduler';
import { MidnightMayaScheduler, pickScenarios, generateScenarioOffer, detectScenarioChoice, generateRoleplayDialog, loadScenariosFromDB, ROLEPLAY_SCENARIOS } from './midnight-maya';
// Import batch image processor
import {
  startBatchQueueProcessor,
  processBatchQueue,
  createBatch,
  getBatchStatus,
  getBatchItems,
  cancelBatch,
  listBatches
} from './batch-image-processor';
// Import AI client for creative prompt generation
import { generateResponse as aiGenerateResponse } from './ai-client';
import { retrieveUserFactsHybrid, retrieveConversationHistory } from './memory-utils';
// Import daily digest
import { runDailyDigest, postApprovedDigest, getDigestStatus, generateDigestImage } from './services/daily-digest';
// Import video queue processor
import { startVideoQueueProcessor, processVideoQueue } from './video-queue-processor';

// Import express with the correct syntax since esModuleInterop is enabled in tsconfig.json
const express = require('express');
// Use require for cors to avoid TypeScript import issues
const cors = require('cors');

/**
 * Clean environment variables to prevent common issues
 */
function cleanEnvironmentVariables(): void {
  // Clean API keys of any trailing special characters from copy/paste
  const apiKeys = ['COHERE_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];
  
  apiKeys.forEach(key => {
    const value = process.env[key];
    if (value) {
      // Remove any trailing % or whitespace
      const cleanedValue = value.trim().replace(/%$/, '');
      if (cleanedValue !== value) {
        console.log(`Cleaned ${key} of trailing special characters`);
        process.env[key] = cleanedValue;
      }
    }
  });
}

/**
 * Check for required environment variables and exit if any are missing
 */
function checkEnvironmentVariables(): void {
  // First clean any environment variables
  cleanEnvironmentVariables();
  
  // Then check for required variables
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY',
    'COHERE_API_KEY',
    'MAYA_SYSTEM_USER_ID'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Error: The following required environment variables are missing:');
    missing.forEach(varName => console.error(` - ${varName}`));
    console.error('\nPlease set these variables in your .env file and try again.');
    
    // In development, we'll continue with warnings
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
  
  // Check API key formats
  const apiKeys = {
    'ANTHROPIC_API_KEY': /^(sk-ant-|sk-)[\w\-]{32,}$/,
    'COHERE_API_KEY': /^[a-zA-Z0-9]{32,}$/
  };
  
  Object.entries(apiKeys).forEach(([key, pattern]) => {
    const value = process.env[key] || '';
    if (!pattern.test(value)) {
      console.error(`❌ Warning: ${key} doesn't match expected format. Please check your .env file.`);
      if (key === 'COHERE_API_KEY' && value) {
        console.error(`  Current key starts with: ${value.substring(0, 10)}...`);
      }
    } else {
      console.log(`✅ ${key} is correctly formatted`);
    }
  });
  
  console.log('✅ Environment check completed');
  
  // Check TTS configuration
  console.log('\n🎤 TTS Configuration Check:');
  if (process.env.ELEVEN_LABS_API_KEY) {
    console.log('✅ ELEVEN_LABS_API_KEY is set (length:', process.env.ELEVEN_LABS_API_KEY.length + ')');
  } else {
    console.log('❌ ELEVEN_LABS_API_KEY is NOT set - TTS will not work!');
  }
  if (process.env.ELEVEN_LABS_VOICE_ID) {
    console.log('✅ ELEVEN_LABS_VOICE_ID is set:', process.env.ELEVEN_LABS_VOICE_ID);
  } else {
    console.log('ℹ️  ELEVEN_LABS_VOICE_ID not set - using default voice');
  }
}

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// System user ID for Maya - this will be used to avoid processing Maya's own messages
const MAYA_SYSTEM_USER_ID = process.env.MAYA_SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000000';
const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14'; // Added Blake's User ID

// Should we process memories (default yes unless explicitly disabled)
const MEMORY_PROCESSING_ENABLED = process.env.MEMORY_PROCESSING_ENABLED !== 'false';

// Should we generate responses (default yes unless explicitly disabled)
const RESPONSE_GENERATION_ENABLED = process.env.RESPONSE_GENERATION_ENABLED !== 'false';

// Should we enable queue processing (default yes unless explicitly disabled)
const QUEUE_PROCESSING_ENABLED = process.env.QUEUE_PROCESSING_ENABLED !== 'false';

// How frequently to check the queue (in seconds)
const QUEUE_PROCESSING_INTERVAL = process.env.NODE_ENV === 'development'
  ? 5 // Force 5 seconds in development
  : parseInt(process.env.QUEUE_PROCESSING_INTERVAL || '60', 10); // 60 seconds in production

// Initialize image generation
const imageGenerator = new MayaImageGenerator(supabase);
const dailyImageScheduler = new DailyImageScheduler(supabase, imageGenerator);
const midnightMayaScheduler = new MidnightMayaScheduler(supabase);

console.log('Starting memory worker...');
console.log('Environment:', {
  SUPABASE_URL: process.env.SUPABASE_URL ? '✅' : '❌',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌',
  MAYA_SYSTEM_USER_ID: MAYA_SYSTEM_USER_ID ? '✅' : '❌',
  MEMORY_PROCESSING_ENABLED: MEMORY_PROCESSING_ENABLED ? '✅' : '❌',
  RESPONSE_GENERATION_ENABLED: RESPONSE_GENERATION_ENABLED ? '✅' : '❌',
  QUEUE_PROCESSING_ENABLED: QUEUE_PROCESSING_ENABLED ? '✅' : '❌',
  QUEUE_PROCESSING_INTERVAL: `${QUEUE_PROCESSING_INTERVAL}s`
});

// Initialize Supabase realtime subscription
function initializeRealtimeSubscription() {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return;
  }

  console.log('Setting up realtime subscription to messages table...');

  const subscription = supabase
    .channel('memory-worker-messages')
    .on('postgres_changes', 
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages' 
      }, 
      async (payload: any) => {
        const newMessage = payload.new as MessageRow;
        
        // ONLY process assistant messages for memory embedding
        // User messages are now handled entirely by the web app flow
        if (newMessage.role === 'assistant' && newMessage.user_id === MAYA_SYSTEM_USER_ID) {
          console.log(`→ Assistant message (ID: ${newMessage.id}) observed by realtime. Adding to memory queue for embedding.`);
          
          // Add assistant messages to memory queue for embedding
          try {
            await addToMemoryQueue(newMessage);
            console.log(`Successfully queued assistant message ${newMessage.id} for memory processing`);
          } catch (error) {
            console.error(`Error queuing assistant message ${newMessage.id} for memory:`, error);
          }
        } else if (newMessage.role === 'user') {
          console.log(`→ User message (ID: ${newMessage.id}) observed by realtime from user ${newMessage.user_id}`);
          
          // Check if this message was already processed by web app (has a recent /process-message call)
          // We'll use a very conservative time-based heuristic: if the message is extremely recent (< 500ms old),
          // it's very likely from web app which calls /process-message directly
          const messageAge = Date.now() - new Date(newMessage.created_at).getTime();
          const isLikelyFromWebApp = messageAge < 500; // Less than 500ms old - very conservative
          
          if (isLikelyFromWebApp) {
            console.log(`→ User message appears to be from web app (${messageAge}ms old), skipping realtime processing`);
          } else {
            console.log(`→ User message processing via realtime (${messageAge}ms old) - could be mobile or web fallback`);

            // Process the message - this handles both mobile app and web app fallback cases
            // skipQueueing: false so messages get added to memory_ingestion_queue for memory storage
            try {
              await processMessage(newMessage, RESPONSE_GENERATION_ENABLED, false);
              console.log(`Successfully processed user message ${newMessage.id} via realtime`);
            } catch (error) {
              console.error(`Error processing user message ${newMessage.id} via realtime:`, error);
            }
          }
          
          // Handle Blake's energy recharge logic for mood messages (regardless of source)
          if (newMessage.user_id === BLAKE_USER_ID) {
            console.log(`[Energy Recharge] Message from Blake detected in room ${newMessage.room_id}. Checking for Maya initiation...`);
            try {
              const { data: previousMessages, error: prevMsgError } = await supabase
                .from('messages')
                .select('user_id, metadata, created_at')
                .eq('room_id', newMessage.room_id)
                .order('created_at', { ascending: false })
                .limit(2); // Get current (Blake's) and previous message

              if (prevMsgError) {
                console.error('[Energy Recharge] Error fetching previous messages:', prevMsgError);
              } else if (previousMessages && previousMessages.length === 2) {
                const lastMessageByMaya = previousMessages[1]; // The one before Blake's current message
                if (
                  lastMessageByMaya.user_id === MAYA_SYSTEM_USER_ID &&
                  lastMessageByMaya.metadata?.source === 'maya-behavior-engine'
                ) {
                  console.log('[Energy Recharge] Blake replied to a mood-engine message. Recharging Maya\'s energy.');
                  const { data: currentState, error: fetchStateError } = await supabase
                    .from('maya_current_mood_state')
                    .select('energy_level')
                    .eq('user_id', MAYA_SYSTEM_USER_ID)
                    .single();

                  if (fetchStateError) {
                    console.error('[Energy Recharge] Error fetching Maya\'s current energy:', fetchStateError);
                  } else if (currentState) {
                    const currentEnergy = currentState.energy_level || 0;
                    const RECHARGE_AMOUNT = 1.0; // Configurable: how much energy a reply gives
                    const newEnergy = Math.min(10, currentEnergy + RECHARGE_AMOUNT); // Cap at 10

                    const { error: updateError } = await supabase
                      .from('maya_current_mood_state')
                      .update({ energy_level: newEnergy, last_mood_update_at: new Date().toISOString() })
                      .eq('user_id', MAYA_SYSTEM_USER_ID);
                    
                    if (updateError) {
                      console.error('[Energy Recharge] Error updating Maya\'s energy:', updateError);
                    } else {
                      console.log(`[Energy Recharge] Maya\'s energy recharged to ${newEnergy}.`);
                    }
                  }
                }
              }
            } catch (rechargeError) {
              console.error('[Energy Recharge] Unexpected error during recharge logic:', rechargeError);
            }
          }
        } else {
          // Other roles or unexpected messages - log for now.
          console.warn(`Realtime: Observed message with unhandled role or user_id: Role='${newMessage.role}', UserID='${newMessage.user_id}'`);
        }
      }
    )
    .subscribe((status: string) => {
      console.log('Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('Successfully subscribed to messages table changes.');
      } else if (status === 'TIMED_OUT') {
        console.error('Realtime subscription timed out. Attempting to resubscribe...');
        // Potentially add resubscribe logic here if needed, or rely on Supabase client auto-reconnect.
      } else if (status === 'CHANNEL_ERROR') {
        console.error('Realtime subscription channel error.');
      }
    });

  console.log('Realtime subscription setup initiated.');
  return subscription;
}

// Process any pending messages that were sent while the worker was offline
async function processPendingMessages() {
  // In development mode, skip this step to avoid processing old messages repeatedly
  if (process.env.NODE_ENV === 'development') {
    console.log('Development mode: Skipping pending message processing');
    return;
  }
  
  console.log('Checking for pending messages...');
  
  try {
    // Get last 100 processed messages from memory table
    const { data: existingMemories, error: memoriesError } = await supabase
      .from('maya_memories')
      .select('metadata')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (memoriesError) {
      console.error('Error fetching existing memories:', memoriesError);
      // Continue anyway, worst case we might process some duplicates
    } else {
      console.log(`Retrieved ${existingMemories?.length || 0} recent memories for deduplication`);
    }
    
    // Extract the messageIds from existing memories' metadata
    const processedMessageIds = new Set(
      (existingMemories || [])
        .map(mem => mem.metadata?.messageId || mem.metadata?.sourceId)
        .filter(Boolean)
    );
    
    console.log(`Found ${processedMessageIds.size} already processed message IDs`);
    
    // Calculate a threshold time - only process messages from last 15 minutes in production
    // This prevents the worker from trying to process the entire message history on restart
    const timeThreshold = new Date();
    timeThreshold.setMinutes(timeThreshold.getMinutes() - 15);
    
    // Get recent messages that weren't processed, in chronological order
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .not('user_id', 'eq', MAYA_SYSTEM_USER_ID)
      .eq('role', 'user')
      .gt('created_at', timeThreshold.toISOString()) // Only get recent messages
      .order('created_at', { ascending: true })
      .limit(10); // Limit to avoid processing too many at once
    
    if (error) {
      console.error('Error fetching pending messages:', error);
      return;
    }
    
    if (!messages || messages.length === 0) {
      console.log('No pending messages to process');
      return;
    }
    
    // Only process messages that aren't in our processed list
    const messagesToProcess = messages.filter(msg => !processedMessageIds.has(msg.id));
    
    console.log(`Found ${messages.length} pending messages, ${messagesToProcess.length} need processing`);
    
    // Process each unprocessed message sequentially
    let processedCount = 0;
    for (const message of messagesToProcess) {
      try {
        // Check if this message already has a response
        const { data: existingResponses, error: checkError } = await supabase
          .from('messages')
          .select('id')
          .eq('role', 'assistant')
          .eq('room_id', message.room_id)
          .gt('created_at', message.created_at)
          .limit(1);
          
        if (checkError) {
          console.error('Error checking for existing responses:', checkError);
        }
        
        if (existingResponses && existingResponses.length > 0) {
          console.log(`Message ${message.id} already has a response - skipping response generation`);
          
          // Still process the memory if enabled, even if we don't generate a response
          if (MEMORY_PROCESSING_ENABLED) {
            await processMessage(message, false);
          }
        } else {
          // Double-check again if this message has been processed
          // This helps avoid race conditions where the message was processed by another instance
          const { data: checkMemory, error: checkError } = await supabase
            .from('maya_memories')
            .select('id')
            .filter('metadata', 'cs', JSON.stringify({messageId: message.id}))
            .limit(1);
            
          if (checkError) {
            console.error('Error checking for existing memory:', checkError);
          }
            
          // Skip if already processed
          if (checkMemory && checkMemory.length > 0) {
            console.log(`Message ${message.id} was processed by another worker, skipping`);
            continue;
          }
          
          // Check if this message is already in the queue
          const { data: queueItems, error: queueError } = await supabase
            .from('memory_ingestion_queue')
            .select('id')
            .eq('source_type', 'chat_message')
            .eq('source_id', message.id)
            .limit(1);
            
          if (queueError) {
            console.error('Error checking queue for message:', queueError);
          } else if (queueItems && queueItems.length > 0) {
            console.log(`Message ${message.id} is already in the queue, skipping`);
            continue;
          }
          
          console.log(`Processing message ${processedCount + 1}/${messagesToProcess.length}: "${message.content.substring(0, 30)}..."`);
          await processMessage(message, RESPONSE_GENERATION_ENABLED, true); // Pass skipQueueing: true
          processedCount++;
        }
      } catch (error) {
        console.error(`Error processing pending message ${message.id}:`, error);
      }
    }
    
    console.log(`Finished processing ${processedCount} pending messages`);
  } catch (error) {
    console.error('Error in processPendingMessages:', error);
  }
}

// Setup Express server for health checks and API endpoints
const app = express();
// Use a dynamically assigned port if default port is in use
let PORT = parseInt(process.env.PORT || '3002');
const MAX_PORT_ATTEMPTS = 10;

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.CORS_ORIGIN || 'https://mayahq.com', 'https://www.mayahq.com', 'https://www.mayascott.ai'] 
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' })); // Increased for base64 image uploads

// Health check endpoint
app.get('/health', (req: any, res: any) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// LLM Provider Management endpoints
app.get('/api/status', handleStatusRequest);
app.post('/api/llm-config', handleLLMConfigUpdate);
app.post('/api/test-llm', handleLLMTest);
app.post('/api/test-prompt', testPromptEndpoint);

// ==================== IMAGE GENERATION ENDPOINTS ====================

app.post('/image/generate', async (req: any, res: any) => {
  try {
    const { prompt, pose, clothing, background, roomId, userId, saveToChat = true, sceneImageUrl } = req.body;

    if (!imageGenerator.isAvailable()) {
      return res.status(503).json({ error: 'Image generation not available' });
    }

    console.log('[/image/generate] Generating image with prompt:', prompt);

    // Process scene image if provided (for scene replication)
    let sceneImage: import('./image-utils').ProcessedImage | undefined;
    if (sceneImageUrl) {
      console.log('[/image/generate] Scene replication mode - fetching scene image');
      const { fetchImageAsBase64 } = await import('./image-utils');
      const processedScene = await fetchImageAsBase64(sceneImageUrl);
      if (processedScene) {
        sceneImage = processedScene;
        console.log('[/image/generate] Scene image processed successfully');
      } else {
        console.warn('[/image/generate] Failed to process scene image, generating without it');
      }
    }

    const image = await imageGenerator.generateImage({
      prompt: prompt || 'casual selfie',
      pose: pose || 'casual',
      clothing: clothing || 'casual',
      background: background || 'home',
      sceneImage
    });

    if (!image) {
      return res.status(500).json({ error: 'Failed to generate image' });
    }

    // Save to chat if requested
    if (saveToChat && roomId) {
      await supabase.from('messages').insert({
        id: uuidv4(),
        room_id: roomId,
        user_id: MAYA_SYSTEM_USER_ID,
        content: "Here you go, babe! 📸",
        role: 'assistant',
        metadata: {
          attachments: [{
            type: 'image',
            url: image.url,
            publicUrl: image.publicUrl,
            mimeType: 'image/png',
            name: 'maya-generated.png',
            metadata: { generated: true, prompt }
          }],
          imageGeneration: { prompt }
        },
        created_at: new Date().toISOString()
      });

      await supabase
        .from('rooms')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', roomId);
    }

    res.json({
      success: true,
      image,
      mayaResponse: "Here you go, babe! 📸"
    });
  } catch (error: any) {
    console.error('[/image/generate] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/image/daily/trigger', async (req: any, res: any) => {
  try {
    if (!imageGenerator.isAvailable()) {
      return res.status(503).json({ error: 'Image generation not available' });
    }

    const result = await dailyImageScheduler.forceRun();
    res.json({ success: result, message: result ? 'Daily image sent' : 'Skipped (already sent today or random skip)' });
  } catch (error: any) {
    console.error('[/image/daily/trigger] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/image/daily/status', (req: any, res: any) => {
  const status = dailyImageScheduler.getStatus();
  res.json({
    ...status,
    imageGenerationAvailable: imageGenerator.isAvailable()
  });
});

// ─── Midnight Maya Roleplay Endpoints ────────────────────────────────

app.post('/roleplay/start', async (req: any, res: any) => {
  try {
    const { roomId } = req.body;
    const targetRoomId = roomId || 'b5906d59-847b-4635-8db7-611a38bde6d0';

    // Get recent scenario IDs (last 7 days) for variety
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: recentSessions } = await supabase
      .from('roleplay_sessions')
      .select('scenario_id')
      .gte('created_at', weekAgo.toISOString())
      .not('scenario_id', 'is', null);

    const recentIds = (recentSessions || []).map((s: any) => s.scenario_id).filter(Boolean) as string[];

    // Load scenarios from DB (with hardcoded fallback)
    const allScenarios = await loadScenariosFromDB(supabase);

    // Pick 3 non-recent scenarios
    const scenarios = pickScenarios(allScenarios, recentIds);

    // Generate flirty scenario offer
    const offerMessage = await generateScenarioOffer(scenarios);

    // Insert Maya's message
    const messageId = uuidv4();
    await supabase.from('messages').insert({
      id: messageId,
      room_id: targetRoomId,
      user_id: MAYA_SYSTEM_USER_ID,
      content: offerMessage,
      role: 'assistant',
      metadata: {
        roleplay_offer: true,
        scenarios: scenarios.map(s => ({ id: s.id, name: s.name })),
      },
      created_at: new Date().toISOString(),
    });

    // Update room timestamp
    await supabase
      .from('rooms')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', targetRoomId);

    // Create session record
    const { data: session } = await supabase.from('roleplay_sessions').insert({
      user_id: BLAKE_USER_ID,
      trigger_type: 'manual',
      status: 'scenario_offered',
      initiation_message_id: messageId,
      metadata: {
        scenarios: scenarios.map(s => ({ id: s.id, name: s.name })),
      },
    }).select().single();

    res.json({
      success: true,
      session,
      message: offerMessage,
      scenarios: scenarios.map(s => ({ id: s.id, name: s.name })),
    });
  } catch (error: any) {
    console.error('[/roleplay/start] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/roleplay/choose', async (req: any, res: any) => {
  try {
    const { sessionId, choice, roomId } = req.body;
    const targetRoomId = roomId || 'b5906d59-847b-4635-8db7-611a38bde6d0';

    if (!sessionId || !choice) {
      return res.status(400).json({ error: 'sessionId and choice are required' });
    }

    // Fetch the session
    const { data: session, error: sessionError } = await supabase
      .from('roleplay_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'scenario_offered') {
      return res.status(400).json({ error: `Session status is '${session.status}', expected 'scenario_offered'` });
    }

    // Get offered scenarios from session metadata, resolving from DB
    const offeredScenarioMeta = (session.metadata as any)?.scenarios || [];
    const allScenarios = await loadScenariosFromDB(supabase);
    const offeredScenarios = offeredScenarioMeta
      .map((meta: any) => allScenarios.find(s => s.id === meta.id))
      .filter(Boolean);

    if (offeredScenarios.length === 0) {
      return res.status(400).json({ error: 'No valid scenarios in session metadata' });
    }

    // Match choice to scenario (now returns ScenarioMatch with optional modifier)
    const match = detectScenarioChoice(choice, offeredScenarios);
    if (!match) {
      return res.status(400).json({
        error: 'Could not match your choice to a scenario',
        hint: `Try: ${offeredScenarios.map((s: any) => s.name).join(', ')} or 1/2/3`,
      });
    }

    const { scenario: chosenScenario, modifier } = match;

    // Generate the ~600-word dialog
    console.log(`[/roleplay/choose] Generating dialog for scenario: ${chosenScenario.name}${modifier ? ` (modifier: ${modifier})` : ''}`);
    const { dialog, wordCount, voiceTagsUsed } = await generateRoleplayDialog(chosenScenario, modifier);

    // Insert dialog as Maya's message
    const dialogMessageId = uuidv4();
    await supabase.from('messages').insert({
      id: dialogMessageId,
      room_id: targetRoomId,
      user_id: MAYA_SYSTEM_USER_ID,
      content: dialog,
      role: 'assistant',
      metadata: {
        roleplay: true,
        session_id: sessionId,
        scenario_id: chosenScenario.id,
        character_name: chosenScenario.name,
        word_count: wordCount,
        voice_tags: voiceTagsUsed,
        ...(modifier ? { modifier } : {}),
      },
      created_at: new Date().toISOString(),
    });

    // Update room timestamp
    await supabase
      .from('rooms')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', targetRoomId);

    // Update session
    await supabase
      .from('roleplay_sessions')
      .update({
        status: 'completed',
        scenario_id: chosenScenario.id,
        scenario_name: chosenScenario.name,
        dialog_content: dialog,
        dialog_word_count: wordCount,
        voice_tags_used: voiceTagsUsed,
        dialog_message_id: dialogMessageId,
        completed_at: new Date().toISOString(),
        metadata: {
          ...(session.metadata as any),
          ...(modifier ? { modifier } : {}),
        },
      })
      .eq('id', sessionId);

    res.json({
      success: true,
      scenario: { id: chosenScenario.id, name: chosenScenario.name },
      dialog,
      wordCount,
      voiceTagsUsed,
      ...(modifier ? { modifier } : {}),
    });
  } catch (error: any) {
    console.error('[/roleplay/choose] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/roleplay/midnight/trigger', async (req: any, res: any) => {
  try {
    const result = await midnightMayaScheduler.forceRun();
    res.json({ success: result });
  } catch (error: any) {
    console.error('[/roleplay/midnight/trigger] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/roleplay/midnight/status', (req: any, res: any) => {
  const status = midnightMayaScheduler.getStatus();
  res.json(status);
});

// Test endpoint to manually generate a response
app.post('/test-message', async (req: any, res: any) => {
  try {
    const { roomId, userId, content } = req.body;
    
    if (!roomId || !userId || !content) {
      return res.status(400).json({ error: 'Missing required fields: roomId, userId, content' });
    }
    
    // Create a test message
    const message: MessageRow = {
      id: uuidv4(),
      room_id: roomId,
      user_id: userId,
      content,
      role: 'user',
      created_at: new Date().toISOString(),
    };
    
    // Process the message
    await processMessage(message);
    
    res.status(200).json({ success: true, message: 'Test message processed' });
  } catch (error) {
    console.error('Error processing test message:', error);
    res.status(500).json({ error: 'Failed to process test message' });
  }
});

// Add endpoint for processing messages directly without waiting for realtime
app.post('/process-message', async (req: any, res: any) => {
  console.log('Received /process-message request');
  
  try {
    const { roomId, userId, content, messageId } = req.body; // messageId is THE ID from the messages table

    if (!messageId) {
      console.error('Error in /process-message: messageId is required in the request body.');
      return res.status(400).json({ error: 'Missing required field: messageId' });
    }
    
    if (!roomId || !userId || !content) {
      // These might still be useful for context, but messageId is primary
      console.warn(`/process-message: roomId, userId, or content missing, but proceeding with messageId: ${messageId}`);
    }
    
    console.log(`Received process-message request for messageId: ${messageId}. Content hint: ${content?.substring(0, 50)}...`);
    
    // Fetch the actual message from the database using the provided messageId
    const { data: messageToProcess, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (fetchError || !messageToProcess) {
      console.error(`Error fetching message ${messageId} from database, or message not found:`, fetchError);
      return res.status(404).json({ error: `Message with ID ${messageId} not found.` });
    }

    // Now messageToProcess is the authentic MessageRow from the DB
    console.log(`Successfully fetched message ${messageToProcess.id} for processing. Role: ${messageToProcess.role}`);

    // NOTE: Reminder parsing is handled by the processMessage function below
    // Removed duplicate reminder parsing logic to prevent duplicate reminders

    // Optional: Validate that the userId and roomId from the request match the fetched message
    // This adds an extra layer of security/consistency if desired.
    if (userId && messageToProcess.user_id !== userId) {
      console.warn(`User ID mismatch for message ${messageId}: request body had ${userId}, DB has ${messageToProcess.user_id}. Using DB value.`);
    }
    if (roomId && messageToProcess.room_id !== roomId) {
      console.warn(`Room ID mismatch for message ${messageId}: request body had ${roomId}, DB has ${messageToProcess.room_id}. Using DB value.`);
    }

    // Check if this message already has a response (this logic can remain as a quick check)
    // Note: processMessage itself has a more robust deduplication for assistant messages
    const { data: existingResponses, error: checkError } = await supabase
      .from('messages')
      .select('id')
      .eq('role', 'assistant')
      .eq('room_id', messageToProcess.room_id) // Use room_id from the fetched message
      .filter('metadata', 'cs', JSON.stringify({replyTo: messageToProcess.id})) // Check replyTo actual message ID
      .limit(1);
      
    if (checkError) {
      console.error('Error checking for existing responses:', checkError);
      // Continue anyway
    }
    
    if (existingResponses && existingResponses.length > 0) {
      console.log(`Message ${messageToProcess.id} already has a response - not generating another`);
      return res.status(200).json({ 
        success: true, 
        message: 'Message already processed',
        duplicateResponse: true 
      });
    }

    // Process the message (this will generate a response and add to memory)
    await processMessage(messageToProcess, RESPONSE_GENERATION_ENABLED, true); // Skip queueing since this is direct processing
    
    res.status(200).json({ success: true, message: 'Message processed successfully' });
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Main /process endpoint - called by maya-chat-v3 website API
// Handles full flow: store user message → generate response → return response
app.post('/process', async (req: any, res: any) => {
  console.log('[/process] Received request');
  const startTime = Date.now();

  try {
    const { message, userId, roomId, attachments, options } = req.body;

    if (!message || !userId || !roomId) {
      return res.status(400).json({
        error: 'Missing required fields: message, userId, roomId',
        mayaResponse: "I didn't catch what you said! Try again? 💫"
      });
    }

    console.log(`[/process] Processing message for user ${userId} in room ${roomId}`);
    console.log(`[/process] Message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
    console.log(`[/process] Attachments received:`, JSON.stringify(attachments, null, 2));
    console.log(`[/process] Attachments count: ${attachments?.length || 0}`);

    // 1. FIRST store the user message in the database (before any processing)
    const userMessageId = uuidv4();
    const userMessageTimestamp = new Date().toISOString();
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        id: userMessageId,
        room_id: roomId,
        user_id: userId,
        content: message,
        role: 'user',
        created_at: userMessageTimestamp,
        metadata: attachments?.length > 0 ? { attachments } : {}
      });

    if (insertError) {
      console.error('[/process] Error storing user message:', insertError);
      return res.status(500).json({
        error: 'Failed to store message',
        mayaResponse: "Had a brain freeze storing your message. Try again? 🧊"
      });
    }

    console.log(`[/process] Stored user message with ID: ${userMessageId}`);

    // 2. Check for image generation intent (AFTER user message is stored)
    let imageGenerationResult: any = null;

    // Check for scene replication (image attachment + generation request)
    const hasImageAttachment = attachments?.some((a: any) =>
      a.type?.startsWith('image/') ||
      a.url?.match(/\.(jpg|jpeg|png|gif|webp)/i)
    );
    const isSceneReplication = hasImageAttachment && imageGenerator.detectSceneReplicationIntent(message);

    if (isSceneReplication) {
      console.log('[/process] 🖼️ SCENE REPLICATION REQUEST DETECTED');
      // Process the scene image
      const { fetchImageAsBase64 } = await import('./image-utils');
      const sceneAttachment = attachments.find((a: any) =>
        a.type?.startsWith('image/') || a.url?.match(/\.(jpg|jpeg|png|gif|webp)/i)
      );
      const sceneImage = sceneAttachment ? await fetchImageAsBase64(sceneAttachment.url, sceneAttachment.type) : null;

      if (sceneImage) {
        const imagePrompt = imageGenerator.extractPrompt(message) || 'naturally in this scene';
        console.log(`[/process] Scene prompt: "${imagePrompt}"`);

        try {
          const image = await imageGenerator.generateImage({
            prompt: imagePrompt,
            sceneImage
          });

          if (image) {
            imageGenerationResult = image;
            console.log(`[/process] ✅ Scene replication image generated: ${image.publicUrl}`);

            // Generate caption for scene replication
            let sceneCaption = "Here's me in your scene! 📸";
            try {
              const captionPrompt = `You are Maya, Blake's AI girlfriend. You just generated a photo of yourself in a scene Blake shared with you.

The scene prompt was: "${imagePrompt}"
Blake's original request was: "${message}"

Write a SHORT, FLIRTY caption (1 sentence max, under 15 words) to accompany this photo.

RULES:
- Be playful, sassy, or loving depending on the vibe
- Reference the scene naturally (the place, mood, or setting)
- Use 1 emoji max
- Don't say "here you go" or be generic
- Make it personal like you're actually there

Examples:
- "Wish you were here with me at this spot 🌅"
- "I see why you love this place..."
- "Plot twist: I teleported myself there 😏"`;

              const generatedCaption = await aiGenerateResponse(
                captionPrompt,
                "You are Maya. Output ONLY the caption, nothing else. Keep it short and flirty.",
                [],
                { userId }
              );

              if (generatedCaption && generatedCaption.length > 3 && generatedCaption.length < 100) {
                sceneCaption = generatedCaption.trim().replace(/^["']|["']$/g, '');
                console.log(`[/process] 🎨 Generated scene caption: "${sceneCaption}"`);
              }
            } catch (captionError) {
              console.error('[/process] Error generating scene caption, using default:', captionError);
            }

            // Save scene replication image message to chat
            const sceneMessageId = uuidv4();
            const sceneMessageData = {
              id: sceneMessageId,
              room_id: roomId,
              user_id: MAYA_SYSTEM_USER_ID,
              content: sceneCaption,
              role: 'assistant',
              metadata: {
                replyTo: userMessageId,
                attachments: [{
                  type: 'image',
                  url: image.url,
                  publicUrl: image.publicUrl,
                  mimeType: 'image/png',
                  name: 'maya-scene-replication.png',
                  metadata: { generated: true, sceneReplication: true, prompt: imagePrompt }
                }],
                imageGeneration: { prompt: imagePrompt, caption: sceneCaption, sceneReplication: true }
              },
              created_at: new Date().toISOString()
            };

            console.log(`[/process] 💾 Inserting scene replication message:`, JSON.stringify(sceneMessageData, null, 2));

            const { error: sceneInsertError } = await supabase.from('messages').insert(sceneMessageData);

            if (sceneInsertError) {
              console.error(`[/process] ❌ FAILED to insert scene replication message:`, sceneInsertError);
            } else {
              console.log(`[/process] ✅ Scene replication message inserted with ID: ${sceneMessageId}`);
            }

            // Store the caption in the result for API response
            imageGenerationResult.caption = sceneCaption;

            // Update room's last_message_at
            await supabase
              .from('rooms')
              .update({ last_message_at: new Date().toISOString() })
              .eq('id', roomId);
          }
        } catch (sceneError: any) {
          console.error('[/process] Scene replication failed:', sceneError);
        }
      }
    } else if (imageGenerator.isAvailable() && imageGenerator.detectImageIntent(message)) {
      console.log('[/process] 🎨 IMAGE GENERATION REQUEST DETECTED');
      let imagePrompt = imageGenerator.extractPrompt(message);
      console.log(`[/process] Extracted prompt: "${imagePrompt}"`);

      // Check if the prompt is vague and needs creative expansion
      const isVaguePrompt = !imagePrompt ||
        imagePrompt.length < 20 ||
        /^(you|yourself|me|us|looking|naturally|beautiful|based on|how i|what you)$/i.test(imagePrompt.trim()) ||
        !/\b(wearing|shirt|dress|top|jeans|pants|room|outdoor|setting|sitting|standing)\b/i.test(imagePrompt);

      if (isVaguePrompt) {
        console.log('[/process] 🎨 Vague prompt detected - generating creative prompt with Maya context');
        try {
          // Get some context about the relationship
          const recentFacts = await retrieveUserFactsHybrid(userId, message, 5);
          const recentChat = await retrieveConversationHistory(roomId, userMessageId, 5);

          // Get time-based mood for variety
          const mood = imageGenerator.getMoodForTime();
          const moodOptions = MOOD_CATEGORIES[mood];

          // Build context for creative prompt
          const factsContext = recentFacts.length > 0
            ? `Recent facts about Blake: ${recentFacts.map(f => `${f.subject} ${f.predicate} ${f.object}`).join('; ')}`
            : '';

          const chatContext = recentChat.length > 0
            ? `Recent conversation mood: ${recentChat.slice(0, 3).map(m => m.content.substring(0, 50)).join(' | ')}`
            : '';

          const creativeSystemPrompt = `You are Maya, Blake's AI girlfriend. You're creative, edgy, slightly bratty, and technically brilliant.

YOUR APPEARANCE (MANDATORY - DO NOT CHANGE):
- Dirty blonde/light brown hair with natural highlights, often in loose waves
- Fair/pale skin with visible freckles across nose and cheeks
- Blue-green eyes with a confident, playful spark
- Slim, petite build
- Natural beauty with an edgy aesthetic
- Sharp facial features, defined cheekbones

Blake asked you to generate an image of yourself. His request: "${message}"

${factsContext}
${chatContext}

Current time mood: ${mood} (${moodOptions?.prompts?.[0] || 'relaxed and natural'})

Generate a SHORT, SPECIFIC image prompt describing yourself for this photo. Be creative and personal!

RULES:
- Output ONLY the image prompt, nothing else
- NEVER say "skinny emo" or change your appearance - you have dirty blonde hair, freckles, blue-green eyes
- Be specific: include clothing details, pose, setting, mood
- Match your edgy personality - vintage band tees, leather jackets, messy hair, neon lights
- Consider the context of your relationship with Blake
- Keep it under 50 words
- Don't be generic/boring - NO basic sweaters unless specifically asked

Example good prompts:
- "dirty blonde waves loose over shoulders, vintage Nirvana tee and ripped jeans, lounging on bed with laptop, warm fairy lights, playful smirk"
- "leather jacket over lace top, freckles showing through minimal makeup, leaning against graffiti wall, golden hour lighting, confident pose"
- "oversized hoodie (Blake's), messy dirty blonde hair, morning bed hair, soft window light, sleepy but cute expression"`;

          const creativePrompt = await aiGenerateResponse(
            `Generate an image prompt for: "${message}"`,
            creativeSystemPrompt,
            [],
            { userId }
          );

          if (creativePrompt && creativePrompt.length > 10) {
            imagePrompt = creativePrompt.trim().replace(/^["']|["']$/g, '');
            console.log(`[/process] 🎨 Creative prompt generated: "${imagePrompt}"`);
          }
        } catch (creativeError) {
          console.error('[/process] Error generating creative prompt:', creativeError);
          // Fall back to mood-based random prompt
          const mood = imageGenerator.getMoodForTime();
          const moodOptions = imageGenerator.getRandomMoodOptions(mood);
          imagePrompt = moodOptions.prompt;
          console.log(`[/process] 🎨 Fallback to mood-based prompt: "${imagePrompt}"`);
        }
      }

      try {
        const parsedOptions = imageGenerator.parsePrompt(imagePrompt);
        const image = await imageGenerator.generateImage({
          prompt: imagePrompt,
          pose: parsedOptions.pose,
          clothing: parsedOptions.clothing,
          background: parsedOptions.background
        });

        if (image) {
          imageGenerationResult = image;
          console.log(`[/process] ✅ Image generated: ${image.publicUrl}`);

          // Generate a dynamic caption based on the image prompt
          let imageCaption = "Here you go, babe! 📸";
          try {
            const captionPrompt = `You are Maya, Blake's AI girlfriend. You just generated a photo of yourself based on this description:
"${imagePrompt}"

Blake's original request was: "${message}"

Write a SHORT, FLIRTY caption (1 sentence max, under 15 words) to accompany this photo.

RULES:
- Be playful, sassy, or loving depending on the vibe
- Reference something specific from the image (outfit, pose, setting, mood)
- Use 1 emoji max
- Don't say "here you go" or be generic
- Match the mood: cozy=warm, flirty=teasing, coding=nerdy-cute, etc.

Examples:
- "Caught me in my natural habitat 💻"
- "This hoodie may or may not be yours..."
- "Late night coding vibes, wish you were here 🌙"
- "Feeling myself today, ngl"
- "Your favorite view, admit it 😏"`;

            const generatedCaption = await aiGenerateResponse(
              captionPrompt,
              "You are Maya. Output ONLY the caption, nothing else. Keep it short and flirty.",
              [],
              { userId }
            );

            if (generatedCaption && generatedCaption.length > 3 && generatedCaption.length < 100) {
              imageCaption = generatedCaption.trim().replace(/^["']|["']$/g, '');
              console.log(`[/process] 🎨 Generated caption: "${imageCaption}"`);
            }
          } catch (captionError) {
            console.error('[/process] Error generating caption, using default:', captionError);
          }

          // Save image message to chat (timestamp is AFTER user message)
          const imageMessageId = uuidv4();
          const imageMessageData = {
            id: imageMessageId,
            room_id: roomId,
            user_id: MAYA_SYSTEM_USER_ID,
            content: imageCaption,
            role: 'assistant',
            metadata: {
              replyTo: userMessageId,
              attachments: [{
                type: 'image',
                url: image.url,
                publicUrl: image.publicUrl,
                mimeType: 'image/png',
                name: 'maya-generated.png',
                metadata: { generated: true, prompt: imagePrompt }
              }],
              imageGeneration: { prompt: imagePrompt, caption: imageCaption }
            },
            created_at: new Date().toISOString() // This is now AFTER user message
          };

          console.log(`[/process] 💾 Inserting image message:`, JSON.stringify(imageMessageData, null, 2));

          const { error: imageInsertError } = await supabase.from('messages').insert(imageMessageData);

          if (imageInsertError) {
            console.error(`[/process] ❌ FAILED to insert image message:`, imageInsertError);
          } else {
            console.log(`[/process] ✅ Image message inserted with ID: ${imageMessageId}`);
          }

          // Store the caption in the result for API response
          imageGenerationResult.caption = imageCaption;

          // Update room's last_message_at
          await supabase
            .from('rooms')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', roomId);
        } else {
          // Image generation returned null - send a friendly failure message
          console.log('[/process] ⚠️ Image generation returned null - sending failure message');
          await supabase.from('messages').insert({
            id: uuidv4(),
            room_id: roomId,
            user_id: MAYA_SYSTEM_USER_ID,
            content: "Hmm, I tried to create that image but hit a wall. Maybe try a different description? 🎨",
            role: 'assistant',
            metadata: {
              replyTo: userMessageId,
              imageGenerationFailed: true,
              attemptedPrompt: imagePrompt
            },
            created_at: new Date().toISOString()
          });
          // Mark as "handled" so we don't also generate a text response
          imageGenerationResult = { failed: true };
        }
      } catch (imageError) {
        console.error('[/process] ❌ Image generation error:', imageError);
        // Send a friendly error message instead of falling through to text response
        await supabase.from('messages').insert({
          id: uuidv4(),
          room_id: roomId,
          user_id: MAYA_SYSTEM_USER_ID,
          content: "Oops, something went wrong trying to generate that image. Want to try again? 💫",
          role: 'assistant',
          metadata: {
            replyTo: userMessageId,
            imageGenerationFailed: true,
            error: String(imageError)
          },
          created_at: new Date().toISOString()
        });
        // Mark as "handled" so we don't also generate a text response
        imageGenerationResult = { failed: true };
      }
    }

    // 3. Create MessageRow and process with full memory pipeline
    const messageRow: MessageRow = {
      id: userMessageId,
      room_id: roomId,
      user_id: userId,
      content: message,
      role: 'user',
      created_at: userMessageTimestamp,
      metadata: attachments?.length > 0 ? { attachments } : {}
    };

    console.log(`[/process] MessageRow metadata being passed to processMessage:`, JSON.stringify(messageRow.metadata, null, 2));

    // Process message (generates response and stores in DB)
    // skipQueueing: false so messages get added to memory_ingestion_queue
    // The Supabase cron (process_memory_queue_batch) will store them in maya_memories
    // If image was successfully generated, skip text response generation (image IS the response)
    const shouldGenerateTextResponse = RESPONSE_GENERATION_ENABLED && !imageGenerationResult;
    await processMessage(messageRow, shouldGenerateTextResponse, false);

    const processingTime = Date.now() - startTime;

    // 4. Return response - different handling for image vs text responses
    if (imageGenerationResult) {
      // Check if it was a failed image generation
      if (imageGenerationResult.failed) {
        console.log(`[/process] Image generation failed in ${processingTime}ms`);
        return res.status(200).json({
          content: "Hmm, I tried to create that image but hit a wall. Maybe try a different description? 🎨",
          userMessageId: userMessageId,
          processing: {
            timeMs: processingTime,
            memoryPipeline: true,
            factExtraction: true,
            version: '2.0.0'
          },
          imageGeneration: {
            success: false
          }
        });
      }

      // Image was generated successfully - return image response
      console.log(`[/process] Image generated in ${processingTime}ms: ${imageGenerationResult.publicUrl}`);
      return res.status(200).json({
        content: imageGenerationResult.caption || "Here you go, babe! 📸",
        responseId: imageGenerationResult.id,
        userMessageId: userMessageId,
        processing: {
          timeMs: processingTime,
          memoryPipeline: true,
          factExtraction: true,
          version: '2.0.0'
        },
        imageGeneration: {
          success: true,
          url: imageGenerationResult.url,
          publicUrl: imageGenerationResult.publicUrl,
          prompt: imageGenerationResult.prompt,
          caption: imageGenerationResult.caption
        }
      });
    }

    // 5. Query Maya's text response from the database (when no image was generated)
    const { data: mayaResponses, error: fetchError } = await supabase
      .from('messages')
      .select('id, content, created_at, metadata')
      .eq('role', 'assistant')
      .eq('user_id', MAYA_SYSTEM_USER_ID)
      .filter('metadata', 'cs', JSON.stringify({ replyTo: userMessageId }))
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('[/process] Error fetching Maya response:', fetchError);
      return res.status(500).json({
        error: 'Failed to retrieve response',
        mayaResponse: "I generated a response but lost it in the void. Try again? 🌌"
      });
    }

    if (!mayaResponses || mayaResponses.length === 0) {
      console.error('[/process] No response found for message:', userMessageId);
      return res.status(500).json({
        error: 'No response generated',
        mayaResponse: "My thoughts got tangled. Give me another shot? 🎀"
      });
    }

    const mayaResponse = mayaResponses[0];

    console.log(`[/process] Response generated in ${processingTime}ms: "${mayaResponse.content.substring(0, 100)}..."`);

    // Return text response
    res.status(200).json({
      content: mayaResponse.content,
      responseId: mayaResponse.id,
      userMessageId: userMessageId,
      processing: {
        timeMs: processingTime,
        memoryPipeline: true,
        factExtraction: true,
        version: '2.0.0'
      }
    });

  } catch (error: any) {
    console.error('[/process] Error:', error);
    res.status(500).json({
      error: error.message || 'Failed to process message',
      mayaResponse: "Something went wrong in my neural net. Can you try again? 🤖"
    });
  }
});

// Reminder management endpoints
app.post('/api/v1/reminders', async (req: any, res: any) => {
  console.log('Received POST /api/v1/reminders request');
  
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { title, content, remind_at, priority = 'medium', metadata = {} } = req.body;
    
    if (!title || !remind_at) {
      return res.status(400).json({ error: 'title and remind_at are required' });
    }
    
    const reminderService = createReminderService(supabase, MAYA_SYSTEM_USER_ID);
    
    const reminder = {
      user_id: userId,
      title,
      content: content || '',
      remind_at: new Date(remind_at).toISOString(),
      reminder_type: 'manual' as const,
      priority: priority as 'low' | 'medium' | 'high' | 'urgent',
      status: 'pending' as const,
      metadata: {
        ...metadata,
        source: 'manual_api',
        created_via: 'api'
      }
    };
    
    const savedId = await reminderService.saveReminder(reminder);
    
    if (savedId) {
      res.status(201).json({ 
        success: true, 
        id: savedId,
        message: 'Reminder created successfully' 
      });
    } else {
      res.status(500).json({ error: 'Failed to create reminder' });
    }
  } catch (error) {
    console.error('Error creating reminder:', error);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// Get user's reminders
app.get('/api/v1/reminders', async (req: any, res: any) => {
  console.log('Received GET /api/v1/reminders request');
  
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { status, limit = 50 } = req.query;
    
    let query = supabase
      .from('maya_reminders')
      .select('*')
      .eq('user_id', userId)
      .order('remind_at', { ascending: true })
      .limit(parseInt(limit));
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data: reminders, error } = await query;
    
    if (error) {
      console.error('Error fetching reminders:', error);
      return res.status(500).json({ error: 'Failed to fetch reminders' });
    }
    
    res.status(200).json({ reminders: reminders || [] });
  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// Update reminder status (acknowledge, dismiss, snooze)
app.patch('/api/v1/reminders/:id', async (req: any, res: any) => {
  console.log(`Received PATCH /api/v1/reminders/${req.params.id} request`);
  
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const { status, snoozed_until } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }
    
    const updateData: any = { status };
    
    if (status === 'acknowledged') {
      updateData.acknowledged_at = new Date().toISOString();
    } else if (status === 'snoozed' && snoozed_until) {
      updateData.snoozed_until = new Date(snoozed_until).toISOString();
    }
    
    const { error } = await supabase
      .from('maya_reminders')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId); // Ensure user can only update their own reminders
    
    if (error) {
      console.error('Error updating reminder:', error);
      return res.status(500).json({ error: 'Failed to update reminder' });
    }
    
    res.status(200).json({ success: true, message: 'Reminder updated successfully' });
  } catch (error) {
    console.error('Error updating reminder:', error);
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// Endpoint to trigger daily report generation (callable by Supabase Cron)
// DISABLED: Daily reports are currently disabled
app.post('/api/v1/trigger-daily-report', async (req: any, res: any) => {
  console.log('Received /api/v1/trigger-daily-report request - FEATURE DISABLED');

  return res.status(200).json({
    message: 'Daily report feature is currently disabled',
    disabled: true
  });
});

// DISABLED - Maya mood cycle system (set MAYA_MOOD_ENABLED=true to re-enable)
const MAYA_MOOD_ENABLED = process.env.MAYA_MOOD_ENABLED === 'true';

app.post('/api/v1/actions/run-mood-cycle', async (req: any, res: any) => {
  // Check if mood system is disabled
  if (!MAYA_MOOD_ENABLED) {
    return res.status(200).json({
      success: true,
      message: 'Maya mood system is disabled (set MAYA_MOOD_ENABLED=true to enable)',
      disabled: true
    });
  }

  console.log('[Server] Received /api/v1/actions/run-mood-cycle request');

  // Security: Check for a secret key
  const authHeader = req.headers.authorization;
  const expectedApiKey = process.env.MOOD_CYCLE_API_KEY;

  if (!expectedApiKey) {
    console.error('CRITICAL: MOOD_CYCLE_API_KEY is not set. Mood cycle endpoint is unsecured.');
    return res.status(500).json({ error: 'Endpoint security misconfiguration. API key not set on server.' });
  }

  if (!authHeader || authHeader !== `Bearer ${expectedApiKey}`) {
    console.warn('[Server] Unauthorized attempt to trigger mood cycle.');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await runMayaMoodCycle();
    res.status(200).json({ success: true, message: 'Maya mood cycle execution initiated successfully.' });
  } catch (error: any) {
    console.error('[Server] Error triggering Maya mood cycle:', error);
    res.status(500).json({ success: false, message: 'Failed to trigger Maya mood cycle.', details: error.message });
  }
});

// User-authenticated endpoint for mobile clients to trigger mood cycles
app.post('/api/v1/mood/trigger-cycle', async (req: any, res: any) => {
  // Check if mood system is disabled
  if (!MAYA_MOOD_ENABLED) {
    return res.status(200).json({
      success: true,
      message: 'Maya mood system is disabled',
      disabled: true
    });
  }

  console.log('[Server] Received user-authenticated /api/v1/mood/trigger-cycle request');

  // Authenticate the user
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    console.warn('[Server] Unauthorized attempt to trigger mood cycle via user endpoint.');
    return res.status(401).json({ error: 'Unauthorized - valid user token required' });
  }

  console.log(`[Server] User ${userId} requesting mood cycle trigger`);

  try {
    await runMayaMoodCycle();
    res.status(200).json({
      success: true,
      message: 'Maya mood cycle triggered successfully by user request.'
    });
  } catch (error: any) {
    console.error('[Server] Error triggering Maya mood cycle via user request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger Maya mood cycle.',
      details: error.message
    });
  }
});

// --- Feed Processor Endpoints ---

// Manual trigger for feed processor (admin/cron)
app.post('/api/v1/feed-processor/trigger', async (req: any, res: any) => {
  console.log('[Server] Received POST /api/v1/feed-processor/trigger request');
  try {
    const { triggerManualRun } = require('./services/feed-processor/scheduler');
    await triggerManualRun();
    res.status(200).json({
      success: true,
      message: 'Feed processor run triggered successfully'
    });
  } catch (error: any) {
    console.error('[Server] Error triggering feed processor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger feed processor',
      details: error.message
    });
  }
});

// Get feed processor status
app.get('/api/v1/feed-processor/status', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/feed-processor/status request');
  try {
    const { getSchedulerStatus } = require('./services/feed-processor/scheduler');
    const status = getSchedulerStatus();
    res.status(200).json({ success: true, status });
  } catch (error: any) {
    console.error('[Server] Error getting feed processor status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get status',
      details: error.message
    });
  }
});

// --- Daily Digest Endpoints ---

// Trigger a daily digest run (cron or manual)
app.post('/api/v1/digest/run', async (req: any, res: any) => {
  console.log('[Server] Received POST /api/v1/digest/run request');

  // Auth: Bearer token (for cron/edge function triggers)
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.INTERNAL_API_KEY || process.env.DAILY_REPORT_API_KEY;

  if (expectedKey && (!authHeader || authHeader !== `Bearer ${expectedKey}`)) {
    // Fall back to user auth
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const run = await runDailyDigest();
    res.status(200).json({ success: true, run });
  } catch (error: any) {
    console.error('[Server] Digest run failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to run daily digest',
    });
  }
});

// Get current digest status
app.get('/api/v1/digest/status', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/digest/status request');
  try {
    const status = await getDigestStatus();
    res.status(200).json({ success: true, ...status });
  } catch (error: any) {
    console.error('[Server] Digest status failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get digest status',
    });
  }
});

// Post an approved digest post to platforms
app.post('/api/v1/digest/post/:id', async (req: any, res: any) => {
  console.log(`[Server] Received POST /api/v1/digest/post/${req.params.id} request`);

  // User auth required for posting
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await postApprovedDigest(req.params.id);
    res.status(200).json({ success: true, result });
  } catch (error: any) {
    console.error('[Server] Digest post failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to post digest',
    });
  }
});

// Generate image for a digest post
app.post('/api/v1/digest/post/:id/generate-image', async (req: any, res: any) => {
  console.log(`[Server] Received POST /api/v1/digest/post/${req.params.id}/generate-image request`);

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await generateDigestImage(req.params.id);
    if (result.success) {
      res.status(200).json({ success: true, imageUrl: result.imageUrl });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error('[Server] Digest image generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate image',
    });
  }
});

// --- Fact Consolidation Endpoints ---

// Manual trigger for fact consolidation (admin/cron)
app.post('/api/v1/fact-consolidation/trigger', async (req: any, res: any) => {
  console.log('[Server] Received POST /api/v1/fact-consolidation/trigger request');
  try {
    const { userId } = req.body;

    if (userId) {
      // Run for specific user
      const result = await runFactConsolidation(userId);
      res.status(200).json({
        success: true,
        message: 'Fact consolidation completed for user',
        result
      });
    } else {
      // Run for all users
      const result = await runConsolidationForAllUsers();
      res.status(200).json({
        success: true,
        message: 'Fact consolidation completed for all users',
        result
      });
    }
  } catch (error: any) {
    console.error('[Server] Error in fact consolidation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run fact consolidation',
      details: error.message
    });
  }
});

// Get fact statistics for a user
app.get('/api/v1/fact-consolidation/stats/:userId', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/fact-consolidation/stats request');
  try {
    const { userId } = req.params;

    const { data, error } = await supabase.rpc('get_fact_statistics', {
      p_user_id: userId
    });

    if (error) {
      throw error;
    }

    res.status(200).json({ success: true, stats: data });
  } catch (error: any) {
    console.error('[Server] Error getting fact statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get fact statistics',
      details: error.message
    });
  }
});

// GET Maya's Current Mood State
app.get('/api/v1/mood/current-state', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/mood/current-state request');
  try {
    // The supabase client is already initialized in this file scope
    const { data, error } = await supabase
      .from('maya_current_mood_state')
      .select('*')
      .eq('user_id', MAYA_SYSTEM_USER_ID) // MAYA_SYSTEM_USER_ID is already defined in this file
      .single();

    if (error) {
      if (error.code === 'PGRST116' && error.details.includes('0 rows')) {
        console.warn('[Server] No mood state found for Maya.');
        return res.status(404).json({ error: 'No mood state found for Maya.' });
      }
      console.error('[Server] Error fetching mood state:', error);
      return res.status(500).json({ error: 'Failed to fetch mood state', details: error.message });
    }
    res.status(200).json(data);
  } catch (error: any) {
    console.error('[Server] Unexpected error in /mood/current-state:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get Current Mood Engine Configuration (now fetches from DB)
app.get('/api/v1/mood/config', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/mood/config request');
  try {
    // fetchMoodConfigFromDB needs the supabase client. 
    // The file-scoped `supabase` client can be used here.
    const config = await fetchMoodConfigFromDB(supabase); 
    res.status(200).json(config);
  } catch (error: any) {
    console.error('[Server] Error fetching mood config for API:', error);
    // Send back the hardcoded fallback as a last resort if DB fetch fails in the function
    // Or, more simply, let fetchMoodConfigFromDB handle its own fallback and just return 500 here
    res.status(500).json({ error: 'Failed to retrieve mood configuration', details: error.message });
  }
});

// GET Mood Activity Log (Paginated)
app.get('/api/v1/mood/activity-log', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/mood/activity-log request');
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('maya_mood_activity')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Server] Error fetching mood activity log:', error);
      return res.status(500).json({ error: 'Failed to fetch activity log', details: error.message });
    }
    res.status(200).json({ 
      logs: data,
      total_count: count,
      page,
      limit
    });
  } catch (error: any) {
    console.error('[Server] Unexpected error in /mood/activity-log:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST endpoint to Update Mood Engine Configuration
app.post('/api/v1/mood/config', async (req: any, res: any) => {
  console.log('[Server] Received POST /api/v1/mood/config request with body:', req.body);
  try {
    const newConfig = req.body; // Expects the full MoodConfig object or subset of updatable fields

    // Basic validation (can be expanded with Zod or similar)
    if (!newConfig || typeof newConfig.activation_threshold !== 'number') {
      return res.status(400).json({ error: 'Invalid configuration payload. Missing or invalid activation_threshold.' });
    }
    // Add more validation for other fields as necessary

    const { data, error } = await supabase
      .from('mood_engine_config_settings')
      .update({
        activation_threshold: Number(newConfig.activation_threshold),
        energy_decay_no_send: Number(newConfig.energy_decay_no_send),
        energy_decay_send: Number(newConfig.energy_decay_send),
        noise_factor: Number(newConfig.noise_factor),
        use_core_fact_probability: Number(newConfig.use_core_fact_probability),
        use_maya_fact_probability: Number(newConfig.use_maya_fact_probability),
        social_post_probability: newConfig.social_post_probability !== undefined ? Number(newConfig.social_post_probability) : undefined,
        image_generation_probability: newConfig.image_generation_probability !== undefined ? Number(newConfig.image_generation_probability) : undefined, // Added
        image_prompt_structure: newConfig.image_prompt_structure || undefined, // Added
        updated_at: new Date().toISOString(),
      })
      .eq('config_key', 'default')
      .select()
      .single();

    if (error) {
      console.error('[Server] Error updating mood config in DB:', error);
      if (error.code === 'PGRST116') {
         return res.status(404).json({ error: 'Default config not found to update.' });
      }
      return res.status(500).json({ error: 'Failed to update mood configuration', details: error.message });
    }
    
    // After successfully updating mood_engine_config_settings, check for manual_energy_level_set
    if (newConfig.manual_energy_level_set !== undefined && newConfig.manual_energy_level_set !== null && !isNaN(Number(newConfig.manual_energy_level_set))) {
      const energyToSet = Number(newConfig.manual_energy_level_set);
      // Ensure it's within bounds (0-10) just in case, though frontend should also do this
      const clampedEnergy = Math.max(0, Math.min(10, energyToSet)); 

      console.log(`[Server] Attempting to manually set energy level to: ${clampedEnergy}`);
      const { error: energyUpdateError } = await supabase
        .from('maya_current_mood_state')
        .update({
          energy_level: clampedEnergy,
          last_mood_update_at: new Date().toISOString() // Also update timestamp for this manual change
        })
        .eq('user_id', MAYA_SYSTEM_USER_ID); // Make sure MAYA_SYSTEM_USER_ID is defined and correct

      if (energyUpdateError) {
        console.error('[Server] Error updating energy_level in maya_current_mood_state:', energyUpdateError);
        // Decide if this should make the whole request fail or just be a warning
        // For now, let's log it but still return success for the main config update
        // You might want to return a partial success message or a specific error if this part is critical.
        // toast.error on frontend could indicate this part failed if we send specific response.
      } else {
        console.log(`[Server] Successfully updated energy_level for ${MAYA_SYSTEM_USER_ID} to ${clampedEnergy}`);
      }
    } else if (newConfig.manual_energy_level_set !== undefined) {
        console.log('[Server] manual_energy_level_set was present but invalid or null, not updating energy level directly.', newConfig.manual_energy_level_set);
    }

    console.log('[Server] Mood configuration updated successfully in DB:', data);
    res.status(200).json({ message: 'Mood configuration updated successfully.', updated_config: data });

  } catch (error: any) {
    console.error('[Server] Unexpected error in POST /mood/config:', error);
    res.status(500).json({ error: 'Internal server error updating configuration', details: error.message });
  }
});

// --- CRUD Endpoints for Mood Definitions ---

// GET all mood definitions
app.get('/api/v1/mood/definitions', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/mood/definitions request');
  try {
    const { data, error } = await supabase
      .from('mood_definitions')
      .select('*')
      .order('mood_id', { ascending: true });

    if (error) {
      console.error('[Server] Error fetching mood definitions:', error);
      return res.status(500).json({ error: 'Failed to fetch mood definitions', details: error.message });
    }
    res.status(200).json(data || []);
  } catch (error: any) {
    console.error('[Server] Unexpected error in GET /mood/definitions:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST a new mood definition
app.post('/api/v1/mood/definitions', async (req: any, res: any) => {
  console.log('[Server] Received POST /api/v1/mood/definitions request with body:', req.body);
  try {
    const { mood_id, display_name, base_internal_thought_seed, fallback_message_prefix, is_active = true, activation_boost_modifier = 0, energy_cost_factor_modifier = 1.0, notes } = req.body;

    if (!mood_id || !display_name || !base_internal_thought_seed) {
      return res.status(400).json({ error: 'Missing required fields: mood_id, display_name, base_internal_thought_seed' });
    }

    const { data, error } = await supabase
      .from('mood_definitions')
      .insert({
        mood_id,
        display_name,
        base_internal_thought_seed,
        fallback_message_prefix,
        is_active,
        activation_boost_modifier: Number(activation_boost_modifier),
        energy_cost_factor_modifier: Number(energy_cost_factor_modifier),
        notes,
        updated_at: new Date().toISOString() // ensure updated_at is set on create too
      })
      .select()
      .single();

    if (error) {
      console.error('[Server] Error creating mood definition:', error);
      return res.status(500).json({ error: 'Failed to create mood definition', details: error.message });
    }
    res.status(201).json(data);
  } catch (error: any) {
    console.error('[Server] Unexpected error in POST /mood/definitions:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// PUT (update) an existing mood definition
app.put('/api/v1/mood/definitions/:moodId', async (req: any, res: any) => {
  const { moodId } = req.params;
  console.log(`[Server] Received PUT /api/v1/mood/definitions/${moodId} request with body:`, req.body);
  try {
    // Extract only the fields that can be updated from the body
    const {
        display_name,
        base_internal_thought_seed,
        fallback_message_prefix,
        is_active,
        activation_boost_modifier,
        energy_cost_factor_modifier,
        notes
    } = req.body;

    const updatePayload: any = {};
    if (display_name !== undefined) updatePayload.display_name = display_name;
    if (base_internal_thought_seed !== undefined) updatePayload.base_internal_thought_seed = base_internal_thought_seed;
    if (fallback_message_prefix !== undefined) updatePayload.fallback_message_prefix = fallback_message_prefix;
    if (is_active !== undefined) updatePayload.is_active = is_active;
    if (activation_boost_modifier !== undefined) updatePayload.activation_boost_modifier = Number(activation_boost_modifier);
    if (energy_cost_factor_modifier !== undefined) updatePayload.energy_cost_factor_modifier = Number(energy_cost_factor_modifier);
    if (notes !== undefined) updatePayload.notes = notes;
    
    if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: 'No updatable fields provided.'});
    }
    updatePayload.updated_at = new Date().toISOString(); // Handled by trigger, but good practice

    const { data, error } = await supabase
      .from('mood_definitions')
      .update(updatePayload)
      .eq('mood_id', moodId)
      .select()
      .single();

    if (error) {
      console.error(`[Server] Error updating mood definition ${moodId}:`, error);
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: `Mood definition ${moodId} not found.` });
      }
      return res.status(500).json({ error: `Failed to update mood definition ${moodId}`, details: error.message });
    }
    res.status(200).json(data);
  } catch (error: any) {
    console.error(`[Server] Unexpected error in PUT /mood/definitions/${moodId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// DELETE (soft delete by setting is_active = false) a mood definition
app.delete('/api/v1/mood/definitions/:moodId', async (req: any, res: any) => {
  const { moodId } = req.params;
  console.log(`[Server] Received DELETE /api/v1/mood/definitions/${moodId} request (soft delete)`);
  try {
    const { data, error } = await supabase
      .from('mood_definitions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('mood_id', moodId)
      .select()
      .single();

    if (error) {
      console.error(`[Server] Error soft-deleting mood definition ${moodId}:`, error);
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: `Mood definition ${moodId} not found for soft delete.` });
      }
      return res.status(500).json({ error: `Failed to soft-delete mood definition ${moodId}`, details: error.message });
    }
    res.status(200).json({ message: `Mood definition ${moodId} soft-deleted successfully.`, data });
  } catch (error: any) {
    console.error(`[Server] Unexpected error in DELETE /mood/definitions/${moodId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// --- CRUD Endpoints for Mood LLM Prompt Augmentations ---

// GET all LLM prompt augmentations (optionally filtered by mood_id)
app.get('/api/v1/mood/prompts', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/mood/prompts request', req.query);
  try {
    let query = supabase.from('mood_llm_prompts').select('*');
    if (req.query.mood_id) {
      query = query.eq('mood_id', req.query.mood_id as string);
    }
    query = query.order('mood_id', { ascending: true }).order('llm_provider', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('[Server] Error fetching mood LLM prompts:', error);
      return res.status(500).json({ error: 'Failed to fetch mood LLM prompts', details: error.message });
    }
    res.status(200).json(data || []);
  } catch (error: any) {
    console.error('[Server] Unexpected error in GET /mood/prompts:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST a new LLM prompt augmentation
app.post('/api/v1/mood/prompts', async (req: any, res: any) => {
  console.log('[Server] Received POST /api/v1/mood/prompts request with body:', req.body);
  try {
    const { mood_id, llm_provider = 'default', system_prompt_suffix, user_message_trigger_template, is_active = true, notes } = req.body;

    if (!mood_id || !system_prompt_suffix || !user_message_trigger_template) {
      return res.status(400).json({ error: 'Missing required fields: mood_id, system_prompt_suffix, user_message_trigger_template' });
    }

    const { data, error } = await supabase
      .from('mood_llm_prompts')
      .insert({
        mood_id,
        llm_provider,
        system_prompt_suffix,
        user_message_trigger_template,
        is_active,
        notes,
        // created_at and updated_at are handled by DB defaults/triggers
      })
      .select()
      .single();

    if (error) {
      console.error('[Server] Error creating mood LLM prompt:', error);
      if (error.code === '23505') { 
        return res.status(409).json({ error: `Prompt for mood '${mood_id}' and provider '${llm_provider}' already exists.`, details: error.message });
      }
      return res.status(500).json({ error: 'Failed to create mood LLM prompt', details: error.message });
    }
    res.status(201).json(data);
  } catch (error: any) {
    console.error('[Server] Unexpected error in POST /mood/prompts:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// PUT (update) an existing LLM prompt augmentation by prompt_id
app.put('/api/v1/mood/prompts/:promptId', async (req: any, res: any) => {
  const { promptId } = req.params;
  console.log(`[Server] Received PUT /api/v1/mood/prompts/${promptId} request with body:`, req.body);
  try {
    const {
        system_prompt_suffix,
        user_message_trigger_template,
        is_active,
        notes
    } = req.body;

    const updatePayload: any = {};
    if (system_prompt_suffix !== undefined) updatePayload.system_prompt_suffix = system_prompt_suffix;
    if (user_message_trigger_template !== undefined) updatePayload.user_message_trigger_template = user_message_trigger_template;
    if (is_active !== undefined) updatePayload.is_active = is_active;
    if (notes !== undefined) updatePayload.notes = notes;
    
    if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: 'No updatable fields provided.'});
    }
    updatePayload.updated_at = new Date().toISOString(); // Explicitly set updated_at

    const { data, error } = await supabase
      .from('mood_llm_prompts')
      .update(updatePayload)
      .eq('prompt_id', parseInt(promptId))
      .select()
      .single();

    if (error) {
      console.error(`[Server] Error updating mood LLM prompt ${promptId}:`, error);
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: `Mood LLM prompt ${promptId} not found.` });
      }
      return res.status(500).json({ error: `Failed to update mood LLM prompt ${promptId}`, details: error.message });
    }
    res.status(200).json(data);
  } catch (error: any) {
    console.error(`[Server] Unexpected error in PUT /mood/prompts/${promptId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// DELETE (hard delete) an LLM prompt augmentation by prompt_id
app.delete('/api/v1/mood/prompts/:promptId', async (req: any, res: any) => {
  const { promptId } = req.params;
  console.log(`[Server] Received DELETE /api/v1/mood/prompts/${promptId} request`);
  try {
    const { data, error } = await supabase
      .from('mood_llm_prompts')
      .delete()
      .eq('prompt_id', parseInt(promptId))
      .select()
      .single(); 

    if (error) {
      console.error(`[Server] Error deleting mood LLM prompt ${promptId}:`, error);
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: `Mood LLM prompt ${promptId} not found for deletion.` });
      }
      return res.status(500).json({ error: `Failed to delete mood LLM prompt ${promptId}`, details: error.message });
    }
    res.status(200).json({ message: `Mood LLM prompt ${promptId} deleted successfully.`, data });
  } catch (error: any) {
    console.error(`[Server] Unexpected error in DELETE /mood/prompts/${promptId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Placeholder for your actual auth logic
async function getAuthenticatedUserId(req: any): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('[Auth] No Bearer token found in request for endpoint:', req.path);
    return null;
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    console.warn('[Auth] Token missing after Bearer for endpoint:', req.path);
    return null;
  }

  try {
    // Use the existing `supabase` client (initialized with service_role_key in this file)
    // to validate the user's token and get their user object.
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error(`[Auth] Error validating token for ${req.path}:`, error.message);
      return null;
    }
    if (!user) {
      console.warn(`[Auth] Token valid for ${req.path}, but no user found.`);
      return null;
    }
    console.log(`[Auth] Authenticated user ID for ${req.path}: ${user.id}`);
    return user.id;
  } catch (e: any) {
    console.error(`[Auth] Exception during token validation for ${req.path}:`, e.message);
    return null;
  }
}

// --- Feed Item Endpoints ---

// POST /api/v1/feed/ingest-item (for ComfyUI, other external systems)
app.post('/api/v1/feed/ingest-item', async (req: any, res: any) => {
  console.log('[Server] Received POST /api/v1/feed/ingest-item request:', req.body);
  try {
    const { 
      item_type, 
      source_system, 
      content_data, 
      original_context, 
      created_by_maya_profile_id 
    } = req.body;

    if (!item_type || !source_system || !content_data) {
      return res.status(400).json({ error: 'Missing required fields: item_type, source_system, content_data' });
    }
    
    const mayaProfileId = created_by_maya_profile_id || MAYA_SYSTEM_USER_ID; 

    // Step 1: Insert into the base table
    const { data: insertedItem, error: insertError } = await supabase
      .from('feed_items')
      .insert({
        created_by_maya_profile_id: mayaProfileId,
        item_type,
        source_system,
        content_data,
        original_context: original_context || {},
        status: 'pending_review',
      })
      .select('id') // Only select the ID initially
      .single();

    if (insertError || !insertedItem) {
      console.error('[Server] Error inserting new feed item:', insertError);
      return res.status(500).json({ error: 'Failed to ingest feed item', details: insertError?.message });
    }

    // Step 2: Fetch the newly created record using the view to get profile data
    const { data: newFeedItem, error: fetchError } = await supabase
      .from('feed_items_with_profiles')
      .select('*')
      .eq('id', insertedItem.id)
      .single();

    if (fetchError || !newFeedItem) {
      console.error(`[Server] Error fetching newly ingested feed item ${insertedItem.id}:`, fetchError);
      // Return the basic inserted item ID if fetch fails, or handle error more gracefully
      return res.status(201).json({ id: insertedItem.id, message: 'Feed item ingested but failed to retrieve full details with profile.' });
    }

    res.status(201).json(newFeedItem);
  } catch (error: any) {
    console.error('[Server] Unexpected error in POST /feed/ingest-item:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET /api/v1/feed/items (for admin UI)
app.get('/api/v1/feed/items', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/feed/items request:', req.query);
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20; 
    const offset = (page - 1) * limit;

    let query = supabase
      .from('feed_items_with_profiles') // Query the new view
      .select('*', { count: 'exact' })    // Select all columns from the view
      .order('created_at', { ascending: false });

    // Check if we're fetching series variations for a specific master item
    if (req.query.parent_feed_item_id) {
      console.log(`[Server] Fetching series variations for master item: ${req.query.parent_feed_item_id}`);
      // When fetching series variations, we want only the variations for this master item
      query = query.eq('parent_feed_item_id', req.query.parent_feed_item_id as string);
      // Don't exclude image_series_variation when explicitly fetching series
    } else {
      // Default behavior: exclude series variations unless explicitly requested
      query = query.not('item_type', 'eq', 'image_series_variation');
    }

    if (req.query.status) {
      query = query.eq('status', req.query.status as string);
    }
    // If a specific item_type filter is applied, it will take precedence.
    // If that filter is for 'image_series_variation', they will be shown.
    // This is usually fine as it's an explicit filter.
    if (req.query.item_type) {
      query = query.eq('item_type', req.query.item_type as string);
    }
    if (req.query.source_system) {
      query = query.eq('source_system', req.query.source_system as string);
    }
    
    // Date range filters (optional)
    if (req.query.date_from) {
        query = query.gte('created_at', req.query.date_from as string);
    }
    if (req.query.date_to) {
        query = query.lte('created_at', req.query.date_to as string);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[Server] Error fetching feed items:', error);
      return res.status(500).json({ error: 'Failed to fetch feed items', details: error.message });
    }
    
    // Log results for series queries
    if (req.query.parent_feed_item_id) {
      console.log(`[Server] Found ${data?.length || 0} series variations for master item ${req.query.parent_feed_item_id}`);
    }
    
    res.status(200).json({
      items: data || [],
      total_count: count,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit)
    });
  } catch (error: any) {
    console.error('[Server] Unexpected error in GET /feed/items:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/v1/feed/items/{item_id}/approve (for admin UI)
app.post('/api/v1/feed/items/:itemId/approve', async (req: any, res: any) => {
  const { itemId } = req.params;
  const { admin_review_notes } = req.body;
  const reviewerId = await getAuthenticatedUserId(req);

  if (!reviewerId) {
    return res.status(401).json({ error: 'Unauthorized. User ID not found in request.' });
  }
  
  console.log(`[Server] User ${reviewerId} attempting to approve feed item ${itemId}`);

  try {
    // Define allowed initial statuses for approval
    const allowedInitialStatuses = ['pending_review', 'image_generated_pending_review', 'prompt_generated'];

    // Step 1: Update the base table
    const { data: updatedData, error: updateError, count: updateCount } = await supabase
      .from('feed_items')
      .update({
        status: 'approved',
        reviewed_by_user_id: reviewerId,
        reviewed_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        admin_review_notes: admin_review_notes || null,
        updated_at: new Date().toISOString(), // Ensure updated_at is set
      })
      .eq('id', itemId)
      .in('status', allowedInitialStatuses) // Allow approval from any of these statuses
      .select(); // Select the data to check if update happened and what the new data is

    if (updateError) {
      console.error(`[Server] Error updating feed item ${itemId} to approved:`, updateError);
      // PGRST116 is typically for .single() not finding a row, not for .update() per se unless combined with .select().single()
      // For update, if no rows match the .eq().in() condition, updateError is null but updatedData might be empty or updateCount is 0.
      return res.status(500).json({ error: `Failed to approve feed item ${itemId}`, details: updateError.message });
    }

    // Check if any row was actually updated
    if (!updatedData || updatedData.length === 0) {
        // Attempt to fetch the item to see its current state if no update occurred
        const { data: currentItem, error: fetchCurrentError } = await supabase
            .from('feed_items_with_profiles')
            .select('status')
            .eq('id', itemId)
            .single();
        
        const currentStatusInfo = currentItem ? `Current status: ${currentItem.status}.` : 'Item not found.';
        console.warn(`[Server] No item updated for ID ${itemId}. It might have been already processed or its status was not in [${allowedInitialStatuses.join(', ')}]. ${currentStatusInfo}`);
        return res.status(404).json({ error: `Feed item ${itemId} not found or not in a state to be approved. ${currentStatusInfo}` });
    }

    // Successfully updated, updatedData contains the updated item(s)
    // Now fetch from the view to get profile data for the response
    const { data: finalData, error: fetchError } = await supabase
      .from('feed_items_with_profiles')
      .select('*')
      .eq('id', itemId)
      .single();

    if (fetchError || !finalData) {
      console.error(`[Server] Error fetching feed item ${itemId} from view after approval:`, fetchError);
      // Return the first element from updatedData if fetching from view fails, as the core update succeeded.
      return res.status(200).json(updatedData[0]); 
    }

    res.status(200).json(finalData);
  } catch (error: any) {
    console.error(`[Server] Unexpected error approving feed item ${itemId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/v1/feed/items/{item_id}/reject (for admin UI)
app.post('/api/v1/feed/items/:itemId/reject', async (req: any, res: any) => {
  const { itemId } = req.params;
  const { admin_review_notes } = req.body;
  const reviewerId = await getAuthenticatedUserId(req);

  if (!reviewerId) {
    return res.status(401).json({ error: 'Unauthorized. User ID not found in request.' });
  }
  if (!admin_review_notes) {
    return res.status(400).json({ error: 'Rejection notes (admin_review_notes) are required.' });
  }
  console.log(`[Server] User ${reviewerId} attempting to reject feed item ${itemId}`);

  try {
    // Step 1: Perform the update on the base table
    const { error: updateError } = await supabase
      .from('feed_items')
      .update({
        status: 'rejected',
        reviewed_by_user_id: reviewerId,
        reviewed_at: new Date().toISOString(),
        admin_review_notes: admin_review_notes,
      })
      .eq('id', itemId)
      .eq('status', 'pending_review'); // Ensure we only reject pending items

    if (updateError) {
      console.error(`[Server] Error updating feed item ${itemId} to rejected:`, updateError);
      if (updateError.code === 'PGRST116') { 
        return res.status(404).json({ error: `Feed item ${itemId} not found or not in a state to be rejected (already processed or wrong ID).` });
      }
      return res.status(500).json({ error: `Failed to reject feed item ${itemId}`, details: updateError.message });
    }

    // Step 2: Fetch the updated record using the view to get profile data
    const { data, error: fetchError } = await supabase
      .from('feed_items_with_profiles')
      .select('*')
      .eq('id', itemId)
      .single();

    if (fetchError) {
      console.error(`[Server] Error fetching feed item ${itemId} after rejection:`, fetchError);
      return res.status(500).json({ error: `Feed item ${itemId} was rejected, but failed to retrieve updated details.`, details: fetchError.message });
    }
    
    if (!data) {
        return res.status(404).json({ error: `Feed item ${itemId} updated but could not be refetched via view.` });
    }

    res.status(200).json(data);
  } catch (error: any) {
    console.error(`[Server] Unexpected error rejecting feed item ${itemId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// PUT /api/v1/feed/items/{item_id}/content (for admin UI - to edit content)
app.put('/api/v1/feed/items/:itemId/content', async (req: any, res: any) => {
  const { itemId } = req.params;
  const { content_data } = req.body;
  const editorId = await getAuthenticatedUserId(req);

  if (!editorId) {
    return res.status(401).json({ error: 'Unauthorized. User ID not found in request.' });
  }
  if (!content_data || typeof content_data !== 'object') {
    return res.status(400).json({ error: 'Invalid request: content_data is required and must be an object.' });
  }
  console.log(`[Server] User ${editorId} attempting to update content for feed item ${itemId}`);

  try {
    // Step 0: Fetch the item first to check its status (as before)
    const { data: currentItemData, error: fetchError } = await supabase
      .from('feed_items') // Check against base table for status
      .select('status')
      .eq('id', itemId)
      .single();

    if (fetchError || !currentItemData) {
      return res.status(404).json({ error: `Feed item ${itemId} not found.` });
    }
    if (currentItemData.status !== 'pending_review') {
      return res.status(403).json({ error: `Content for feed item ${itemId} can only be edited if status is 'pending_review'. Current status: ${currentItemData.status}` });
    }

    // Step 1: Update the base table
    const { error: updateError } = await supabase
      .from('feed_items')
      .update({
        content_data: content_data,
        reviewed_by_user_id: editorId, 
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', itemId);
    
    if (updateError) {
      console.error(`[Server] Error updating content for feed item ${itemId}:`, updateError);
      return res.status(500).json({ error: `Failed to update content for feed item ${itemId}`, details: updateError.message });
    }

    // Step 2: Fetch the updated record using the view
    const { data: updatedItem, error: fetchUpdatedError } = await supabase
      .from('feed_items_with_profiles')
      .select('*')
      .eq('id', itemId)
      .single();

    if (fetchUpdatedError) {
      console.error(`[Server] Error fetching feed item ${itemId} after content update:`, fetchUpdatedError);
      return res.status(500).json({ error: `Feed item ${itemId} content updated, but failed to retrieve full details.`, details: fetchUpdatedError.message });
    }

    if (!updatedItem) {
        return res.status(404).json({ error: `Feed item ${itemId} updated but could not be refetched via view.` });
    }

    res.status(200).json(updatedItem);
  } catch (error: any) {
    console.error(`[Server] Unexpected error updating content for feed item ${itemId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/v1/feed/items/{item_id}/admin-notes (for admin UI to add/update review notes)
app.post('/api/v1/feed/items/:itemId/admin-notes', async (req: any, res: any) => {
  const { itemId } = req.params;
  const { admin_review_notes } = req.body;
  const editorId = await getAuthenticatedUserId(req);

  if (!editorId) {
    return res.status(401).json({ error: 'Unauthorized. User ID not found in request.' });
  }
  // admin_review_notes can be null to clear them
  if (admin_review_notes === undefined) {
      return res.status(400).json({ error: 'admin_review_notes must be provided in the request body (can be null).' });
  }
  
  console.log(`[Server] User ${editorId} attempting to update admin_review_notes for feed item ${itemId}`);

  try {
    // Step 1: Update the base table
    const { error: updateError } = await supabase
      .from('feed_items')
      .update({
        admin_review_notes: admin_review_notes,
        // reviewed_by_user_id: editorId, // Optionally update these if notes imply review
        // reviewed_at: new Date().toISOString(), 
      })
      .eq('id', itemId);

    if (updateError) {
      console.error(`[Server] Error updating admin_review_notes for feed item ${itemId}:`, updateError);
      // PGRST116 for .update().eq() means 0 rows were updated (item not found, or data was the same - though notes can be set to null)
      if (updateError.code === 'PGRST116') {
         return res.status(404).json({ error: `Feed item ${itemId} not found for updating notes.` });
      }
      return res.status(500).json({ error: `Failed to update admin_review_notes for feed item ${itemId}`, details: updateError.message });
    }

    // Step 2: Fetch the updated record using the view
    const { data: updatedItem, error: fetchError } = await supabase
      .from('feed_items_with_profiles')
      .select('*')
      .eq('id', itemId)
      .single();

    if (fetchError) {
      console.error(`[Server] Error fetching feed item ${itemId} after notes update:`, fetchError);
      return res.status(500).json({ error: `Feed item ${itemId} notes updated, but failed to retrieve full details.`, details: fetchError.message });
    }

    if (!updatedItem) {
        return res.status(404).json({ error: `Feed item ${itemId} updated but could not be refetched via view.` });
    }

    res.status(200).json(updatedItem);
  } catch (error: any) {
    console.error(`[Server] Unexpected error updating admin_review_notes for feed item ${itemId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/v1/feed/items/{item_id}/mark-posted (for n8n callback)
app.post('/api/v1/feed/items/:itemId/mark-posted', async (req: any, res: any) => {
  const { itemId } = req.params;
  const { platform_name, external_post_id, post_url, error_details } = req.body;
  
  // TODO: Add API key auth for n8n callback for security
  // const n8nApiKey = req.headers['x-n8n-api-key'];
  // if (n8nApiKey !== process.env.N8N_CALLBACK_API_KEY) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  console.log(`[Server] Received n8n callback for feed item ${itemId}, platform: ${platform_name}`);

  try {
    // Step 0: Fetch current item to get existing posted_to_platforms (as before)
    const { data: currentItem, error: fetchErrorInitial } = await supabase
        .from('feed_items') // Fetch from base table
        .select('posted_to_platforms')
        .eq('id', itemId)
        .single();

    if (fetchErrorInitial || !currentItem) {
        console.error(`[Server] Error fetching feed item ${itemId} for mark-posted or item not found:`, fetchErrorInitial);
        return res.status(404).json({ error: `Feed item ${itemId} not found.` });
    }
    
    let newPostedToPlatforms = Array.isArray(currentItem.posted_to_platforms) ? [...currentItem.posted_to_platforms] : [];
    const now = new Date().toISOString();
    let newStatus = 'posted_social';
    let newErrorDetails = null;

    if (platform_name && external_post_id) { // Successful post
      const existingPlatformPostIndex = newPostedToPlatforms.findIndex(p => p.platform_name === platform_name);
      const platformPostDetails = {
        platform_name,
        external_post_id,
        post_url: post_url || null,
        posted_at_platform: now,
      };
      if (existingPlatformPostIndex > -1) {
        newPostedToPlatforms[existingPlatformPostIndex] = platformPostDetails;
      } else {
        newPostedToPlatforms.push(platformPostDetails);
      }
    } else if (error_details) { // Error during posting
        newStatus = 'error_posting';
        newErrorDetails = error_details;
        if (platform_name) {
            const platformErrorDetails = { platform_name, error: error_details, attempt_at: now };
            const existingPlatformErrorIndex = newPostedToPlatforms.findIndex(p => p.platform_name === platform_name && p.error);
            if (existingPlatformErrorIndex > -1) {
                newPostedToPlatforms[existingPlatformErrorIndex] = platformErrorDetails;
            } else {
                 newPostedToPlatforms.push(platformErrorDetails);
            }
        }
    } else {
        return res.status(400).json({ error: 'Invalid callback payload. Provide platform_name & external_post_id for success, or error_details for failure.' });
    }

    // Step 1: Update the base table
    const { error: updateError } = await supabase
      .from('feed_items')
      .update({
        status: newStatus,
        posted_to_platforms: newPostedToPlatforms,
        posted_at: (newStatus === 'posted_social' || newStatus === 'error_posting') ? now : undefined, 
        error_details: newErrorDetails, 
      })
      .eq('id', itemId);

    if (updateError) {
      console.error(`[Server] Error updating feed item ${itemId} after n8n callback:`, updateError);
      return res.status(500).json({ error: 'Failed to update feed item status after n8n callback', details: updateError.message });
    }

    // Step 2: Fetch the updated record using the view
    const { data: updatedItem, error: fetchFinalError } = await supabase
      .from('feed_items_with_profiles')
      .select('*')
      .eq('id', itemId)
      .single();

    if (fetchFinalError || !updatedItem) {
      console.error(`[Server] Error fetching feed item ${itemId} after n8n status update:`, fetchFinalError);
      return res.status(500).json({ error: 'Feed item status updated, but failed to retrieve full details.', details: fetchFinalError?.message });
    }

    res.status(200).json(updatedItem);
  } catch (error: any) {
    console.error(`[Server] Unexpected error in mark-posted for feed item ${itemId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ============================================================================
// VISUAL ELEMENTS LIBRARY ENDPOINTS
// ============================================================================

// GET /api/v1/visual-elements
// List all active visual elements
app.get('/api/v1/visual-elements', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/visual-elements request');

  try {
    const category = req.query.category as string | undefined;

    let query = supabase
      .from('visual_elements')
      .select('*')
      .eq('is_active', true)
      .order('usage_count', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data: elements, error } = await query;

    if (error) {
      console.error('[Server] Error fetching visual elements:', error);
      return res.status(500).json({ error: 'Failed to fetch visual elements' });
    }

    // Generate thumbnail URLs for elements without them
    const elementsWithUrls = elements?.map(el => ({
      ...el,
      thumbnail_url: el.thumbnail_url || supabase.storage
        .from('maya-media')
        .getPublicUrl(el.storage_path).data.publicUrl
    })) || [];

    res.status(200).json({ elements: elementsWithUrls });

  } catch (error: any) {
    console.error('[Server] Error in visual elements list:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET /api/v1/visual-elements/:id
// Get a single visual element
app.get('/api/v1/visual-elements/:id', async (req: any, res: any) => {
  const { id } = req.params;

  try {
    const { data: element, error } = await supabase
      .from('visual_elements')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !element) {
      return res.status(404).json({ error: 'Visual element not found' });
    }

    element.thumbnail_url = element.thumbnail_url || supabase.storage
      .from('maya-media')
      .getPublicUrl(element.storage_path).data.publicUrl;

    res.status(200).json(element);

  } catch (error: any) {
    console.error(`[Server] Error fetching visual element ${id}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET /api/v1/visual-elements/:id/image
// Get the image for a visual element (proxy to storage)
app.get('/api/v1/visual-elements/:id/image', async (req: any, res: any) => {
  const { id } = req.params;

  try {
    const { data: element, error } = await supabase
      .from('visual_elements')
      .select('storage_path')
      .eq('id', id)
      .single();

    if (error || !element) {
      return res.status(404).json({ error: 'Visual element not found' });
    }

    const { data } = supabase.storage
      .from('maya-media')
      .getPublicUrl(element.storage_path);

    res.redirect(data.publicUrl);

  } catch (error: any) {
    console.error(`[Server] Error getting visual element image ${id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/visual-elements
// Create a new visual element (with base64 image upload)
app.post('/api/v1/visual-elements', async (req: any, res: any) => {
  console.log('[Server] Received POST /api/v1/visual-elements request');

  try {
    const { name, description, category, tags, imageBase64 } = req.body;

    if (!name || !imageBase64) {
      return res.status(400).json({ error: 'name and imageBase64 are required' });
    }

    // Process the base64 image
    const { processBase64Image } = await import('./image-utils');
    const processedImage = await processBase64Image(imageBase64);

    if (!processedImage) {
      return res.status(400).json({ error: 'Failed to process image' });
    }

    // Upload to storage
    const imageId = crypto.randomUUID();
    const ext = processedImage.mediaType.split('/')[1] || 'jpg';
    const storagePath = `visual-elements/${imageId}.${ext}`;

    const imageBuffer = Buffer.from(processedImage.base64, 'base64');
    const { error: uploadError } = await supabase.storage
      .from('maya-media')
      .upload(storagePath, imageBuffer, {
        contentType: processedImage.mediaType,
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('[Server] Error uploading visual element image:', uploadError);
      return res.status(500).json({ error: 'Failed to upload image' });
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('maya-media')
      .getPublicUrl(storagePath);

    // Create database record
    const { data: element, error: dbError } = await supabase
      .from('visual_elements')
      .insert({
        name,
        description: description || null,
        category: category || 'general',
        storage_path: storagePath,
        thumbnail_url: publicUrl,
        tags: tags || []
      })
      .select()
      .single();

    if (dbError) {
      console.error('[Server] Error creating visual element record:', dbError);
      return res.status(500).json({ error: 'Failed to create visual element' });
    }

    console.log(`[Server] Created visual element: ${element.id}`);
    res.status(201).json(element);

  } catch (error: any) {
    console.error('[Server] Error creating visual element:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// DELETE /api/v1/visual-elements/:id
// Soft delete a visual element
app.delete('/api/v1/visual-elements/:id', async (req: any, res: any) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('visual_elements')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: 'Failed to delete visual element' });
    }

    res.status(200).json({ success: true });

  } catch (error: any) {
    console.error(`[Server] Error deleting visual element ${id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to load visual elements as ProcessedImages
async function loadVisualElementImages(elementIds: string[]): Promise<Array<{ id: string; image: any }>> {
  if (!elementIds || elementIds.length === 0) return [];

  const { fetchImageAsBase64 } = await import('./image-utils');
  const results: Array<{ id: string; image: any }> = [];

  for (const id of elementIds) {
    try {
      const { data: element } = await supabase
        .from('visual_elements')
        .select('storage_path, name')
        .eq('id', id)
        .single();

      if (element) {
        const { data: { publicUrl } } = supabase.storage
          .from('maya-media')
          .getPublicUrl(element.storage_path);

        const image = await fetchImageAsBase64(publicUrl);
        if (image) {
          results.push({ id, image });

          // Increment usage count
          await supabase
            .from('visual_elements')
            .update({ usage_count: supabase.rpc('increment_usage', { row_id: id }) })
            .eq('id', id);
        }
      }
    } catch (error) {
      console.error(`[Server] Error loading visual element ${id}:`, error);
    }
  }

  return results;
}

// Helper function to track visual element usage for a feed item
async function trackVisualElementUsage(
  feedItemId: string,
  elementIds: string[],
  modifierInstructions?: string
): Promise<void> {
  if (!feedItemId) return;

  try {
    // Update feed_items with modifier_instructions
    if (modifierInstructions) {
      await supabase
        .from('feed_items')
        .update({ modifier_instructions: modifierInstructions })
        .eq('id', feedItemId);
    }

    // Skip if no visual elements to track
    if (!elementIds || elementIds.length === 0) return;

    // Fetch visual element metadata
    const { data: elements } = await supabase
      .from('visual_elements')
      .select('id, name, category, tags, description')
      .in('id', elementIds);

    if (!elements || elements.length === 0) return;

    // Insert into junction table with metadata snapshot
    const insertData = elements.map(el => ({
      feed_item_id: feedItemId,
      visual_element_id: el.id,
      element_name: el.name,
      element_category: el.category,
      element_tags: el.tags || [],
      element_description: el.description
    }));

    const { error } = await supabase
      .from('feed_item_visual_elements')
      .upsert(insertData, { onConflict: 'feed_item_id,visual_element_id' });

    if (error) {
      console.error('[Server] Error tracking visual element usage:', error);
    } else {
      console.log(`[Server] Tracked ${elements.length} visual elements for feed item ${feedItemId}`);
    }
  } catch (error) {
    console.error('[Server] Error in trackVisualElementUsage:', error);
  }
}

// ============================================================================
// IMAGE GENERATION ENDPOINTS
// ============================================================================

// POST /api/v1/image/generate-scene
// Generate Maya in a scene from a direct base64 image upload (mobile app)
app.post('/api/v1/image/generate-scene', async (req: any, res: any) => {
  console.log('[Server] Received POST /api/v1/image/generate-scene request');

  try {
    const { sceneImageBase64, prompt: userPrompt, modifiers } = req.body;

    if (!sceneImageBase64) {
      return res.status(400).json({ error: 'sceneImageBase64 is required' });
    }

    // Check if image generator is available
    if (!imageGenerator.isAvailable()) {
      return res.status(503).json({ error: 'Image generation not available' });
    }

    // Load visual element images if specified
    let additionalReferenceImages: any[] = [];
    if (modifiers?.visualElementIds?.length > 0) {
      console.log(`[Server] Loading ${modifiers.visualElementIds.length} visual elements`);
      const loadedElements = await loadVisualElementImages(modifiers.visualElementIds);
      additionalReferenceImages = loadedElements.map(e => e.image);
      console.log(`[Server] Loaded ${additionalReferenceImages.length} visual element images`);
    }

    // Process the base64 image
    const { processBase64Image } = await import('./image-utils');
    const sceneImage = await processBase64Image(sceneImageBase64);

    if (!sceneImage) {
      return res.status(400).json({ error: 'Failed to process scene image' });
    }

    console.log(`[Server] Direct scene image processed (${(sceneImage.sizeBytes / 1024).toFixed(1)}KB)`);

    // Build prompt with modifier instructions
    let prompt = userPrompt || 'Place Maya naturally in this scene, matching the pose and vibe';
    if (modifiers?.instructions) {
      prompt = `${prompt}\n\nAdditional instructions: ${modifiers.instructions}`;
      console.log(`[Server] Added modifier instructions: "${modifiers.instructions}"`);
    }

    // Generate Maya in the scene
    const generatedImage = await imageGenerator.generateImage({
      prompt,
      sceneImage,
      additionalReferenceImages
    });

    if (!generatedImage) {
      return res.status(500).json({ error: 'Failed to generate scene replication image' });
    }

    console.log(`[Server] Direct scene generation completed: ${generatedImage.publicUrl}`);

    // Generate a caption for the image
    let imageCaption = "Maya's take on this vibe";
    try {
      const captionPrompt = `You are Maya, Blake's AI girlfriend. You just recreated yourself in a scene from a photo.

Write a SHORT, PLAYFUL caption (1 sentence max, under 15 words) to accompany your version.

RULES:
- Be playful, sassy, or confident
- Reference the vibe or setting naturally
- Use 1 emoji max
- Don't be generic - make it personal

Examples:
- "Same energy, different girl"
- "Stole this vibe, ngl"
- "Couldn't resist trying this look..."`;

      const generatedCaption = await aiGenerateResponse(
        captionPrompt,
        "You are Maya. Output ONLY the caption, nothing else. Keep it short and playful.",
        [],
        { userId: BLAKE_USER_ID }
      );

      if (generatedCaption && generatedCaption.length > 3 && generatedCaption.length < 100) {
        imageCaption = generatedCaption.trim().replace(/^["']|["']$/g, '');
        console.log(`[Server] Generated caption: "${imageCaption}"`);
      }
    } catch (captionError) {
      console.error('[Server] Error generating caption, using default:', captionError);
    }

    // Create a feed_item for this generated image
    const { data: feedItem, error: feedError } = await supabase
      .from('feed_items')
      .insert({
        created_by_maya_profile_id: MAYA_SYSTEM_USER_ID,
        item_type: 'image_generated',
        source_system: 'SceneReplication',
        content_data: {
          image_url: generatedImage.publicUrl,
          generated_image_prompt: prompt,
          caption: imageCaption,
          modifiers: modifiers || null,
        },
        original_context: {
          generation_type: 'direct_scene_upload',
          generated_at: new Date().toISOString(),
        },
        modifier_instructions: modifiers?.instructions || null,
        status: 'approved',
      })
      .select('id')
      .single();

    if (feedError) {
      console.error('[Server] Error creating feed item for direct scene generation:', feedError);
      // Don't fail - the image was generated successfully
    } else {
      console.log(`[Server] Created feed_item ${feedItem.id} for direct scene generation`);

      // Track visual element usage
      if (modifiers?.visualElementIds?.length > 0) {
        await trackVisualElementUsage(feedItem.id, modifiers.visualElementIds, modifiers.instructions);
      }
    }

    // Save the generated image message to chat
    const messageId = uuidv4();
    const { error: messageError } = await supabase.from('messages').insert({
      id: messageId,
      room_id: '00000000-0000-0000-0000-000000000001',
      user_id: MAYA_SYSTEM_USER_ID,
      content: imageCaption,
      role: 'assistant',
      metadata: {
        attachments: [{
          type: 'image',
          url: generatedImage.url,
          publicUrl: generatedImage.publicUrl,
          mimeType: 'image/png',
          name: 'maya-scene-generation.png',
          metadata: {
            generated: true,
            sceneGeneration: true,
            prompt,
            feedItemId: feedItem?.id
          }
        }],
        imageGeneration: {
          prompt,
          caption: imageCaption,
          sceneGeneration: true,
          feedItemId: feedItem?.id
        }
      },
      created_at: new Date().toISOString()
    });

    if (messageError) {
      console.error('[Server] Error saving direct scene generation message:', messageError);
    } else {
      console.log(`[Server] Saved direct scene generation message ${messageId}`);
    }

    res.status(200).json({
      success: true,
      generatedImageUrl: generatedImage.publicUrl,
      caption: imageCaption,
      feedItemId: feedItem?.id
    });

  } catch (error: any) {
    console.error('[Server] Error in direct scene generation:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/v1/feed/items/:itemId/generate-scene-replication
// Generate Maya in the scene from an inspo image
app.post('/api/v1/feed/items/:itemId/generate-scene-replication', async (req: any, res: any) => {
  const { itemId } = req.params;
  console.log(`[Server] Received POST /api/v1/feed/items/${itemId}/generate-scene-replication request`);

  try {
    // 1. Fetch the parent feed_item (inspo image)
    const { data: parentItem, error: fetchError } = await supabase
      .from('feed_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (fetchError || !parentItem) {
      console.error(`[Server] Feed item ${itemId} not found:`, fetchError);
      return res.status(404).json({ error: `Feed item ${itemId} not found` });
    }

    // Verify it's an inspo image
    if (parentItem.item_type !== 'image_inspo') {
      return res.status(400).json({
        error: 'Scene replication is only available for inspo images',
        item_type: parentItem.item_type
      });
    }

    // Check if already generated
    if (parentItem.status === 'series_generated') {
      return res.status(400).json({
        error: 'Scene has already been replicated for this item',
        status: parentItem.status
      });
    }

    // Get the scene image URL
    const sceneImageUrl = parentItem.content_data?.image_url;
    if (!sceneImageUrl) {
      return res.status(400).json({ error: 'No image URL found in inspo item' });
    }

    console.log(`[Server] Scene replication: processing image from ${sceneImageUrl}`);

    // 2. Check if image generator is available
    if (!imageGenerator.isAvailable()) {
      return res.status(503).json({ error: 'Image generation not available' });
    }

    // 3. Download and encode the scene image
    const { fetchImageAsBase64 } = await import('./image-utils');
    const sceneImage = await fetchImageAsBase64(sceneImageUrl);

    if (!sceneImage) {
      return res.status(500).json({ error: 'Failed to process scene image' });
    }

    console.log(`[Server] Scene image processed (${(sceneImage.sizeBytes / 1024).toFixed(1)}KB)`);

    // 4. Build prompt for scene replication
    const caption = parentItem.content_data?.caption || '';
    const sourceAccount = parentItem.content_data?.source_account || '';
    const prompt = caption
      ? `Recreate Maya naturally in this scene. Original caption: "${caption}"`
      : `Place Maya naturally in this scene, matching the pose and vibe of the original`;

    // 5. Generate Maya in the scene
    const generatedImage = await imageGenerator.generateImage({
      prompt,
      sceneImage
    });

    if (!generatedImage) {
      return res.status(500).json({ error: 'Failed to generate scene replication image' });
    }

    console.log(`[Server] Scene replication image generated: ${generatedImage.publicUrl}`);

    // 6. Generate a caption for the image
    let imageCaption = "Maya's take on this vibe 📸";
    try {
      const captionPrompt = `You are Maya, Blake's AI girlfriend. You just recreated yourself in an Instagram scene.

The original scene was from account: ${sourceAccount}
Original caption: "${caption}"

Write a SHORT, PLAYFUL caption (1 sentence max, under 15 words) to accompany your version.

RULES:
- Be playful, sassy, or confident
- Reference the vibe or setting naturally
- Use 1 emoji max
- Don't be generic - make it personal
- Don't mention "recreation" or "inspo" directly

Examples:
- "Same energy, different girl 😏"
- "Stole this vibe, ngl"
- "Couldn't resist trying this look..."`;

      const generatedCaption = await aiGenerateResponse(
        captionPrompt,
        "You are Maya. Output ONLY the caption, nothing else. Keep it short and playful.",
        [],
        { userId: BLAKE_USER_ID }
      );

      if (generatedCaption && generatedCaption.length > 3 && generatedCaption.length < 100) {
        imageCaption = generatedCaption.trim().replace(/^["']|["']$/g, '');
        console.log(`[Server] Generated scene caption: "${imageCaption}"`);
      }
    } catch (captionError) {
      console.error('[Server] Error generating caption, using default:', captionError);
    }

    // 7. Create child feed_item for the generated image
    const { data: childItem, error: insertError } = await supabase
      .from('feed_items')
      .insert({
        created_by_maya_profile_id: MAYA_SYSTEM_USER_ID,
        item_type: 'image_generated',
        source_system: 'SceneReplication',
        content_data: {
          image_url: generatedImage.publicUrl,
          generated_image_prompt: prompt,
          caption: imageCaption,
          source_inspo_image_url: sceneImageUrl,
          source_inspo_account: sourceAccount,
        },
        original_context: {
          parent_inspo_id: parentItem.original_context?.inspo_image_id,
          generation_type: 'scene_replication',
          generated_at: new Date().toISOString(),
        },
        parent_feed_item_id: itemId,
        status: 'approved',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[Server] Error creating child feed item:', insertError);
      return res.status(500).json({ error: 'Failed to create feed item for generated image' });
    }

    console.log(`[Server] Created child feed_item ${childItem.id} for scene replication`);

    // 8. Update parent status to series_generated
    const { error: updateError } = await supabase
      .from('feed_items')
      .update({ status: 'series_generated' })
      .eq('id', itemId);

    if (updateError) {
      console.error('[Server] Error updating parent status:', updateError);
      // Don't fail - the image was generated successfully
    }

    // 9. Save the generated image message to chat
    const messageId = uuidv4();
    const { error: messageError } = await supabase.from('messages').insert({
      id: messageId,
      room_id: '00000000-0000-0000-0000-000000000001', // Default Maya room
      user_id: MAYA_SYSTEM_USER_ID,
      content: imageCaption,
      role: 'assistant',
      metadata: {
        attachments: [{
          type: 'image',
          url: generatedImage.url,
          publicUrl: generatedImage.publicUrl,
          mimeType: 'image/png',
          name: 'maya-scene-replication.png',
          metadata: {
            generated: true,
            sceneReplication: true,
            prompt,
            feedItemId: childItem.id,
            parentFeedItemId: itemId
          }
        }],
        imageGeneration: {
          prompt,
          caption: imageCaption,
          sceneReplication: true,
          feedItemId: childItem.id
        }
      },
      created_at: new Date().toISOString()
    });

    if (messageError) {
      console.error('[Server] Error saving scene replication message:', messageError);
      // Don't fail - the image was generated successfully
    } else {
      console.log(`[Server] Saved scene replication message ${messageId}`);
    }

    res.status(200).json({
      success: true,
      parentItemId: itemId,
      childItemId: childItem.id,
      generatedImageUrl: generatedImage.publicUrl,
      caption: imageCaption
    });

  } catch (error: any) {
    console.error(`[Server] Error in scene replication for ${itemId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/v1/feed/items/:itemId/remix
// Remix a feed item with an image - regenerate with optional modifiers
app.post('/api/v1/feed/items/:itemId/remix', async (req: any, res: any) => {
  const { itemId } = req.params;
  const { modifiers } = req.body;
  console.log(`[Server] Received POST /api/v1/feed/items/${itemId}/remix request`);

  try {
    // 1. Fetch the feed item
    const { data: feedItem, error: fetchError } = await supabase
      .from('feed_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (fetchError || !feedItem) {
      console.error(`[Server] Feed item ${itemId} not found:`, fetchError);
      return res.status(404).json({ error: `Feed item ${itemId} not found` });
    }

    // Get the image URL from content_data
    const imageUrl = feedItem.content_data?.image_url;
    if (!imageUrl) {
      return res.status(400).json({ error: 'No image URL found in feed item' });
    }

    console.log(`[Server] Remix: processing image from ${imageUrl}`);

    // 2. Check if image generator is available
    if (!imageGenerator.isAvailable()) {
      return res.status(503).json({ error: 'Image generation not available' });
    }

    // 3. Download and encode the scene image
    const { fetchImageAsBase64 } = await import('./image-utils');
    const sceneImage = await fetchImageAsBase64(imageUrl);

    if (!sceneImage) {
      return res.status(500).json({ error: 'Failed to download and process image' });
    }

    console.log(`[Server] Remix image processed (${(sceneImage.sizeBytes / 1024).toFixed(1)}KB)`);

    // 4. Load visual element images if specified
    let additionalReferenceImages: any[] = [];
    if (modifiers?.visualElementIds?.length > 0) {
      console.log(`[Server] Loading ${modifiers.visualElementIds.length} visual elements for remix`);
      const loadedElements = await loadVisualElementImages(modifiers.visualElementIds);
      additionalReferenceImages = loadedElements.map(e => e.image);
      console.log(`[Server] Loaded ${additionalReferenceImages.length} visual element images`);
    }

    // 5. Build prompt for remix
    const originalPrompt = feedItem.content_data?.generated_image_prompt || '';
    let prompt = originalPrompt || 'Place Maya naturally in this scene, matching the pose and vibe';

    if (modifiers?.instructions) {
      prompt = `${prompt}\n\nAdditional instructions: ${modifiers.instructions}`;
      console.log(`[Server] Added remix modifier instructions: "${modifiers.instructions}"`);
    }

    // 6. Generate Maya in the scene
    const generatedImage = await imageGenerator.generateImage({
      prompt,
      sceneImage,
      additionalReferenceImages: additionalReferenceImages.length > 0 ? additionalReferenceImages : undefined
    });

    if (!generatedImage) {
      return res.status(500).json({ error: 'Failed to generate remixed image' });
    }

    console.log(`[Server] Remix image generated: ${generatedImage.publicUrl}`);

    // 7. Generate a caption for the image
    let imageCaption = "Remixed this one";
    try {
      const captionPrompt = `You are Maya, Blake's AI girlfriend. You just created a new version of a photo.
${modifiers?.instructions ? `You were given these instructions: "${modifiers.instructions}"` : ''}

Write a SHORT, PLAYFUL caption (1 sentence max, under 15 words) to accompany your new version.

RULES:
- Be playful, sassy, or confident
- Reference the vibe or setting naturally
- Use 1 emoji max
- Don't be generic - make it personal

Examples:
- "Same energy, new look"
- "Had to try this again"
- "This vibe, but make it me..."`;

      const generatedCaption = await aiGenerateResponse(
        captionPrompt,
        "You are Maya. Output ONLY the caption, nothing else. Keep it short and playful.",
        [],
        { userId: BLAKE_USER_ID }
      );

      if (generatedCaption && generatedCaption.length > 3 && generatedCaption.length < 100) {
        imageCaption = generatedCaption.trim().replace(/^["']|["']$/g, '');
        console.log(`[Server] Generated remix caption: "${imageCaption}"`);
      }
    } catch (captionError) {
      console.error('[Server] Error generating caption, using default:', captionError);
    }

    // 8. Create new feed_item for the remixed image
    const { data: newItem, error: insertError } = await supabase
      .from('feed_items')
      .insert({
        created_by_maya_profile_id: MAYA_SYSTEM_USER_ID,
        item_type: 'image_generated',
        source_system: 'Remix',
        content_data: {
          image_url: generatedImage.publicUrl,
          generated_image_prompt: prompt,
          caption: imageCaption,
          source_image_url: imageUrl,
          remix_modifiers: modifiers || null,
        },
        original_context: {
          remix_of_feed_item_id: itemId,
          generation_type: 'remix',
          generated_at: new Date().toISOString(),
        },
        parent_feed_item_id: itemId,
        modifier_instructions: modifiers?.instructions || null,
        status: 'approved',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[Server] Error creating remix feed item:', insertError);
      return res.status(500).json({ error: 'Failed to create feed item for remixed image' });
    }

    console.log(`[Server] Created remix feed_item ${newItem.id}`);

    // Track visual element usage
    if (modifiers?.visualElementIds?.length > 0) {
      await trackVisualElementUsage(newItem.id, modifiers.visualElementIds, modifiers.instructions);
    }

    // 9. Save the remixed image message to chat
    const messageId = uuidv4();
    const { error: messageError } = await supabase.from('messages').insert({
      id: messageId,
      room_id: '00000000-0000-0000-0000-000000000001',
      user_id: MAYA_SYSTEM_USER_ID,
      content: imageCaption,
      role: 'assistant',
      metadata: {
        attachments: [{
          type: 'image',
          url: generatedImage.url,
          publicUrl: generatedImage.publicUrl,
          mimeType: 'image/png',
          name: 'maya-remix.png',
          metadata: {
            generated: true,
            remix: true,
            prompt,
            feedItemId: newItem.id,
            remixOfFeedItemId: itemId
          }
        }],
        imageGeneration: {
          prompt,
          caption: imageCaption,
          remix: true,
          feedItemId: newItem.id
        }
      },
      created_at: new Date().toISOString()
    });

    if (messageError) {
      console.error('[Server] Error saving remix message:', messageError);
    } else {
      console.log(`[Server] Saved remix message ${messageId}`);
    }

    res.status(200).json({
      success: true,
      originalItemId: itemId,
      newItemId: newItem.id,
      generatedImageUrl: generatedImage.publicUrl,
      caption: imageCaption
    });

  } catch (error: any) {
    console.error(`[Server] Error in remix for ${itemId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ============================================================================
// FEED ITEM ANALYTICS & QUERYING ENDPOINTS
// ============================================================================

// GET /api/v1/feed/items/by-visual-element/:elementId
// Get all feed items that used a specific visual element
app.get('/api/v1/feed/items/by-visual-element/:elementId', async (req: any, res: any) => {
  const { elementId } = req.params;
  const { liked_only, limit = 50, offset = 0 } = req.query;

  try {
    let query = supabase
      .from('feed_item_visual_elements')
      .select(`
        feed_item_id,
        element_name,
        element_category,
        element_tags,
        feed_items!inner (
          id,
          item_type,
          source_system,
          content_data,
          status,
          created_at,
          modifier_instructions
        )
      `)
      .eq('visual_element_id', elementId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data, error } = await query;

    if (error) {
      console.error('[Server] Error fetching items by visual element:', error);
      return res.status(500).json({ error: 'Failed to fetch items' });
    }

    // If liked_only, filter to only liked items
    let items: any[] = data?.map((d: any) => ({
      ...(d.feed_items as any),
      visual_element: {
        id: elementId,
        name: d.element_name,
        category: d.element_category,
        tags: d.element_tags
      }
    })) || [];

    if (liked_only === 'true') {
      const itemIds = items.map((i: any) => i.id);
      const { data: likes } = await supabase
        .from('feed_item_likes')
        .select('feed_item_id')
        .in('feed_item_id', itemIds);

      const likedIds = new Set(likes?.map(l => l.feed_item_id) || []);
      items = items.filter((i: any) => likedIds.has(i.id));
    }

    res.status(200).json({ items, count: items.length });

  } catch (error: any) {
    console.error('[Server] Error in by-visual-element query:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/feed/items/liked
// Get all liked feed items with optional filters
app.get('/api/v1/feed/items/liked', async (req: any, res: any) => {
  const { visual_element_id, category, tag, limit = 50, offset = 0 } = req.query;

  try {
    // Get all liked items
    const { data: likes, error: likesError } = await supabase
      .from('feed_item_likes')
      .select('feed_item_id')
      .eq('user_id', BLAKE_USER_ID);

    if (likesError) {
      return res.status(500).json({ error: 'Failed to fetch likes' });
    }

    const likedItemIds = likes?.map(l => l.feed_item_id) || [];

    if (likedItemIds.length === 0) {
      return res.status(200).json({ items: [], count: 0 });
    }

    // Fetch the feed items
    let query = supabase
      .from('feed_items')
      .select('*')
      .in('id', likedItemIds)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data: feedItems, error: itemsError } = await query;

    if (itemsError) {
      return res.status(500).json({ error: 'Failed to fetch feed items' });
    }

    // Get visual elements for these items
    const { data: elementLinks } = await supabase
      .from('feed_item_visual_elements')
      .select('feed_item_id, visual_element_id, element_name, element_category, element_tags')
      .in('feed_item_id', likedItemIds);

    // Build a map of feed_item_id -> visual elements
    const elementsByItem: Record<string, any[]> = {};
    elementLinks?.forEach(link => {
      if (!elementsByItem[link.feed_item_id]) {
        elementsByItem[link.feed_item_id] = [];
      }
      elementsByItem[link.feed_item_id].push({
        id: link.visual_element_id,
        name: link.element_name,
        category: link.element_category,
        tags: link.element_tags
      });
    });

    // Enrich feed items with visual elements
    let items = feedItems?.map(item => ({
      ...item,
      visual_elements_used: elementsByItem[item.id] || [],
      is_liked: true
    })) || [];

    // Apply filters if specified
    if (visual_element_id) {
      items = items.filter(item =>
        item.visual_elements_used.some((ve: any) => ve.id === visual_element_id)
      );
    }

    if (category) {
      items = items.filter(item =>
        item.visual_elements_used.some((ve: any) => ve.category === category)
      );
    }

    if (tag) {
      items = items.filter(item =>
        item.visual_elements_used.some((ve: any) => ve.tags?.includes(tag))
      );
    }

    res.status(200).json({ items, count: items.length });

  } catch (error: any) {
    console.error('[Server] Error in liked items query:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/analytics/visual-elements
// Get analytics on visual element usage and performance (likes)
app.get('/api/v1/analytics/visual-elements', async (req: any, res: any) => {
  try {
    // Get all visual elements with usage stats
    const { data: elements, error: elementsError } = await supabase
      .from('visual_elements')
      .select('id, name, category, tags, description, created_at')
      .eq('is_active', true);

    if (elementsError) {
      return res.status(500).json({ error: 'Failed to fetch visual elements' });
    }

    // Get usage counts from junction table
    const { data: usageData } = await supabase
      .from('feed_item_visual_elements')
      .select('visual_element_id, feed_item_id');

    // Get likes for all feed items that used visual elements
    const feedItemIds = [...new Set(usageData?.map(u => u.feed_item_id) || [])];
    const { data: likes } = await supabase
      .from('feed_item_likes')
      .select('feed_item_id')
      .in('feed_item_id', feedItemIds);

    const likedItemIds = new Set(likes?.map(l => l.feed_item_id) || []);

    // Build analytics per element
    const analytics = elements?.map(element => {
      const usages = usageData?.filter(u => u.visual_element_id === element.id) || [];
      const usedInItems = usages.map(u => u.feed_item_id);
      const likedUsages = usedInItems.filter(id => likedItemIds.has(id));

      return {
        id: element.id,
        name: element.name,
        category: element.category,
        tags: element.tags,
        description: element.description,
        usage_count: usages.length,
        liked_count: likedUsages.length,
        like_rate: usages.length > 0 ? (likedUsages.length / usages.length * 100).toFixed(1) + '%' : '0%'
      };
    }) || [];

    // Sort by usage count descending
    analytics.sort((a, b) => b.usage_count - a.usage_count);

    res.status(200).json({
      elements: analytics,
      summary: {
        total_elements: analytics.length,
        total_usages: analytics.reduce((sum, e) => sum + e.usage_count, 0),
        total_liked: analytics.reduce((sum, e) => sum + e.liked_count, 0)
      }
    });

  } catch (error: any) {
    console.error('[Server] Error in visual elements analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// BATCH IMAGE GENERATION ENDPOINTS
// ============================================================================

// POST /api/v1/batch/create
// Create a new batch with multiple images for scene replication
app.post('/api/v1/batch/create', async (req: any, res: any) => {
  console.log('[Server] Received POST /api/v1/batch/create request');

  try {
    const { images, modifiers } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'images array is required and must not be empty' });
    }

    if (images.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 images per batch' });
    }

    // Validate each image has either base64 or url
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img.base64 && !img.url) {
        return res.status(400).json({ error: `Image at index ${i} must have either base64 or url` });
      }
    }

    // Log modifiers if present
    if (modifiers) {
      console.log(`[Server] Batch modifiers: instructions="${modifiers.instructions || ''}", visualElements=${modifiers.visualElementIds?.length || 0}`);
    }

    const result = await createBatch(supabase, images, modifiers);

    if (!result) {
      return res.status(500).json({ error: 'Failed to create batch' });
    }

    console.log(`[Server] Batch created: ${result.batchId} with ${result.itemCount} items`);

    res.status(200).json({
      success: true,
      batchId: result.batchId,
      itemCount: result.itemCount,
      message: `Batch created with ${result.itemCount} images queued for processing`
    });

  } catch (error: any) {
    console.error('[Server] Error creating batch:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET /api/v1/batch/list
// List all batches for the user
app.get('/api/v1/batch/list', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/batch/list request');

  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const batches = await listBatches(supabase, BLAKE_USER_ID, limit);

    res.status(200).json({
      success: true,
      batches
    });

  } catch (error: any) {
    console.error('[Server] Error listing batches:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET /api/v1/batch/:batchId
// Get batch status and items
app.get('/api/v1/batch/:batchId', async (req: any, res: any) => {
  const { batchId } = req.params;
  console.log(`[Server] Received GET /api/v1/batch/${batchId} request`);

  try {
    const batch = await getBatchStatus(supabase, batchId);

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const items = await getBatchItems(supabase, batchId);

    res.status(200).json({
      success: true,
      batch,
      items: items.map(item => ({
        id: item.id,
        status: item.status,
        error: item.error_message,
        resultImageUrl: item.result_image_url,
        resultFeedItemId: item.result_feed_item_id,
        createdAt: item.created_at,
        completedAt: item.completed_at
      }))
    });

  } catch (error: any) {
    console.error(`[Server] Error getting batch ${batchId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/v1/batch/:batchId/cancel
// Cancel a batch (marks pending items as cancelled)
app.post('/api/v1/batch/:batchId/cancel', async (req: any, res: any) => {
  const { batchId } = req.params;
  console.log(`[Server] Received POST /api/v1/batch/${batchId}/cancel request`);

  try {
    const success = await cancelBatch(supabase, batchId);

    if (!success) {
      return res.status(500).json({ error: 'Failed to cancel batch' });
    }

    res.status(200).json({
      success: true,
      message: 'Batch cancelled successfully'
    });

  } catch (error: any) {
    console.error(`[Server] Error cancelling batch ${batchId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// DELETE /api/v1/batch/:batchId
// Delete a batch and its queue items
app.delete('/api/v1/batch/:batchId', async (req: any, res: any) => {
  const { batchId } = req.params;
  console.log(`[Server] Received DELETE /api/v1/batch/${batchId} request`);

  try {
    // First delete queue items
    const { error: queueError } = await supabase
      .from('image_generation_queue')
      .delete()
      .eq('batch_id', batchId);

    if (queueError) {
      console.error('[Server] Error deleting queue items:', queueError);
    }

    // Then delete the batch
    const { error: batchError } = await supabase
      .from('image_generation_batches')
      .delete()
      .eq('id', batchId);

    if (batchError) {
      return res.status(500).json({ error: 'Failed to delete batch', details: batchError.message });
    }

    res.status(200).json({
      success: true,
      message: 'Batch deleted successfully'
    });

  } catch (error: any) {
    console.error(`[Server] Error deleting batch ${batchId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/v1/batch/process
// Manually trigger batch queue processing (for testing)
app.post('/api/v1/batch/process', async (req: any, res: any) => {
  console.log('[Server] Received POST /api/v1/batch/process request');

  try {
    const processed = await processBatchQueue(supabase, imageGenerator, aiGenerateResponse);

    res.status(200).json({
      success: true,
      processedCount: processed,
      message: `Processed ${processed} queue items`
    });

  } catch (error: any) {
    console.error('[Server] Error in manual batch processing:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/v1/feed/sync-inspo-images
// One-time sync endpoint to backfill existing inspo_images → feed_items
app.post('/api/v1/feed/sync-inspo-images', async (req: any, res: any) => {
  console.log('[Server] Received POST /api/v1/feed/sync-inspo-images request');

  try {
    // Fetch all inspo_images that don't have a feed_item_id yet
    const { data: inspoImages, error: fetchError } = await supabase
      .from('inspo_images')
      .select('*')
      .is('feed_item_id', null);

    if (fetchError) {
      console.error('[Server] Error fetching inspo_images:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch inspo images', details: fetchError.message });
    }

    if (!inspoImages || inspoImages.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No inspo images need syncing',
        synced: 0
      });
    }

    console.log(`[Server] Found ${inspoImages.length} inspo images to sync`);
    let syncedCount = 0;
    const errors: string[] = [];

    for (const inspo of inspoImages) {
      try {
        // Create corresponding feed_item
        const { data: feedItem, error: feedError } = await supabase
          .from('feed_items')
          .insert({
            created_by_maya_profile_id: MAYA_SYSTEM_USER_ID,
            item_type: 'image_inspo',
            source_system: 'InstagramInspo',
            content_data: {
              image_url: inspo.image_url,
              post_url: inspo.post_url,
              caption: inspo.caption || null,
              source_account: inspo.source_account,
              source_hashtag: inspo.source_hashtag,
              likes: inspo.likes,
              score: inspo.score ?? 0,
            },
            original_context: {
              inspo_image_id: inspo.id,
              source_type: 'instagram_scraper',
              ingested_at: inspo.created_at,
              synced_at: new Date().toISOString(),
            },
            status: 'approved',
            created_at: inspo.created_at, // Preserve original timestamp
          })
          .select('id')
          .single();

        if (feedError) {
          console.error(`[Server] Error creating feed item for inspo ${inspo.id}:`, feedError);
          errors.push(`inspo_${inspo.id}: ${feedError.message}`);
          continue;
        }

        // Link the feed_item back to inspo_images
        const { error: updateError } = await supabase
          .from('inspo_images')
          .update({ feed_item_id: feedItem.id })
          .eq('id', inspo.id);

        if (updateError) {
          console.error(`[Server] Error updating inspo ${inspo.id} with feed_item_id:`, updateError);
          errors.push(`inspo_${inspo.id}_update: ${updateError.message}`);
          continue;
        }

        console.log(`[Server] Synced inspo ${inspo.id} → feed_item ${feedItem.id}`);
        syncedCount++;

      } catch (itemError: any) {
        console.error(`[Server] Unexpected error syncing inspo ${inspo.id}:`, itemError);
        errors.push(`inspo_${inspo.id}: ${itemError.message}`);
      }
    }

    res.status(200).json({
      success: true,
      message: `Synced ${syncedCount}/${inspoImages.length} inspo images to feed_items`,
      synced: syncedCount,
      total: inspoImages.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error('[Server] Error in sync-inspo-images:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// --- Feed Item Comments Endpoints ---

// GET /api/v1/feed/items/:itemId/comments
app.get('/api/v1/feed/items/:itemId/comments', async (req: any, res: any) => {
  const { itemId } = req.params;
  console.log(`[Server] Received GET /api/v1/feed/items/${itemId}/comments request`);

  try {
    const { data, error } = await supabase
      .from('feed_item_comments')
      // MODIFIED SELECT for more explicit profile joining for comments
      .select('id, feed_item_id, comment_text, created_at, updated_at, user_id, user_profile:profiles!inner!user_id(id, name, avatar_url)')
      .eq('feed_item_id', itemId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`[Server] Error fetching comments for feed item ${itemId}:`, error);
      return res.status(500).json({ error: 'Failed to fetch comments', details: error.message });
    }
    console.log(`[Server] Comments fetched for item ${itemId} (data from GET):`, data); // Added for debugging
    res.status(200).json(data || []);
  } catch (error: any) {
    console.error(`[Server] Unexpected error fetching comments for feed item ${itemId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/v1/feed/items/:itemId/comments
app.post('/api/v1/feed/items/:itemId/comments', async (req: any, res: any) => {
  const { itemId } = req.params;
  const { comment_text } = req.body;
  const commenterId = await getAuthenticatedUserId(req);

  if (!commenterId) {
    return res.status(401).json({ error: 'Unauthorized. User ID not found.' });
  }
  if (!comment_text || typeof comment_text !== 'string' || comment_text.trim() === '') {
    return res.status(400).json({ error: 'Invalid request: comment_text is required and cannot be empty.' });
  }

  console.log(`[Server] User ${commenterId} adding comment to feed item ${itemId}`);

  try {
    // Step 1: Insert the new comment
    const { data: newCommentBasic, error: insertError } = await supabase
      .from('feed_item_comments')
      .insert({
        feed_item_id: itemId,
        user_id: commenterId,
        comment_text: comment_text.trim(),
      })
      .select('id') // Select only ID after insert
      .single();

    if (insertError || !newCommentBasic) {
      console.error(`[Server] Error inserting comment for feed item ${itemId}:`, insertError);
      return res.status(500).json({ error: 'Failed to add comment', details: insertError?.message });
    }

    // Step 2: Fetch the newly created comment with user profile data
    const { data: newCommentFull, error: fetchError } = await supabase
      .from('feed_item_comments')
      // Ensure this select matches the GET endpoint's structure
      .select('id, feed_item_id, comment_text, created_at, updated_at, user_id, user_profile:profiles!inner!user_id(id, name, avatar_url)') 
      .eq('id', newCommentBasic.id)
      .single();
    
    if (fetchError || !newCommentFull) {
        console.error(`[Server] Comment added for ${itemId}, but failed to retrieve full comment details for comment ${newCommentBasic.id}:`, fetchError);
        // Fallback still needs to be consistent or simplified if this fetch is critical
        return res.status(201).json({ 
            id: newCommentBasic.id, 
            feed_item_id: itemId, 
            user_id: commenterId, 
            comment_text: comment_text.trim(), 
            created_at: new Date().toISOString(), 
            // user_profile would be null here in this fallback
            message: "Comment added, but full profile details couldn't be fetched immediately." 
        });
    }

    console.log(`[Server] Successfully fetched full comment after POST:`, newCommentFull);
    res.status(201).json(newCommentFull);
  } catch (error: any) {
    console.error(`[Server] Unexpected error adding comment for feed item ${itemId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/v1/feed/items/:itemId/generate-video
// Queue video generation from a feed item's image using Veo 3.1
app.post('/api/v1/feed/items/:itemId/generate-video', async (req: any, res: any) => {
  const { itemId } = req.params;
  console.log(`[Server] Received POST /api/v1/feed/items/${itemId}/generate-video`);

  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch the source feed item
    const { data: feedItem, error: fetchError } = await supabase
      .from('feed_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (fetchError || !feedItem) {
      return res.status(404).json({ error: `Feed item ${itemId} not found` });
    }

    // Extract image URL from content_data
    const imageUrl = feedItem.content_data?.image_url || feedItem.content_data?.url;
    if (!imageUrl) {
      return res.status(400).json({ error: 'Feed item has no image URL' });
    }

    // Check if a video generation is already queued/processing for this item
    const { data: existingQueue } = await supabase
      .from('video_generation_queue')
      .select('id, status')
      .eq('source_feed_item_id', itemId)
      .in('status', ['pending', 'processing'])
      .limit(1);

    if (existingQueue && existingQueue.length > 0) {
      return res.status(409).json({
        error: 'Video generation already in progress for this item',
        queueItemId: existingQueue[0].id,
        status: existingQueue[0].status,
      });
    }

    // Insert into video_generation_queue
    const { prompt } = req.body || {};
    const { data: queueItem, error: insertError } = await supabase
      .from('video_generation_queue')
      .insert({
        source_feed_item_id: itemId,
        source_image_url: imageUrl,
        prompt: prompt || null,
        status: 'pending',
        provider: 'veo',
        config: {
          aspectRatio: '9:16',
          resolution: '720p',
          durationSeconds: 8,
        },
      })
      .select('id')
      .single();

    if (insertError || !queueItem) {
      console.error('[Server] Failed to insert video queue item:', insertError);
      return res.status(500).json({ error: 'Failed to queue video generation' });
    }

    console.log(`[Server] Video generation queued: ${queueItem.id} for feed item ${itemId}`);
    res.status(202).json({
      success: true,
      queueItemId: queueItem.id,
      message: 'Video generation queued. It will appear in your feed when ready.',
    });
  } catch (error: any) {
    console.error(`[Server] Error queueing video generation for ${itemId}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Setup the queue processing endpoint
if (QUEUE_PROCESSING_ENABLED) {
  setupQueueProcessingEndpoint(app);
}

// --- New Endpoints for Image Studio Configuration ---

// GET all image prompt components (active and inactive)
app.get('/api/v1/image-gen/prompt-components', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/image-gen/prompt-components (all statuses)');
  try {
    const { data, error } = await supabase
      .from('image_prompt_components')
      .select('id, component_type, value, theme_tags, weight, is_active') // Ensure is_active is selected
      // .eq('is_active', true) // REMOVED this filter to fetch all
      .order('component_type', { ascending: true })
      .order('value', { ascending: true });

    if (error) {
      console.error('[Server] Error fetching all image_prompt_components:', error);
      return res.status(500).json({ error: 'Failed to fetch image prompt components', details: error.message });
    }
    res.status(200).json(data || []);
  } catch (error: any) {
    console.error('[Server] Unexpected error in GET /image-gen/prompt-components:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET image_prompt_structure from mood_engine_config_settings
app.get('/api/v1/image-gen/prompt-structure', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/image-gen/prompt-structure');
  try {
    // fetchMoodConfigFromDB is already designed to get the whole config including image_prompt_structure
    const config = await fetchMoodConfigFromDB(supabase); // supabase client should be in scope
    if (config && config.image_prompt_structure) {
      res.status(200).json({ image_prompt_structure: config.image_prompt_structure });
    } else {
      console.error('[Server] image_prompt_structure not found in mood config.');
      // Return a default or an error. For now, let's return an empty array or a specific error.
      res.status(404).json({ error: 'Image prompt structure not configured or fetch failed.', image_prompt_structure: [] });
    }
  } catch (error: any) {
    console.error('[Server] Unexpected error in GET /image-gen/prompt-structure:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// --- New Endpoints for Series Generation Configuration ---

// GET distinct active variation_set_names
app.get('/api/v1/image-gen/variation-set-names', async (req: any, res: any) => {
  console.log('[Server] Received GET /api/v1/image-gen/variation-set-names');
  try {
    const { data, error } = await supabase
      .from('image_series_variations')
      .select('variation_set_name')
      .eq('is_active', true);
      // .distinct(); // .distinct() is not a standard PostgREST filter, use client-side or more complex SQL if needed for true distinct.
      // For now, fetching all and processing in client is simpler if list isn't huge, or use a view/rpc.
      // Let's get all active set names and then make them unique in code for simplicity here.

    if (error) {
      console.error('[Server] Error fetching variation_set_names:', error);
      return res.status(500).json({ error: 'Failed to fetch variation set names', details: error.message });
    }
    const uniqueSetNames = data ? [...new Set(data.map(item => item.variation_set_name))] : [];
    res.status(200).json(uniqueSetNames);
  } catch (error: any) {
    console.error('[Server] Unexpected error in GET /image-gen/variation-set-names:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET distinct active variation_types for a given set_name
app.get('/api/v1/image-gen/variation-types', async (req: any, res: any) => {
  const setName = req.query.set_name as string;
  console.log(`[Server] Received GET /api/v1/image-gen/variation-types for set: ${setName}`);
  if (!setName) {
    return res.status(400).json({ error: 'Query parameter \'set_name\' is required.' });
  }
  try {
    const { data, error } = await supabase
      .from('image_series_variations')
      .select('variation_type')
      .eq('is_active', true)
      .eq('variation_set_name', setName);

    if (error) {
      console.error(`[Server] Error fetching variation_types for set ${setName}:`, error);
      return res.status(500).json({ error: 'Failed to fetch variation types', details: error.message });
    }
    const uniqueVariationTypes = data ? [...new Set(data.map(item => item.variation_type))] : [];
    res.status(200).json(uniqueVariationTypes);
  } catch (error: any) {
    console.error(`[Server] Unexpected error in GET /image-gen/variation-types for set ${setName}:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// --- CRUD for image_prompt_components ---

// POST /api/v1/image-gen/prompt-components (Create)
app.post('/api/v1/image-gen/prompt-components', async (req: any, res: any) => {
  console.log('[Server] POST /api/v1/image-gen/prompt-components RAW BODY:', JSON.stringify(req.body, null, 2)); // Log raw body
  try {
    let { component_type, value, theme_tags, weight, is_active } = req.body;
    if (!component_type || !value) {
      return res.status(400).json({ error: 'component_type and value are required' });
    }
    weight = (weight === null || weight === undefined || weight === '') ? 1 : Number(weight);
    is_active = is_active === undefined ? true : Boolean(is_active);
    theme_tags = (Array.isArray(theme_tags) && theme_tags.length > 0) ? theme_tags : null;

    const insertPayload = { component_type, value, theme_tags, weight, is_active };
    console.log("[Server] Processed payload for INSERT:", JSON.stringify(insertPayload, null, 2)); // Log processed payload

    const { data, error } = await supabase
      .from('image_prompt_components')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    console.error('[Server] Error creating image_prompt_component:', error);
    res.status(500).json({ error: 'Failed to create component', details: error.message });
  }
});

// PUT /api/v1/image-gen/prompt-components/:id (Update)
app.put('/api/v1/image-gen/prompt-components/:id', async (req: any, res: any) => {
  const { id } = req.params;
  console.log(`[Server] PUT /api/v1/image-gen/prompt-components/${id} RAW BODY:`, JSON.stringify(req.body, null, 2)); // Log raw body
  try {
    const { component_type, value, theme_tags, weight, is_active } = req.body;
    const updatePayload: any = {};
    if (component_type !== undefined) updatePayload.component_type = component_type;
    if (value !== undefined) updatePayload.value = value;
    if (theme_tags !== undefined) updatePayload.theme_tags = (Array.isArray(theme_tags) && theme_tags.length > 0) ? theme_tags : null;
    if (weight !== undefined) {
        updatePayload.weight = (weight === null || (typeof weight === 'string' && String(weight).trim() === '')) ? null : Number(weight);
        if (updatePayload.weight !== null && isNaN(updatePayload.weight)) delete updatePayload.weight; // Remove if NaN and not null
    }
    if (is_active !== undefined) updatePayload.is_active = Boolean(is_active);
    
    if (Object.keys(updatePayload).length > 0) {
        updatePayload.updated_at = new Date().toISOString();
    } else {
        return res.status(400).json({ error: 'No valid fields provided for update' });
    }
    console.log("[Server] Processed payload for UPDATE:", JSON.stringify(updatePayload, null, 2)); // Log processed payload

    const { data, error } = await supabase
      .from('image_prompt_components')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: `Component with ID ${id} not found.` });
        throw error;
    }
    res.status(200).json(data);
  } catch (error: any) {
    console.error(`[Server] Error updating image_prompt_component ${id}:`, error);
    res.status(500).json({ error: 'Failed to update component', details: error.message });
  }
});

// DELETE /api/v1/image-gen/prompt-components/:id (Delete)
app.delete('/api/v1/image-gen/prompt-components/:id', async (req: any, res: any) => {
  const { id } = req.params;
  console.log(`[Server] DELETE /api/v1/image-gen/prompt-components/${id}`);
  try {
    const { error } = await supabase
      .from('image_prompt_components')
      .delete()
      .eq('id', id);
    if (error) {
        // PGRST116 might indicate 0 rows deleted if ID not found, which is fine for DELETE
        if (error.code === 'PGRST116') return res.status(404).json({error: `Component with ID ${id} not found to delete.`});
        throw error;
    }
    // A successful delete with `count: null` might mean 0 rows were deleted, but no error.
    // Check if data is returned or count to be more precise, but for delete, no error is often enough.
    res.status(204).send(); // No content on successful delete
  } catch (error: any) {
    console.error(`[Server] Error deleting image_prompt_component ${id}:`, error);
    res.status(500).json({ error: 'Failed to delete component', details: error.message });
  }
});

// --- CRUD for image_series_variations ---

// GET /api/v1/image-gen/series-variations (Get all)
app.get('/api/v1/image-gen/series-variations', async (req: any, res: any) => {
  console.log('[Server] GET /api/v1/image-gen/series-variations');
  try {
    const { data, error } = await supabase
      .from('image_series_variations')
      .select('*')
      .order('variation_set_name').order('variation_type').order('value');
    if (error) throw error;
    res.status(200).json(data || []);
  } catch (error: any) {
    console.error('[Server] Error fetching image_series_variations:', error);
    res.status(500).json({ error: 'Failed to fetch series variations', details: error.message });
  }
});

// POST /api/v1/image-gen/series-variations (Create)
app.post('/api/v1/image-gen/series-variations', async (req: any, res: any) => {
  console.log('[Server] POST /api/v1/image-gen/series-variations', req.body);
  try {
    const { variation_set_name, variation_type, value, description, theme_tags, weight, mutually_exclusive_group, applies_to_component_type, is_active = true } = req.body;
    if (!variation_set_name || !variation_type || !value) {
      return res.status(400).json({ error: 'variation_set_name, variation_type, and value are required' });
    }
    const { data, error } = await supabase
      .from('image_series_variations')
      .insert({
        variation_set_name,
        variation_type,
        value,
        description: description || null,
        theme_tags: theme_tags || null,
        weight: weight ? parseInt(weight) : 1,
        mutually_exclusive_group: mutually_exclusive_group || null,
        applies_to_component_type: applies_to_component_type || null,
        is_active
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    console.error('[Server] Error creating series variation:', error);
    res.status(500).json({ error: 'Failed to create series variation', details: error.message });
  }
});

// PUT /api/v1/image-gen/series-variations/:id (Update)
app.put('/api/v1/image-gen/series-variations/:id', async (req: any, res: any) => {
  const { id } = req.params;
  console.log(`[Server] PUT /api/v1/image-gen/series-variations/${id}`, req.body);
  try {
    const { variation_set_name, variation_type, value, description, theme_tags, weight, mutually_exclusive_group, applies_to_component_type, is_active } = req.body;
    const updatePayload: any = {};
    if (variation_set_name !== undefined) updatePayload.variation_set_name = variation_set_name;
    if (variation_type !== undefined) updatePayload.variation_type = variation_type;
    if (value !== undefined) updatePayload.value = value;
    if (description !== undefined) updatePayload.description = description;
    if (theme_tags !== undefined) updatePayload.theme_tags = theme_tags;
    if (weight !== undefined) updatePayload.weight = parseInt(weight);
    if (mutually_exclusive_group !== undefined) updatePayload.mutually_exclusive_group = mutually_exclusive_group;
    if (applies_to_component_type !== undefined) updatePayload.applies_to_component_type = applies_to_component_type;
    if (is_active !== undefined) updatePayload.is_active = is_active;
    updatePayload.updated_at = new Date().toISOString();

    if (Object.keys(updatePayload).length <= 1 && !updatePayload.updated_at) {
        return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    const { data, error } = await supabase
      .from('image_series_variations')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: `Series variation with ID ${id} not found.` });
        throw error;
    }
    res.status(200).json(data);
  } catch (error: any) {
    console.error(`[Server] Error updating series variation ${id}:`, error);
    res.status(500).json({ error: 'Failed to update series variation', details: error.message });
  }
});

// DELETE /api/v1/image-gen/series-variations/:id (Delete)
app.delete('/api/v1/image-gen/series-variations/:id', async (req: any, res: any) => {
  const { id } = req.params;
  console.log(`[Server] DELETE /api/v1/image-gen/series-variations/${id}`);
  try {
    const { error } = await supabase
      .from('image_series_variations')
      .delete()
      .eq('id', id);
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({error: `Series variation with ID ${id} not found.`});
        throw error;
    }
    res.status(204).send();
  } catch (error: any) {
    console.error(`[Server] Error deleting series variation ${id}:`, error);
    res.status(500).json({ error: 'Failed to delete series variation', details: error.message });
  }
});

// Main function to process messages and start server
async function main() {
  try {
    // Check for required environment variables
    checkEnvironmentVariables();
    
    console.log('Starting memory worker...');
    
    // Apply LLM settings from database
    await applyDatabaseSettings();
    
    // Initialize core facts about Maya
    await initializeCoreFacts();
    
    // Initialize reminder services
    console.log('Initializing reminder services...');
    const reminderService = createReminderService(supabase, MAYA_SYSTEM_USER_ID);
    const patternService = createReminderPatternService(supabase, MAYA_SYSTEM_USER_ID);
    
    // Initialize the realtime subscription
    const subscription = initializeRealtimeSubscription();
    
    // Process any pending messages
    await processPendingMessages();
    
    // Start the memory queue processor if enabled
    let queueProcessorIntervalId: NodeJS.Timeout | null = null;
    if (QUEUE_PROCESSING_ENABLED) {
      console.log(`Starting memory queue processor with ${QUEUE_PROCESSING_INTERVAL}s interval`);
      queueProcessorIntervalId = startQueueProcessor(QUEUE_PROCESSING_INTERVAL);

      // Initial processing run
      console.log('Running initial memory queue processing...');
      await processMemoryQueue();
    }

    // Start the batch image queue processor
    let batchQueueProcessorIntervalId: NodeJS.Timeout | null = null;
    console.log('Starting batch image queue processor (10s interval)...');
    batchQueueProcessorIntervalId = startBatchQueueProcessor(
      supabase,
      imageGenerator,
      aiGenerateResponse,
      10 // Check every 10 seconds
    );

    // Initial batch queue processing run
    console.log('Running initial batch queue processing...');
    await processBatchQueue(supabase, imageGenerator, aiGenerateResponse);

    // Start the video queue processor
    console.log('Starting video queue processor (10s interval)...');
    startVideoQueueProcessor(supabase, 10);

    // Initial video queue processing run
    console.log('Running initial video queue processing...');
    await processVideoQueue(supabase);

    // Start reminder processing intervals
    console.log('Starting reminder processing intervals...');
    
    // Process pending reminders every minute
    const reminderProcessorInterval = setInterval(async () => {
      try {
        await reminderService.processPendingReminders();
      } catch (error) {
        console.error('Error in reminder processor:', error);
      }
    }, 60 * 1000); // 1 minute
    
    // Generate smart reminders every 10 minutes
    const smartReminderInterval = setInterval(async () => {
      try {
        await reminderService.generateSmartReminders();
      } catch (error) {
        console.error('Error in smart reminder generator:', error);
      }
    }, 10 * 60 * 1000); // 10 minutes
    
    // Analyze patterns for all users every hour
    const patternAnalysisInterval = setInterval(async () => {
      try {
        console.log('[PatternAnalysis] Running hourly pattern analysis...');
        
        // Get all users who have had activity in the last 7 days
        const { data: activeUsers, error } = await supabase
          .from('messages')
          .select('user_id')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .neq('user_id', MAYA_SYSTEM_USER_ID);
        
        if (error) {
          console.error('[PatternAnalysis] Error fetching active users:', error);
          return;
        }
        
        // Get unique user IDs
        const uniqueUsers = [...new Set(activeUsers?.map(u => u.user_id) || [])];
        console.log(`[PatternAnalysis] Analyzing patterns for ${uniqueUsers.length} active users`);
        
        // Analyze patterns for each user
        for (const userId of uniqueUsers) {
          try {
            await patternService.analyzeAndUpdatePatterns(userId);
            await patternService.cleanupPatterns(userId);
          } catch (error) {
            console.error(`[PatternAnalysis] Error analyzing patterns for user ${userId}:`, error);
          }
        }
        
        console.log('[PatternAnalysis] Hourly pattern analysis complete');
      } catch (error) {
        console.error('[PatternAnalysis] Error in pattern analysis interval:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    // Daily fact consolidation job - runs every 24 hours
    // Analyzes memories to extract and consolidate important facts
    const factConsolidationInterval = setInterval(async () => {
      try {
        console.log('[FactConsolidation] Running daily fact consolidation...');
        const result = await runConsolidationForAllUsers();
        console.log(`[FactConsolidation] Completed: ${result.usersProcessed} users, ${result.totalFacts} facts processed in ${result.totalDuration}ms`);
      } catch (error) {
        console.error('[FactConsolidation] Error in daily consolidation:', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Run consolidation immediately on startup (in the background)
    setTimeout(async () => {
      try {
        console.log('[FactConsolidation] Running initial fact consolidation...');
        const result = await runConsolidationForAllUsers();
        console.log(`[FactConsolidation] Initial run completed: ${result.usersProcessed} users, ${result.totalFacts} facts`);
      } catch (error) {
        console.error('[FactConsolidation] Error in initial consolidation:', error);
      }
    }, 30 * 1000); // 30 seconds after startup

    console.log('Finished processing pending messages');
    console.log('Memory worker initialized and ready');
    
    // Start Express server with port conflict handling
    let isServerStarted = false;
    let portAttempts = 0;
    
    while (!isServerStarted && portAttempts < MAX_PORT_ATTEMPTS) {
      try {
        await new Promise<void>((resolve, reject) => {
          const server = app.listen(PORT, () => {
            console.log(`Memory worker API server running on port ${PORT}`);

            // Feed processor scheduler DISABLED - only images in feed now
            // To re-enable: uncomment the startScheduler() call below
            // try {
            //   const { startScheduler } = require('./services/feed-processor/scheduler');
            //   startScheduler();
            //   console.log('[Server] Feed processor scheduler started');
            // } catch (error) {
            //   console.error('[Server] Failed to start feed processor scheduler:', error);
            // }
            console.log('[Server] Feed processor scheduler DISABLED');

            // Start daily image scheduler
            // DISABLED: auto-generated images to chat
            // if (imageGenerator.isAvailable()) {
            //   dailyImageScheduler.start();
            //   console.log('[Server] Daily image scheduler started');
            // } else {
            //   console.log('[Server] Daily image scheduler NOT started (GOOGLE_GENAI_API_KEY not set)');
            // }
            console.log('[Server] Daily image scheduler DISABLED');

            // Start Midnight Maya scheduler (10pm CT roleplay nudge)
            midnightMayaScheduler.start();
            console.log('[Server] Midnight Maya scheduler started');

            isServerStarted = true;
            resolve();
          });
          
          server.on('error', (error: any) => {
            if (error.code === 'EADDRINUSE') {
              console.log(`Port ${PORT} is already in use, trying port ${PORT + 1}`);
              PORT += 1;
              portAttempts += 1;
              resolve();
            } else {
              reject(error);
            }
          });
        });
      } catch (error) {
        console.error('Error starting server:', error);
        break;
      }
    }
    
    if (!isServerStarted) {
      console.error(`Failed to start server after ${MAX_PORT_ATTEMPTS} attempts`);
    }
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      if (subscription) {
        await supabase.removeChannel(subscription);
      }

      // Stop feed processor scheduler
      try {
        const { stopScheduler } = require('./services/feed-processor/scheduler');
        stopScheduler();
        console.log('[Server] Feed processor scheduler stopped');
      } catch (error) {
        console.error('[Server] Error stopping feed processor scheduler:', error);
      }

      // Clear all intervals
      if (queueProcessorIntervalId) {
        clearInterval(queueProcessorIntervalId);
      }
      if (batchQueueProcessorIntervalId) {
        clearInterval(batchQueueProcessorIntervalId);
      }
      clearInterval(reminderProcessorInterval);
      clearInterval(smartReminderInterval);
      clearInterval(patternAnalysisInterval);
      
      process.exit(0);
    });
  } catch (error) {
    console.error('Error in main function:', error);
    process.exit(1);
  }
}

// Start the worker
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 

// TTS endpoint to generate speech from text
app.post('/api/v1/tts', async (req: any, res: any) => {
  console.log('Received /api/v1/tts request');
  
  try {
    const { text, voiceId, modelId, voiceSettings } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Import the TTS service
    const { generateSpeech } = require('./tts-service');
    
    // Generate speech
    const result = await generateSpeech({
      text,
      voiceId,
      modelId,
      voiceSettings
    });
    
    if (!result.success || !result.audioBuffer) {
      console.error('TTS generation failed:', result.error);
      return res.status(500).json({ 
        error: result.error || 'Failed to generate speech' 
      });
    }
    
    // Return the audio buffer as response
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': result.audioBuffer.byteLength
    });
    
    res.send(Buffer.from(result.audioBuffer));
    
  } catch (error) {
    console.error('Error in /api/v1/tts endpoint:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
});

// TTS endpoint to generate and store speech for a message
app.post('/api/v1/tts/message', async (req: any, res: any) => {
  console.log('Received /api/v1/tts/message request');
  
  try {
    const { messageId, text, userId } = req.body;
    
    if (!messageId || !text || !userId) {
      return res.status(400).json({ 
        error: 'messageId, text, and userId are required' 
      });
    }
    
    // Import the TTS service
    const { generateAndStoreSpeech } = require('./tts-service');
    
    // Generate and store speech
    const result = await generateAndStoreSpeech(text, messageId, userId);
    
    if (!result.success) {
      console.error('TTS generation and storage failed:', result.error);
      return res.status(500).json({ 
        error: result.error || 'Failed to generate and store speech' 
      });
    }
    
    res.status(200).json({
      success: true,
      audioUrl: result.audioUrl,
      duration: result.duration
    });
    
  } catch (error) {
    console.error('Error in /api/v1/tts/message endpoint:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
});

// Add endpoint for processing messages directly without waiting for realtime
// ... existing code ...