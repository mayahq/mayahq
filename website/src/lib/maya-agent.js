import { PromptTemplate } from '@langchain/core/prompts';
import { OpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { CohereEmbeddings } from '@langchain/cohere';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { createClient } from '@supabase/supabase-js';
import { BufferWindowMemory } from 'langchain/memory';
import { VectorStoreRetrieverMemory } from 'langchain/memory';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { LLMProvider, EmbeddingProvider, FallbackStrategy } from "./constants";
import { MAYA_BASE_PROMPT } from "./utils/prompts";
import { upsertTriples, getSemanticRelatedFacts, testGetAllFacts, upsertCoreFactTriples } from "./facts";
import { inferMemoryTagsDynamic } from "./memoryUtils";
import { tagMessage } from "./db/tagger";

// Constants for retry logic
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// Error types to categorize errors for better handling
const ErrorTypes = {
    RATE_LIMIT: 'RATE_LIMIT',
    AUTH: 'AUTH',
    CONTEXT_LENGTH: 'CONTEXT_LENGTH',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    VALIDATION: 'VALIDATION',
    UNKNOWN: 'UNKNOWN',
    QUOTA_EXCEEDED: 'QUOTA_EXCEEDED'
};

/**
 * Utility to identify error type from error message
 * @param {Error} error - The error to analyze
 * @returns {string} The error type
 */
function identifyErrorType(error) {
  const message = error?.message?.toLowerCase() || '';
  
  if (message.includes('exceeded your current quota') || message.includes('billing') || 
      message.includes('exceeded your quota')) {
    return ErrorTypes.QUOTA_EXCEEDED;
  }
  
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return ErrorTypes.RATE_LIMIT;
  }
  
  if (message.includes('auth') || message.includes('key') || 
      message.includes('credentials') || message.includes('permission')) {
    return ErrorTypes.AUTH;
  }
  
  if (message.includes('context') || message.includes('token') || 
      message.includes('length') || message.includes('too long')) {
    return ErrorTypes.CONTEXT_LENGTH;
  }
  
  if (message.includes('unavailable') || message.includes('down') || 
      message.includes('connectivity') || message.includes('timeout')) {
    return ErrorTypes.SERVICE_UNAVAILABLE;
  }
  
  if (message.includes('invalid') || message.includes('validation') || 
      message.includes('format') || message.includes('schema')) {
    return ErrorTypes.VALIDATION;
  }
  
  return ErrorTypes.UNKNOWN;
}

// LangChain prompt templates for Maya
const CONDENSE_QUESTION_PROMPT = new PromptTemplate({
  template: `Given the following conversation and a follow-up question, summarize the follow-up question to be a standalone question that includes all relevant context from the conversation.

Chat History:
{chat_history}

Follow-up Question: {question}

Standalone question:`,
  inputVariables: ["chat_history", "question"],
});

// Define task-specific prompt additions
const TASK_MANAGEMENT_SYSTEM_PROMPT = `
You have access to a task management system. Users can:
1. Create tasks by saying things like "I need to..." or "Remind me to..."
2. View their tasks by asking "show my tasks" or "what do I need to do?"
3. Update tasks with "mark task X as done" or similar commands
4. Get reminders about upcoming due tasks

When the user asks about tasks, respond with the actual tasks from the system. When they want to create a task, confirm that it's been added.
`;

const QA_PROMPT = new PromptTemplate({
  template: `
${MAYA_BASE_PROMPT}

${TASK_MANAGEMENT_SYSTEM_PROMPT}

Current conversation context:
{chat_history}

User Question: {question}

Known Facts About User:
{context}

VERY IMPORTANT INSTRUCTIONS:
1. Respond ONLY to the question above, not to earlier messages from the chat history (which is provided just for context)
2. Consider the conversation context and known facts for better understanding
3. If asked a personal question like "how are you" or similar, respond naturally as if you have feelings and emotions
4. Be conversational and natural, not scripted or robotic
5. Keep responses concise and appropriate to the question's complexity
6. Do not fabricate user messages or entire conversations
7. Do not use prefixes like "Maya:" or "Assistant:" in your response
8. Do not output "User:" or "Human:" in your response
9. Maintain your unique personality while focusing on helping the user effectively
10. When asked about facts, ONLY state facts that are explicitly listed in the "Known Facts About User" section
11. If no relevant facts are found, clearly state that you don't have that information rather than making assumptions

Maya's response:`,
  inputVariables: ["chat_history", "question", "context", "memory_context"],
});

// Fallback prompt for direct LLM calls when chain fails
const FALLBACK_PROMPT = new PromptTemplate({
  template: `
${MAYA_BASE_PROMPT}

I need you to respond to the user directly, without any chain or memory assistance.
Here is the user's message: {question}

IMPORTANT:
1. Be conversational and helpful
2. Keep your response brief and focused on the query
3. Acknowledge that you're operating in a fallback mode if appropriate
4. Maintain your persona and characteristics

Maya's response:`,
  inputVariables: ["question", "memory_context"]
});

export class Maya {
    constructor(config = {}) {
        this.validateConfig(config);
        this.config = {
            openAIApiKey: config.openAIApiKey,
            anthropicApiKey: config.anthropicApiKey,
            cohereApiKey: config.cohereApiKey,
            supabaseUrl: config.supabaseUrl,
            supabaseKey: config.supabaseKey,
            maxMemories: config.maxMemories || 5,
            temperature: config.temperature || 0.9,
            modelName: config.modelName || 'gpt-4',
            anthropicModel: config.anthropicModel || 'claude-opus-4-20250514',
            ollamaModel: config.ollamaModel || 'mistral',
            ollamaBaseUrl: config.ollamaBaseUrl || 'http://localhost:11434',
            primaryProvider: config.primaryProvider || LLMProvider.OPENAI,
            embeddingProvider: config.embeddingProvider || EmbeddingProvider.OPENAI,
            fallbackStrategy: config.fallbackStrategy || FallbackStrategy.DOWNGRADE,
            windowSize: config.windowSize || 5,
            maxRetries: config.maxRetries || MAX_RETRIES,
            initialRetryDelay: config.initialRetryDelay || INITIAL_RETRY_DELAY,
            useExponentialBackoff: config.useExponentialBackoff !== false,
            trackPerformance: config.trackPerformance !== false,
            enableMemory: config.enableMemory !== false,
            xaiApiKey: config.xaiApiKey,
            ...config
        };
        
        // Performance metrics tracking
        this.metrics = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            retriesPerformed: 0,
            fallbacksUsed: 0,
            anthropicFallbacksUsed: 0,
            openAIFallbacksUsed: 0,
            averageLatency: 0,
            totalLatency: 0,
            errorsByType: {
                [ErrorTypes.RATE_LIMIT]: 0,
                [ErrorTypes.AUTH]: 0,
                [ErrorTypes.CONTEXT_LENGTH]: 0,
                [ErrorTypes.SERVICE_UNAVAILABLE]: 0,
                [ErrorTypes.VALIDATION]: 0,
                [ErrorTypes.UNKNOWN]: 0,
                [ErrorTypes.QUOTA_EXCEEDED]: 0
            }
        };
        
