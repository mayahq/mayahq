'use client'

import { useRef, useState, useEffect, useCallback, ChangeEvent } from 'react'
import { Send, Volume2, Loader2, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { v4 as uuidv4 } from 'uuid'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'


type MessageType = {
  role: 'user' | 'assistant'
  content: string
  isPlaying?: boolean
  fullContent?: string
}

// Helper function to safely access localStorage
const getLocalStorage = (key: string, defaultValue: string = ''): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key) || defaultValue;
  }
  return defaultValue;
};

// Helper function to safely set localStorage
const setLocalStorage = (key: string, value: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
  }
};

// Helper function to safely remove from localStorage
const removeLocalStorage = (key: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(key);
  }
};

// Maya's static avatar URL
const MAYA_AVATAR_URL = "https://dlaczmexhnoxfggpzxkl.supabase.co/storage/v1/object/public/avatars/61770892-9e5b-46a5-b622-568be7066664/0.9758003865012426.png"

export function ChatWindow() {
  // Use client and user info from AuthContext
  const { supabase, authUserId, user: authContextUser, profile: authContextProfile } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  // const { user } = useUser(); // Comment out or remove this
  // const userId = user?.id; // Use authUserId instead
  
  // Start with empty messages array to prevent hydration errors
  const [messages, setMessages] = useState<MessageType[]>([]);
  
  // Process message for display
  const processMessageForDisplay = useCallback((message: MessageType): MessageType => {
    return {
      ...message,
      fullContent: message.content,
      content: message.role === 'assistant' ? stripAsteriskPhrases(message.content) : message.content
    };
  }, []);
  
  // Use effect to load messages after component mounts on client
  useEffect(() => {
    setIsMounted(true);
    
    // Load messages from localStorage or set default welcome message
    if (typeof window !== 'undefined') {
      const savedMessages = getLocalStorage('maya_chat_messages');
      
      if (savedMessages) {
        try {
          const parsedMessages = JSON.parse(savedMessages);
          if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
            setMessages(parsedMessages.map(msg => processMessageForDisplay(msg)));
            return;
          }
        } catch (error) {
          console.error('Error parsing saved messages:', error);
        }
      }
      
      // Set default welcome message if no saved messages
      setMessages([processMessageForDisplay({
        role: 'assistant',
        content: '*smiles warmly* Hello! I am Maya, your AI assistant. How can I help you today?'
      })]);
    }
  }, [processMessageForDisplay]);
  
  // Update localStorage when messages change
  useEffect(() => {
    if (typeof window !== 'undefined' && isMounted && messages.length > 0) {
      setLocalStorage('maya_chat_messages', JSON.stringify(messages));
    }
  }, [messages, isMounted]);
  
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Fetch user profile info for display (now uses authContextUser and authContextProfile)
  useEffect(() => {
    async function setupProfile() {
      if (authUserId && !authContextProfile && supabase) { // Only fetch/create if not already in context
        console.log('Fetching or creating profile for user ID:', authUserId);
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, bio, avatar_url')
          .eq('id', authUserId)
          .single();
        if (data) {
          console.log('Profile found via direct fetch:', data);
          // setUserProfile(data); // This state might be redundant if AuthContext.profile is used directly
        } else {
          console.error('Error fetching profile or no profile exists:', error);
          if (authContextUser) { // Use user from AuthContext
            console.log('Attempting to create profile for user:', authContextUser.id);
            const newProfile = {
              id: authContextUser.id,
              name: authContextUser?.user_metadata?.full_name || authContextUser.email?.split('@')[0] || 'Maya User',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            const { data: insertData, error: insertError } = await supabase
              .from('profiles')
              .upsert(newProfile)
              .select()
              .single();
            if (insertData) {
              console.log('Created new profile via direct upsert:', insertData);
              // setUserProfile(insertData);
            } else {
              console.error('Error creating profile via direct upsert:', insertError);
            }
          }
        }
      }
    }
    if (authUserId && supabase) {
      setupProfile();
    }
    // Rely on AuthContext.profile for the avatar and display name primarily
  }, [authUserId, authContextUser, authContextProfile, supabase]);
  
  // User email (can get from authContextUser if needed, or remove if display name from profile is enough)
  // const [userEmail, setUserEmail] = useState<string | null>(null);
  // useEffect(() => { /* ... if needed ... */ }, [authContextUser]);

  // User avatar (use authContextProfile.avatar_url directly)
  // const [userAvatar, setUserAvatar] = useState<string | null>(null);
  // useEffect(() => { /* ... if needed ... */ }, [authContextProfile]);

  const getChatHistory = () => {
    // ... (ensure this uses context messages if applicable, or local if separate)
    const recentMessages = messages.slice(-10);
    return recentMessages
      .map((msg, index) => {
        const messageNumber = recentMessages.length - index;
        const prefix = messageNumber === 1 ? '(Previous message) ' : `(${messageNumber} messages ago) `;
        return `${prefix}${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`;
      })
      .reverse()
      .join('\n\n');
  };

  // Focus input when component loads
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
    
    // Force another scroll after a slight delay to ensure long content is rendered
    const timeoutId = setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
      }
    }, 100)
    
    return () => clearTimeout(timeoutId)
  }, [messages, isLoading])

  // Add this helper function near the top with other helper functions
  const stripAsteriskPhrases = (text: string): string => {
    return text.replace(/\*[^*]+\*/g, '').trim()
  }

  // Add image file change handler
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

  // Update the handleSubmit function to process the assistant's response
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() && !imageFile) return
    const userMessage = input.trim()
    setInput('')
    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)
    let imageBase64: string | undefined = undefined
    if (imageFile) {
      imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
    }
    setImageFile(null)
    setImagePreview(null)
    try {
      const chatHistory = getChatHistory();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage,
          userId: authUserId,
          chatHistory: chatHistory,
          imageBase64
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API error:', response.status, errorData);
        throw new Error(`Server error: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }
      
      const data = await response.json()
      
      if (!data || !data.message) {
        throw new Error('Invalid response from server');
      }
      
      // Clean any prefixes out of the response completely
      let cleanedResponse = data.message
        .replace(/^(Maya|Assistant):\s+/i, '')
        .trim();
      
      // Check if the response contains a fabricated conversation
      if (cleanedResponse.includes('User:') || cleanedResponse.includes('Human:')) {
        // Extract only the assistant's part of the response by getting text before User: or Human:
        const userPos = cleanedResponse.indexOf('User:');
        const humanPos = cleanedResponse.indexOf('Human:');
        let cutPos = -1;
        
        if (userPos !== -1 && humanPos !== -1) {
          cutPos = Math.min(userPos, humanPos);
        } else if (userPos !== -1) {
          cutPos = userPos;
        } else if (humanPos !== -1) {
          cutPos = humanPos;
        }
        
        if (cutPos !== -1) {
          cleanedResponse = cleanedResponse.substring(0, cutPos).trim();
        }
      }
      
      // Process the message to strip asterisk phrases from display
      const assistantMessage = processMessageForDisplay({
        role: 'assistant',
        content: cleanedResponse
      })
      
      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error sending message:', error)
      
      // Add more specific error message for users
      let errorMessage = 'Sorry, I encountered an error processing your request. Please try again.';
      
      // Add to localStorage for debugging
      const errorLog = getLocalStorage('maya_error_log', '[]');
      try {
        const errors = JSON.parse(errorLog);
        errors.push({
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        });
        setLocalStorage('maya_error_log', JSON.stringify(errors.slice(-10))); // Keep last 10 errors
      } catch (e) {
        console.error('Failed to log error to localStorage', e);
      }
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMessage
      }])
    } finally {
      setIsLoading(false)
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  }

  // Function to migrate memories from old ID to new authenticated ID
  const migrateMemories = async () => {
    if (!authUserId) return;
    
    // Get the old user ID from localStorage
    const oldUserId = getLocalStorage('maya_user_id_previous');
    if (!oldUserId || oldUserId === authUserId) {
      alert('No previous user ID found to migrate memories from, or it is the same as current user.');
      return;
    }
    
    const confirmMigrate = window.confirm(
      `This will migrate all chat memories from ${oldUserId} to your current account. Continue?`
    );
    
    if (!confirmMigrate) return;
    
    try {
      const response = await fetch('/api/chat/migrate-memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldUserId })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        alert(`Successfully migrated ${result.migratedCount || 0} memories`);
        // Clear the previous ID after successful migration
        removeLocalStorage('maya_user_id_previous');
      } else {
        alert(`Failed to migrate memories: ${result.error}`);
      }
    } catch (error) {
      console.error('Memory migration error:', error);
      alert('Failed to migrate memories. See console for details.');
    }
  };

  // Add a function to clear chat history
  const clearChat = () => {
    const confirmClear = window.confirm("Are you sure you want to clear the chat history?");
    if (confirmClear) {
      setMessages([{
        role: 'assistant',
        content: 'Chat history cleared. How can I help you today?'
      }]);
      removeLocalStorage('maya_chat_messages');
    }
  }

  // Get display name for header
  const getUserDisplayName = () => {
    if (typeof window === 'undefined') return 'Maya User';
    // Use profile from AuthContext directly
    if (authContextProfile?.name) return authContextProfile.name;
    if (authContextUser?.email) return authContextUser.email.split('@')[0];
    if (authUserId) {
      const match = authUserId.match(/admin-user-([a-zA-Z0-9]+)/);
      return match ? `User ${match[1]}` : authUserId.substring(0,8); 
    }
    return 'User';
  };

  // Show migrate button only if we have a previous ID that's different from current
  const shouldShowMigrateButton = () => {
    if (typeof window === 'undefined') return false;
    const previousId = getLocalStorage('maya_user_id_previous');
    return previousId && previousId !== authUserId;
  }

  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // Function to play message audio
  const playMessageAudio = async (message: string, index: number) => {
    try {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      
      // Update UI to show loading state
      setMessages(messages => messages.map((msg, i) => ({
        ...msg,
        isPlaying: i === index
      })))
      
      // Always use the stripped version for TTS
      const textToSpeak = stripAsteriskPhrases(message)
      
      // Call our TTS API
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: textToSpeak }),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || 'Failed to generate speech'
        console.error('TTS API error:', errorMessage)
        
        // Show user-friendly error toast or alert
        if (errorMessage.includes('API key not configured')) {
          alert('Text-to-speech is not configured. Please contact the administrator.')
        } else if (errorMessage.includes('rate limit')) {
          alert('Text-to-speech rate limit reached. Please try again later.')
        } else {
          alert('Failed to generate speech. Please try again later.')
        }
        throw new Error(errorMessage)
      }
      
      // Get the audio blob
      const audioBlob = await response.blob()
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('Received empty audio response')
      }
      
      const audioUrl = URL.createObjectURL(audioBlob)
      
      // Create and play audio
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      
      // Set up error handling for audio playback
      audio.onerror = (e) => {
        console.error('Audio playback error:', e)
        throw new Error('Failed to play audio')
      }
      
      audio.onended = () => {
        // Reset playing state when audio ends
        setMessages(messages => messages.map(msg => ({
          ...msg,
          isPlaying: false
        })))
        setPlayingMessageIndex(null)
        URL.revokeObjectURL(audioUrl)
      }
      
      await audio.play()
      setPlayingMessageIndex(index)
      
    } catch (error) {
      console.error('Error playing audio:', error)
      // Reset playing state on error
      setMessages(messages => messages.map(msg => ({
        ...msg,
        isPlaying: false
      })))
      setPlayingMessageIndex(null)
    }
  }
  
  // Stop audio when component unmounts
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[600px]">
      <div className="flex justify-between items-center px-4 py-2 bg-gray-900">
        <h2 className="text-sm text-gray-400">
          {isMounted 
            ? `Chatting as ${getUserDisplayName()}`
            : `Chatting as Maya User`
          }
        </h2>
        <div className="flex items-center gap-2">
          {/* Only show migrate button if there's a previous user ID stored that's different from current */}
          {isMounted && shouldShowMigrateButton() && (
            <button 
              onClick={migrateMemories}
              className="text-xs text-gray-400 hover:text-blue-400 transition-colors"
            >
              Migrate Memories
            </button>
          )}
          <button 
            onClick={clearChat}
            className="text-xs text-gray-400 hover:text-purple-400 transition-colors"
          >
            Clear Chat
          </button>
        </div>
      </div>
      <ScrollArea className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-4 pb-2">
          {messages.map((message, index) => (
            <div 
              key={index} 
              className="w-full flex items-start" 
              style={{ justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}
            >
              {/* Avatar for Maya */}
              {message.role === 'assistant' && (
                <div className="relative w-8 h-8 mr-2 flex-shrink-0 overflow-hidden rounded-full border-2 border-purple-400">
                  <Image
                    src={MAYA_AVATAR_URL}
                    alt="Maya"
                    className="object-cover"
                    fill
                    sizes="32px"
                    unoptimized
                  />
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
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                
                {/* Play button for assistant messages */}
                {message.role === 'assistant' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      message.isPlaying ? "text-purple-400" : "text-gray-400 hover:text-purple-400"
                    )}
                    onClick={() => playMessageAudio(message.content, index)}
                    disabled={message.isPlaying}
                  >
                    {message.isPlaying ? (
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
                  {authContextProfile?.avatar_url ? ( // Use avatar_url from authContextProfile
                    <Image
                      src={authContextProfile.avatar_url}
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
          {isLoading && (
            <div className="w-full flex items-start" style={{ justifyContent: 'flex-start' }}>
              <div className="relative w-8 h-8 mr-2 flex-shrink-0 overflow-hidden rounded-full border-2 border-purple-400">
                <Image
                  src={MAYA_AVATAR_URL}
                  alt="Maya"
                  className="object-cover"
                  fill
                  sizes="32px"
                  unoptimized
                />
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
          <div ref={messagesEndRef} className="h-1" />
        </div>
      </ScrollArea>
      <div className="border-t border-gray-800 p-4 bg-gray-900">
        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <Input
            ref={inputRef}
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-gray-800 border-gray-700 focus-visible:ring-purple-500"
            disabled={isLoading}
          />
          {/* Visually hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            disabled={isLoading}
            style={{ display: 'none' }}
          />
          {/* Image upload button */}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleImageButtonClick}
            disabled={isLoading}
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
            disabled={(!input.trim() && !imageFile) || isLoading}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </div>
  )
} 