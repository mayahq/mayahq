import { Maya } from './maya-agent';
import { OpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { createClient } from '@supabase/supabase-js';

// Mock dependencies
jest.mock('@langchain/openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    predict: jest.fn().mockResolvedValue('Test response from direct LLM'),
  })),
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  })),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    data: [],
    error: null,
  })),
}));

jest.mock('@langchain/community/vectorstores/supabase', () => ({
  SupabaseVectorStore: jest.fn().mockImplementation(() => ({
    asRetriever: jest.fn().mockReturnValue({
      getRelevantDocuments: jest.fn().mockResolvedValue([
        { pageContent: 'Test memory 1', metadata: { id: '1' } },
        { pageContent: 'Test memory 2', metadata: { id: '2' } },
      ]),
    }),
  })),
}));

jest.mock('@langchain/community/chains', () => ({
  ConversationalRetrievalQAChain: {
    fromLLM: jest.fn().mockImplementation(() => ({
      invoke: jest.fn().mockResolvedValue('Test response from chain'),
    })),
  },
}));

describe('Maya Agent', () => {
  let maya;
  const mockConfig = {
    openAIApiKey: 'test-key',
    supabaseUrl: 'https://test.supabase.co',
    supabaseKey: 'test-supabase-key',
    userId: 'test-user',
    modelName: 'gpt-4',
    temperature: 0.7,
    maxMemories: 5
  };

  beforeEach(() => {
    jest.clearAllMocks();
    maya = new Maya(mockConfig);
  });

  test('should initialize with config', () => {
    expect(maya.config.openAIApiKey).toBe(mockConfig.openAIApiKey);
    expect(maya.config.supabaseUrl).toBe(mockConfig.supabaseUrl);
    expect(maya.config.supabaseKey).toBe(mockConfig.supabaseKey);
    expect(maya.config.modelName).toBe(mockConfig.modelName);
    expect(maya.isInitialized).toBe(true);
  });

  test('should throw error for invalid config', () => {
    expect(() => new Maya({})).toThrow('Missing required configuration');
    expect(() => new Maya({ 
      openAIApiKey: '', 
      supabaseUrl: '', 
      supabaseKey: '' 
    })).toThrow('Required configuration fields are empty');
  });

  test('should handle chat with conversation chain', async () => {
    // Mock the conversation chain to return a response
    maya.conversationChain = {
      invoke: jest.fn().mockResolvedValue('Test chain response')
    };
    
    // Also mock storeMemory to avoid actual storage calls
    maya.storeMemory = jest.fn().mockResolvedValue(null);
    
    const result = await maya.chat('Hello Maya', { userId: 'test-user' });
    
    expect(result).toBe('Test chain response');
    expect(maya.conversationChain.invoke).toHaveBeenCalled();
    expect(maya.storeMemory).toHaveBeenCalled();
  });

  test('should fall back to direct LLM call when chain fails', async () => {
    // Mock conversation chain to fail
    maya.conversationChain = {
      invoke: jest.fn().mockRejectedValue(new Error('Chain error'))
    };
    
    // Mock the direct LLM call
    maya.llm = {
      predict: jest.fn().mockResolvedValue('Fallback response')
    };
    
    // Mock storeMemory
    maya.storeMemory = jest.fn().mockResolvedValue(null);
    
    const result = await maya.chat('Hello with error', { userId: 'test-user' });
    
    expect(result).toBe('Fallback response');
    expect(maya.llm.predict).toHaveBeenCalled();
    expect(maya.metrics.fallbacksUsed).toBe(1);
  });

  test('should process context correctly', () => {
    const context = { userId: 'user-123', userName: 'Test User' };
    const processed = maya.processContext(context);
    
    expect(processed.userId).toBe('user-123');
    expect(processed.userName).toBe('Test User');
    expect(processed.timestamp).toBeDefined();
  });

  test('should clear memories', async () => {
    // Setup mocks
    const mockDelete = jest.fn().mockResolvedValue({ error: null });
    maya.supabase = {
      from: jest.fn().mockReturnValue({
        delete: mockDelete,
        eq: jest.fn().mockReturnThis()
      })
    };
    
    await maya.clearMemories('test-user');
    
    expect(maya.supabase.from).toHaveBeenCalledWith('maya_memories');
    expect(mockDelete).toHaveBeenCalled();
  });

  test('should track metrics', () => {
    // Check initial metrics
    expect(maya.metrics.totalCalls).toBe(0);
    expect(maya.metrics.successfulCalls).toBe(0);
    expect(maya.metrics.failedCalls).toBe(0);
    
    // Test metrics after successful call simulation
    maya.metrics.totalCalls++;
    maya.metrics.successfulCalls++;
    maya.metrics.totalLatency += 500;
    maya.metrics.averageLatency = maya.metrics.totalLatency / maya.metrics.successfulCalls;
    
    expect(maya.metrics.totalCalls).toBe(1);
    expect(maya.metrics.successfulCalls).toBe(1);
    expect(maya.metrics.averageLatency).toBe(500);
    
    // Get metrics
    const metrics = maya.getMetrics();
    expect(metrics.totalCalls).toBe(1);
  });
  
  test('should execute with retry logic', async () => {
    // Mock function that fails once then succeeds
    const mockOperation = jest.fn()
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockResolvedValueOnce('Success after retry');
    
    const result = await maya.executeWithRetry(mockOperation);
    
    expect(result).toBe('Success after retry');
    expect(mockOperation).toHaveBeenCalledTimes(2);
    expect(maya.metrics.retriesPerformed).toBe(1);
  });
  
  test('should give up after max retries', async () => {
    // Mock function that always fails
    const mockOperation = jest.fn()
      .mockRejectedValue(new Error('Persistent error'));
    
    await expect(maya.executeWithRetry(mockOperation))
      .rejects.toThrow('Persistent error');
    
    expect(mockOperation).toHaveBeenCalledTimes(maya.config.maxRetries);
    expect(maya.metrics.failedCalls).toBe(1);
  });
  
  test('should migrate memories between users', async () => {
    // Setup mocks
    const mockUpdate = jest.fn().mockResolvedValue({ error: null });
    maya.supabase = {
      from: jest.fn().mockReturnValue({
        update: mockUpdate,
        eq: jest.fn().mockReturnThis()
      })
    };
    
    await maya.migrateMemories('old-user-id', 'new-user-id');
    
    expect(maya.supabase.from).toHaveBeenCalledWith('maya_memories');
    expect(mockUpdate).toHaveBeenCalled();
  });
  
  test('should reset metrics', () => {
    // Set some metrics
    maya.metrics.totalCalls = 10;
    maya.metrics.successfulCalls = 8;
    maya.metrics.failedCalls = 2;
    maya.metrics.retriesPerformed = 3;
    
    // Call reset
    maya.resetMetrics();
    
    // Verify all metrics are reset
    expect(maya.metrics.totalCalls).toBe(0);
    expect(maya.metrics.successfulCalls).toBe(0);
    expect(maya.metrics.failedCalls).toBe(0);
    expect(maya.metrics.retriesPerformed).toBe(0);
    expect(maya.metrics.averageLatency).toBe(0);
  });
  
  test('should retrieve relevant memories', async () => {
    // Setup mock for vector store
    maya.vectorStore = {
      asRetriever: jest.fn().mockReturnValue({
        getRelevantDocuments: jest.fn().mockResolvedValue([
          { pageContent: 'Memory 1', metadata: { userId: 'test-user' } },
          { pageContent: 'Memory 2', metadata: { userId: 'test-user' } }
        ])
      }),
      similaritySearch: jest.fn().mockResolvedValue([
        { pageContent: 'Memory 1', metadata: { userId: 'test-user' } },
        { pageContent: 'Memory 2', metadata: { userId: 'test-user' } }
      ])
    };
    
    const memories = await maya.retrieveRelevantMemories('Test query', 'test-user');
    
    expect(memories.length).toBe(2);
    expect(memories).toContain('Memory 1');
    expect(memories).toContain('Memory 2');
    expect(maya.vectorStore.similaritySearch).toHaveBeenCalled();
  });
  
  test('should handle empty message in retrieveRelevantMemories', async () => {
    maya.vectorStore = {
      similaritySearch: jest.fn()
    };
    
    const memories = await maya.retrieveRelevantMemories('', 'test-user');
    
    expect(memories).toEqual([]);
    expect(maya.vectorStore.similaritySearch).not.toHaveBeenCalled();
  });
  
  test('should handle errors in memory migration', async () => {
    // First test - query error
    maya.supabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        error: { message: 'Query error' }
      })
    };
    
    const result1 = await maya.migrateMemories('old-user', 'new-user');
    expect(result1).toBe(0);
    
    // Second test - no memories found
    maya.supabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        data: []
      })
    };
    
    const result2 = await maya.migrateMemories('old-user', 'new-user');
    expect(result2).toBe(0);
    
    // Third test - update errors
    maya.supabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnValue({
          data: [
            { id: '1', metadata: { userId: 'old-user' } },
            { id: '2', metadata: { userId: 'old-user' } }
          ]
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            error: { message: 'Update error' }
          })
        })
      })
    };
    
    const result3 = await maya.migrateMemories('old-user', 'new-user');
    expect(result3).toBe(0);
  });
  
  test('should handle error in clearMemories', async () => {
    maya.supabase = {
      from: jest.fn().mockReturnValue({
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        error: { message: 'Delete error' }
      })
    };
    
    // Should not throw an error
    await expect(maya.clearMemories('test-user')).resolves.not.toThrow();
  });

  test('should retry failed executions with exponential backoff', async () => {
    // Mock a function that fails twice and succeeds on the third try
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockRejectedValueOnce(new Error('Second failure'))
      .mockResolvedValueOnce('Success');
    
    // Mock the delay function to avoid waiting in tests
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = jest.fn((callback) => callback());
    
    const result = await maya.executeWithRetry(mockFn, 3, 100);
    
    expect(mockFn).toHaveBeenCalledTimes(3);
    expect(result).toBe('Success');
    expect(global.setTimeout).toHaveBeenCalledTimes(2);
    
    // Restore original setTimeout
    global.setTimeout = originalSetTimeout;
  });
  
  test('should throw after exhausting all retry attempts', async () => {
    // Mock a function that always fails
    const mockFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));
    
    // Mock the delay function to avoid waiting in tests
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = jest.fn((callback) => callback());
    
    await expect(maya.executeWithRetry(mockFn, 3, 100))
      .rejects
      .toThrow('Persistent failure');
    
    expect(mockFn).toHaveBeenCalledTimes(3);
    expect(global.setTimeout).toHaveBeenCalledTimes(2);
    
    // Restore original setTimeout
    global.setTimeout = originalSetTimeout;
  });
}); 