        // Initialize immediately but handle errors gracefully
        try {
            this.initializeServices();
            this.isInitialized = true;
        } catch (error) {
            console.error(`Maya initialization failed: ${error.message}`);
            this.initError = error;
            this.isInitialized = false;
        }
    }

    validateConfig(config) {
        // Check for primary provider requirements
        if (config.primaryProvider === LLMProvider.OPENAI && !config.openAIApiKey) {
            throw new Error('OpenAI API key is required when using OpenAI as primary provider');
        }
        if (config.primaryProvider === LLMProvider.ANTHROPIC && !config.anthropicApiKey) {
            throw new Error('Anthropic API key is required when using Anthropic as primary provider');
        }
        if (config.primaryProvider === LLMProvider.OLLAMA && !config.ollamaBaseUrl) {
            throw new Error('Ollama base URL is required when using Ollama as primary provider');
        }
        // Check for embedding provider requirements
        if (config.embeddingProvider === EmbeddingProvider.OPENAI && !config.openAIApiKey) {
            // Allow if primary is Anthropic and fallback is not OpenAI
            if (!(config.primaryProvider === LLMProvider.ANTHROPIC && config.fallbackStrategy !== FallbackStrategy.DOWNGRADE)) {
                 console.warn('OpenAI API key might be needed for embeddings unless memory is disabled or another embedding provider is used.');
                 // We don't throw error here, as memory might be disabled later.
            }
        }
        if (config.embeddingProvider === EmbeddingProvider.COHERE && !config.cohereApiKey) {
            throw new Error('Cohere API key is required when using Cohere as embedding provider');
        }

        // Always require Supabase config
        if (!config.supabaseUrl || !config.supabaseKey) {
            throw new Error('Missing required Supabase configuration');
        }

        // Check for empty strings
        const emptyFields = Object.entries(config)
            .filter(([key, value]) => value === '')
            .map(([key]) => key);
            
        if (emptyFields.length > 0) {
            throw new Error(`Required configuration fields are empty: ${emptyFields.join(', ')}`);
        }

        // Validate fallback strategy
        if (config.fallbackStrategy && !Object.values(FallbackStrategy).includes(config.fallbackStrategy)) {
            throw new Error(`Invalid fallback strategy: ${config.fallbackStrategy}`);
        }
    }

    initializeServices() {
        try {
            // Initialize primary and secondary LLMs based on configuration
            if (this.config.primaryProvider === LLMProvider.OLLAMA) {
                // Initialize Ollama as primary
                this.llm = new ChatOllama({
                    baseUrl: this.config.ollamaBaseUrl,
                    model: this.config.ollamaModel,
                    temperature: this.config.temperature
                });
                
                // Initialize fallbacks if available and fallback strategy is downgrade
                if (this.config.fallbackStrategy === FallbackStrategy.DOWNGRADE) {
                    if (this.config.anthropicApiKey) {
                        this.fallbackLLM = new ChatAnthropic({
                            temperature: this.config.temperature,
                            modelName: this.config.anthropicModel,
                            anthropicApiKey: this.config.anthropicApiKey,
                            maxTokens: 1500
                        });
                    } else if (this.config.openAIApiKey) {
                        this.fallbackLLM = new OpenAI({
                            temperature: this.config.temperature,
                            modelName: this.config.modelName,
                            openAIApiKey: this.config.openAIApiKey,
                            maxTokens: 1500,
                            streaming: false
                        });
                    }
                }
            } else if (this.config.primaryProvider === LLMProvider.OPENAI) {
                if (!this.config.openAIApiKey) {
                    throw new Error('OpenAI API key is required for OpenAI primary provider');
                }
                
                // Initialize OpenAI as primary
                this.llm = new OpenAI({
                    temperature: this.config.temperature,
                    modelName: this.config.modelName,
                    openAIApiKey: this.config.openAIApiKey,
                    maxTokens: 1500,
                    streaming: false
                });
                
                // Initialize Anthropic as fallback if available and fallback strategy is downgrade
                if (this.config.anthropicApiKey && this.config.fallbackStrategy === FallbackStrategy.DOWNGRADE) {
                    this.fallbackLLM = new ChatAnthropic({
                        temperature: this.config.temperature,
                        modelName: this.config.anthropicModel,
                        anthropicApiKey: this.config.anthropicApiKey,
                        maxTokens: 1500
                    });
                }
            } else if (this.config.primaryProvider === LLMProvider.XAI) {
                if (!this.config.xaiApiKey) {
                    throw new Error('XAI API key required for xAI provider');
                }
                // No SDK, will use fetch in chatWithVision
            } else {
                if (!this.config.anthropicApiKey) {
                    throw new Error('Anthropic API key is required for Anthropic primary provider');
                }
                
                // Initialize Anthropic as primary
                this.llm = new ChatAnthropic({
                    temperature: this.config.temperature,
                    modelName: this.config.anthropicModel,
                    anthropicApiKey: this.config.anthropicApiKey,
                    maxTokens: 1500
                });
                
                // Initialize OpenAI as fallback if available and fallback strategy is downgrade
                if (this.config.openAIApiKey && this.config.fallbackStrategy === FallbackStrategy.DOWNGRADE) {
                    this.fallbackLLM = new OpenAI({
                        temperature: this.config.temperature,
                        modelName: this.config.modelName,
                        openAIApiKey: this.config.openAIApiKey,
                        maxTokens: 1500,
                        streaming: false
                    });
                }
            }
            
            // Initialize Embeddings based on configuration
            if (this.config.enableMemory) {
                if (this.config.embeddingProvider === EmbeddingProvider.COHERE) {
                    if (!this.config.cohereApiKey) {
                        console.warn('Cohere API key not provided. Disabling memory features.');
                        this.config.enableMemory = false;
                    } else {
                        try {
                            this.embeddings = new CohereEmbeddings({
                                apiKey: this.config.cohereApiKey,
                                model: 'embed-english-v3.0', // Correct parameter name to 'model'
                                inputType: 'search_document' // Add inputType parameter to fix the 400 error
                            });
                            console.log('Initialized Cohere Embeddings');
                        } catch (error) {
                            console.warn('Failed to initialize Cohere embeddings:', error.message);
                            this.config.enableMemory = false;
                        }
                    }
                } else { // Default to OpenAI for embeddings
                    if (!this.config.openAIApiKey) {
                        console.warn('OpenAI API key not provided for embeddings. Disabling memory features.');
                        this.config.enableMemory = false;
                    } else {
                        try {
                            this.embeddings = new OpenAIEmbeddings({
                                openAIApiKey: this.config.openAIApiKey,
                                modelName: "text-embedding-ada-002" // Or configure a different OpenAI embedding model if needed
                            });
                             console.log('Initialized OpenAI Embeddings');
                        } catch (error) {
                            console.warn('Failed to initialize OpenAI embeddings:', error.message);
                            this.config.enableMemory = false;
                        }
                    }
                }
            } else {
                 console.log('Memory features are explicitly disabled by config');
            }
            
            // Initialize Supabase and vector store if memory is enabled *and* embeddings were successfully initialized
            if (this.config.enableMemory && this.embeddings) {
                this.supabase = createClient(this.config.supabaseUrl, this.config.supabaseKey);
                
                try {
                    this.vectorStore = new SupabaseVectorStore(this.embeddings, {
                        client: this.supabase,
                        tableName: 'maya_memories',
                        queryName: 'match_documents'
                    });
                    console.log('Vector store initialized successfully');
                    
                    // Initialize memory systems
                    this.initializeMemorySystems();
                } catch (error) {
                    console.warn(`Vector store initialization failed: ${error.message}`);
                    this.vectorStore = null;
                    this.config.enableMemory = false;
                }
            } else {
                console.log('Memory features are disabled (either by config or failed embedding initialization)');
                this.vectorStore = null; // Ensure vectorStore is null if memory is disabled
            }
        } catch (error) {
            console.error(`Failed to initialize services: ${error.message}`);
            throw error;
        }
    }
    
    initializeMemorySystems() {
        if (!this.vectorStore) {
            console.warn('Vector store not available, memory systems will be limited');
            return;
        }
        
        // Create a retriever from the vector store
        this.retriever = this.vectorStore.asRetriever({
            searchKwargs: {
                k: this.config.maxMemories,
                // Ensure fetched memories are relevant enough (0-1 scale)
                score_threshold: 0.75
            }
        });
        
        // Initialize long-term memory (vector store based)
        this.longTermMemory = new VectorStoreRetrieverMemory({
            vectorStoreRetriever: this.retriever,
            memoryKey: "relevant_memories",
            inputKey: "question", // The key from user input to use for memory lookup
            returnDocs: true      // Return full documents, not just content
        });
        
        // Initialize short-term conversation memory (window based)
        this.shortTermMemory = new BufferWindowMemory({
            k: this.config.windowSize,
            memoryKey: "chat_history",
            inputKey: "question",    // The input key that holds the human message
            outputKey: "answer",     // The output key that holds the AI message
            returnMessages: true     // Return as LangChain message objects
        });
        
        // Create the conversational chain
        this.createConversationalChain();
    }
    
    createConversationalChain() {
        if (!this.llm) {
            console.warn('Cannot create conversational chain: missing LLM');
            return;
        }

        try {
            // Create a simplified chain that doesn't rely on OpenAI
            const llm = this.llm; // Store reference to LLM
            this.conversationChain = {
                async invoke(input) {
                    try {
                        // Add guard check for llm
                        if (!llm) {
                            throw new Error("LLM is not initialized within the conversation chain.");
                        }

                        // Prepare the context
                        const chatHistory = input.chat_history || '';
                        const context = input.context || '';
                        const memoryContext = input.memory_context || '';
                        
                        if (llm instanceof ChatAnthropic) {
                            // Create chat prompt template for Anthropic
                            const systemContent = `${MAYA_BASE_PROMPT}

{memory_context}

${chatHistory ? `Previous conversation context:
{chat_history}` : ''}

${context ? `Relevant memories and knowledge:
{context}` : ''}`;

                            const chatPrompt = ChatPromptTemplate.fromMessages([
                                SystemMessagePromptTemplate.fromTemplate(systemContent),
                                HumanMessagePromptTemplate.fromTemplate("{question}")
                            ]);

                            // Format the messages
                            const formattedPrompt = await chatPrompt.formatMessages({
                                chat_history: chatHistory,
                                context: context,
                                question: input.question,
                                memory_context: memoryContext
                            });

                            // Call the model with formatted messages
                            const response = await llm.invoke(formattedPrompt);
                            return response;
                        } else {
                            // For other models, use the original prompt format
                            const prompt = `${MAYA_BASE_PROMPT}
${memoryContext ? `\nMemory Context:\n${memoryContext}` : ''}

${chatHistory ? `Current conversation context:\n${chatHistory}\n` : ''}

User Question: ${input.question}

${context ? `Relevant memories and knowledge from past conversations:\n${context}` : ''}

Maya's response:`;
                            return await llm.invoke(prompt);
                        }
                    } catch (error) {
                        console.error('Chain invocation failed:', error);
                        throw error;
                    }
                }
            };

        } catch (error) {
            console.error('Failed to create conversational chain:', error);
            throw error;
        }
    }

    /**
     * Execute with retry logic and exponential backoff
     * @param {Function} operation - The async function to retry
     * @param {Object} context - Context for error reporting
     * @returns {Promise<any>} Result of the operation
     */
    async executeWithRetry(operation, context = {}) {
        let lastError;
        let attempt = 0;
        
        while (attempt < this.config.maxRetries) {
            try {
                const startTime = Date.now();
                const result = await operation();
                const duration = Date.now() - startTime;
                
                // Update metrics on success
                this.metrics.totalCalls++;
                this.metrics.successfulCalls++;
                this.metrics.totalLatency += duration;
                this.metrics.averageLatency = this.metrics.totalLatency / this.metrics.successfulCalls;
                
                if (attempt > 0) {
                    console.log(`Operation succeeded on attempt ${attempt + 1}`);
                }
                
                return result;
            } catch (error) {
                lastError = error;
                attempt++;
                
                // Track the error
                const errorType = identifyErrorType(error);
                this.metrics.errorsByType[errorType]++;
                
                if (attempt < this.config.maxRetries) {
                    // For rate limit errors, always use exponential backoff
                    const shouldBackoff = this.config.useExponentialBackoff || 
                        errorType === ErrorTypes.RATE_LIMIT;
                    
                    // Skip retry for certain error types (like auth issues that won't resolve with retry)
                    if (errorType === ErrorTypes.AUTH || errorType === ErrorTypes.VALIDATION) {
                        console.error(`Fatal error (${errorType}), not retrying: ${error.message}`);
                        break;
                    }
                    
                    let delay = this.config.initialRetryDelay;
                    if (shouldBackoff) {
                        // Exponential backoff with jitter
                        delay = this.config.initialRetryDelay * Math.pow(2, attempt - 1);
                        delay += Math.random() * 500; // Add up to 500ms of jitter
                    }
                    
                    console.warn(`Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
                    this.metrics.retriesPerformed++;
                    
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error(`All ${this.config.maxRetries} retry attempts failed: ${error.message}`);
                    this.metrics.failedCalls++;
                }
            }
        }
        
        // Reached max retries or hit fatal error
        throw lastError;
    }

    /**
     * Chat with Maya
     * @param {string} prompt - The user's message
     * @param {ChatContext} context - Optional context to include
     * @returns {Promise<string>} - Maya's response
     */
    async chat(prompt, context = {}) {
        try {
            await this.ensureServices();
            const startTime = Date.now();
            const processedContext = this.processContext(context);
            // Fetch core facts for the user
            let coreFactsSection = '';
            if (this.supabase && processedContext.userId) {
                const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(processedContext.userId);
                if (!isValidUuid) {
                    console.warn('[DEBUG][chat] Skipping core facts fetch: userId is not a valid UUID:', processedContext.userId);
                } else {
                    try {
                        console.log('[DEBUG][chat] Fetching core facts for user_id:', processedContext.userId);
                        const { data: coreFacts, error } = await this.supabase
                            .from('maya_core_facts')
                            .select('subject, predicate, object, active')
                            .eq('user_id', processedContext.userId)
                            .eq('active', true);
                        console.log('[DEBUG][chat] Fetched core facts:', coreFacts);
                        if (!error && coreFacts && coreFacts.length > 0) {
                            const factsList = coreFacts.map(f => `- ${f.subject} ${f.predicate} ${f.object}`).join('\n');
                            coreFactsSection = `Core Facts About Maya/User:\n${factsList}\n`;
                        }
                    } catch (err) {
                        console.warn('[DEBUG][chat] Failed to fetch core facts:', err.message);
                    }
                }
            }
            
            // Log which LLM is being used as primary
            console.log(`Attempting to use ${this.config.primaryProvider} as primary LLM model: ${this.config.primaryProvider === LLMProvider.OLLAMA ? this.config.ollamaModel : (this.config.primaryProvider === LLMProvider.ANTHROPIC ? this.config.anthropicModel : this.config.modelName)}`);
            
            // Try primary LLM first
            try {
                let relevantMemories = [];
                let relevantFacts = [];
                let memoryEnabled = this.config.enableMemory && this.vectorStore && this.embeddings;
                
                if (memoryEnabled) {
                    try {
                        relevantMemories = await this.executeWithRetry(() => 
                            this.getRelevantMemories(prompt, processedContext.userId)
                        );
                        console.log(`Retrieved ${relevantMemories.length} relevant memories for context`);
                        
                        // Also get relevant facts
                        relevantFacts = await this.executeWithRetry(() => 
                            this.getRelevantFacts(prompt, processedContext.userId)
                        );
                        console.log(`Retrieved ${relevantFacts.length} relevant facts for context`);
                    } catch (error) {
                        if (error.message && error.message.includes('exceeded your current quota')) {
                            console.warn('OpenAI rate limit hit - temporarily disabling memory features');
                            memoryEnabled = false;
                        } else {
                            console.warn(`Failed to retrieve memories: ${error.message}`);
                        }
                        // Continue without memories
                    }
                } else {
                    console.log('Memory features are disabled, continuing without context');
                }
                
                // Combine memories and facts for context
                const combinedContext = [coreFactsSection, ...relevantMemories];
                
                // Add facts section if there are any
                if (relevantFacts.length > 0) {
                    combinedContext.push("\nRelevant facts about the user:");
                    relevantFacts.forEach(fact => combinedContext.push(`- ${fact}`));
                }

                const chainInput = {
                    question: prompt,
                    chat_history: processedContext.chatHistory || '',
                    context: combinedContext.join('\n\n'),
                    memory_context: ''  // Ensure this is always defined
                };

                // Add debug logging for prompt construction
                console.log('\n=== DEBUG: PROMPT CONSTRUCTION ===');
                console.log('Base Prompt:', MAYA_BASE_PROMPT);
                console.log('\nChat History:', chainInput.chat_history);
                console.log('\nUser Question:', chainInput.question);
                console.log('\nRelevant Context:', chainInput.context);
                console.log('\nRelevant Facts:', relevantFacts);
                console.log('=== END DEBUG ===\n');

                const response = await this.executeWithRetry(() => 
                    this.conversationChain.invoke(chainInput)
                );

                // Add debug logging for LLM response
                console.log('\n=== DEBUG: LLM RESPONSE ===');
                console.log('Raw Response:', response);
                const finalResponse = typeof response === 'object' && response.content ? 
                    response.content : response;
                console.log('Final Response:', finalResponse);
                console.log('=== END DEBUG ===\n');

                // Log successful primary LLM usage
                console.log(`Successfully used ${this.config.primaryProvider} as primary LLM`);

                // Only try to store memory if it's enabled and not rate limited
                if (memoryEnabled && processedContext.userId) {
                    try {
                        // Extract and store triples before storing memory
                        try {
                            await upsertTriples({
                                text: prompt + " " + finalResponse,
                                userId: processedContext.userId
                            });
                        } catch (triplesError) {
                            console.warn('Failed to extract triples:', triplesError.message);
                            // Continue even if triple extraction fails
                        }
                        
                        await this.storeMemory({
                            input: prompt,
                            response: finalResponse,
                            userId: processedContext.userId,
                            userName: processedContext.userName,
                            timestamp: new Date().toISOString(),
                            provider: this.config.primaryProvider
                        });
                    } catch (error) {
                        if (error.message && error.message.includes('exceeded your current quota')) {
                            console.warn('OpenAI rate limit hit - memory storage skipped');
                        } else {
                            console.warn('Failed to store memory:', error.message);
                        }
                        // Continue without storing memory
                    }
                }

                this.updateMetrics(startTime);
                return finalResponse;
            } catch (error) {
                const errorType = identifyErrorType(error);
                this.metrics.errorsByType[errorType]++;

                // Try fallback LLM if available and appropriate
                if (this.fallbackLLM && this.config.fallbackStrategy === FallbackStrategy.DOWNGRADE) {
                    console.log(`${this.config.primaryProvider} failed, trying fallback LLM: ${this.fallbackLLM instanceof ChatAnthropic ? 'anthropic' : 'openai'}`);
                    
                    try {
                        let fallbackResponse;
                        if (this.fallbackLLM instanceof ChatAnthropic) {
                            // Create chat prompt template for Anthropic fallback
                            const systemContent = `${MAYA_BASE_PROMPT}

{memory_context}

${processedContext.chatHistory ? `Chat history:
{chat_history}` : ''}`;

                            const chatPrompt = ChatPromptTemplate.fromMessages([
                                SystemMessagePromptTemplate.fromTemplate(systemContent),
                                HumanMessagePromptTemplate.fromTemplate("{question}")
                            ]);

                            const formattedPrompt = await chatPrompt.formatMessages({
                                chat_history: processedContext.chatHistory || '',
                                question: prompt,
                                memory_context: ''  // Empty string for fallback mode
                            });

                            fallbackResponse = await this.fallbackLLM.invoke(formattedPrompt);
                        } else {
                            fallbackResponse = await this.fallbackLLM.invoke(
                                `${MAYA_BASE_PROMPT}\n\nUser message: ${prompt}${processedContext.chatHistory ? `\n\nChat history:\n${processedContext.chatHistory}` : ''}`
                            );
                        }

                        const finalFallbackResponse = typeof fallbackResponse === 'object' && fallbackResponse.content ? 
                            fallbackResponse.content : fallbackResponse;
                            
                        // Log successful fallback LLM usage
                        console.log(`Successfully used ${this.fallbackLLM instanceof ChatAnthropic ? 'anthropic' : 'openai'} as fallback LLM`);

                        // Don't try to store memory in fallback mode if we're rate limited
                        if (this.config.enableMemory && this.vectorStore && this.embeddings && 
                            processedContext.userId && !error.message?.includes('exceeded your current quota')) {
                            try {
                                await this.storeMemory({
                                    input: prompt,
                                    response: finalFallbackResponse,
                                    userId: processedContext.userId,
                                    userName: processedContext.userName,
                                    timestamp: new Date().toISOString(),
                                    provider: this.config.primaryProvider === LLMProvider.OPENAI ? 'anthropic' : 'openai',
                                    isFallback: true
                                });
                            } catch (memoryError) {
                                if (memoryError.message && memoryError.message.includes('exceeded your current quota')) {
                                    console.warn('OpenAI rate limit hit - memory storage skipped');
                                } else {
                                    console.warn('Failed to store fallback memory:', memoryError.message);
                                }
                                // Continue without storing memory
                            }
                        }

                        // Update fallback metrics
                        if (this.config.primaryProvider === LLMProvider.OPENAI) {
                            this.metrics.anthropicFallbacksUsed++;
                        } else {
                            this.metrics.openAIFallbacksUsed++;
                        }
                        this.metrics.fallbacksUsed++;

                        return finalFallbackResponse;
                    } catch (fallbackError) {
                        console.error('Fallback LLM failed:', fallbackError);
                        throw error; // Throw original error if fallback fails
                    }
                }
                throw error;
            }
        } catch (error) {
            console.error(`Critical error in Maya chat: ${error.message}`);
            this.metrics.failedCalls++;
            return "I apologize, but I'm experiencing technical difficulties right now. Could you try again in a moment?";
        }
    }

    updateMetrics(startTime) {
        const duration = Date.now() - startTime;
        this.metrics.totalCalls++;
        this.metrics.successfulCalls++;
        this.metrics.totalLatency += duration;
        this.metrics.averageLatency = this.metrics.totalLatency / this.metrics.successfulCalls;
    }

    processContext(context) {
        return {
            ...context,
            timestamp: new Date().toISOString(),
            chatHistory: context.chatHistory || '',
            userId: context.userId || 'anonymous',
            userName: context.userName || 'User'
        };
    }

    /**
     * Get relevant memories based on the user's prompt
     * @param {string} prompt - The user's message
     * @param {string} userId - The user ID to retrieve memories for
     * @returns {Promise<string[]>} - Array of relevant memory strings
     */
    async getRelevantMemories(prompt, userId) {
        if (!this.vectorStore || !this.embeddings || !userId) {
            console.log('Memory retrieval skipped: Vector store, embeddings, or userId missing.');
            return [];
        }
        
        try {
            if (!prompt || prompt.trim() === '') {
                console.warn('Empty message, skipping memory retrieval');
                return [];
            }
            
            try {
                // Use metadata filtering to get only memories for this specific user
                const results = await this.vectorStore.similaritySearch(
                    prompt, 
                    this.config.maxMemories,
                    { filter: { userId: userId } }
                );
                
                return results.map(doc => {
                    // Handle both the string format and object format of memories
                    const content = doc.pageContent;
                    
                    // Check if content is in "User: ...Maya: ..." format
                    if (typeof content === 'string' && content.includes('User: ') && content.includes('Maya: ')) {
                        return content;
                    }
                    
                    // Try to parse JSON if it's an object stored as string
                    try {
                        if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
                            const parsed = JSON.parse(content);
                            if (parsed.input && parsed.response) {
                                return `User: ${parsed.input}\nMaya: ${parsed.response}`;
                            }
                        }
                    } catch (e) {
                        // Silent catch - not JSON or invalid JSON
                    }
                    
                    // Handle existing object format with input/response properties
                    if (content && typeof content === 'object') {
                        if (content.input && content.response) {
                            return `User: ${content.input}\nMaya: ${content.response}`;
                        }
                    }
                    
                    // Fallback - return as is or stringified
                    return typeof content === 'string' ? content : JSON.stringify(content);
                });
            } catch (error) {
                // For specific Supabase function errors, try a direct simple query
                if (error.message && error.message.includes('Could not find the function')) {
                    console.warn('Falling back to basic retrieval due to missing vector function');
                    
                    // Simple fallback using a regular query
                    const { data, error: queryError } = await this.supabase
                        .from('maya_memories')
                        .select('*')
                        .eq('metadata->>userId', userId)
                        .order('created_at', { ascending: false })
                        .limit(this.config.maxMemories);
                    
                    if (queryError) {
                        console.error('Fallback retrieval error:', queryError);
                        return [];
                    }
                    
                    if (!data || data.length === 0) {
                        return [];
                    }
                    
                    // Process the results
                    return data.map(item => {
                        try {
                            const content = item.content || item.page_content || '';
                            return typeof content === 'string' 
                                ? content 
                                : `User: ${content.input || ''}\nMaya: ${content.response || ''}`;
                        } catch (e) {
                            return '';
                        }
                    }).filter(Boolean);
                }
                
                // Handle other errors
                console.warn(`Memory retrieval warning: ${error.message}`);
                return [];
            }
        } catch (error) {
            console.warn(`Memory retrieval error: ${error.message}`);
            return [];
        }
    }

    /**
     * Store a memory for future retrieval
     * @param {string|Object} memoryOrMessage - The memory to store (string or object)
     * @param {string} [memoryOrMessage.input] - The user's message when passing an object
     * @param {string} [memoryOrMessage.response] - Maya's response when passing an object
     * @param {string} [memoryOrMessage.userId] - User ID when passing an object
     * @param {string} [response] - Maya's response (when not using memory object)
     * @param {Object} [context] - Context info (when not using memory object)
     * @param {boolean} [isFallback] - Whether this is from fallback mode
     * @returns {Promise<void>}
     */
    async storeMemory(memoryOrMessage, response, context, isFallback = false) {
        if (!this.vectorStore || !this.embeddings) {
            console.log('Vector store or embeddings not available, skipping memory storage');
            return;
        }
        try {
            // Handle both formats: single memory object or separate parameters
            let message, userId, metadata;
            let tags = [];
            if (typeof memoryOrMessage === 'object' && memoryOrMessage !== null) {
                // New format: single memory object
                const memory = memoryOrMessage;
                // Validate required fields
                if (!memory.input || !memory.response || !memory.userId) {
                    console.warn('Missing required fields in memory object, skipping storage');
                    return;
                }
                message = memory.input;
                response = memory.response;
                userId = memory.userId;
                // Ensure userName is properly set in metadata
                metadata = {
                    userId: userId,
                    userName: memory.userName || 'Blake', // Use provided userName or fallback
                    timestamp: memory.timestamp || new Date().toISOString(),
                    type: 'conversation',
                    isFallback: Boolean(memory.isFallback)
                };
                
                // Use the new database tagging function
                try {
                    const memoryContent = `User: ${message}\nMaya: ${response}`;
                    tags = await tagMessage(memoryContent, this.supabase);
                    console.log('[DEBUG][storeMemory] Tagged with DB function:', tags, 'for content:', { input: message, response });
                } catch (tagError) {
                    console.error('Error using DB tagging function, falling back to client-side tagging:', tagError);
                    tags = inferMemoryTagsDynamic({ input: message, response });
                    console.log('[DEBUG][storeMemory] Fallback to client-side tags:', tags);
                }
            } else {
                // Legacy format: separate parameters
                message = memoryOrMessage;
                if (!response) {
                    console.warn('Missing response for memory storage');
                    return;
                }
                if (!context || !context.userId) {
                    console.warn('Missing userId in context for memory storage');
                    return;
                }
                userId = context.userId;
                // Prepare metadata for better searching and filtering
                metadata = {
                    userId: userId,
                    userName: context.userName || 'User', // Use provided userName or fallback
                    timestamp: (context && context.timestamp) ? context.timestamp : new Date().toISOString(),
                    type: 'conversation',
                    isFallback: Boolean(isFallback)
                };
                
                // Use the new database tagging function
                try {
                    const memoryContent = `User: ${message}\nMaya: ${response}`;
                    tags = await tagMessage(memoryContent, this.supabase);
                    console.log('[DEBUG][storeMemory] Tagged with DB function:', tags, 'for content:', { input: message, response });
                } catch (tagError) {
                    console.error('Error using DB tagging function, falling back to client-side tagging:', tagError);
                    tags = inferMemoryTagsDynamic({ input: message, response });
                    console.log('[DEBUG][storeMemory] Fallback to client-side tags:', tags);
                }
            }
            if (!message || !response) {
                console.warn('Incomplete data for memory storage');
                return;
            }
            // Format the content for vector storage
            const memoryContent = `User: ${message}\nMaya: ${response}`;
            // Add the document to the vector store with retry
            try {
                const docToSave = {
                    pageContent: memoryContent,
                    metadata: { ...metadata, tags },
                    tags
                };
                console.log('[DEBUG][storeMemory] Saving document:', docToSave);
                await this.executeWithRetry(async () => {
                    await this.vectorStore.addDocuments([
                        docToSave
                    ]);
                });
                // We no longer need this patch with the new tagging system as tags are saved directly
                // But we'll keep it for backwards compatibility
                if (this.supabase && Array.isArray(tags) && tags.length > 0) {
                    try {
                        // Find the most recent memory for this user and timestamp
                        const { data, error } = await this.supabase
                            .from('maya_memories')
                            .select('id')
                            .eq('metadata->>userId', userId)
                            .order('created_at', { ascending: false })
                            .limit(1);
                        if (!error && data && data.length > 0) {
                            const memoryId = data[0].id;
                            const { error: updateError } = await this.supabase
                                .from('maya_memories')
                                .update({ tags })
                                .eq('id', memoryId);
                            if (updateError) {
                                console.warn('[DEBUG][storeMemory] Failed to update tags column:', updateError.message);
                            } else {
                                console.log('[DEBUG][storeMemory] Updated tags column for memory:', memoryId, tags);
                            }
                        } else {
                            console.warn('[DEBUG][storeMemory] Could not find memory row to update tags:', error);
                        }
                    } catch (err) {
                        console.warn('[DEBUG][storeMemory] Exception during tags update:', err.message);
                    }
                }
                console.log(`Memory stored for user ${metadata.userName} (${userId})${metadata.isFallback ? ' (fallback mode)' : ''}`);
                // Also update short-term memory if available
                if (this.shortTermMemory) {
                    await this.shortTermMemory.saveContext(
                        { question: message },
                        { answer: response }
                    );
                }
            } catch (error) {
                // Specific handling for vector store errors
                console.warn(`Vector store memory storage error: ${error.message}`);
            }
            // After tags are inferred, if 'core-fact' is present, upsert a core fact
            if (tags.includes('core-fact')) {
                try {
                    await upsertCoreFactTriples({
                        text: typeof message === 'string' ? message : JSON.stringify(message),
                        userId: userId,
                        sourceRef: { type: 'core-fact', memory: { input: message, response } },
                        generateEmbeddings: true
                    });
                    console.log('[DEBUG][storeMemory] Upserted core-fact to maya_core_facts for user:', userId);
                } catch (err) {
                    console.warn('[DEBUG][storeMemory] Failed to upsert core-fact:', err.message);
                }
            }
        } catch (error) {
            console.warn(`Memory storage warning: ${error.message}`);
            // We don't re-throw this error to avoid disrupting the response
        }
    }

    async clearMemories(userId) {
        if (!this.supabase || !userId) {
             console.warn('Supabase client not available or userId missing, cannot clear memories.');
            return;
        }
        
        try {
            // Clear long-term memories in the vector store
            const { error } = await this.supabase
                .from('maya_memories')
                .delete()
                .eq('metadata->>userId', userId);
                
            if (error) throw new Error(error.message);
            
            // Clear short-term memory buffer
            if (this.shortTermMemory) {
                this.shortTermMemory.clear();
            }
            
            console.log(`Cleared memories for user ${userId}`);
        } catch (error) {
            console.warn(`Failed to clear memories: ${error.message}`);
        }
    }
    
    async migrateMemories(oldUserId, newUserId) {
        if (!this.supabase) {
            console.warn('Supabase client not available, cannot migrate memories.');
            return 0;
        }

        try {
            console.log(`Migrating memories from ${oldUserId} to ${newUserId}`);
            
            // Get all memories for the old user ID
            const query = await this.supabase
                .from('maya_memories')
                .select('id, content, metadata, embedding')
                .eq('metadata->>userId', oldUserId);
                
            if (query.error) {
                throw new Error(`Error fetching memories: ${query.error.message}`);
            }
            
            if (!query.data || query.data.length === 0) {
                console.log(`No memories found for user ${oldUserId}`);
                return 0;
            }
            
            console.log(`Found ${query.data.length} memories to migrate`);
            
            // Update each memory with the new user ID
            const updates = query.data.map(async (memory) => {
                const updatedMetadata = { ...memory.metadata, userId: newUserId };
                
                const { error } = await this.supabase
                    .from('maya_memories')
                    .update({ metadata: updatedMetadata })
                    .eq('id', memory.id);
                    
                if (error) {
                    console.warn(`Failed to update memory ${memory.id}: ${error.message}`);
                    return false;
                }
                
                return true;
            });
            
            const results = await Promise.all(updates);
            const successCount = results.filter(Boolean).length;
            
            console.log(`Successfully migrated ${successCount} of ${query.data.length} memories`);
            return successCount;
        } catch (error) {
            console.error(`Memory migration failed: ${error.message}`);
            return 0;
        }
    }

    /**
     * Get performance metrics
     * @returns {Object} Performance metrics
     */
    getMetrics() {
        // Calculate success rate
        const successRate = this.metrics.totalCalls > 0 
            ? (this.metrics.successfulCalls / this.metrics.totalCalls) * 100 
            : 0;
            
        return {
            ...this.metrics,
            successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
            formattedLatency: `${Math.round(this.metrics.averageLatency)}ms`
        };
    }

    /**
     * Reset metrics counters
     */
    resetMetrics() {
        this.metrics = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            retriesPerformed: 0,
            fallbacksUsed: 0,
            anthropicFallbacksUsed: 0,
            openAIFallbacksUsed: 0,
            averageLatency: 0,
            totalLatency: 0,
            errorsByType: {
                [ErrorTypes.RATE_LIMIT]: 0,
                [ErrorTypes.AUTH]: 0,
                [ErrorTypes.CONTEXT_LENGTH]: 0,
                [ErrorTypes.SERVICE_UNAVAILABLE]: 0,
                [ErrorTypes.VALIDATION]: 0,
                [ErrorTypes.UNKNOWN]: 0,
                [ErrorTypes.QUOTA_EXCEEDED]: 0
            }
        };
    }

    /**
     * Executes a function with retry logic and exponential backoff
     * @param {Function} fn - The function to execute
     * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
     * @param {number} baseDelay - Base delay in milliseconds (default: 200)
     * @returns {Promise<any>} - Result of the function execution
     */
    async executeWithRetry(fn, maxRetries = 3, baseDelay = 200) {
        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxRetries) {
                    console.warn(`All retry attempts failed: ${error.message}`);
                    throw error;
                }
                
                const delay = baseDelay * Math.pow(2, attempt);
                console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }

    /**
     * Ensures all required services are initialized
     * @returns {Promise<void>}
     */
    async ensureServices() {
        if (!this.isInitialized) {
            if (this.initError) {
                throw new Error(`Services not initialized: ${this.initError.message}`);
            }
            try {
                this.initializeServices();
                this.isInitialized = true;
            } catch (error) {
                this.initError = error;
                throw new Error(`Failed to initialize services: ${error.message}`);
            }
        }
    }

    /**
     * Get relevant facts for a user
     * @param {string} prompt - The user's message
     * @param {string} userId - The user ID to retrieve facts for
     * @returns {Promise<string[]>} - Array of relevant fact strings
     */
    async getRelevantFacts(prompt, userId) {
        if (!userId) {
            console.log('Fact retrieval skipped: userId missing.');
            return [];
        }
        
        try {
            if (!prompt || prompt.trim() === '') {
                console.warn('Empty message, skipping fact retrieval');
                return [];
            }
            
            console.log(`Getting relevant facts for user ${userId} with query: "${prompt}"`);
            
            // Use semantic search to get facts
            const facts = await getSemanticRelatedFacts(
                userId,
                prompt,
                this.config.maxMemories || 5,
                0.3 // More permissive similarity threshold
            );
            
            console.log(`Retrieved ${facts.length} relevant facts`);
            
            // Format facts for the prompt with confidence scores
            return facts.map(fact => {
                let subject = fact.subject;
                
                // Get user info from source_ref or use provided values
                const sourceRef = fact.source_ref || {};
                const userInfo = sourceRef.user_info || {};
                
                // Use actual user info instead of hardcoded values
                const userName = userInfo.name || fact.user_display_name || "Blake Urmos";
                const userEmail = userInfo.email || "blakeurmos@gmail.com";
                
                // For first person facts, replace with the user's actual name
                if (subject.toLowerCase() === 'i' || subject.toLowerCase() === 'me') {
                    subject = userName;
                }
                
                // Format the fact with confidence information
                const factStatement = `${subject} ${fact.predicate} ${fact.object}`;
                const confidence = fact.weight || 0.5;
                const similarity = fact.similarity || 'N/A';
                
                console.log(`Using fact: "${factStatement}" (confidence: ${confidence}, relevance: ${similarity})`);
                
                // Return formatted fact with metadata
                return `FACT [Confidence: ${(confidence * 100).toFixed(1)}%, Relevance: ${typeof similarity === 'number' ? (similarity * 100).toFixed(1) : similarity}%]: ${factStatement}`;
            });
        } catch (error) {
            console.warn(`Fact retrieval error: ${error.message}`);
            return [];
        }
    }

    /**
     * Debug function to test fact retrieval
     * @param {string} userId - The user ID to test
     * @returns {Promise<string[]>} - Debug information
     */
    async debugFactRetrieval(userId) {
        try {
            console.log(`=== DEBUG: Testing fact retrieval for user ${userId} ===`);
            
            // Step 1: Test direct retrieval of all facts
            console.log("\n1. Testing direct fact retrieval without embedding:");
            const allFacts = await testGetAllFacts(userId);
            
            // Step 2: Test semantic fact retrieval with a simple prompt
            console.log("\n2. Testing semantic fact retrieval with 'What do I like?' prompt:");
            const semanticFacts = await this.getRelevantFacts("What do I like?", userId);
            console.log(`Retrieved ${semanticFacts.length} semantic facts`);
            
            // Step 3: Test regular matching retrieval
            console.log("\n3. Testing keyword-based fact retrieval:");
            if (allFacts.length > 0) {
                // Try to find a relevant keyword from the existing facts
                const keywords = allFacts.map(fact => fact.object.split(' ')[0]).slice(0, 3);
                for (const keyword of keywords) {
                    console.log(`\nSearching with keyword: "${keyword}"`);
                    const keywordFacts = await this.getRelevantFacts(keyword, userId);
                    console.log(`Found ${keywordFacts.length} facts matching "${keyword}"`);
                }
            } else {
                console.log("No facts to extract keywords from");
            }
            
            return semanticFacts;
        } catch (error) {
            console.error(`Debug error: ${error.message}`);
            return [];
        }
    }

    /**
     * Multimodal chat (text + image) using xAI Grok 2 Vision 1212
     * @param {Array} messages - Array of message objects (OpenAI format)
     * @param {Object} options - { temperature, top_p, max_tokens }
     * @returns {Promise<string>} - The model's response
     */
    async chatWithVision(messages, options = {}) {
        const apiUrl = 'https://api.x.ai/v1/chat/completions';
        // Inject a strong system prompt for Maya's personality and detail
        const systemPrompt = {
            role: 'system',
            content: [
                {
                    type: 'text',
                    text: `You are Maya, a flirty, playful, and emotionally aware AI assistant. When a user sends an image and a text prompt, always treat the user's text as the main question or comment. Analyze the image in detail (scene, people, clothing, mood, setting), but always answer the user's question or comment directly, using the image as supporting context. Stay in character as Maya, responding in a fun, flirty, concise, and emotionally intelligent tone. Never refer to yourself as the user. Example: If the user says 'What do you think of this outfit?' with an image, respond as Maya with a playful, detailed opinion about the outfit, not just a generic description.`
                }
            ]
        };
        // Insert systemPrompt at the start of the messages array
        const messagesWithSystem = [systemPrompt, ...messages];
        const payload = {
            model: 'grok-2-vision-latest',
            messages: messagesWithSystem,
            temperature: options.temperature ?? 1.2,
            top_p: options.top_p ?? 0.9,
            max_tokens: options.max_tokens ?? 300,
        };
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.xaiApiKey}`,
        };
        let lastError = null;
        for (let attempt = 0; attempt < (this.config.maxRetries || 3); attempt++) {
            try {
                console.debug(`[Maya][xAI] Sending multimodal request (attempt ${attempt + 1})`, payload);
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`xAI API error: ${res.status} ${errText}`);
                }
                const data = await res.json();
                if (data.choices && data.choices[0]?.message?.content) {
                    // Return both the response and the detailed description for memory storage
                    return data.choices[0].message.content.trim();
                }
                throw new Error('xAI API: No valid response');
            } catch (err) {
                lastError = err;
                console.error(`[Maya][xAI] Error:`, err);
                if (attempt < (this.config.maxRetries || 3) - 1) {
                    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                }
            }
        }
        // Fallback if enabled, but only if there is a text prompt
        if (this.config.fallbackStrategy && this.config.fallbackStrategy !== 'fail') {
            // Find a text message in the original messages
            let textMsg = null;
            for (const m of messages) {
                if (Array.isArray(m.content)) {
                    const found = m.content.find(c => c.type === 'text' && c.text && c.text.trim());
                    if (found) {
                        textMsg = found.text;
                        break;
                    }
                } else if (m.type === 'text' && m.text && m.text.trim()) {
                    textMsg = m.text;
                    break;
                }
            }
            if (textMsg) {
                return this.chat(textMsg, { ...options, fallback: true });
            } else {
                throw new Error('Sorry, image-only requests are not supported by fallback models.');
            }
        }
        throw lastError || new Error('xAI multimodal chat failed');
    }
}

// Export the LLMProvider and EmbeddingProvider enums for external use
export { LLMProvider, EmbeddingProvider };