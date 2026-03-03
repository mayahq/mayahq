'use client'

import { useRef, useState, useEffect, ChangeEvent } from 'react'
import { Send, Volume2, Loader2, Image as ImageIcon, Phone, PhoneOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'
import { useRoomMessages, sendMessage, Message as ChatMessage } from '@mayahq/chat-sdk'
import { v4 as uuidv4 } from 'uuid'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Textarea } from '@/components/ui/textarea'
import { AnimatePresence } from 'framer-motion'
import { VoiceChatInterface } from './voice-chat-interface'

// Add an environment-aware memory worker URL
const MEMORY_WORKER_URL = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002';
const MEMORY_WORKER_ENABLED = process.env.NEXT_PUBLIC_MEMORY_WORKER_ENABLED !== 'false';

// Maya's system user ID - should match the ID in environment variables
const MAYA_SYSTEM_USER_ID = process.env.NEXT_PUBLIC_MAYA_SYSTEM_USER_ID || '61770892-9e5b-46a5-b622-568be7066664';

export function ChatWindow() {
  // Use client and user info ONLY from AuthContext
  const { user, loading: userLoading, profile, supabase } = useAuth(); 
  
  // Room state - moved to top level
  const [roomId, setRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Refs - at top level
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isMounted = useRef(true)
  
  // Audio playback state
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null)
  
  // User interface state
  const [input, setInput] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [mayaAvatar, setMayaAvatar] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [waitingForMaya, setWaitingForMaya] = useState(false);
  const [showVoiceInterface, setShowVoiceInterface] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  
  // Use our chat SDK hook to get messages - pass the supabase client from AuthContext
  const { messages, loading: messagesLoading } = useRoomMessages(roomId, {
    // @ts-ignore - If type incompatibility persists, address ChatSDK or cast here
    supabaseClient: supabase 
  });

  // Debug messages updates
  useEffect(() => {
    console.log('[ChatWindow] Messages updated. Count:', messages?.length, 'Room:', roomId)
    if (messages && messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      console.log('[ChatWindow] Last message:', { 
        id: lastMessage.id, 
        role: lastMessage.role, 
        content: lastMessage.content.substring(0, 50) + '...' 
      })
    }
  }, [messages, roomId])

  // Auto-scroll to bottom when messages change or when loading completes
  useEffect(() => {
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ 
          behavior: 'smooth',
          block: 'end'
        })
      }
    }

    // Scroll when messages change (new message added)
    if (messages && messages.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 100)
    }

    // Also scroll when loading states change
    if (!loading && !messagesLoading) {
      setTimeout(scrollToBottom, 100)
    }
  }, [messages, loading, messagesLoading, sendingMessage, waitingForMaya])

  // Scroll to bottom on initial load when room is ready
  useEffect(() => {
    if (roomId && !loading && !messagesLoading) {
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ 
            behavior: 'auto', // No animation on initial load
            block: 'end'
          })
        }
      }, 200) // Slightly longer delay for initial load
    }
  }, [roomId, loading, messagesLoading])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Create or get a chat room once user is authenticated and supabase client is available
  useEffect(() => {
    if (!user?.id || !supabase) { // Check for supabase client from context
      if (!userLoading) {
        // console.log('ChatWindow: User not loaded or supabase client not available from AuthContext, returning.');
      }
      return;
    }
    
    const userId = user.id;
    console.log('User loaded, getting room with user ID:', userId);
    
    async function getOrCreateRoom() {
      try {
        // Look for an existing room
        const { data: rooms, error: roomsError } = await supabase
          .from('rooms')
          .select('*')
          .eq('user_id', userId)
          .order('last_message_at', { ascending: false })
          .limit(1);
        
        if (roomsError) {
          console.error('Error fetching rooms:', roomsError);
          setError('Failed to load chat rooms');
          setLoading(false);
          return;
        }
          
        if (rooms && rooms.length > 0 && rooms[0].id) {
          console.log('Found existing room:', rooms[0].id);
          setRoomId(rooms[0].id);
        } else {
          console.log('Creating new room for user:', userId);
          // Create a new room
          const { data, error: createError } = await supabase
            .from('rooms')
            .insert({
              name: 'Chat with Maya',
              user_id: userId
            })
            .select()
            .single();
            
          if (createError) {
            console.error('Error creating room:', createError);
            setError('Failed to create chat room');
            setLoading(false);
            return;
          }
            
          if (data && data.id) {
            console.log('Created new room:', data.id);
            setRoomId(data.id);
            
            // Add welcome message - using user_id to match trigger expectation
            const { error: welcomeError } = await supabase
              .from('messages')
              .insert({
                room_id: data.id,
                user_id: userId, // CRITICAL: Using user_id to match DB trigger
                content: '*smiles warmly* Hello! I am Maya, your AI assistant. How can I help you today?',
                role: 'assistant'
              });
              
            if (welcomeError) {
              console.error('Error adding welcome message:', welcomeError);
            }
          } else {
            console.error('Room created but no ID returned');
            setError('Error setting up chat - please refresh');
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Error in getOrCreateRoom:', err);
        setError('An error occurred setting up the chat');
      } finally {
        setLoading(false);
      }
    }
    
    getOrCreateRoom();
  }, [user, supabase, userLoading]); // Add supabase and userLoading to dependencies

  // Fetch Maya's avatar once supabase client is available
  useEffect(() => {
    if (!supabase) return; // Check for supabase client from context
    async function fetchMayaAvatar() {
      try {
        const { data: mayaProfile, error } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .eq('id', MAYA_SYSTEM_USER_ID)
          .single();
          
        if (error) {
          console.error('Error fetching Maya profile:', error);
          // Set a default avatar URL as fallback
          setMayaAvatar(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/maya-default.png`);
          return;
        }
        
        if (mayaProfile && mayaProfile.avatar_url) {
          console.log('Found Maya avatar URL:', mayaProfile.avatar_url);
          setMayaAvatar(mayaProfile.avatar_url);
        } else {
          console.log('Maya profile found but no avatar_url');
          setMayaAvatar(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/maya-default.png`);
        }
      } catch (error) {
        console.error('Error in fetchMayaAvatar:', error);
        setMayaAvatar(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/maya-default.png`);
      }
    }
    
    fetchMayaAvatar();
  }, [supabase]);
  
  // Focus input when component loads
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Image file change handler
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  // Trigger file input when image button is clicked
  const handleImageButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Auto-resize textarea height
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'; // Reset height to shrink if text is deleted
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  };

  // Handle Enter key for sending, Shift+Enter for new line
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent default newline on Enter
      if (input.trim() || imageFile) {
        handleSubmit(e as any); // Pass event, cast if necessary for form submission context
      }
    }
  };

  // Handle form submission using SDK's sendMessage function
  const handleSubmit = async (e: React.FormEvent) => {
    if (!supabase) {
      console.error('Chat handleSubmit: Supabase client from AuthContext is not available!');
      setError('Chat client not ready. Please refresh.');
      setSendingMessage(false);
      return;
    }
    console.log('[ChatWindow] Passing this supabase client to sendMessage. Type:', supabase?.constructor?.name);

    e.preventDefault()
    if (!input.trim() && !imageFile) return
    
    // Simple guard - fail fast if not ready
    if (!roomId || !user?.id) {
      console.error('Cannot send message - missing IDs:', { roomId, userId: user?.id });
      setError('Session not ready. Wait a second and try again.');
      setSendingMessage(false);
      return;
    }
    
    // GUARD AGAINST DOUBLE SUBMISSION
    if (sendingMessage) {
      console.warn('[ChatWindow] handleSubmit called while already sending message - ignoring');
      return;
    }
    
    // Generate unique submission ID for debugging
    const submissionId = uuidv4().substring(0, 8);
    console.log(`[ChatWindow] handleSubmit START - submission ID: ${submissionId}`);
    
    // Get user ID directly from user object - no transforms
    const userId = user.id;
    const userMessage = input.trim()
    setInput('')
    setSendingMessage(true)
    setError(null)
    
    try {
      // Debug raw values first
      console.log(`[ChatWindow] ${submissionId} - DEBUG IDs:`, {
        roomId: typeof roomId + ' → ' + roomId,
        userId: typeof userId + ' → ' + userId
      });
      
      // Use the SDK's sendMessage function with proper error handling
      console.log(`[ChatWindow] ${submissionId} - Calling SDK sendMessage...`);
      const { message: sentMessage, error: sendError } = await sendMessage({
        supabaseClient: supabase,
        roomId,
        userId,
        content: userMessage,
        imageFile,
        voiceMode: isVoiceMode
      } as any); // Type assertion to handle missing type

      if (sendError) {
        console.error(`[ChatWindow] ${submissionId} - Error from SDK sendMessage:`, sendError);
        throw sendError; // Propagate the error to be caught by the outer try-catch
      }

      if (!sentMessage || !sentMessage.id) {
        console.error(`[ChatWindow] ${submissionId} - SDK sendMessage did not return a message with an ID.`);
        throw new Error('Message sending failed to return a valid message ID.');
      }
      
      console.log(`[ChatWindow] ${submissionId} - Message sent successfully via SDK! ID: ${sentMessage.id}`);
      setWaitingForMaya(true);
      
      // Now call memory worker to process the message and generate response
      // This is needed since realtime subscription no longer processes user messages
      if (MEMORY_WORKER_ENABLED) {
        try {
          console.log(`[ChatWindow] ${submissionId} - Calling memory worker to process message and generate response...`);
          const response = await fetch(`${MEMORY_WORKER_URL}/process-message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: userMessage,
              userId,
              roomId,
              messageId: sentMessage.id // Use the ID from the successfully sent message
            }),
          });

          if (!response.ok) {
            console.error(`[ChatWindow] ${submissionId} - Memory worker response not ok:`, response.status, response.statusText);
          } else {
            console.log(`[ChatWindow] ${submissionId} - Memory worker processing initiated successfully`);
          }
        } catch (memoryError) {
          console.error(`[ChatWindow] ${submissionId} - Error calling memory worker:`, memoryError);
          // Don't show this error to user as the message was still sent successfully
        }
      } else {
        console.log(`[ChatWindow] ${submissionId} - Memory worker disabled, skipping processing call`);
      }
      
      setImageFile(null);
      setImagePreview(null);
      if (inputRef.current) inputRef.current.focus();
    } catch (error) {
      console.error(`[ChatWindow] ${submissionId} - Error sending message:`, error);
      
      if (error instanceof Error) {
        if (error.message.includes('uuid')) {
          setError('Invalid UUID: Please refresh the page and try again.');
        } else {
          setError(`Failed to send message: ${error.message}`);
        }
      } else {
        setError('Failed to send message. Please try again later.');
      }
    } finally {
      console.log(`[ChatWindow] ${submissionId} - handleSubmit END`);
      setSendingMessage(false);
      // Keep waitingForMaya true - we'll turn it off when a new message arrives
    }
  };

  // Listen for new messages to stop showing the waiting animation
  useEffect(() => {
    if (messages && messages.length > 0 && waitingForMaya) {
      // If we have a message from Maya that was created recently (last 5 seconds)
      const now = new Date();
      const recentMessages = messages.filter(msg => 
        msg.role === 'assistant' && 
        new Date(msg.created_at as string).getTime() > now.getTime() - 5000
      );
      
      if (recentMessages.length > 0) {
        setWaitingForMaya(false);
      }
    }
  }, [messages, waitingForMaya]);
  
  // Sync voice mode state with voice interface visibility
  useEffect(() => {
    setIsVoiceMode(showVoiceInterface);
  }, [showVoiceInterface]);
  
  // Auto-play assistant messages with audio when in voice mode
  useEffect(() => {
    if (!isVoiceMode || messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant') {
      const metadata = lastMessage.metadata as { audioUrl?: string } | undefined;
      if (metadata?.audioUrl && !playingMessageId) {
        // Small delay to ensure UI is ready
        setTimeout(() => {
          playMessageAudio(lastMessage);
        }, 100);
      }
    }
  }, [messages, isVoiceMode]);

  // Function to play message audio - with abort controller and mount checks
  const playMessageAudio = async (message: ChatMessage) => {
    // Create an abort controller to cancel fetch if component unmounts
    const abortController = new AbortController();
    
    try {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      // Update UI to show loading state
      setPlayingMessageId(message.id);
      
      // First check if message has audio URL in metadata (from voice mode)
      const metadata = message.metadata as { audioUrl?: string } | undefined;
      if (metadata?.audioUrl) {
        // Use pre-generated audio from voice mode
        const audio = new Audio(metadata.audioUrl);
        audioRef.current = audio;
        
        audio.onerror = (e) => {
          console.error('Audio playback error:', e);
          if (isMounted.current) {
            setPlayingMessageId(null);
          }
        };
        
        audio.onended = () => {
          if (isMounted.current) {
            setPlayingMessageId(null);
          }
        };
        
        await audio.play();
        return;
      }
      
      // Otherwise, generate TTS on demand (legacy mode)
      const textToSpeak = message.content;
      
      // Call our TTS API with abort signal
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: textToSpeak }),
        signal: abortController.signal
      });
      
      // Check if component is still mounted before continuing
      if (!isMounted.current) {
        return;
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || 'Failed to generate speech';
        console.error('TTS API error:', errorMessage);
        
        // Check if still mounted before showing alerts
        if (!isMounted.current) {
          return;
        }
        
        // Show user-friendly error toast or alert
        if (errorMessage.includes('API key not configured')) {
          alert('Text-to-speech is not configured. Please contact the administrator.');
        } else if (errorMessage.includes('rate limit')) {
          alert('Text-to-speech rate limit reached. Please try again later.');
        } else {
          alert('Failed to generate speech. Please try again later.');
        }
        throw new Error(errorMessage);
      }
      
      // Get the audio blob
      const audioBlob = await response.blob();
      
      // Check if component is still mounted
      if (!isMounted.current) {
        return;
      }
      
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('Received empty audio response');
      }
      
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Create and play audio
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      // Set up error handling for audio playback
      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        // Only update state if still mounted
        if (isMounted.current) {
          setPlayingMessageId(null);
        }
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.onended = () => {
        // Reset playing state when audio ends, only if mounted
        if (isMounted.current) {
          setPlayingMessageId(null);
        }
        URL.revokeObjectURL(audioUrl);
      };
      
      await audio.play();
      
    } catch (error) {
      // Ignore abort errors
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('Audio fetch aborted');
        return;
      }
      
      console.error('Error playing audio:', error);
      // Reset playing state on error, only if mounted
      if (isMounted.current) {
        setPlayingMessageId(null);
      }
    }
    
    return () => {
      // Cleanup function to abort fetch request
      abortController.abort();
    };
  };
  
  // Get display name for header
  const getUserDisplayName = () => {
    if (profile?.name) {
      return profile.name;
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    if (user && typeof user.id === 'string') {
      const match = user.id.match(/admin-user-([a-zA-Z0-9]+)/);
      return match ? `User ${match[1]}` : user.id;
    }
    return 'Maya User';
  };

  // Clear chat function with simple guard
  const clearChat = async () => {
    if (!roomId || !user?.id || !supabase) { // Check for supabase
       // ... error handling ...
      return;
    }
    
    const userId = user.id;
    
    const confirmClear = window.confirm("Are you sure you want to clear the chat history?");
    if (confirmClear) {
      try {
        console.log('[DEBUG clear chat]', { roomId, user_id: userId });
        
        // Delete existing messages
        await supabase
          .from('messages')
          .delete()
          .eq('room_id', roomId);
        
        // Add welcome message back
        await supabase
          .from('messages')
          .insert({
            room_id: roomId,
            user_id: userId, // CRITICAL: Using user_id to match DB trigger
            content: 'Chat history cleared. How can I help you today?',
            role: 'assistant'
          });
      } catch (error) {
        console.error('Error clearing chat:', error);
        alert('Failed to clear chat history. Please try again.');
      }
    }
  };

  // If we're loading the user, show a loading state
  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)] min-h-[600px] bg-gray-900">
        <div className="p-4 bg-gray-800 rounded-lg flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
          <span>Loading user session...</span>
        </div>
      </div>
    );
  }
  
  // No user after loading = auth error
  if (!user) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)] min-h-[600px] bg-gray-900">
        <div className="p-4 bg-red-900/50 text-red-200 rounded-lg max-w-md">
          <p className="font-bold mb-2">Authentication Error</p>
          <p>You need to be logged in to use the chat. Please try logging in again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[600px]">
      <div className="flex justify-between items-center px-4 py-2 bg-gray-900">
        <h2 className="text-sm text-gray-400">
          {`Chatting as ${getUserDisplayName()}`}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowVoiceInterface(!showVoiceInterface)}
            className={cn(
              "flex items-center gap-2 transition-colors",
              showVoiceInterface ? "text-purple-400" : "text-gray-400"
            )}
          >
            {showVoiceInterface ? (
              <PhoneOff className="h-4 w-4" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
            Voice Mode
          </Button>
          <button 
            onClick={clearChat}
            className="text-xs text-gray-400 hover:text-purple-400 transition-colors"
          >
            Clear Chat
          </button>
        </div>
      </div>
      <ScrollArea className="flex-1 p-4 overflow-y-auto">
        {error && (
          <div className="mb-4 p-2 bg-red-900/50 text-red-200 rounded text-sm">
            {error}
          </div>
        )}
        {loading && (
          <div className="mb-4 p-2 bg-purple-900/50 text-purple-200 rounded text-sm flex items-center">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span>Loading chat room...</span>
          </div>
        )}
        <div className="space-y-4 pb-2">
          {messages?.map((message) => (
            <div 
              key={message.id} 
              className="w-full flex items-start" 
              style={{ justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}
            >
              {/* Avatar for Maya */}
              {message.role === 'assistant' && (
                <div className="relative w-8 h-8 mr-2 flex-shrink-0 overflow-hidden rounded-full border-2 border-purple-400">
                  {mayaAvatar ? (
                    <Image
                      src={mayaAvatar}
                      alt="Maya"
                      className="object-cover"
                      fill
                      sizes="32px"
                      unoptimized
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs">
                      M
                    </div>
                  )}
                </div>
              )}
              
              {/* Message content */}
              <div className={cn(
                'flex flex-col space-y-2 max-w-[80%]',
                message.role === 'user' ? 'items-end' : 'items-start'
              )}>
                <div className={cn(
                  'rounded-lg px-4 py-2 max-w-prose',
                  message.role === 'assistant' 
                    ? 'bg-gray-800'
                    : 'bg-purple-600'
                )}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    className="prose prose-base prose-invert max-w-none text-gray-100"
                    components={{
                      a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300" />,
                      p: ({node, ...props}) => <p {...props} className="text-gray-100" />,
                      // You can add more custom components for other markdown elements (ul, li, code, etc.) if needed
                      // For example, to ensure list items also use the brighter text:
                      li: ({node, ...props}) => <li {...props} className="text-gray-100" />,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
                
                {/* Play button for assistant messages */}
                {message.role === 'assistant' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      playingMessageId === message.id ? "text-purple-400" : "text-gray-400 hover:text-purple-400"
                    )}
                    onClick={() => playMessageAudio(message)}
                    disabled={playingMessageId === message.id}
                  >
                    {playingMessageId === message.id ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Playing...</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3 h-3" />
                        <span>Play</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
              
              {/* Avatar for user */}
              {message.role === 'user' && (
                <div className="relative w-8 h-8 ml-2 flex-shrink-0 overflow-hidden rounded-full border-2 border-purple-500">
                  {profile?.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt="User"
                      className="object-cover"
                      fill
                      sizes="32px"
                      unoptimized
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs">
                      {getUserDisplayName().charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {messagesLoading && (
            <div className="w-full flex items-start" style={{ justifyContent: 'flex-start' }}>
              <div className="relative w-8 h-8 mr-2 flex-shrink-0 overflow-hidden rounded-full border-2 border-purple-400">
                {mayaAvatar ? (
                  <Image
                    src={mayaAvatar}
                    alt="Maya"
                    className="object-cover"
                    fill
                    sizes="32px"
                    unoptimized
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs">
                    M
                  </div>
                )}
              </div>
              <div className="bg-gray-800 text-gray-200 max-w-[80%] rounded-lg px-4 py-2">
                <div className="flex space-x-2">
                  <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"></div>
                </div>
              </div>
            </div>
          )}
          {waitingForMaya && !messagesLoading && (
            <div className="w-full flex items-start" style={{ justifyContent: 'flex-start' }}>
              <div className="relative w-8 h-8 mr-2 flex-shrink-0 overflow-hidden rounded-full border-2 border-purple-400">
                {mayaAvatar ? (
                  <Image
                    src={mayaAvatar}
                    alt="Maya"
                    className="object-cover"
                    fill
                    sizes="32px"
                    unoptimized
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs">
                    M
                  </div>
                )}
              </div>
              <div className="bg-gray-800 text-gray-200 max-w-[80%] rounded-lg px-4 py-2">
                <div className="flex space-x-2">
                  <div className="h-3 w-3 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="h-3 w-3 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="h-3 w-3 rounded-full bg-purple-400 animate-bounce"></div>
                </div>
              </div>
            </div>
          )}
          {sendingMessage && (
            <div className="w-full flex items-start" style={{ justifyContent: 'flex-end' }}>
              <div className="bg-purple-600/50 text-white max-w-[80%] rounded-lg px-4 py-2 flex items-center">
                <span className="mr-2">Sending</span>
                <Loader2 className="h-3 w-3 animate-spin" />
              </div>
              <div className="relative w-8 h-8 ml-2 flex-shrink-0 overflow-hidden rounded-full border-2 border-purple-500">
                {profile?.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt="User"
                    className="object-cover"
                    fill
                    sizes="32px"
                    unoptimized
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs">
                    {getUserDisplayName().charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-1" />
        </div>
      </ScrollArea>
      <div className="border-t border-gray-800 p-4 bg-gray-900">
        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <Textarea
            ref={inputRef}
            placeholder={!roomId || !user?.id ? "Loading session..." : "Type your message (Shift+Enter for new line)..."}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            className="flex-1 bg-gray-800 border-gray-700 focus-visible:ring-purple-500 resize-none overflow-y-auto min-h-[40px] max-h-[150px]"
            disabled={messagesLoading || !roomId || !user?.id || sendingMessage}
          />
          {/* Visually hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            disabled={messagesLoading || !roomId || !user?.id || sendingMessage}
            style={{ display: 'none' }}
          />
          {/* Image upload button */}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleImageButtonClick}
            disabled={messagesLoading || !roomId || !user?.id || sendingMessage}
            aria-label="Upload image"
            className="text-gray-400 hover:text-purple-500"
          >
            <ImageIcon className="h-5 w-5" />
          </Button>
          {imagePreview && (
            <img src={imagePreview} alt="Preview" className="w-10 h-10 object-cover rounded border border-purple-400" />
          )}
          <Button 
            type="submit" 
            size="icon" 
            variant="secondary" 
            disabled={(!input.trim() && !imageFile) || messagesLoading || !roomId || !user?.id || sendingMessage}
            aria-label="Send message"
          >
            {sendingMessage ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="sr-only">Send</span>
          </Button>
        </form>
        {(!user?.id || !roomId) && (
          <div className="mt-2 px-2 py-1 text-xs text-amber-400 bg-amber-900/20 rounded">
            Waiting for session to initialize... This can take a moment.
          </div>
        )}
      </div>
      
      {/* Voice Interface Overlay */}
      <AnimatePresence>
        {showVoiceInterface && (
          <VoiceChatInterface
            roomId={roomId || ''}
            userId={user?.id || ''}
            supabaseClient={supabase}
            messages={messages || []}
            mayaAvatar={mayaAvatar || undefined}
            onClose={() => {
              setShowVoiceInterface(false);
              setIsVoiceMode(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
} 