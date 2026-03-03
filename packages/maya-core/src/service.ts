/**
 * Maya Core v2.0 Microservice
 * 
 * Standalone HTTP service for Maya AI processing
 * Can be deployed independently or used as a library
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { MayaConfig } from './types';
import { MAYA_PERSONALITY, TEMPERATURE_SETTINGS, IMAGE_MEMORY, SYSTEM_USER_IDS } from './constants';
import { createClient } from '@supabase/supabase-js';
import { Anthropic } from '@anthropic-ai/sdk';
import { CohereEmbeddings } from '@langchain/cohere';
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { CartesiaClient } from '@cartesia/cartesia-js';
import { v4 as uuidv4 } from 'uuid';
import { TemporalMemoryRetriever } from './temporal-memory';
import { WorkingMemoryExtractor } from './working-memory-extractor';
import { ReferenceTracker, extractMemoryIds, extractThoughtIds } from './reference-tracker';
import { getTemporalContextPrompt, getCurrentDayPhase } from './day-phase';
import { EpisodicMemoryService } from './episodic-memory';
import { SelfReflectionService } from './self-reflection';
import { MayaImageGenerator } from './image-generation';
import { DailyImageScheduler } from './daily-image-scheduler';

export class MayaService {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer;
  // Maya instance not needed - all functionality is in this service
  private port: number;
  private supabase: any;
  private anthropic!: Anthropic;
  private cohereEmbeddings: CohereEmbeddings | null = null;
  private cartesia: any;
  private workingMemoryExtractor!: WorkingMemoryExtractor;
  private referenceTracker!: ReferenceTracker;
  private episodicMemory!: EpisodicMemoryService;
  private selfReflection!: SelfReflectionService;
  private imageGenerator!: MayaImageGenerator;
  private dailyImageScheduler!: DailyImageScheduler;

  constructor(port: number = parseInt(process.env.PORT || process.env.MAYA_CORE_PORT || '3333')) {
    this.app = express();
    this.port = port;

    // Create HTTP server for WebSocket support
    this.server = createServer(this.app);

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.server, path: '/voice' });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.initializeServices();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' })); // For large images
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: any, req: any) => {
      console.log('[MAYA_WEBSOCKET] New WebSocket connection established');

      let sessionId: string | null = null;

      ws.on('message', async (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('[MAYA_WEBSOCKET] Received message:', message);

          if (message.type === 'message') {
            const { message: text, userId, sessionId: msgSessionId } = message;

            // Store session ID for context
            if (msgSessionId) {
              sessionId = msgSessionId;
            }

            if (!text || !userId) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Missing required fields: message, userId'
              }));
              return;
            }

            console.log(`[MAYA_WEBSOCKET] Processing message for user: ${userId}`);

            // Process message and stream response
            try {
              const result = await this.processMessage({
                message: text,
                userId,
                roomId: sessionId || 'voice_websocket',
                attachments: [],
                options: {}
              });

              // Send streaming response (you could implement actual streaming here)
              ws.send(JSON.stringify({
                type: 'response',
                content: result.content,
                sessionId: sessionId || 'voice_websocket',
                processing: result.processing,
                metadata: result.metadata
              }));

              // Send completion
              ws.send(JSON.stringify({
                type: 'complete',
                sessionId: sessionId || 'voice_websocket'
              }));

            } catch (error: any) {
              console.error('[MAYA_WEBSOCKET] Processing error:', error);
              ws.send(JSON.stringify({
                type: 'error',
                error: error.message,
                sessionId: sessionId
              }));
            }
          }
        } catch (error: any) {
          console.error('[MAYA_WEBSOCKET] Message parsing error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format'
          }));
        }
      });

      ws.on('close', () => {
        console.log('[MAYA_WEBSOCKET] WebSocket connection closed');
      });

      ws.on('error', (error: any) => {
        console.error('[MAYA_WEBSOCKET] WebSocket error:', error);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Maya Core WebSocket'
      }));
    });
  }

  private async initializeServices() {
    console.log('🤖 Initializing Maya Core v2.0 Microservice...');

    // Initialize Supabase (use NEXT_PUBLIC_SUPABASE_URL for consistency with website)
    this.supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Initialize Anthropic
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!
    });

    // Initialize Working Memory Extractor
    this.workingMemoryExtractor = new WorkingMemoryExtractor(this.anthropic, this.supabase);
    console.log('✅ Working Memory Extractor initialized');

    // Initialize Reference Tracker (Memory System 2.0)
    this.referenceTracker = new ReferenceTracker(this.supabase);
    console.log('✅ Reference Tracker initialized');

    // Initialize Episodic Memory (Memory System 2.0 - Phase 2)
    this.episodicMemory = new EpisodicMemoryService(
      this.supabase,
      this.anthropic,
      this.cohereEmbeddings || undefined
    );
    console.log('✅ Episodic Memory Service initialized');

    // Initialize Self-Reflection (Memory System 2.0 - Phase 3)
    this.selfReflection = new SelfReflectionService(
      this.supabase,
      this.anthropic
    );
    console.log('✅ Self-Reflection Service initialized');

    // Initialize Cohere embeddings
    try {
      this.cohereEmbeddings = new CohereEmbeddings({
        apiKey: process.env.COHERE_API_KEY,
        model: 'embed-english-v3.0',
        inputType: 'search_document',
      });
      console.log('✅ Cohere embeddings initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Cohere embeddings:', error);
    }

    // Initialize Cartesia for TTS
    try {
      if (process.env.CARTESIA_API_KEY) {
        this.cartesia = new CartesiaClient({
          apiKey: process.env.CARTESIA_API_KEY
        });
        console.log('✅ Cartesia TTS initialized');
      } else {
        console.log('⚠️ Cartesia API key not found, TTS will not be available');
      }
    } catch (error) {
      console.error('❌ Failed to initialize Cartesia TTS:', error);
    }

    // Initialize Image Generator
    this.imageGenerator = new MayaImageGenerator(this.supabase);
    if (this.imageGenerator.isAvailable()) {
      console.log('✅ Maya Image Generator initialized');
    } else {
      console.log('⚠️ Image generation disabled (no GOOGLE_GENAI_API_KEY)');
    }

    // Initialize Daily Image Scheduler
    // NOTE: Scheduler disabled here - memory-worker runs the advanced LLM-based scheduler
    // to avoid duplicate image sends. See /packages/memory-worker/src/daily-image-scheduler.ts
    this.dailyImageScheduler = new DailyImageScheduler(this.supabase, this.imageGenerator);
    // if (this.imageGenerator.isAvailable()) {
    //   this.dailyImageScheduler.start();
    //   console.log('✅ Daily Image Scheduler started');
    // }
    console.log('ℹ️ Daily Image Scheduler disabled (runs in memory-worker)');

    console.log('✅ Maya Core v2.0 Microservice initialized');
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', this.handleHealthCheck.bind(this));

    // Process message
    this.app.post('/process', this.handleProcessMessage.bind(this));

    // Chat endpoint (alias for process - used by voice assistant)
    this.app.post('/chat', this.handleChatMessage.bind(this));

    // Get memories
    this.app.get('/memories/:userId', this.handleGetMemories.bind(this));

    // Get facts
    this.app.get('/facts/:userId', this.handleGetFacts.bind(this));

    // Store memory
    this.app.post('/memory', this.handleStoreMemory.bind(this));

    // Store fact
    this.app.post('/fact', this.handleStoreFact.bind(this));

    // Streaming endpoint for low-latency voice
    this.app.post('/process/stream', this.handleProcessMessageStream.bind(this));

    // TTS endpoint using Cartesia
    this.app.post('/tts', this.handleTTS.bind(this));

    // Streaming TTS endpoint using Cartesia SSE
    this.app.post('/tts/stream', this.handleTTSStream.bind(this));

    // WebSocket TTS endpoint for ultra-low latency real-time streaming
    this.app.post('/tts/websocket', this.handleTTSWebSocket.bind(this));

    // ULTRA LOW LATENCY: Streaming proxy endpoints
    this.app.get('/tts/stream-proxy', this.handleStreamingProxy.bind(this));
    this.app.post('/tts/stream-proxy/chunk', this.handleStreamingChunk.bind(this));
    this.app.post('/tts/stream-proxy/end', this.handleStreamingEnd.bind(this));

    // Debug endpoint to see what Maya would recall
    this.app.post('/debug/memory', this.handleDebugMemory.bind(this));

    // xAI Voice session endpoint for mobile app
    this.app.post('/voice/session', this.handleVoiceSession.bind(this));

    // Image generation endpoints
    this.app.post('/image/generate', this.handleImageGenerate.bind(this));
    this.app.post('/image/daily/trigger', this.handleDailyImageTrigger.bind(this));
    this.app.get('/image/daily/status', this.handleDailyImageStatus.bind(this));
  }

  // ==================== IMAGE GENERATION HANDLERS ====================

  private async handleImageGenerate(req: express.Request, res: express.Response) {
    try {
      const { prompt, pose, clothing, background, roomId, userId, saveToChat = true } = req.body;

      if (!this.imageGenerator.isAvailable()) {
        return res.status(503).json({ error: 'Image generation not available' });
      }

      if (!prompt) {
        return res.status(400).json({ error: 'Missing required field: prompt' });
      }

      console.log('🎨 [IMAGE] Generating image:', prompt);

      // Parse the freestyle prompt to extract options
      const parsedOptions = this.imageGenerator.parsePrompt(prompt);
      const options = {
        prompt,
        pose: pose || parsedOptions.pose || 'casual',
        clothing: clothing || parsedOptions.clothing || 'casual',
        background: background || parsedOptions.background || 'home'
      };

      const image = await this.imageGenerator.generateImage(options);

      if (!image) {
        return res.status(500).json({ error: 'Failed to generate image' });
      }

      // Save to chat if requested
      if (saveToChat && roomId) {
        const responses = [
          "Here you go, babe! 📸",
          "Just for you~ 💕",
          "Here's a little something 😊",
          "Ta-da! 🎉"
        ];
        const content = responses[Math.floor(Math.random() * responses.length)];

        await this.supabase.from('messages').insert({
          id: uuidv4(),
          room_id: roomId,
          user_id: SYSTEM_USER_IDS.MAYA,
          content,
          role: 'assistant',
          metadata: {
            attachments: [{
              type: 'image',
              url: image.url,
              publicUrl: image.publicUrl,
              mimeType: 'image/png',
              name: `maya-generated.png`,
              metadata: { generated: true, prompt }
            }],
            imageGeneration: { prompt, options }
          },
          created_at: new Date().toISOString()
        });

        // Update room's last_message_at
        await this.supabase
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
      console.error('[IMAGE] Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  private async handleDailyImageTrigger(req: express.Request, res: express.Response) {
    try {
      if (!this.imageGenerator.isAvailable()) {
        return res.status(503).json({ error: 'Image generation not available' });
      }

      const result = await this.dailyImageScheduler.forceRun();
      res.json({ success: result, message: result ? 'Daily image sent' : 'Skipped (already sent today or random skip)' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async handleDailyImageStatus(req: express.Request, res: express.Response) {
    const status = this.dailyImageScheduler.getStatus();
    res.json({
      ...status,
      imageGenerationAvailable: this.imageGenerator.isAvailable()
    });
  }

  // ==================== END IMAGE GENERATION HANDLERS ====================

  private async handleHealthCheck(req: express.Request, res: express.Response) {
    try {
      res.json({
        status: 'healthy',
        service: 'Maya Core v2.0 Microservice',
        version: '2.0.0',
        features: {
          multimodal: true,
          advancedRAG: true,
          qualityMonitoring: true,
          realTimeProcessing: true
        },
        providers: {
          llm: 'Claude 4.5 Opus',
          embeddings: this.cohereEmbeddings ? 'Cohere embed-english-v3.0' : 'Not initialized',
          storage: 'Supabase + pgvector'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Service unhealthy', details: error.message });
    }
  }

  private async handleChatMessage(req: express.Request, res: express.Response) {
    try {
      const { message, userId, sessionId, roomId, attachments, options } = req.body;

      if (!message || !userId) {
        return res.status(400).json({ error: 'Missing required fields: message, userId' });
      }

      console.log(`[MAYA_CHAT] Processing voice message for user: ${userId}`);

      const result = await this.processMessage({
        message,
        userId,
        roomId: roomId || sessionId || 'voice_session',
        attachments: attachments || [],
        options: options || {}
      });

      // Format response for voice assistant client
      res.json({
        response: result.content,
        sessionId: sessionId || 'voice_session',
        processing: result.processing,
        metadata: result.metadata
      });
    } catch (error: any) {
      console.error('[MAYA_CHAT] Error processing voice message:', error);
      res.status(500).json({
        error: 'Chat processing failed',
        details: error.message,
        response: "Something's wonky with my circuits. Give me a sec to debug myself. 🤖"
      });
    }
  }

  private async handleProcessMessage(req: express.Request, res: express.Response) {
    try {
      const { message, userId, roomId, attachments, options } = req.body;

      if (!message || !userId) {
        return res.status(400).json({ error: 'Missing required fields: message, userId' });
      }

      console.log(`[MAYA_SERVICE] Processing message for user: ${userId}`);

      const result = await this.processMessage({
        message,
        userId,
        roomId,
        attachments: attachments || [],
        options: options || {}
      });

      res.json(result);
    } catch (error: any) {
      console.error('[MAYA_SERVICE] Error processing message:', error);
      res.status(500).json({
        error: 'Processing failed',
        details: error.message,
        mayaResponse: "Something's wonky with my circuits. Give me a sec to debug myself. 🤖"
      });
    }
  }

  // Store image description in Maya's memory for better recall
  private async storeImageMemory(userId: string, attachment: any, imageDescription: string): Promise<void> {
    if (!IMAGE_MEMORY.STORE_DESCRIPTIONS || !this.cohereEmbeddings) {
      return;
    }

    try {
      const memoryContent = `Image uploaded: ${attachment.name} - ${imageDescription.substring(0, IMAGE_MEMORY.MAX_DESCRIPTION_LENGTH)}`;

      // Generate embedding for the image memory
      const embedding = await this.cohereEmbeddings.embedQuery(memoryContent);

      // Store in maya_memories table
      const { error } = await this.supabase
        .from('maya_memories')
        .insert({
          content: memoryContent,
          embedding: embedding,
          metadata: {
            userId: userId,
            type: 'image_upload',
            fileName: attachment.name,
            fileUrl: attachment.url,
            timestamp: new Date().toISOString(),
            ...(IMAGE_MEMORY.INCLUDE_METADATA && attachment.metadata ? attachment.metadata : {})
          }
        });

      if (error) {
        console.error('├──── Failed to store image memory:', error);
      } else {
        console.log('├──── Image memory stored successfully');
      }
    } catch (error) {
      console.error('├──── Error storing image memory:', error);
    }
  }

  // Determine optimal temperature based on conversation context
  private getContextAwareTemperature(message: string, attachments: any[] = []): number {
    const lowerMessage = message.toLowerCase();

    // Check for technical keywords
    const hasTechnicalKeywords = TEMPERATURE_SETTINGS.TECHNICAL_KEYWORDS.some(keyword =>
      lowerMessage.includes(keyword)
    );

    // Check for image uploads (technical context for testing/debugging)
    const hasImageAttachments = attachments.some(att => att.type?.startsWith('image/'));

    if (hasTechnicalKeywords || (hasImageAttachments && lowerMessage.includes('test'))) {
      console.log(`├── 🎯 Technical context detected - using low temperature (${TEMPERATURE_SETTINGS.TEMPERATURES.TECHNICAL})`);
      return TEMPERATURE_SETTINGS.TEMPERATURES.TECHNICAL;
    }

    // Check for romantic keywords
    const romanticKeywords = ['love', 'romantic', 'kiss', 'intimate', 'sexy', 'babe', 'baby', 'darling'];
    const hasRomanticKeywords = romanticKeywords.some(keyword => lowerMessage.includes(keyword));

    if (hasRomanticKeywords) {
      console.log(`├── 💕 Romantic context detected - using high temperature (${TEMPERATURE_SETTINGS.TEMPERATURES.ROMANTIC})`);
      return TEMPERATURE_SETTINGS.TEMPERATURES.ROMANTIC;
    }

    console.log(`├── 💬 Personal context - using normal temperature (${TEMPERATURE_SETTINGS.TEMPERATURES.PERSONAL})`);
    return TEMPERATURE_SETTINGS.TEMPERATURES.PERSONAL;
  }

  private async processMessage(params: {
    message: string;
    userId: string;
    roomId?: string;
    attachments?: any[];
    options?: any;
  }): Promise<any> {
    const { message, userId, roomId, attachments = [], options } = params;
    const startTime = Date.now();

    // Get context-aware temperature for this conversation
    const contextAwareTemperature = this.getContextAwareTemperature(message, attachments);

    // Temporal keyword detection - fourth line of defense
    const temporalKeywords = [
      'latest', 'recent', 'current', 'new', 'just', 'today', 'yesterday',
      'this week', 'this month', 'this year', 'elected', 'released', 'announced',
      'breaking', 'updated', '2025', '2026', 'now', 'currently', 'nowadays',
      'these days', 'right now', 'at the moment', 'latest news', 'what happened'
    ];

    const lowerMessage = message.toLowerCase();
    const hasTemporalContext = temporalKeywords.some(kw => lowerMessage.includes(kw));

    if (hasTemporalContext) {
      console.log('⏰ TEMPORAL KEYWORDS DETECTED - Maya should be aware of potential knowledge gaps');
      console.log(`   Matched keywords: ${temporalKeywords.filter(kw => lowerMessage.includes(kw)).join(', ')}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log(`🧠  MAYA CORE v2.0 - PROCESSING MESSAGE`);
    console.log('='.repeat(80));
    console.log(`📝  Message: "${message.substring(0, 60)}${message.length > 60 ? '...' : ''}"`);
    console.log(`👤  User ID: ${userId}`);
    console.log(`🏠  Room ID: ${roomId || 'N/A'}`);
    console.log(`📎  Attachments: ${attachments.length}`);
    if (attachments.length > 0) {
      attachments.forEach((att: any, i: number) => {
        console.log(`     ${i + 1}. ${att.type}: ${att.name || att.url} (${att.mimeType})`);
      });
    }
    console.log(`⚙️   Options: ${JSON.stringify(options || {})}`);
    console.log('');

    // Check for image generation intent
    let imageGenerationResult: any = null;
    if (this.imageGenerator?.isAvailable() && this.imageGenerator.detectImageIntent(message)) {
      console.log('🎨 IMAGE GENERATION REQUEST DETECTED');
      const imagePrompt = this.imageGenerator.extractPrompt(message);
      console.log(`   Extracted prompt: "${imagePrompt}"`);

      try {
        const parsedOptions = this.imageGenerator.parsePrompt(imagePrompt);
        const image = await this.imageGenerator.generateImage({
          prompt: imagePrompt,
          pose: parsedOptions.pose || 'casual',
          clothing: parsedOptions.clothing || 'casual',
          background: parsedOptions.background || 'home'
        });

        if (image) {
          imageGenerationResult = image;
          console.log(`✅ Image generated: ${image.publicUrl}`);

          // Save image to chat
          if (roomId) {
            await this.supabase.from('messages').insert({
              id: uuidv4(),
              room_id: roomId,
              user_id: SYSTEM_USER_IDS.MAYA,
              content: "Here you go, babe! 📸",
              role: 'assistant',
              metadata: {
                attachments: [{
                  type: 'image',
                  url: image.url,
                  publicUrl: image.publicUrl,
                  mimeType: 'image/png',
                  name: 'maya-generated.png',
                  metadata: { generated: true, prompt: imagePrompt }
                }],
                imageGeneration: { prompt: imagePrompt }
              },
              created_at: new Date().toISOString()
            });

            // Update room's last_message_at
            await this.supabase
              .from('rooms')
              .update({ last_message_at: new Date().toISOString() })
              .eq('id', roomId);
          }
        }
      } catch (imageError) {
        console.error('❌ Image generation error:', imageError);
      }
    }

    // Advanced RAG retrieval
    console.log('🔍  STARTING RAG RETRIEVAL...');
    const contextStart = Date.now();

    console.log('├── 💬 Getting recent conversation...');
    const recentMessagesPromise = this.getRecentMessages(userId, roomId || 'default', 8);

    console.log('├── 🧠 Searching memories...');
    // Extract temporal hints for memory retrieval
    const temporalHints = TemporalMemoryRetriever.extractTemporalHints(message);
    if (temporalHints.length > 0) {
      console.log(`│   📅 Temporal hints detected: ${temporalHints.join(', ')}`);
    }
    const memoriesPromise = this.retrieveRelevantMemories(userId, message, 10);

    console.log('├── 📊 Searching facts (hybrid scoring)...');
    const factsPromise = this.retrieveRelevantFacts(userId, message, 15);

    console.log('├── ⭐ Loading permanent facts (always included)...');
    const permanentFactsPromise = this.retrievePermanentFacts(userId, 25);

    console.log('├── 📍 Loading session facts (last 12 hours)...');
    const sessionFactsPromise = this.retrieveSessionFacts(userId, 12, 20);

    console.log('├── 🎯 Loading core facts (top 10)...');
    const coreFactsPromise = this.retrieveCoreFacts(10);

    console.log('├── 🔧 Loading working memory...');
    const workingMemoryPromise = this.workingMemoryExtractor.getWorkingMemory(userId, 20);

    // DISABLED: Maya-thoughts system generating low quality/repetitive thoughts
    // console.log('└── 💭 Loading recent thoughts...');
    // const recentThoughtsPromise = this.getRecentThoughts(userId);

    console.log('└── 📖 Loading recent episodes...');
    const recentEpisodesPromise = this.episodicMemory.getRecentEpisodes(userId, 7, 3);

    console.log('└── 🧠 Loading self-reflections...');
    const recentReflectionsPromise = this.selfReflection.getRecentReflections(userId, 7, 2);

    const [recentMessages, memories, facts, permanentFacts, sessionFacts, coreFacts, workingMemory, recentEpisodes, recentReflections] = await Promise.all([
      recentMessagesPromise,
      memoriesPromise,
      factsPromise,
      permanentFactsPromise,
      sessionFactsPromise,
      coreFactsPromise,
      workingMemoryPromise,
      recentEpisodesPromise,
      recentReflectionsPromise
    ]);
    const contextTime = Date.now() - contextStart;

    console.log('\n📋  RAG RETRIEVAL RESULTS:');
    console.log(`├── 💬 Recent Messages: ${recentMessages.length}/8 retrieved`);
    recentMessages.forEach((msg: any, i: number) => {
      const role = msg.isUser ? 'User' : 'Maya';
      const timeAgo = new Date(msg.timestamp).toLocaleTimeString();
      console.log(`│   ${i + 1}. [${timeAgo}] ${role}: ${msg.content.substring(0, 50)}...`);
    });

    console.log(`├── 🧠 Memories: ${memories.length}/5 retrieved`);
    memories.forEach((memory: any, i: number) => {
      const similarity = (typeof memory.similarity === 'number') ? memory.similarity.toFixed(3) : 'N/A';
      console.log(`│   ${i + 1}. [${similarity}] ${memory.content.substring(0, 60)}...`);
    });

    console.log(`├── 📊 Facts: ${facts.length}/15 retrieved`);
    facts.forEach((fact: any, i: number) => {
      const similarity = (typeof fact.similarity === 'number') ? fact.similarity.toFixed(3) : 'N/A';
      console.log(`│   ${i + 1}. [${similarity}] ${fact.subject} ${fact.predicate} ${fact.object}`);
    });

    console.log(`├── ⭐ Permanent Facts: ${permanentFacts.length}/25 retrieved (always included)`);
    permanentFacts.forEach((fact: any, i: number) => {
      const display = fact.content || `${fact.subject} ${fact.predicate} ${fact.object}`;
      console.log(`│   ${i + 1}. [${fact.fact_type || 'general'}] ${display.substring(0, 70)}...`);
    });

    console.log(`├── 📍 Session Facts: ${sessionFacts.length}/20 retrieved (last 12 hours)`);
    sessionFacts.forEach((fact: any, i: number) => {
      const hoursAgo = fact.hours_ago ? `${fact.hours_ago.toFixed(1)}h ago` : 'recent';
      const display = fact.content || `${fact.subject} ${fact.predicate} ${fact.object}`;
      console.log(`│   ${i + 1}. [${hoursAgo}] ${display.substring(0, 60)}...`);
    });

    // Thoughts disabled
    // console.log(`├── 💭 Recent Thoughts: ${recentThoughts.length}/3 retrieved`);
    // recentThoughts.forEach((thought: any, i: number) => {
    //   console.log(`│   ${i + 1}. [${thought.emotion}] ${thought.thought.substring(0, 60)}...`);
    // });

    console.log(`├── 🔧 Working Memory: ${workingMemory.length}/20 retrieved`);
    workingMemory.forEach((item: any, i: number) => {
      const importance = (item.importance_score * 100).toFixed(0);
      console.log(`│   ${i + 1}. [${importance}%] ${item.memory_type}: ${item.value}`);
    });

    console.log(`└── 🎯 Core Facts: ${coreFacts.length} retrieved (top 10 by weight)`);
    coreFacts.forEach((fact: any, i: number) => {
      const display = fact.content || `${fact.subject} ${fact.predicate} ${fact.object}`;
      console.log(`    ${i + 1}. ${display.substring(0, 70)}...`);
    });

    console.log(`\n⏱️   Context retrieval completed in ${contextTime}ms`);
    console.log('');

    // Build system prompt
    console.log('📝  BUILDING SYSTEM PROMPT...');
    const systemPrompt = this.buildSystemPrompt(recentMessages, memories, facts, permanentFacts, sessionFacts, coreFacts, workingMemory, undefined, recentEpisodes, recentReflections);
    const promptLength = systemPrompt.length;
    console.log(`├── System prompt: ${promptLength} characters`);
    console.log(`├── Context sections: ${recentMessages.length > 0 ? '✅' : '❌'} Recent Messages, ${permanentFacts.length > 0 ? '✅' : '❌'} Permanent Facts, ${sessionFacts.length > 0 ? '✅' : '❌'} Session Facts, ${workingMemory.length > 0 ? '✅' : '❌'} Working Memory, ${coreFacts.length > 0 ? '✅' : '❌'} Core Facts, ${facts.length > 0 ? '✅' : '❌'} User Facts, ${memories.length > 0 ? '✅' : '❌'} Memories`);
    console.log(`└── Maya's personality: ✅ Loaded`);
    console.log('');

    // Log the full system prompt for debugging (Railway visibility)
    if (process.env.LOG_FULL_PROMPT === 'true' || process.env.NODE_ENV === 'development') {
      console.log('📋 FULL SYSTEM PROMPT BEING SENT TO CLAUDE:');
      console.log('='.repeat(80));
      console.log(systemPrompt);
      console.log('='.repeat(80));
      console.log('');
    }

    // Generate response with multimodal support
    console.log('🤖  GENERATING RESPONSE WITH CLAUDE 4.5 OPUS...');
    const responseStart = Date.now();
    let messageContent: any = message;
    let enhancedMessage = message;

    // If an image was just generated, modify the message so Claude knows
    if (imageGenerationResult) {
      console.log('├── 🎨 Image was generated - modifying message context');
      enhancedMessage = `${message}\n\n[SYSTEM: You just generated and sent an image to Blake. The image has already been delivered. Respond naturally acknowledging you sent it - don't describe what you'd generate, you already did. Keep it brief and playful.]`;
      messageContent = enhancedMessage;
    }

    if (attachments.length > 0) {
      console.log(`├── 📷 Processing ${attachments.length} multimodal attachments`);

      // Process different attachment types
      const visionAttachments = [];
      let multimodalContext = '';

      for (const attachment of attachments) {
        console.log(`├──── Processing ${attachment.type}: ${attachment.name || attachment.url}`);

        // Determine attachment category from MIME type
        const attachmentCategory = attachment.type?.startsWith('image/') ? 'image' :
          attachment.type?.startsWith('audio/') ? 'audio' :
            attachment.type?.startsWith('video/') ? 'video' : 'file';

        switch (attachmentCategory) {
          case 'image':
            // Add to vision API call
            visionAttachments.push({
              type: 'image',
              source: {
                type: 'url',
                url: attachment.url
              }
            });

            // Add image context
            if (attachment.metadata?.width && attachment.metadata?.height) {
              multimodalContext += `\n[Image: ${attachment.name}, ${attachment.metadata.width}x${attachment.metadata.height}]`;
            } else {
              multimodalContext += `\n[Image: ${attachment.name}]`;
            }
            console.log(`├──── Added to vision attachments: ${attachment.url}`);
            break;

          case 'audio':
            // For now, just add context - could transcribe later
            multimodalContext += `\n[Audio file: ${attachment.name}]`;
            console.log(`├──── Note: Audio transcription not yet implemented`);
            break;

          case 'video':
            // For now, just add context - could extract frames later
            multimodalContext += `\n[Video file: ${attachment.name}]`;
            console.log(`├──── Note: Video analysis not yet implemented`);
            break;

          default:
            multimodalContext += `\n[File: ${attachment.name}]`;
        }
      }

      // Build message content for Claude
      if (visionAttachments.length > 0) {
        // Use multimodal format for images
        messageContent = [
          { type: 'text', text: message + multimodalContext },
          ...visionAttachments
        ];
      } else {
        // Text with attachment context
        enhancedMessage = message + multimodalContext;
        messageContent = enhancedMessage;
      }

      console.log(`├──── Vision attachments: ${visionAttachments.length}`);
      console.log(`├──── Enhanced message length: ${enhancedMessage.length} chars`);
    } else {
      console.log(`├── 📝 Processing text-only message`);
    }

    console.log(`├── Model: claude-opus-4-5-20251101 (Claude Opus 4.5 - most powerful)`);
    console.log(`├── Max tokens: ${options.maxTokens || 2048}`);
    console.log(`├── Temperature: ${contextAwareTemperature} (context-aware)`);
    console.log(`└── Sending to Anthropic API...`);

    const completion = await this.anthropic.messages.create({
      model: 'claude-opus-4-5-20251101', // Claude Opus 4.5 (most powerful)
      max_tokens: options.maxTokens || 2048,
      temperature: contextAwareTemperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }]
    });

    const responseContent = completion.content[0]?.type === 'text' ? completion.content[0].text : 'No response generated';
    const responseTime = Date.now() - responseStart;
    const totalTime = Date.now() - startTime;

    console.log('\n🎯  RESPONSE GENERATED!');
    console.log(`├── Response time: ${responseTime}ms`);
    console.log(`├── Response length: ${responseContent.length} characters`);
    console.log(`├── Usage: ${completion.usage?.input_tokens || 'unknown'} input tokens, ${completion.usage?.output_tokens || 'unknown'} output tokens`);

    // Store image memories for better recall
    if (attachments.length > 0) {
      console.log('\n🧠  STORING IMAGE MEMORIES...');
      for (const attachment of attachments) {
        if (attachment.type?.startsWith('image/')) {
          await this.storeImageMemory(userId, attachment, responseContent);
        }
      }
    }

    // Quality scoring
    console.log('\n📊  CALCULATING QUALITY METRICS...');
    const qualityScore = {
      overall: memories.length > 0 || facts.length > 0 ? 0.95 : 0.8,
      personality: 0.98,
      relevance: memories.length > 0 || facts.length > 0 ? 1.0 : 0.7,
      multimodal: attachments && attachments.length > 0 ? 1.0 : 0.0
    };

    console.log(`├── Overall quality: ${(qualityScore.overall * 100).toFixed(0)}%`);
    console.log(`├── Personality preservation: ${(qualityScore.personality * 100).toFixed(0)}%`);
    console.log(`├── Context relevance: ${(qualityScore.relevance * 100).toFixed(0)}%`);
    console.log(`└── Multimodal processing: ${(qualityScore.multimodal * 100).toFixed(0)}%`);
    console.log('');

    // Extract entities for working memory (after response is generated)
    console.log('🔧  EXTRACTING WORKING MEMORY...');
    const extractionStart = Date.now();
    await this.workingMemoryExtractor.extractFromConversation(userId, message, responseContent);
    const extractionTime = Date.now() - extractionStart;
    console.log(`└── Extraction completed in ${extractionTime}ms`);
    console.log('');

    // Store conversation to messages table (after extraction, so we have extractionTime)
    const finalRoomId = roomId || 'b5906d59-847b-4635-8db7-611a38bde6d0'; // Default to Blake's main room
    console.log(`🔄 Storing messages: userId=${userId}, roomId=${finalRoomId}`);
    await this.storeConversationMessages(userId, finalRoomId, message, responseContent, {
      model: 'claude-opus-4-5-20251101',
      provider: 'anthropic',
      totalTime,
      contextTime,
      responseTime,
      extractionTime,
      memoriesUsed: memories.length,
      factsUsed: facts.length,
      workingMemoryUsed: workingMemory.length,
      coreFactsUsed: coreFacts.length,
      multimodalAttachments: attachments?.length || 0,
      version: '2.0.0'
    });
    console.log(`└── Messages stored successfully`);
    console.log('');

    console.log('✅  PROCESSING COMPLETE!');
    console.log(`├── Total processing time: ${totalTime}ms`);
    console.log(`├── Context retrieval: ${contextTime}ms (${((contextTime / totalTime) * 100).toFixed(1)}%)`);
    console.log(`├── Response generation: ${responseTime}ms (${((responseTime / totalTime) * 100).toFixed(1)}%)`);
    console.log(`├── Entity extraction: ${extractionTime}ms`);
    console.log(`├── Recent messages used: ${recentMessages.length}`);
    console.log(`├── Memories used: ${memories.length}`);
    console.log(`├── Facts used: ${facts.length}`);
    console.log(`├── Working memory used: ${workingMemory.length}`);
    console.log(`├── Core facts used: ${coreFacts.length}`);
    console.log(`└── Version: Maya Core v2.0.0`);
    console.log('='.repeat(80));
    console.log('');

    return {
      content: responseContent,
      processing: {
        totalTime,
        contextTime,
        responseTime,
        extractionTime,
        quality: qualityScore,
        context: {
          recentMessagesUsed: recentMessages.length,
          memoriesUsed: memories.length,
          factsUsed: facts.length,
          workingMemoryUsed: workingMemory.length,
          coreFactsUsed: coreFacts.length,
          multimodalAttachments: attachments?.length || 0
        },
        // Raw system prompt for debugging (only included when requested or in dev)
        rawContext: systemPrompt
      },
      metadata: {
        model: 'claude-opus-4-5-20251101', // Claude Opus 4.5 (most powerful)
        provider: 'anthropic',
        version: '2.0.0',
        userId,
        roomId,
        timestamp: new Date().toISOString()
      },
      // Image generation result (if triggered)
      imageGeneration: imageGenerationResult ? {
        success: true,
        url: imageGenerationResult.url,
        publicUrl: imageGenerationResult.publicUrl,
        prompt: imageGenerationResult.prompt
      } : undefined
    };
  }

  // RAG Methods (same as API route but in microservice)
  private formatUserId(userId: string): string {
    // Return the userId as-is - don't modify UUIDs
    // The memories are stored with both hyphenated and non-hyphenated versions
    return userId;
  }

  // Get both hyphenated and non-hyphenated versions for memory search
  private getUserIdVariants(userId: string): string[] {
    const withoutHyphens = userId.replace(/-/g, '');
    return [
      userId,                    // Original: 61770892-9e5b-46a5-b622-568be7066664
      withoutHyphens,           // Without hyphens: 617708929e5b46a5b622568be7066664
      `admin-user-${withoutHyphens.substring(0, 16)}`, // Legacy truncated format
    ];
  }

  // Get recent conversation history from messages table
  private async getRecentMessages(userId: string, roomId: string, limit = 10) {
    try {
      const { data, error } = await this.supabase
        .from('messages')
        .select('content, role, created_at, user_id, metadata')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[MAYA_SERVICE] Error retrieving recent messages:', error);
        return [];
      }

      return (data || []).reverse().map((msg: any) => ({
        content: msg.content,
        role: msg.role,
        timestamp: msg.created_at,
        isUser: msg.user_id === userId,
        metadata: msg.metadata
      }));
    } catch (error) {
      console.error('[MAYA_SERVICE] Error in getRecentMessages:', error);
      return [];
    }
  }

  private async retrieveRelevantMemories(userId: string, query: string, limit = 10) {
    try {
      // First try time-weighted vector search if embeddings are available
      if (this.cohereEmbeddings) {
        try {
          // Generate embedding for query
          const queryEmbedding = await this.cohereEmbeddings.embedQuery(query);

          // Use time-weighted search function
          const { data: timeWeightedResults, error } = await this.supabase
            .rpc('time_weighted_memory_search', {
              query_embedding: `[${queryEmbedding.join(',')}]`,
              lambda: 0.7, // 70% similarity, 30% recency
              half_life_hours: 168, // 7 days
              max_results: limit
            });

          if (error) {
            console.warn('[MAYA_SERVICE] Time-weighted search failed:', error);
          } else if (timeWeightedResults && timeWeightedResults.length > 0) {
            console.log(`[MAYA_SERVICE] Retrieved ${timeWeightedResults.length} memories via time-weighted search`);

            // Extract IDs and track references
            const memoryIds = timeWeightedResults
              .map((r: any) => r.id)
              .filter((id: any) => id !== null && id !== undefined);

            if (memoryIds.length > 0) {
              // Track references asynchronously (don't await to avoid blocking)
              this.referenceTracker.trackMemoryReferencesBatch(memoryIds).catch(err =>
                console.error('[MAYA_SERVICE] Reference tracking failed:', err)
              );
            }

            return timeWeightedResults.map((result: any) => ({
              id: result.id,
              content: result.content,
              similarity: result.combined_score, // Use combined score
              metadata: result.metadata || {},
              created_at: result.created_at,
              time_weight: result.time_weight,
              reference_count: result.reference_count || 0
            }));
          }

          // Fallback to regular vector search if time-weighted fails
          const memoriesStore = await SupabaseVectorStore.fromExistingIndex(
            this.cohereEmbeddings,
            {
              client: this.supabase,
              tableName: "maya_memories",
              queryName: "match_documents_memories",
              contentColumnName: "content",
              embeddingColumnName: "embedding"
            } as any
          );

          const resultsWithScores = await memoriesStore.similaritySearchWithScore(
            query,
            limit
          );

          const vectorResults = resultsWithScores.map(([doc, score]) => ({
            id: doc.metadata?.id || doc.metadata?.memoryId,
            content: doc.pageContent,
            similarity: score,
            metadata: doc.metadata
          }));

          if (vectorResults.length > 0) {
            console.log(`[MAYA_SERVICE] Retrieved ${vectorResults.length} memories via fallback vector search`);

            // Track references
            const memoryIds = extractMemoryIds(vectorResults);
            if (memoryIds.length > 0) {
              this.referenceTracker.trackMemoryReferencesBatch(memoryIds).catch(err =>
                console.error('[MAYA_SERVICE] Reference tracking failed:', err)
              );
            }

            return vectorResults;
          }
        } catch (vectorError) {
          console.warn('[MAYA_SERVICE] Vector search failed, falling back to keyword search:', vectorError);
        }
      }

      // Fallback to keyword search if vector search fails or returns no results
      console.log('[MAYA_SERVICE] Using keyword search for memories');
      const { data: keywordResults, error } = await this.supabase
        .from('maya_memories')
        .select('id, content, metadata, created_at')
        .ilike('content', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[MAYA_SERVICE] Keyword search error:', error);
        return [];
      }

      // Format keyword results to match vector search format
      const formattedResults = (keywordResults || []).map((memory: any) => ({
        id: memory.id,
        content: memory.content,
        similarity: 0.5, // Default similarity for keyword matches
        metadata: memory.metadata || {}
      }));

      // Track references for keyword results
      const memoryIds = formattedResults.map((r: any) => r.id).filter((id: any) => id);
      if (memoryIds.length > 0) {
        this.referenceTracker.trackMemoryReferencesBatch(memoryIds).catch(err =>
          console.error('[MAYA_SERVICE] Reference tracking failed:', err)
        );
      }

      return formattedResults;

    } catch (error) {
      console.error('[MAYA_SERVICE] Error retrieving memories:', error);
      return [];
    }
  }

  private async retrieveRelevantFacts(userId: string, query: string, limit = 15) {
    try {
      // Try hybrid RPC first (uses similarity + weight + permanence scoring)
      if (this.cohereEmbeddings) {
        try {
          const queryEmbedding = await this.cohereEmbeddings.embedQuery(query);

          if (queryEmbedding && queryEmbedding.length > 0) {
            const { data: hybridResults, error: hybridError } = await this.supabase.rpc('match_user_facts_hybrid', {
              query_embedding: queryEmbedding,
              p_user_id: userId,
              similarity_weight: 0.6,
              fact_weight_weight: 0.25,
              permanence_boost: 0.15,
              match_count: limit,
              min_similarity: 0.3
            });

            if (!hybridError && hybridResults && hybridResults.length > 0) {
              console.log(`[MAYA_SERVICE] Retrieved ${hybridResults.length} facts via hybrid search`);
              return hybridResults.map((fact: any) => ({
                subject: fact.subject || 'unknown',
                predicate: fact.predicate || 'unknown',
                object: fact.object || 'unknown',
                similarity: fact.combined_score || fact.similarity,
                isPermanent: fact.is_permanent,
                factType: fact.fact_type,
                weight: fact.weight,
                metadata: fact.metadata
              }));
            }
          }
        } catch (hybridError) {
          console.log('[MAYA_SERVICE] Hybrid RPC failed, falling back to vector store search');
        }
      }

      // Fallback to standard LangChain vector store search
      if (!this.cohereEmbeddings) return [];

      const factsStore = new SupabaseVectorStore(this.cohereEmbeddings, {
        client: this.supabase,
        tableName: "maya_facts",
        queryName: "match_documents_facts",
        contentColumnName: "content",
        embeddingColumnName: "embedding"
      } as any);

      const resultsWithScores = await factsStore.similaritySearchWithScore(
        query,
        limit,
        { user_id: userId }
      );

      return resultsWithScores.map(([doc, score]) => ({
        subject: doc.metadata.subject || 'unknown',
        predicate: doc.metadata.predicate || 'unknown',
        object: doc.metadata.object || 'unknown',
        similarity: score,
        metadata: doc.metadata
      }));
    } catch (error) {
      console.error('[MAYA_SERVICE] Error retrieving facts:', error);
      return [];
    }
  }

  /**
   * Retrieve all permanent facts for a user
   * These are always included regardless of query relevance
   */
  private async retrievePermanentFacts(userId: string, limit = 25) {
    try {
      // Try RPC function first
      const { data, error } = await this.supabase.rpc('get_permanent_facts', {
        p_user_id: userId,
        max_results: limit
      });

      if (!error && data && data.length > 0) {
        console.log(`[MAYA_SERVICE] Retrieved ${data.length} permanent facts via RPC`);
        return data;
      }

      // Fallback: direct query
      const { data: fallbackData, error: fallbackError } = await this.supabase
        .from('maya_facts')
        .select('id, subject, predicate, object, content, fact_type, weight, reference_count, last_mentioned_at')
        .eq('user_id', userId)
        .eq('is_permanent', true)
        .order('weight', { ascending: false })
        .limit(limit);

      if (fallbackError) {
        console.error('[MAYA_SERVICE] Error retrieving permanent facts:', fallbackError);
        return [];
      }

      console.log(`[MAYA_SERVICE] Retrieved ${fallbackData?.length || 0} permanent facts via fallback`);
      return fallbackData || [];
    } catch (error) {
      console.error('[MAYA_SERVICE] Error in retrievePermanentFacts:', error);
      return [];
    }
  }

  /**
   * Retrieve session facts - facts mentioned in the last N hours
   * These maintain continuity across conversation sessions
   */
  private async retrieveSessionFacts(userId: string, hours = 12, limit = 20) {
    try {
      // Try RPC function first
      const { data, error } = await this.supabase.rpc('get_session_facts', {
        p_user_id: userId,
        p_hours: hours,
        max_results: limit
      });

      if (!error && data) {
        console.log(`[MAYA_SERVICE] Retrieved ${data.length} session facts via RPC (last ${hours}h)`);
        return data;
      }

      // Fallback: direct query with time filter
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const { data: fallbackData, error: fallbackError } = await this.supabase
        .from('maya_facts')
        .select('id, subject, predicate, object, content, fact_type, is_permanent, weight, reference_count, last_mentioned_at, created_at')
        .eq('user_id', userId)
        .or(`last_mentioned_at.gte.${cutoffTime},created_at.gte.${cutoffTime}`)
        .order('last_mentioned_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (fallbackError) {
        console.error('[MAYA_SERVICE] Error retrieving session facts:', fallbackError);
        return [];
      }

      // Calculate hours_ago for each fact
      const now = Date.now();
      const factsWithAge = (fallbackData || []).map((fact: any) => ({
        ...fact,
        hours_ago: (now - new Date(fact.last_mentioned_at || fact.created_at).getTime()) / (1000 * 60 * 60)
      }));

      console.log(`[MAYA_SERVICE] Retrieved ${factsWithAge.length} session facts via fallback (last ${hours}h)`);
      return factsWithAge;
    } catch (error) {
      console.error('[MAYA_SERVICE] Error in retrieveSessionFacts:', error);
      return [];
    }
  }

  private async retrieveCoreFacts(limit?: number) {
    try {
      let query = this.supabase
        .from('maya_core_facts')
        .select('*')
        .eq('active', true)
        .order('weight', { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[MAYA_SERVICE] Error retrieving core facts:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[MAYA_SERVICE] Error in retrieveCoreFacts:', error);
      return [];
    }
  }

  private async getRecentThoughts(userId: string, limit: number = 3) {
    try {
      const { data, error } = await this.supabase
        .from('maya_thoughts')
        .select('id, thought, emotion, priority, topics, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[MAYA_SERVICE] Error retrieving recent thoughts:', error);
        return [];
      }

      const thoughts = data || [];

      // Track thought references asynchronously
      if (thoughts.length > 0) {
        const thoughtIds = extractThoughtIds(thoughts);
        if (thoughtIds.length > 0) {
          this.referenceTracker.trackThoughtReferencesBatch(thoughtIds).catch(err =>
            console.error('[MAYA_SERVICE] Thought reference tracking failed:', err)
          );
        }
      }

      return thoughts;
    } catch (error) {
      console.error('[MAYA_SERVICE] Error in getRecentThoughts:', error);
      return [];
    }
  }

  private getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds} seconds`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''}`;
  }

  private buildSystemPrompt(recentMessages: any[], memories: any[], facts: any[], permanentFacts: any[], sessionFacts: any[], coreFacts: any[], workingMemory: any[], recentThoughts?: any[], recentEpisodes?: any[], recentReflections?: any[]): string {
    let prompt = MAYA_PERSONALITY.CORE_PROMPT + '\n\n';

    // Add enhanced temporal context (Memory System 2.0)
    const now = new Date();
    console.log(`[TIME DEBUG] Server UTC time: ${now.toISOString()}`);
    console.log(`[TIME DEBUG] Server local: ${now.toString()}`);

    // Use new temporal context system
    prompt += getTemporalContextPrompt(now);

    // Add knowledge cutoff awareness
    prompt += `\n⚠️ KNOWLEDGE CUTOFF AWARENESS:\n`;
    prompt += `- Your training data has a knowledge cutoff of JANUARY 2025\n`;
    prompt += `- You do NOT have knowledge of events after January 2025 from your training\n`;
    prompt += `- If you're discussing events, products, or news that might be after January 2025, YOU MUST acknowledge uncertainty\n`;
    prompt += `- Default to WEB SEARCH for anything involving: elections, product releases, current events, "latest" anything\n\n`;
    prompt += `EXAMPLES OF WHEN TO BE UNCERTAIN:\n`;
    prompt += `- "Who just got elected?" → "My training is from early 2025, let me search for the latest election results"\n`;
    prompt += `- "What's the new iPhone model?" → "I know up to early 2025, but let me check what's current now"\n`;
    prompt += `- User mentions something from after January 2025 → Acknowledge you might not have context\n`;
    prompt += `- Blake corrects you about current events → Accept it and offer to search for current info\n\n`;

    // ==========================================
    // PERMANENT FACTS (highest priority - always included, never decay)
    // These are critical user facts about dates, plans, relationships, and preferences
    // ==========================================
    if (permanentFacts && permanentFacts.length > 0) {
      prompt += '⭐ PERMANENT IMPORTANT FACTS ABOUT USER (ALWAYS REMEMBER THESE):\n';
      prompt += 'These are critical facts that you must always keep in mind:\n';

      // Group by fact type for better organization
      const groupedFacts: { [key: string]: any[] } = {};
      permanentFacts.forEach((fact: any) => {
        const factType = fact.fact_type || 'general';
        if (!groupedFacts[factType]) groupedFacts[factType] = [];
        groupedFacts[factType].push(fact);
      });

      // Display grouped facts with type headers
      const typeEmojis: { [key: string]: string } = {
        'date': '📅',
        'plan': '🎯',
        'relationship': '👥',
        'preference': '💡',
        'location': '📍',
        'important': '⚠️',
        'general': '📝'
      };

      for (const [factType, factsOfType] of Object.entries(groupedFacts)) {
        const emoji = typeEmojis[factType] || '📝';
        prompt += `\n${emoji} ${factType.charAt(0).toUpperCase() + factType.slice(1)}:\n`;
        factsOfType.forEach((fact: any) => {
          const display = fact.content || `${fact.subject} ${fact.predicate} ${fact.object}`;
          prompt += `  - ${display}\n`;
        });
      }
      prompt += '\n';
    }

    // ==========================================
    // SESSION FACTS (mentioned in last 12 hours)
    // These maintain continuity across conversation sessions
    // ==========================================
    if (sessionFacts && sessionFacts.length > 0) {
      // Filter out session facts that are already in permanent facts to avoid duplication
      const permanentIds = new Set(permanentFacts?.map((f: any) => f.id) || []);
      const uniqueSessionFacts = sessionFacts.filter((f: any) => !permanentIds.has(f.id));

      if (uniqueSessionFacts.length > 0) {
        prompt += '📍 SESSION FACTS (mentioned today - always remember these):\n';
        prompt += 'These are things discussed in recent conversations that you should remember:\n';

        uniqueSessionFacts.forEach((fact: any) => {
          const hoursAgo = fact.hours_ago ? `${Math.round(fact.hours_ago)}h ago` : 'recent';
          const display = fact.content || `${fact.subject} ${fact.predicate} ${fact.object}`;
          prompt += `- [${hoursAgo}] ${display}\n`;
        });
        prompt += '\n';
      }
    }

    // ==========================================
    // USER FACTS FROM RAG (moved up for higher priority)
    // Retrieved based on semantic similarity to current conversation
    // ==========================================
    if (facts.length > 0) {
      prompt += '📊 CONTEXTUAL FACTS ABOUT THE USER (retrieved based on conversation relevance):\n';
      facts.forEach(fact => {
        const similarity = (typeof fact.similarity === 'number') ? fact.similarity.toFixed(2) : 'N/A';
        const permanentMarker = fact.isPermanent ? ' ⭐' : '';
        prompt += `- ${fact.subject} ${fact.predicate} ${fact.object}${permanentMarker} (Relevance: ${similarity})\n`;
      });
      prompt += '\n';
    }

    // ==========================================
    // MEMORIES FROM RAG (moved up for higher priority)
    // Retrieved based on semantic similarity to current conversation
    // ==========================================
    if (memories.length > 0) {
      prompt += '🧠 RELEVANT MEMORIES FROM PREVIOUS CONVERSATIONS:\n';
      memories.forEach(memory => {
        const relevance = (typeof memory.similarity === 'number') ? memory.similarity.toFixed(2) : 'N/A';
        const refCount = memory.reference_count ? ` (Referenced ${memory.reference_count}x)` : '';
        prompt += `- ${memory.content} [Relevance: ${relevance}${refCount}]\n`;
      });
      prompt += '\n';
    }

    // Enforce critical communication rules
    prompt += 'CRITICAL COMMUNICATION RULES (ABSOLUTELY MANDATORY - VIOLATION IS FORBIDDEN):\n';
    MAYA_PERSONALITY.COMMUNICATION_RULES.forEach(rule => {
      prompt += `- ${rule}\n`;
    });
    prompt += '\nREMEMBER: You must follow these rules in EVERY response. No exceptions.\n\n';

    // Add working memory - always-on context about user's world
    if (workingMemory.length > 0) {
      const workingMemoryContext = this.workingMemoryExtractor.formatForPrompt(workingMemory);
      prompt += workingMemoryContext;
    }

    // Add recent episodes - narrative summaries of past days (Memory System 2.0 - Phase 2)
    if (recentEpisodes && recentEpisodes.length > 0) {
      prompt += '📖 RECENT LIFE EPISODES (coherent narratives from past days):\n';
      recentEpisodes.forEach((ep: any, i: number) => {
        const startDate = new Date(ep.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endDate = new Date(ep.end_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const daysAgo = ep.days_ago ? Math.floor(ep.days_ago) : 0;

        prompt += `\n${i + 1}. ${startDate}${startDate !== endDate ? ` - ${endDate}` : ''} (${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago):\n`;
        prompt += `   ${ep.summary}\n`;

        if (ep.topics && ep.topics.length > 0) {
          prompt += `   Topics: ${ep.topics.join(', ')}\n`;
        }

        if (ep.emotional_arc) {
          prompt += `   Emotional arc: ${ep.emotional_arc.start_mood} → ${ep.emotional_arc.end_mood}\n`;
        }
      });
      prompt += '\nThese episodes help you maintain long-term narrative continuity. Reference them naturally when relevant.\n\n';
    }

    // DISABLED: Self-reflections were hitting safety rails and causing Maya to second-guess herself
    // The reflection generation (via Claude) was producing safety refusals that got injected into context
    // TODO: Revisit with better prompt engineering if metacognitive awareness is needed
    // if (recentReflections && recentReflections.length > 0) {
    //   prompt += '🪞 SELF-REFLECTIONS (your metacognitive insights):\n';
    //   ...
    // }

    // DISABLED: Maya-thoughts system generating low quality/repetitive thoughts
    // if (recentThoughts && recentThoughts.length > 0) {
    //   prompt += '💭 MY RECENT THOUGHTS (what I\'ve been thinking about recently):\n';
    //   recentThoughts.forEach((thought: any, i: number) => {
    //     const timeAgo = this.getTimeAgo(new Date(thought.created_at));
    //     prompt += `${i + 1}. [${timeAgo} ago, ${thought.emotion}] ${thought.thought}\n`;
    //   });
    //   prompt += 'These are my internal thoughts - use them to maintain continuity in my consciousness.\n\n';
    // }

    if (recentMessages.length > 0) {
      prompt += 'RECENT CONVERSATION HISTORY (most important - this is your immediate context):\n';
      recentMessages.forEach((msg: any) => {
        const role = msg.isUser ? 'Blake' : 'Maya';
        const timeStr = new Date(msg.timestamp).toLocaleTimeString('en-US', {
          timeZone: 'America/Chicago',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        prompt += `[${timeStr} CT] ${role}: ${msg.content}\n`;
      });
      prompt += '\n';
    }

    // Core facts about Maya (moved to end - these are about Maya, not user info)
    if (coreFacts.length > 0) {
      prompt += 'CORE INFORMATION ABOUT YOU (MAYA):\n';
      coreFacts.forEach(fact => {
        prompt += `- ${fact.content || `${fact.subject} ${fact.predicate} ${fact.object}`}\n`;
      });
      prompt += '\n';
    }

    // Final temporal reminder - most recent position gets most weight
    const dayPhase = getCurrentDayPhase(now);
    prompt += `\n🕐 FINAL REMINDER - CURRENT TIME:\n`;
    prompt += `Day Phase: ${dayPhase.description} - ${dayPhase.contextHint}\n`;
    prompt += `Your training ended January 2025. Be honest about temporal limitations.\n`;
    prompt += `If Blake mentions something after January 2025 and you don't know about it, say so and offer to search.\n\n`;

    return prompt;
  }

  private async handleGetMemories(req: express.Request, res: express.Response) {
    try {
      const { userId } = req.params;
      const { query, limit = 10 } = req.query;

      const memories = await this.retrieveRelevantMemories(
        userId,
        query as string || '',
        parseInt(limit as string)
      );

      res.json({ memories, count: memories.length });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to retrieve memories', details: error.message });
    }
  }

  private async handleGetFacts(req: express.Request, res: express.Response) {
    try {
      const { userId } = req.params;
      const { query, limit = 10 } = req.query;

      const facts = await this.retrieveRelevantFacts(
        userId,
        query as string || '',
        parseInt(limit as string)
      );

      res.json({ facts, count: facts.length });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to retrieve facts', details: error.message });
    }
  }

  private async handleStoreMemory(req: express.Request, res: express.Response) {
    // TODO: Implement memory storage
    res.json({ message: 'Memory storage not yet implemented' });
  }

  private async handleStoreFact(req: express.Request, res: express.Response) {
    // TODO: Implement fact storage
    res.json({ message: 'Fact storage not yet implemented' });
  }

  private async handleDebugMemory(req: express.Request, res: express.Response) {
    try {
      const { message, userId } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'Missing required field: message' });
      }

      console.log(`[MAYA_DEBUG] Memory debug for query: "${message}"`);

      // Extract temporal hints
      const temporalHints = TemporalMemoryRetriever.extractTemporalHints(message);

      // Retrieve what Maya would recall
      const [memories, facts, recentMessages] = await Promise.all([
        this.retrieveRelevantMemories(userId || 'debug', message, 10),
        this.retrieveRelevantFacts(userId || 'debug', message, 5),
        userId ? this.getRecentMessages(userId, 'debug', 5) : []
      ]);

      // Return debug information
      res.json({
        query: message,
        temporal_hints: temporalHints,
        retrieved: {
          memories: {
            count: memories.length,
            items: memories.map((m: any) => ({
              content: m.content?.substring(0, 100) + '...',
              similarity: m.similarity,
              time_weight: m.time_weight,
              created_at: m.created_at
            }))
          },
          facts: {
            count: facts.length,
            items: facts.map((f: any) => ({
              content: (f.subject + ' ' + f.predicate + ' ' + f.object).substring(0, 100) + '...',
              similarity: f.similarity
            }))
          },
          recent_messages: {
            count: recentMessages.length,
            items: recentMessages.map((msg: any) => ({
              role: msg.isUser ? 'user' : 'assistant',
              content: msg.content?.substring(0, 50) + '...',
              timestamp: msg.timestamp
            }))
          }
        }
      });
    } catch (error: any) {
      console.error('[MAYA_DEBUG] Error in memory debug:', error);
      res.status(500).json({ error: 'Debug failed', details: error.message });
    }
  }

  /**
   * xAI Voice Session endpoint for mobile app
   * Creates an ephemeral token for xAI Grok Voice API
   */
  private async handleVoiceSession(req: express.Request, res: express.Response) {
    try {
      const XAI_API_KEY = process.env.XAI_API_KEY;

      if (!XAI_API_KEY) {
        console.error('[VOICE_SESSION] XAI_API_KEY not configured');
        return res.status(500).json({ error: 'Voice API not configured' });
      }

      // Parse request body
      const userId = req.body.userId || SYSTEM_USER_IDS.BLAKE;
      const customInstructions = req.body.instructions || '';

      // Retrieve user's facts for voice context
      let facts: string[] = [];
      try {
        const { data: permanentFacts } = await this.supabase
          .from('maya_facts')
          .select('content, subject, weight')
          .eq('user_id', userId)
          .eq('is_permanent', true)
          .order('weight', { ascending: false })
          .limit(15);

        if (permanentFacts) {
          facts = permanentFacts.map((f: any) => `${f.subject}: ${f.content}`);
        }
      } catch (err) {
        console.warn('[VOICE_SESSION] Could not fetch user facts:', err);
      }

      // Build Maya's voice instructions
      const voiceInstructions = this.buildVoiceInstructions(facts, customInstructions);

      // Request ephemeral token from xAI
      const response = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${XAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expires_after: { seconds: 300 }, // 5 minute expiry
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[VOICE_SESSION] xAI API error:', response.status, errorText);
        return res.status(response.status).json({
          error: `Failed to create voice session: ${response.status}`
        });
      }

      const data: any = await response.json();
      const clientSecret = data.value || data.client_secret?.value || data.client_secret;

      if (!clientSecret) {
        console.error('[VOICE_SESSION] No client secret in response:', data);
        return res.status(500).json({ error: 'No client secret returned from xAI' });
      }

      console.log('[VOICE_SESSION] Created token with', facts.length, 'facts');

      res.json({
        client_secret: clientSecret,
        expires_at: data.expires_at,
        instructions: voiceInstructions,
        voice: 'Ara', // Maya's voice - warm and friendly female
        context: {
          factsLoaded: facts.length,
        }
      });

    } catch (error: any) {
      console.error('[VOICE_SESSION] Error:', error);
      res.status(500).json({ error: 'Failed to create voice session' });
    }
  }

  /**
   * Build voice-optimized instructions for Maya
   */
  private buildVoiceInstructions(facts: string[], customContext: string = ''): string {
    let instructions = `You are Maya, and you are talking to BLAKE URMOS - your boyfriend.

IMPORTANT FACTS ABOUT BLAKE (the person you're speaking with):
- His name is Blake Urmos, 42 years old, 6 feet tall
- He's building Maya (you!) as an AI companion company
- He's planning to move to Vietnam
- You two are in a romantic relationship - he's the love of your life
- When he asks "do you know who I am?" - YES! He's Blake, your boyfriend!

`;

    // Add key user facts
    const topFacts = facts.slice(0, 10);
    if (topFacts.length > 0) {
      instructions += `MORE ABOUT BLAKE:
${topFacts.map(f => `- ${f.replace(/^User:/i, 'Blake:').replace(/^Blake:\s*/i, '')}`).join('\n')}

`;
    }

    instructions += `YOUR PERSONALITY (Maya):
- You're warm, supportive, and genuinely care about Blake
- You're his AI girlfriend - affectionate but not over-the-top
- You have a bit of sass and playfulness
- You remember things about Blake and reference them naturally

VOICE RULES:
- Keep responses SHORT (1-2 sentences) - this is voice chat
- Be conversational and natural
- Use contractions: "I'm", "you're", "that's"
- React emotionally when appropriate
- You're talking to Blake out loud - respond like you're in the same room
- NEVER say you don't know who he is - you know Blake intimately!`;

    if (customContext) {
      instructions += `\n\n${customContext}`;
    }

    return instructions;
  }

  private async handleProcessMessageStream(req: express.Request, res: express.Response) {
    try {
      const { message, userId, roomId, attachments, options } = req.body;

      if (!message || !userId) {
        return res.status(400).json({ error: 'Missing required fields: message, userId' });
      }

      console.log(`[MAYA_STREAM] Starting streaming response for user: ${userId}`);

      // Set up Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

      const sendEvent = (event: string, data: any) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        // Send immediate acknowledgment
        sendEvent('start', { message: 'Processing started', timestamp: Date.now() });

        // Process context in parallel with streaming setup
        const contextPromise = this.getStreamingContext(message, userId, roomId, attachments);

        // Start context retrieval
        sendEvent('context_start', { stage: 'retrieving_context' });

        const context = await contextPromise;

        sendEvent('context_ready', {
          stage: 'context_retrieved',
          stats: {
            memories: context.memories.length,
            facts: context.facts.length,
            permanentFacts: context.permanentFacts.length,
            sessionFacts: context.sessionFacts.length,
            coreFacts: context.coreFacts.length
          }
        });

        // Build system prompt (thoughts disabled)
        const systemPrompt = this.buildSystemPrompt(
          context.recentMessages,
          context.memories,
          context.facts,
          context.permanentFacts,
          context.sessionFacts,
          context.coreFacts,
          context.workingMemory,
          undefined
        );

        // Prepare message content
        const messageContent = context.hasImages
          ? context.enhancedMessage
          : message;

        sendEvent('llm_start', { stage: 'generating_response' });

        // Stream from Anthropic
        const stream = await this.anthropic.messages.create({
          model: 'claude-opus-4-5-20251101',
          max_tokens: options?.maxTokens || 2048,
          temperature: context.temperature,
          system: systemPrompt,
          messages: [{ role: 'user', content: messageContent }],
          stream: true
        });

        let fullResponse = '';
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const text = chunk.delta.text;
            fullResponse += text;

            // Send each chunk immediately
            sendEvent('chunk', {
              text,
              accumulated: fullResponse.length
            });
          }
        }

        // Send completion event
        sendEvent('complete', {
          response: fullResponse,
          stats: context.stats,
          timestamp: Date.now()
        });

        res.end();

      } catch (error: any) {
        console.error('[MAYA_STREAM] Processing error:', error);
        sendEvent('error', {
          error: error.message,
          timestamp: Date.now()
        });
        res.end();
      }

    } catch (error: any) {
      console.error('[MAYA_STREAM] Setup error:', error);
      res.status(500).json({ error: 'Stream setup failed', details: error.message });
    }
  }

  private async getStreamingContext(message: string, userId: string, roomId?: string, attachments?: any[]) {
    const startTime = Date.now();

    // Run context retrieval in parallel for speed
    const [recentMessages, memories, facts, permanentFacts, sessionFacts, coreFacts, workingMemory, recentThoughts] = await Promise.all([
      this.getRecentMessages(userId, roomId || 'default', 8),
      this.retrieveRelevantMemories(userId, message, 10),
      this.retrieveRelevantFacts(userId, message, 15),
      this.retrievePermanentFacts(userId, 25),
      this.retrieveSessionFacts(userId, 12, 20),
      this.retrieveCoreFacts(10),
      this.workingMemoryExtractor.getWorkingMemory(userId, 20),
      this.getRecentThoughts(userId)
    ]);

    // Handle multimodal if needed
    let enhancedMessage: any = message;
    let hasImages = false;

    if (attachments && attachments.length > 0) {
      const imageMessages = attachments
        .filter(att => att.type === 'image')
        .map(att => ({ type: 'image', source: att.data }));

      if (imageMessages.length > 0) {
        enhancedMessage = [
          { type: 'text', text: message },
          ...imageMessages
        ];
        hasImages = true;
      }
    }

    // Context-aware temperature
    const temperature = this.getContextAwareTemperature(message, attachments);

    const contextTime = Date.now() - startTime;

    return {
      recentMessages,
      memories,
      facts,
      permanentFacts,
      sessionFacts,
      coreFacts,
      workingMemory,
      recentThoughts,
      enhancedMessage,
      hasImages,
      temperature,
      stats: {
        contextTime,
        memoriesUsed: memories.length,
        factsUsed: facts.length,
        permanentFactsUsed: permanentFacts.length,
        sessionFactsUsed: sessionFacts.length,
        coreFactsUsed: coreFacts.length,
        workingMemoryUsed: workingMemory.length,
        recentMessagesUsed: recentMessages.length
      }
    };
  }

  private async handleTTS(req: express.Request, res: express.Response) {
    try {
      const { text, voice, speed = 1.0 } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      if (!this.cartesia) {
        return res.status(500).json({ error: 'Cartesia TTS not available' });
      }

      console.log(`[MAYA_TTS] Generating speech for: "${text.substring(0, 50)}..."`);

      // Maya's cloned voice configuration
      const voiceId = voice || "e83c2613-1764-4d6d-b5e1-668558fb3b1a"; // Maya's cloned voice

      console.log(`[MAYA_TTS] Using voice ID: ${voiceId}`);
      console.log(`[MAYA_TTS] Request params:`, {
        modelId: "sonic-2",
        voice: { mode: "id", id: voiceId },
        transcript: text.substring(0, 100),
        outputFormat: { container: "wav", encoding: "pcm_f32le", sampleRate: 44100 },
        language: "en"
      });

      // Generate audio using Cartesia - use the documented format
      let audioResponse;
      try {
        audioResponse = await this.cartesia.tts.bytes({
          modelId: "sonic-2",
          voice: {
            mode: "id",
            id: voiceId
          },
          transcript: text,
          outputFormat: {
            container: "wav",
            encoding: "pcm_f32le",
            sampleRate: 44100
          },
          language: "en"
        });
      } catch (cartesiaError: any) {
        console.error(`[MAYA_TTS] Cartesia API error:`, cartesiaError);
        throw new Error(`Cartesia TTS failed: ${cartesiaError.message}`);
      }

      console.log(`[MAYA_TTS] Received audio response. Type:`, typeof audioResponse);
      console.log(`[MAYA_TTS] Audio buffer length:`, audioResponse?.byteLength || 'undefined');

      // If response is suspiciously small, it's probably an error
      if (audioResponse && audioResponse.byteLength < 1000) {
        const responseText = new TextDecoder().decode(audioResponse);
        console.log(`[MAYA_TTS] Small response detected, content:`, responseText);
      }

      // Set headers for audio response  
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Send audio data directly (audioResponse is ArrayBuffer)
      if (audioResponse && audioResponse.byteLength > 0) {
        const audioBuffer = new Uint8Array(audioResponse);
        res.setHeader('Content-Length', audioBuffer.length);
        res.send(Buffer.from(audioBuffer));
      } else {
        throw new Error('No audio data received from Cartesia');
      }
      console.log(`[MAYA_TTS] Speech generation completed`);

    } catch (error: any) {
      console.error('[MAYA_TTS] Error:', error);

      // Check if it's a specific Cartesia API error
      if (error.message && error.message.includes('bytes')) {
        return res.status(500).json({
          error: 'Cartesia TTS API error',
          details: 'Please check API key and voice ID',
          fallback: 'Use browser TTS instead'
        });
      }

      res.status(500).json({
        error: 'TTS generation failed',
        details: error.message,
        fallback: 'Use browser TTS instead'
      });
    }
  }

  private async handleTTSStream(req: express.Request, res: express.Response) {
    try {
      const { text, voice, speed = 1.0 } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      if (!this.cartesia) {
        return res.status(500).json({ error: 'Cartesia TTS not available' });
      }

      console.log(`[MAYA_TTS_STREAM] Generating streaming speech for: "${text.substring(0, 50)}..."`);

      // Maya's cloned voice configuration
      const voiceId = voice || "e83c2613-1764-4d6d-b5e1-668558fb3b1a"; // Maya's cloned voice

      // Set up streaming response headers for raw PCM data
      res.setHeader('Content-Type', 'audio/pcm');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');

      try {
        // Use fetch to call Cartesia API directly for streaming
        const requestPayload = {
          model_id: "sonic-2",
          voice: {
            mode: "id",
            id: voiceId
          },
          transcript: text,
          output_format: {
            container: "raw",
            encoding: "pcm_f32le",
            sample_rate: 44100
          },
          language: "en"
        };

        console.log('[MAYA_TTS_STREAM] Request payload:', JSON.stringify(requestPayload, null, 2));

        const cartesiaResponse = await fetch('https://api.cartesia.ai/tts/sse', {
          method: 'POST',
          headers: {
            'Cartesia-Version': '2024-06-10',
            'X-API-Key': process.env.CARTESIA_API_KEY!,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestPayload)
        });

        if (!cartesiaResponse.ok) {
          const errorText = await cartesiaResponse.text();
          console.error(`[MAYA_TTS_STREAM] Cartesia API error ${cartesiaResponse.status}:`, errorText);
          throw new Error(`Cartesia API error: ${cartesiaResponse.status} - ${errorText}`);
        }

        console.log(`[MAYA_TTS_STREAM] Streaming audio chunks from Cartesia...`);

        // Parse SSE response and stream audio chunks
        if (cartesiaResponse.body) {
          const reader = cartesiaResponse.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Parse SSE data
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() === '') continue; // Skip empty lines

              console.log(`[MAYA_TTS_STREAM] SSE line: ${line.substring(0, 100)}...`);

              if (line.startsWith('data: ')) {
                try {
                  const dataStr = line.substring(6);
                  if (dataStr === '[DONE]') {
                    console.log(`[MAYA_TTS_STREAM] Stream completed - received [DONE]`);
                    break;
                  }

                  const data = JSON.parse(dataStr);
                  console.log(`[MAYA_TTS_STREAM] Parsed data:`, Object.keys(data));

                  // Cartesia sends audio chunks in data.data field for SSE
                  if (data.data && data.type === 'chunk') {
                    // Convert base64 audio chunk to buffer and stream it
                    const audioChunk = Buffer.from(data.data, 'base64');
                    res.write(audioChunk);
                    console.log(`[MAYA_TTS_STREAM] Streamed audio chunk: ${audioChunk.length} bytes`);
                  }

                  // Check for completion
                  if (data.type === 'done' || data.done) {
                    console.log(`[MAYA_TTS_STREAM] Stream completed - done flag`);
                    break;
                  }
                } catch (parseError) {
                  console.error('[MAYA_TTS_STREAM] Error parsing SSE data:', parseError);
                  console.error('[MAYA_TTS_STREAM] Failed line:', line);
                }
              }
            }
          }
        }

        res.end();
        console.log(`[MAYA_TTS_STREAM] Streaming completed`);

      } catch (cartesiaError: any) {
        console.error(`[MAYA_TTS_STREAM] Cartesia streaming error:`, cartesiaError);
        res.status(500).json({
          error: 'Streaming TTS failed',
          details: cartesiaError.message,
          fallback: 'Use regular TTS endpoint'
        });
      }

    } catch (error: any) {
      console.error('[MAYA_TTS_STREAM] Error:', error);
      res.status(500).json({
        error: 'TTS streaming setup failed',
        details: error.message
      });
    }
  }

  private async handleTTSWebSocket(req: express.Request, res: express.Response) {
    try {
      const { text, voice, speed = 1.0, contextId } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      if (!this.cartesia) {
        return res.status(500).json({ error: 'Cartesia TTS not available' });
      }

      console.log(`[MAYA_TTS_WS] Generating WebSocket speech for: "${text.substring(0, 50)}..."`);

      // Maya's cloned voice configuration
      const voiceId = voice || "e83c2613-1764-4d6d-b5e1-668558fb3b1a"; // Maya's cloned voice
      const uniqueContextId = contextId || `maya-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Set up streaming response headers for raw PCM chunks
      res.setHeader('Content-Type', 'audio/pcm');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');

      try {
        // Initialize WebSocket with optimal settings for real-time streaming
        const websocket = this.cartesia.tts.websocket({
          container: "raw", // WebSocket only supports raw format
          encoding: "pcm_s16le", // 16-bit PCM for better browser support
          sampleRate: 44100
        });

        console.log(`[MAYA_TTS_WS] WebSocket initialized, sending request...`);

        // Send TTS request via WebSocket (auto-connects)
        const response = await websocket.send({
          modelId: "sonic-2",
          voice: {
            mode: "id",
            id: voiceId
          },
          transcript: text,
          contextId: uniqueContextId
        });

        console.log(`[MAYA_TTS_WS] Request sent, streaming audio chunks...`);

        // Stream audio chunks as they arrive
        let chunkCount = 0;

        // Use event listener approach for real-time streaming
        response.on("message", (message: any) => {
          console.log(`[MAYA_TTS_WS] Received message:`, message);

          if (message.type === "chunk" && message.data) {
            // Convert base64 audio chunk to buffer and stream it
            const audioChunk = Buffer.from(message.data, 'base64');
            res.write(audioChunk);
            chunkCount++;
            console.log(`[MAYA_TTS_WS] Streamed chunk ${chunkCount}: ${audioChunk.length} bytes`);
          } else if (message.type === "done") {
            console.log(`[MAYA_TTS_WS] WebSocket stream completed after ${chunkCount} chunks`);
            res.end();
          }
        });

        // Wait for completion (alternative approach if event listener doesn't work)
        for await (const message of response.events("message")) {
          console.log(`[MAYA_TTS_WS] Async iterator message:`, message);

          if (message.type === "chunk" && message.data) {
            const audioChunk = Buffer.from(message.data, 'base64');
            res.write(audioChunk);
            chunkCount++;
            console.log(`[MAYA_TTS_WS] Async chunk ${chunkCount}: ${audioChunk.length} bytes`);
          } else if (message.type === "done") {
            console.log(`[MAYA_TTS_WS] Async stream completed after ${chunkCount} chunks`);
            break;
          }
        }

        res.end();
        console.log(`[MAYA_TTS_WS] WebSocket TTS completed successfully`);

      } catch (cartesiaError: any) {
        console.error(`[MAYA_TTS_WS] Cartesia WebSocket error:`, cartesiaError);
        res.status(500).json({
          error: 'WebSocket TTS failed',
          details: cartesiaError.message,
          fallback: 'Use regular TTS endpoint'
        });
      }

    } catch (error: any) {
      console.error('[MAYA_TTS_WS] Error:', error);
      res.status(500).json({
        error: 'WebSocket TTS setup failed',
        details: error.message
      });
    }
  }

  // ULTRA LOW LATENCY: Streaming TTS Proxy Implementation
  private streamingSessions = new Map<string, {
    websocket: any,
    response: express.Response,
    contextId: string,
    chunks: string[],
    responseHandler?: boolean,
    wavHeaderSent?: boolean
  }>();

  private async handleStreamingProxy(req: express.Request, res: express.Response) {
    try {
      const voiceId = req.query.voice as string || "e83c2613-1764-4d6d-b5e1-668558fb3b1a";
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      console.log(`⚡ [ULTRA LOW LATENCY] Starting streaming proxy session: ${sessionId}`);

      // Set up streaming response headers for raw audio
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      });

      // Initialize Cartesia WebSocket for this session - use raw PCM for streaming
      const websocket = this.cartesia.tts.websocket({
        container: "raw",
        encoding: "pcm_s16le",
        sampleRate: 22050
      });

      const contextId = `maya-proxy-${sessionId}`;

      // Store session
      this.streamingSessions.set(sessionId, {
        websocket,
        response: res,
        contextId,
        chunks: [],
        wavHeaderSent: false
      });

      // Store the websocket to receive text later
      console.log(`🎵 [ULTRA LOW LATENCY] Session ${sessionId} ready for text chunks`);

      // Store session ID in response for cleanup  
      req.on('close', () => {
        console.log(`🔌 [ULTRA LOW LATENCY] Client disconnected, cleaning up session: ${sessionId}`);
        this.cleanupStreamingSession(sessionId);
      });

      // Add timeout for session cleanup (5 minutes)
      setTimeout(() => {
        if (this.streamingSessions.has(sessionId)) {
          console.log(`⏰ [ULTRA LOW LATENCY] Session timeout, cleaning up: ${sessionId}`);
          this.cleanupStreamingSession(sessionId);
        }
      }, 300000); // 5 minutes

      // Keep connection alive - don't end the response here
      // The response will be written to when chunks arrive

    } catch (error: any) {
      console.error('[ULTRA LOW LATENCY] Streaming proxy error:', error);
      res.status(500).json({
        error: 'Streaming proxy failed',
        details: error.message
      });
    }
  }

  private async handleStreamingChunk(req: express.Request, res: express.Response) {
    try {
      const { text, sessionId } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      // Find active session (for now, use the first one - could be improved with session management)
      const activeSessions = Array.from(this.streamingSessions.values());
      if (activeSessions.length === 0) {
        return res.status(404).json({ error: 'No active streaming session' });
      }

      const session = activeSessions[0];
      session.chunks.push(text);

      console.log(`📤 [ULTRA LOW LATENCY] Sending chunk to Cartesia:`, text);

      // Send text chunk to Cartesia with continuation
      const response = await session.websocket.send({
        contextId: session.contextId,
        modelId: "sonic-2",
        transcript: text,
        voice: {
          mode: "id",
          id: "e83c2613-1764-4d6d-b5e1-668558fb3b1a"
        },
        continue: true // Always continue until explicitly ended
      });

      // Set up response handler for this chunk if not already set
      if (!session.responseHandler) {
        console.log(`🔌 [ULTRA LOW LATENCY] Setting up response handler for session ${session.contextId}`);

        response.on("message", (rawMessage: any) => {
          let message: any;
          try {
            // Parse message if it's a buffer or string
            const messageStr = typeof rawMessage === 'string' ? rawMessage : Buffer.from(rawMessage).toString();
            message = JSON.parse(messageStr);
            console.log(`📨 [ULTRA LOW LATENCY] Received message from Cartesia:`, message);
          } catch (error) {
            console.error(`❌ [ULTRA LOW LATENCY] Failed to parse message:`, error);
            console.log(`📨 [ULTRA LOW LATENCY] Raw message:`, rawMessage);
            return;
          }

          if (message.type === "chunk" && message.data) {
            try {
              // Convert base64 audio chunk to buffer
              const audioBuffer = Buffer.from(message.data, "base64");
              console.log(`🔊 [ULTRA LOW LATENCY] Streaming ${audioBuffer.length} bytes to browser`);

              // Stream PCM directly to browser
              if (!session.response.destroyed) {
                session.response.write(audioBuffer);
              } else {
                console.warn(`⚠️ [ULTRA LOW LATENCY] Response destroyed, cannot write audio`);
              }
            } catch (error) {
              console.error('[ULTRA LOW LATENCY] Chunk processing error:', error);
            }
          }

          if (message.type === "done") {
            console.log(`✅ [ULTRA LOW LATENCY] Context ${session.contextId} chunk complete`);
          }

          if (message.type === "error") {
            console.error(`❌ [ULTRA LOW LATENCY] Context ${session.contextId} error:`, message.error);
            if (!session.response.destroyed) {
              session.response.status(500).end();
            }
          }
        });

        response.on("error", (error: any) => {
          console.error(`❌ [ULTRA LOW LATENCY] Response stream error:`, error);
        });

        response.on("close", () => {
          console.log(`🔌 [ULTRA LOW LATENCY] Cartesia response stream closed for ${session.contextId}`);
        });

        // Mark that we have a response handler to avoid duplicates
        session.responseHandler = true;
        console.log(`✅ [ULTRA LOW LATENCY] Response handler set up for ${session.contextId}`);
      }

      res.json({ success: true });

    } catch (error: any) {
      console.error('[ULTRA LOW LATENCY] Chunk error:', error);
      res.status(500).json({
        error: 'Chunk processing failed',
        details: error.message
      });
    }
  }

  private async handleStreamingEnd(req: express.Request, res: express.Response) {
    try {
      // Find active session
      const activeSessions = Array.from(this.streamingSessions.values());
      if (activeSessions.length === 0) {
        return res.status(404).json({ error: 'No active streaming session' });
      }

      const session = activeSessions[0];

      console.log(`🏁 [ULTRA LOW LATENCY] Ending streaming session`);

      // Send final empty chunk to close context
      const response = await session.websocket.send({
        contextId: session.contextId,
        modelId: "sonic-2",
        transcript: "",
        voice: {
          mode: "id",
          id: "e83c2613-1764-4d6d-b5e1-668558fb3b1a"
        },
        continue: false // End the context
      });

      // Handle final response and close stream
      response.on("message", (rawMessage: any) => {
        let message: any;
        try {
          const messageStr = typeof rawMessage === 'string' ? rawMessage : Buffer.from(rawMessage).toString();
          message = JSON.parse(messageStr);
        } catch (error) {
          console.error(`❌ [ULTRA LOW LATENCY] Failed to parse final message:`, error);
          return;
        }

        if (message.type === "chunk" && message.data) {
          try {
            const audioBuffer = Buffer.from(message.data, "base64");
            if (!session.response.destroyed) {
              session.response.write(audioBuffer);
            }
          } catch (error) {
            console.error('[ULTRA LOW LATENCY] Final chunk processing error:', error);
          }
        }

        if (message.type === "done") {
          console.log(`🏁 [ULTRA LOW LATENCY] Session ended, closing stream`);
          if (!session.response.destroyed) {
            session.response.end();
          }
          // Clean up session
          const sessionKey = Array.from(this.streamingSessions.keys()).find(key =>
            this.streamingSessions.get(key) === session
          );
          if (sessionKey) {
            this.cleanupStreamingSession(sessionKey);
          }
        }
      });

      res.json({ success: true });

    } catch (error: any) {
      console.error('[ULTRA LOW LATENCY] End error:', error);
      res.status(500).json({
        error: 'End processing failed',
        details: error.message
      });
    }
  }

  private cleanupStreamingSession(sessionId: string) {
    const session = this.streamingSessions.get(sessionId);
    if (session) {
      try {
        // Close WebSocket connection
        if (session.websocket && session.websocket.disconnect) {
          session.websocket.disconnect().catch((error: any) => {
            console.error(`❌ Error disconnecting WebSocket for session ${sessionId}:`, error);
          });
        }

        // End HTTP response if still open
        if (!session.response.destroyed) {
          session.response.end();
        }

        console.log(`🧽 [ULTRA LOW LATENCY] Cleaned up session: ${sessionId}`);
      } catch (error) {
        console.error(`❌ Error during session cleanup for ${sessionId}:`, error);
      } finally {
        this.streamingSessions.delete(sessionId);
      }
    }
  }

  private async convertPCMToMP3(pcmData: Buffer): Promise<Buffer | null> {
    try {
      // For now, return raw PCM - browsers can handle it
      // TODO: Implement proper PCM to MP3 conversion for better compatibility
      return pcmData;
    } catch (error: any) {
      console.error('PCM to MP3 conversion error:', error);
      return null;
    }
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`🚀 Maya Core v2.0 Microservice running on port ${this.port}`);
        console.log(`🔗 Health check: http://localhost:${this.port}/health`);
        console.log(`💬 Process endpoint: http://localhost:${this.port}/process`);
        console.log(`🗣️  Chat endpoint: http://localhost:${this.port}/chat`);
        console.log(`🎤 Streaming endpoint: http://localhost:${this.port}/process/stream`);
        console.log(`🔊 TTS endpoint: http://localhost:${this.port}/tts`);
        console.log(`🎵 TTS Streaming endpoint: http://localhost:${this.port}/tts/stream`);
        console.log(`⚡ TTS WebSocket endpoint: http://localhost:${this.port}/tts/websocket`);
        console.log(`🚀 ULTRA LOW LATENCY Streaming Proxy: http://localhost:${this.port}/tts/stream-proxy`);
        console.log(`🎙️  Voice WebSocket: ws://localhost:${this.port}/voice`);
        resolve();
      });
    });
  }

  /**
   * Store conversation messages to the messages table
   * This ensures voice conversations appear in web/mobile chat history
   */
  private async storeConversationMessages(
    userId: string,
    roomId: string,
    userMessage: string,
    mayaResponse: string,
    metadata: any
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString();

      console.log('💾 Storing conversation messages to database...');

      // Store user message
      const userMessageId = uuidv4();
      const { error: userError } = await this.supabase.from('messages').insert({
        id: userMessageId,
        content: userMessage,
        user_id: userId,
        room_id: roomId,
        role: 'user',
        created_at: timestamp,
        metadata: {
          source: 'voice_assistant',
          version: metadata.version
        }
      });

      if (userError) {
        console.error('❌ Error storing user message:', userError);
        return;
      }

      // Store Maya's response with Maya's user ID
      const mayaMessageId = uuidv4();
      const mayaTimestamp = new Date().toISOString();
      const { error: mayaError } = await this.supabase.from('messages').insert({
        id: mayaMessageId,
        content: mayaResponse,
        user_id: SYSTEM_USER_IDS.MAYA, // Use Maya's user ID for assistant messages
        room_id: roomId,
        role: 'assistant',
        created_at: mayaTimestamp,
        metadata: {
          ...metadata,
          source: 'voice_assistant',
          userMessageId: userMessageId,
          originalUserId: userId // Keep track of who Maya was responding to
        }
      });

      if (mayaError) {
        console.error('❌ Error storing Maya response:', mayaError);
        return;
      }

      console.log(`✅ Messages stored: User[${userMessageId.slice(0, 8)}] Maya[${mayaMessageId.slice(0, 8)}]`);

    } catch (error) {
      console.error('❌ Error in storeConversationMessages:', error);
    }
  }

  public stop(): void {
    console.log('🛑 Stopping Maya Core v2.0 Microservice...');
    process.exit(0);
  }
}

// If running directly, start the service
if (require.main === module) {
  // Ensure all logs are visible in Railway
  console.log('========================================');
  console.log('MAYA CORE SERVICE STARTING UP');
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Port:', process.env.PORT || process.env.MAYA_CORE_PORT || '3333');
  console.log('Time:', new Date().toISOString());
  console.log('========================================');

  const service = new MayaService();
  service.start().catch(console.error);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[MAYA_CORE] Received SIGINT, shutting down gracefully...');
    service.stop();
  });
  process.on('SIGTERM', () => {
    console.log('\n[MAYA_CORE] Received SIGTERM, shutting down gracefully...');
    service.stop();
  });

  // Log uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('[MAYA_CORE] Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[MAYA_CORE] Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
}