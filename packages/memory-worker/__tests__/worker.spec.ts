import { processMessage } from '../src/process-message';
import { detectTasks, saveTasksFromMessage } from '../src/tasks';
import { generateEmbedding } from '../src/embeddings';

// Mock the embedding generator
jest.mock('../src/embeddings', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
}));

describe('Memory Worker', () => {
  // Mock message data
  const mockMessage = {
    id: 'msg-123',
    room_id: 'room-456',
    user_id: 'user-789',
    content: 'Remember to call Bob tomorrow #todo',
    role: 'user',
    created_at: new Date().toISOString(),
    metadata: {}
  };

  // Mock Supabase client
  const mockSupabase = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { id: 'mem-123' },
      error: null
    })
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Task Detection', () => {
    it('should detect #todo tags in messages', () => {
      const tasks = detectTasks('Remember to call Bob #todo');
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toBe('call Bob');
    });

    it('should detect multiple #todo tags', () => {
      const tasks = detectTasks('Buy milk #todo and call mom #todo');
      expect(tasks).toHaveLength(2);
      expect(tasks).toContain('call mom');
      expect(tasks).toContain('Buy milk');
    });

    it('should return empty array when no tasks detected', () => {
      const tasks = detectTasks('Just a regular message');
      expect(tasks).toHaveLength(0);
    });
  });

  describe('Message Processing', () => {
    it('should process a message and generate embedding', async () => {
      await processMessage(mockSupabase as any, mockMessage as any);
      
      // Should call generateEmbedding
      expect(generateEmbedding).toHaveBeenCalledWith(mockMessage.content);
      
      // Should update the message with embedding
      expect(mockSupabase.from).toHaveBeenCalledWith('messages');
      expect(mockSupabase.update).toHaveBeenCalled();
      
      // Should store in maya_memories
      expect(mockSupabase.from).toHaveBeenCalledWith('maya_memories');
      expect(mockSupabase.insert).toHaveBeenCalled();
    });

    it('should extract and save tasks from messages', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          error: null
        })
      });

      const result = await saveTasksFromMessage(
        'Remember to call Bob #todo', 
        'user-123',
        mockSupabase as any
      );
      
      expect(result).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
    });

    it('should not create tasks when none detected', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          error: null
        })
      });

      const result = await saveTasksFromMessage(
        'Just a regular message', 
        'user-123',
        mockSupabase as any
      );
      
      expect(result).toBe(false);
      // Should not call insert on tasks table
      expect(mockSupabase.from).not.toHaveBeenCalledWith('tasks');
    });
  });
}); 