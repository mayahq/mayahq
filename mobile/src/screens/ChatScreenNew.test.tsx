import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ChatScreenNew from './ChatScreenNew';
import { useRoomMessages, sendMessage } from '@mayahq/chat-sdk';
import { useAuthContext } from '../auth/AuthProvider';
import { createClient } from '@mayahq/supabase-client';

// Mock the hooks and modules
jest.mock('@mayahq/chat-sdk', () => ({
  useRoomMessages: jest.fn(),
  sendMessage: jest.fn()
}));

jest.mock('../auth/AuthProvider', () => ({
  useAuthContext: jest.fn()
}));

jest.mock('@mayahq/supabase-client', () => ({
  createClient: jest.fn()
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn()
  })
}));

// Helper function to create a mock message
const createMockMessage = (id: string, content: string, role: 'user' | 'assistant') => ({
  id,
  content,
  role,
  room_id: 'room-123',
  user_id: 'user-123',
  created_at: new Date().toISOString()
});

describe('ChatScreenNew', () => {
  // Mock setup
  beforeEach(() => {
    // Mock supabase client
    (createClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: null
                })
              })
            })
          })
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { 
                id: 'room-123', 
                name: 'Chat with Maya',
                user_id: 'user-123'
              },
              error: null
            })
          })
        })
      })
    });

    // Mock auth context
    (useAuthContext as jest.Mock).mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' }
    });

    // Mock useRoomMessages hook
    (useRoomMessages as jest.Mock).mockReturnValue({
      messages: [],
      loading: false,
      error: null,
      addLocalMessage: jest.fn()
    });

    // Mock sendMessage function
    (sendMessage as jest.Mock).mockResolvedValue({
      message: createMockMessage('msg-123', 'Test message', 'user'),
      error: null
    });
  });

  test('renders correctly', async () => {
    const { getByText, getByPlaceholderText } = render(<ChatScreenNew />);
    
    // Verify header and input elements
    expect(getByText('Chat with Maya')).toBeTruthy();
    expect(getByPlaceholderText('Type a message...')).toBeTruthy();
  });

  test('shows loading state', async () => {
    // Mock loading state
    (useRoomMessages as jest.Mock).mockReturnValue({
      messages: [],
      loading: true,
      error: null,
      addLocalMessage: jest.fn()
    });

    const { getByText } = render(<ChatScreenNew />);
    
    // Verify loading text
    expect(getByText('Loading messages...')).toBeTruthy();
  });

  test('renders messages', async () => {
    // Mock messages
    const mockMessages = [
      createMockMessage('msg-1', 'Hello there', 'user'),
      createMockMessage('msg-2', 'How can I help you?', 'assistant')
    ];
    
    (useRoomMessages as jest.Mock).mockReturnValue({
      messages: mockMessages,
      loading: false,
      error: null,
      addLocalMessage: jest.fn()
    });

    const { getByText } = render(<ChatScreenNew />);
    
    // Verify messages are displayed
    expect(getByText('Hello there')).toBeTruthy();
    expect(getByText('How can I help you?')).toBeTruthy();
  });

  test('sends message', async () => {
    const { getByPlaceholderText, getByText } = render(<ChatScreenNew />);
    
    // Type a message
    const input = getByPlaceholderText('Type a message...');
    fireEvent.changeText(input, 'New test message');
    
    // Find the send button by its parent component (TouchableOpacity)
    const sendButton = getByText('');
    
    // Trigger send
    fireEvent.press(sendButton);
    
    // Verify sendMessage was called
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          content: 'New test message',
          role: 'user',
          roomId: 'room-123',
          userId: 'user-123'
        })
      );
    });
  });

  test('handles realtime message updates', async () => {
    // Initial render without messages
    const { rerender, getByText } = render(<ChatScreenNew />);
    
    // Update mock to add a new message as if received from realtime
    const updatedMessages = [
      createMockMessage('msg-new', 'Realtime message', 'assistant')
    ];
    
    (useRoomMessages as jest.Mock).mockReturnValue({
      messages: updatedMessages,
      loading: false,
      error: null,
      addLocalMessage: jest.fn()
    });
    
    // Rerender component
    rerender(<ChatScreenNew />);
    
    // Verify new message appears
    expect(getByText('Realtime message')).toBeTruthy();
  });
}); 