'use client'

/**
 * Maya Core v2.0 Chat Interface
 * Enhanced RAG with real-time updates and multimodal support
 */

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Send, Bot, User, X, Terminal, Mic, Image as ImageIcon, Plus, FileAudio, FileVideo, File, Sparkles, Volume2, Download } from 'lucide-react'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'
import { useRoomMessages } from '@mayahq/chat-sdk'
import ReactMarkdown from 'react-markdown'
import { v4 as uuidv4 } from 'uuid'
import { AnimatePresence } from 'framer-motion'
import { VoiceChat } from '@/components/voice-chat'

// Maya's system user ID - same as working admin/chat
const MAYA_SYSTEM_USER_ID = process.env.NEXT_PUBLIC_MAYA_SYSTEM_USER_ID || '61770892-9e5b-46a5-b622-568be7066664';
const ROOM_ID = 'b5906d59-847b-4635-8db7-611a38bde6d0'

export default function ChatPage() {
  // Use client and user info from AuthContext (same as working admin/chat)
  const { user, profile, supabase } = useAuth(); 
  
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showFullContext, setShowFullContext] = useState(true)
  const [mayaAvatar, setMayaAvatar] = useState<string | null>(null);
  const [waitingForMaya, setWaitingForMaya] = useState(false)
  const [rawContext, setRawContext] = useState<string | null>(null)
  const [showVoiceMode, setShowVoiceMode] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [roleplayLoading, setRoleplayLoading] = useState(false)
  const [activeRoleplaySession, setActiveRoleplaySession] = useState<{ id: string; scenarios: { id: string; name: string }[] } | null>(null)
  const [generatingTTS, setGeneratingTTS] = useState<string | null>(null)
  const [audioUrls, setAudioUrls] = useState<Map<string, string>>(new Map())

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastMessageCountRef = useRef(0)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)

  // Close attachment menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false)
      }
    }
    if (showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAttachMenu])
  
  // Use our chat SDK hook to get messages (same as working admin/chat)
  const {
    messages,
    loading: messagesLoading,
    subscriptionStatus,
    addLocalMessage,
    updateLocalMessage,
    removeLocalMessage
  } = useRoomMessages(ROOM_ID, {
    supabaseClient: supabase
  });

  // Auto-scroll to bottom of chat messages only
  const scrollToBottom = () => {
    setTimeout(() => {
      const chatContainer = document.getElementById('chat-messages-container')
      if (chatContainer && messagesEndRef.current) {
        chatContainer.scrollTop = chatContainer.scrollHeight
      }
    }, 100)
  }
  
  // Fetch Maya's avatar once supabase client is available (same as working admin/chat)
  useEffect(() => {
    if (!supabase) return;
    async function fetchMayaAvatar() {
      try {
        const { data: mayaProfile, error } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .eq('id', MAYA_SYSTEM_USER_ID)
          .single();
          
        if (error) {
          console.error('Error fetching Maya profile:', error);
          setMayaAvatar('/images/mayaportrait.jpg'); // Fallback
          return;
        }
        
        if (mayaProfile && mayaProfile.avatar_url) {
          console.log('Found Maya avatar URL:', mayaProfile.avatar_url);
          setMayaAvatar(mayaProfile.avatar_url);
        } else {
          setMayaAvatar('/images/mayaportrait.jpg'); // Fallback
        }
      } catch (error) {
        console.error('Error in fetchMayaAvatar:', error);
        setMayaAvatar('/images/mayaportrait.jpg'); // Fallback
      }
    }
    
    fetchMayaAvatar();
  }, [supabase]);

  // Debug messages updates (same as working admin/chat)
  useEffect(() => {
    console.log('[TestV2] Messages updated. Count:', messages?.length, 'Room:', ROOM_ID)
    if (messages && messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      console.log('[TestV2] Last message:', { 
        id: lastMessage.id, 
        role: lastMessage.role, 
        content: (lastMessage.content || '').substring(0, 50) + '...'
      })
      
      console.log('[Chat] Messages loaded:', messages.length)
    }
  }, [messages, ROOM_ID])

  // Auto-scroll when messages change or when loading completes (same as working admin/chat)
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(scrollToBottom, 100)
    }
    if (!loading && !messagesLoading) {
      setTimeout(scrollToBottom, 100)
    }
  }, [messages, loading, messagesLoading])

  // Stop typing indicator when new Maya message arrives
  useEffect(() => {
    if (!waitingForMaya || !messages || messages.length === 0) return

    // Check if we got a new assistant message
    const currentMessageCount = messages.length
    if (currentMessageCount > lastMessageCountRef.current) {
      const lastMessage = messages[messages.length - 1]

      // Stop typing if latest message is from Maya (assistant)
      if (lastMessage.role === 'assistant') {
        console.log('Maya responded, stopping typing indicator')
        setWaitingForMaya(false)

        // Auto-detect roleplay offer from cron or other sources
        const meta = lastMessage.metadata as any
        if (meta?.roleplay_offer && meta?.scenarios && !activeRoleplaySession) {
          // Find the session ID from the database (look for pending session)
          fetch('/api/roleplay/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: ROOM_ID }),
          }).then(r => r.json()).then(data => {
            if (data.success && data.session && data.reused) {
              setActiveRoleplaySession({
                id: data.session.id,
                scenarios: meta.scenarios,
              })
            }
          }).catch(() => {})
        }
      }
    }

    lastMessageCountRef.current = currentMessageCount
  }, [messages, waitingForMaya])

  const generateRoleplayTTS = async (messageId: string, text: string) => {
    if (generatingTTS) return
    setGeneratingTTS(messageId)
    try {
      const response = await fetch('/api/roleplay/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, text }),
      })
      if (!response.ok) {
        const errorText = await response.text()
        console.error('[TTS] Error:', response.status, errorText)
        alert(response.status === 504
          ? 'Audio generation timed out — try a shorter message'
          : `Failed to generate audio (${response.status})`)
        return
      }
      const data = await response.json()
      if (data.audioUrl) {
        setAudioUrls(prev => new Map(prev).set(messageId, data.audioUrl))
      } else {
        alert('Failed to generate audio: no URL returned')
      }
    } catch (error) {
      console.error('[TTS] Error:', error)
      alert('Failed to generate audio')
    } finally {
      setGeneratingTTS(null)
    }
  }

  const startRoleplay = async () => {
    console.log('[Roleplay] Button clicked. roleplayLoading:', roleplayLoading, 'loading:', loading)
    if (roleplayLoading) return
    setRoleplayLoading(true)
    try {
      const response = await fetch('/api/roleplay/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: ROOM_ID }),
      })
      console.log('[Roleplay] Response status:', response.status)
      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Roleplay] API error:', response.status, errorText)
        alert(`Roleplay failed: ${response.status}`)
        return
      }
      const data = await response.json()
      console.log('[Roleplay] Response data:', data)
      if (data.success && data.session) {
        setActiveRoleplaySession({
          id: data.session.id,
          scenarios: data.scenarios || (data.session.metadata as any)?.scenarios || [],
        })
      } else {
        console.warn('[Roleplay] No session in response:', data)
      }
    } catch (error) {
      console.error('[Roleplay] Error starting roleplay:', error)
      alert('Failed to start roleplay — check console')
    } finally {
      setRoleplayLoading(false)
    }
  }

  const sendMessage = async () => {
    if ((!input.trim() && selectedFiles.length === 0) || loading) return

    const userMessage = input.trim() || 'Sent an image'
    const tempId = uuidv4()
    const hasFiles = selectedFiles.length > 0

    // 1. OPTIMISTIC UPDATE - Show user message immediately
    addLocalMessage({
      id: tempId,
      content: userMessage,
      role: 'user',
      user_id: user?.id || '',
      room_id: ROOM_ID,
      created_at: new Date().toISOString(),
      isPending: true,
      metadata: hasFiles ? { attachments: selectedFiles.map(f => ({ type: f.type, name: f.name, size: f.size })) } : undefined
    } as any)

    const filesToUpload = [...selectedFiles] // Store files before clearing
    setInput('')
    setSelectedFiles([]) // Clear files after storing
    setLoading(true)

    try {
      let mayaPromise: Promise<Response>

      // If there's an active roleplay session, route to choose endpoint
      if (activeRoleplaySession && !hasFiles) {
        setWaitingForMaya(true)
        const roleplayPromise = fetch('/api/roleplay/choose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: activeRoleplaySession.id,
            choice: userMessage,
            roomId: ROOM_ID,
          }),
        })

        roleplayPromise.then(async response => {
          removeLocalMessage(tempId)
          if (!response.ok) {
            console.error('Roleplay choose error')
            setWaitingForMaya(false)
            return
          }
          const data = await response.json()
          if (data.success) {
            setActiveRoleplaySession(null) // Clear active session
            setTimeout(scrollToBottom, 200)
          }
          setWaitingForMaya(false)
        }).catch(err => {
          console.error('Roleplay choose error:', err)
          removeLocalMessage(tempId)
          setWaitingForMaya(false)
        })

        setLoading(false)
        return
      }

      if (hasFiles) {
        // Send with files using FormData
        const formData = new FormData()
        formData.append('message', userMessage)
        formData.append('roomId', ROOM_ID)
        formData.append('mobileAuthUserId', user?.id || '')
        formData.append('userName', user?.email || 'User')

        // Add each file
        filesToUpload.forEach((file, index) => {
          formData.append(`file_${index}`, file)
        })

        mayaPromise = fetch('/api/maya-chat-v3', {
          method: 'POST',
          headers: {
            'X-Maya-Mobile-App': 'true'
          },
          body: formData
        })
      } else {
        // Send text-only with JSON
        mayaPromise = fetch('/api/maya-chat-v3', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Maya-Mobile-App': 'true'
          },
          body: JSON.stringify({
            message: userMessage,
            roomId: ROOM_ID,
            mobileAuthUserId: user?.id,
            userName: user?.email || 'User'
          })
        })
      }

      // Show typing indicator
      setWaitingForMaya(true)

      // Handle Maya response in background (don't await - let realtime show the message)
      mayaPromise.then(async response => {
        if (!response.ok) {
          console.error('Maya API error - check if service is running')
          removeLocalMessage(tempId)
          setWaitingForMaya(false)
          return
        }

        const data = await response.json()

        // Remove optimistic message - realtime will add the real one
        removeLocalMessage(tempId)

        // Store the raw context/system prompt if available
        if (data.processing?.rawContext) {
          setRawContext(data.processing.rawContext)
        }

        if (data.mayaResponse) {
          setStats(data.processing)
          setTimeout(scrollToBottom, 200)
        } else {
          console.error('Maya API error', data)
        }
      }).catch(err => {
        console.error('Maya API error:', err)
        removeLocalMessage(tempId)
        setWaitingForMaya(false)
      })

    } catch (error) {
      console.error('Error in sendMessage:', error)

      // Remove failed optimistic message
      removeLocalMessage(tempId)
      setWaitingForMaya(false)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB to stay under Vercel's 4.5MB limit
      const MAX_TOTAL_SIZE = 4 * 1024 * 1024 // 4MB total for all files

      // Check individual file sizes
      const oversizedFiles = files.filter(f => f.size > MAX_FILE_SIZE)
      if (oversizedFiles.length > 0) {
        alert(`Some files are too large. Maximum file size is 4MB.\nLarge files: ${oversizedFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`).join(', ')}`)
        return
      }

      // Check total size
      const currentSize = selectedFiles.reduce((sum, f) => sum + f.size, 0)
      const newSize = files.reduce((sum, f) => sum + f.size, 0)
      if (currentSize + newSize > MAX_TOTAL_SIZE) {
        alert(`Total file size would exceed 4MB limit. Current: ${(currentSize / 1024 / 1024).toFixed(1)}MB, Adding: ${(newSize / 1024 / 1024).toFixed(1)}MB`)
        return
      }

      setSelectedFiles(prev => [...prev, ...files])
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // Create and clean up object URLs for image thumbnails
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<File, string>>(new Map())

  useEffect(() => {
    const newUrls = new Map<File, string>()
    for (const file of selectedFiles) {
      if (file.type.startsWith('image/')) {
        const existing = thumbnailUrls.get(file)
        if (existing) {
          newUrls.set(file, existing)
        } else {
          newUrls.set(file, URL.createObjectURL(file))
        }
      }
    }
    // Revoke URLs for removed files
    for (const [file, url] of thumbnailUrls) {
      if (!newUrls.has(file)) {
        URL.revokeObjectURL(url)
      }
    }
    setThumbnailUrls(newUrls)
    // Cleanup all on unmount
    return () => {
      // Only cleanup on true unmount (selectedFiles going empty is handled above)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiles])

  // Get display name for user
  const getUserDisplayName = () => {
    if (profile?.name) return profile.name;
    if (user?.email) return user.email.split('@')[0];
    return 'User';
  };

  const runHealthCheck = async () => {
    try {
      const response = await fetch('/api/maya-chat-v3')
      const data = await response.json()
      
      if (response.ok) {
        alert(`Maya v${data.version} is ${data.status}!\n\nArchitecture: ${data.architecture}\nService: ${data.serviceUrl}\n\nMaya Status:\n${JSON.stringify(data.maya, null, 2)}`)
      } else {
        alert(`Health check failed: ${data.error}`)
      }
    } catch (error: any) {
      alert(`Health check error: ${error.message}`)
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6" />
            Chat with Maya
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowFullContext(!showFullContext)}>
              <Terminal className="w-4 h-4 mr-1" />
              {showFullContext ? 'Hide' : 'Show'} Full Context
            </Button>
            <Button variant="outline" size="sm" onClick={runHealthCheck}>
              Health Check
            </Button>
          </div>
        </div>
        
        {/* Main Chat Interface */}
        <div className="w-full">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                Chat with Maya ({messages?.length || 0} messages)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Messages */}
              <div className="h-[600px] overflow-y-auto mb-4 space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg" id="chat-messages-container">
                {(!messages || messages.length === 0) && !messagesLoading && (
                  <div className="text-center text-gray-500 dark:text-gray-400 mt-32">
                    <Bot className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Chat with Maya</p>
                    <p className="text-sm mt-2">Enhanced RAG • Image Memory • Context-Aware Temperature</p>
                  </div>
                )}
                
                {messages?.map((message, index) => {
                  // Extract image attachments
                  const imageAttachments = message.metadata && typeof message.metadata === 'object' && 'attachments' in message.metadata && Array.isArray((message.metadata as any).attachments)
                    ? ((message.metadata as any).attachments as any[]).filter((att: any) =>
                        att.type?.startsWith('image/') || att.type === 'image' || att.mimeType?.startsWith('image/')
                      )
                    : [];

                  const hasImages = imageAttachments.length > 0 || message.media_path;
                  const hasText = message.content && message.content.trim().length > 0;

                  return (
                    <div key={message.id || index} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
                      {/* Maya Avatar */}
                      {message.role === 'assistant' && (
                        <div className="flex-shrink-0">
                          <div className="relative w-10 h-10 overflow-hidden rounded-full border-2 border-purple-400">
                            {mayaAvatar ? (
                              <Image
                                src={mayaAvatar}
                                alt="Maya"
                                className="object-cover"
                                fill
                                sizes="40px"
                                unoptimized
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs">
                                M
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Message Content */}
                      <div className="max-w-[70%] flex flex-col gap-2">
                        {/* Images - no background, just rounded corners */}
                        {hasImages && (
                          <div className="flex flex-col gap-2">
                            {message.media_path && (
                              <div className="rounded-2xl overflow-hidden shadow-lg">
                                <Image
                                  src={message.media_path}
                                  alt="Attachment"
                                  width={400}
                                  height={300}
                                  className="object-cover w-full h-auto"
                                  unoptimized
                                />
                              </div>
                            )}
                            {imageAttachments.map((attachment: any, idx: number) => (
                              <div key={idx} className="rounded-2xl overflow-hidden shadow-lg">
                                <Image
                                  src={attachment.publicUrl || attachment.url}
                                  alt={attachment.name || 'Image'}
                                  width={400}
                                  height={300}
                                  className="object-cover w-full h-auto"
                                  unoptimized
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Text Content - with background card */}
                        {hasText && (
                          <div className={`rounded-2xl p-4 ${
                            message.role === 'user'
                              ? 'bg-blue-600 text-white shadow-lg'
                              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                          }`}>
                            {/* Non-image attachments */}
                            {message.metadata && typeof message.metadata === 'object' && 'attachments' in message.metadata && Array.isArray((message.metadata as any).attachments) && (
                              <div className="mb-3">
                                {((message.metadata as any).attachments as any[]).map((attachment: any, idx: number) => {
                                  const isImage = attachment.type?.startsWith('image/') || attachment.type === 'image' || attachment.mimeType?.startsWith('image/');

                                  if (isImage) return null; // Already rendered above

                                  if (attachment.type === 'audio' || attachment.mimeType?.startsWith('audio/')) {
                                    return (
                                      <div key={idx} className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-900 rounded-lg mb-2">
                                        <Mic className="w-4 h-4 opacity-60" />
                                        <span className="text-xs truncate">{attachment.name || 'Audio'}</span>
                                      </div>
                                    )
                                  } else {
                                    return (
                                      <div key={idx} className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-900 rounded-lg mb-2">
                                        <Paperclip className="w-4 h-4 opacity-60" />
                                        <span className="text-xs truncate">{attachment.name || 'File'}</span>
                                      </div>
                                    )
                                  }
                                })}
                              </div>
                            )}

                            {/* Markdown content */}
                            <div className={`text-sm leading-relaxed ${
                              message.role === 'user' ? 'prose-invert' : ''
                            }`}>
                              {message.role === 'assistant' ? (
                                <ReactMarkdown
                                  className="prose prose-sm dark:prose-invert max-w-none"
                                  components={{
                                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                    ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                                    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                                    li: ({ children }) => <li className="mb-1">{children}</li>,
                                    h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                                    h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                                    h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                                    code: ({ className, children, ...props }) => {
                                      const match = /language-(\w+)/.exec(className || '')
                                      const isInline = !match
                                      return isInline ? (
                                        <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded text-xs" {...props}>
                                          {children}
                                        </code>
                                      ) : (
                                        <pre className="bg-gray-100 dark:bg-gray-900 p-2 rounded-lg overflow-x-auto mb-2">
                                          <code className="text-xs" {...props}>
                                            {children}
                                          </code>
                                        </pre>
                                      )
                                    },
                                    blockquote: ({ children }) => (
                                      <blockquote className="border-l-2 border-gray-300 dark:border-gray-600 pl-3 italic mb-2">
                                        {children}
                                      </blockquote>
                                    ),
                                    a: ({ href, children }) => (
                                      <a href={href} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
                                        {children}
                                      </a>
                                    ),
                                    strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                                    em: ({ children }) => <em className="italic">{children}</em>,
                                  }}
                                >
                                  {message.content}
                                </ReactMarkdown>
                              ) : (
                                <p className="whitespace-pre-wrap">{message.content}</p>
                              )}
                            </div>

                            <div className="flex items-center justify-between mt-2">
                              <p className="text-xs opacity-60">
                                {new Date(message.created_at as string).toLocaleTimeString()}
                              </p>
                            </div>

                            {/* Roleplay TTS Audio Player */}
                            {message.role === 'assistant' && ((message.metadata as any)?.roleplay === true) && (() => {
                              const metaAudioUrl = (message.metadata as any)?.audioUrl
                              const localAudioUrl = audioUrls.get(message.id)
                              const audioUrl = localAudioUrl || metaAudioUrl

                              if (audioUrl) {
                                return (
                                  <div className="mt-3 flex items-center gap-2 bg-gray-900/60 rounded-lg p-2">
                                    <audio
                                      controls
                                      src={audioUrl}
                                      className="h-8 flex-1 min-w-0"
                                      style={{ colorScheme: 'dark' }}
                                    />
                                    <a
                                      href={audioUrl}
                                      download={`maya-roleplay-${message.id}.mp3`}
                                      className="flex-shrink-0 p-1.5 rounded-md hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                      title="Download audio"
                                    >
                                      <Download className="w-4 h-4" />
                                    </a>
                                  </div>
                                )
                              }

                              return (
                                <div className="mt-3">
                                  <button
                                    onClick={() => generateRoleplayTTS(message.id, message.content)}
                                    disabled={generatingTTS !== null}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {generatingTTS === message.id ? (
                                      <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Generating audio...
                                      </>
                                    ) : (
                                      <>
                                        <Volume2 className="w-3.5 h-3.5" />
                                        Generate Audio
                                      </>
                                    )}
                                  </button>
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    
                      {/* User Avatar */}
                      {message.role === 'user' && (
                        <div className="flex-shrink-0">
                          <div className="relative w-10 h-10 overflow-hidden rounded-full border-2 border-blue-500">
                            {profile?.avatar_url ? (
                              <Image
                                src={profile.avatar_url}
                                alt="User"
                                className="object-cover"
                                fill
                                sizes="40px"
                                unoptimized
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs">
                                {getUserDisplayName().charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Typing indicator - shown while waiting for Maya's response */}
                {waitingForMaya && (
                  <div className="flex justify-start gap-3">
                    <div className="flex-shrink-0">
                      <div className="relative w-10 h-10 overflow-hidden rounded-full border-2 border-purple-400">
                        {mayaAvatar ? (
                          <Image
                            src={mayaAvatar}
                            alt="Maya"
                            className="object-cover"
                            fill
                            sizes="40px"
                            unoptimized
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs">
                            M
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                        <span className="text-sm text-gray-600 dark:text-gray-300">Maya is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Auto-scroll anchor */}
                <div ref={messagesEndRef} />
              </div>

              {/* File Preview */}
              {selectedFiles.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {selectedFiles.map((file, index) => {
                    const thumbUrl = thumbnailUrls.get(file)
                    if (thumbUrl) {
                      // Image thumbnail preview
                      return (
                        <div key={index} className="relative group">
                          <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbUrl}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <button
                            onClick={() => removeFile(index)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 dark:bg-gray-600 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    }
                    // Non-image file chip
                    return (
                      <div key={index} className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-full px-3 py-1.5">
                        {file.type.startsWith('audio/') ? <FileAudio className="w-3.5 h-3.5 text-green-500" /> :
                         file.type.startsWith('video/') ? <FileVideo className="w-3.5 h-3.5 text-purple-500" /> :
                         <File className="w-3.5 h-3.5 text-gray-500" />}
                        <span className="text-sm text-gray-700 dark:text-gray-300 max-w-[150px] truncate">{file.name}</span>
                        <button
                          onClick={() => removeFile(index)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Hidden file inputs */}
              <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
              <input ref={audioInputRef} type="file" accept="audio/*" multiple onChange={handleFileSelect} className="hidden" />
              <input ref={videoInputRef} type="file" accept="video/*" multiple onChange={handleFileSelect} className="hidden" />
              <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />

              {/* Unified Input Bar */}
              <div className="relative flex items-end gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                {/* Plus button with attachment menu */}
                <div className="relative" ref={attachMenuRef}>
                  <button
                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    disabled={loading}
                  >
                    <Plus className={`w-5 h-5 text-gray-600 dark:text-gray-300 transition-transform ${showAttachMenu ? 'rotate-45' : ''}`} />
                  </button>

                  {/* Attachment menu popup */}
                  {showAttachMenu && (
                    <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-2 min-w-[160px] z-10">
                      <button
                        onClick={() => { imageInputRef.current?.click(); setShowAttachMenu(false) }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
                      >
                        <ImageIcon className="w-5 h-5 text-blue-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Photo</span>
                      </button>
                      <button
                        onClick={() => { audioInputRef.current?.click(); setShowAttachMenu(false) }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
                      >
                        <FileAudio className="w-5 h-5 text-green-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Audio</span>
                      </button>
                      <button
                        onClick={() => { videoInputRef.current?.click(); setShowAttachMenu(false) }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
                      >
                        <FileVideo className="w-5 h-5 text-purple-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Video</span>
                      </button>
                      <button
                        onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false) }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
                      >
                        <File className="w-5 h-5 text-gray-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">File</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Text input */}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Message Maya..."
                  className="flex-1 bg-transparent border-0 resize-none text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-0 text-sm py-2.5 px-1 min-h-[40px] max-h-[120px]"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items
                    if (!items) return
                    const imageFiles: File[] = []
                    for (const item of Array.from(items)) {
                      if (item.type.startsWith('image/')) {
                        const file = item.getAsFile()
                        if (file) imageFiles.push(file)
                      }
                    }
                    if (imageFiles.length === 0) return
                    e.preventDefault()
                    const MAX_FILE_SIZE = 4 * 1024 * 1024
                    const MAX_TOTAL_SIZE = 4 * 1024 * 1024
                    const oversized = imageFiles.filter(f => f.size > MAX_FILE_SIZE)
                    if (oversized.length > 0) {
                      alert(`Pasted image too large (max 4MB)`)
                      return
                    }
                    const currentSize = selectedFiles.reduce((sum, f) => sum + f.size, 0)
                    const newSize = imageFiles.reduce((sum, f) => sum + f.size, 0)
                    if (currentSize + newSize > MAX_TOTAL_SIZE) {
                      alert(`Total file size would exceed 4MB limit`)
                      return
                    }
                    setSelectedFiles(prev => [...prev, ...imageFiles])
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = Math.min(target.scrollHeight, 120) + 'px'
                  }}
                />

                {/* Right side buttons */}
                <div className="flex items-center gap-1">
                  {/* Midnight Maya roleplay button */}
                  <button
                    onClick={startRoleplay}
                    className={`flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${activeRoleplaySession ? 'bg-purple-100 dark:bg-purple-900/30' : ''}`}
                    disabled={loading || roleplayLoading}
                    title={activeRoleplaySession ? 'Roleplay active — pick a scenario' : 'Midnight Maya roleplay'}
                  >
                    {roleplayLoading ? (
                      <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                    ) : (
                      <Sparkles className={`w-5 h-5 ${activeRoleplaySession ? 'text-purple-400' : 'text-purple-600 dark:text-purple-400'}`} />
                    )}
                  </button>

                  {/* Voice mode button */}
                  <button
                    onClick={() => setShowVoiceMode(true)}
                    className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    disabled={loading}
                    title="Voice chat with Maya"
                  >
                    <Mic className="w-5 h-5 text-purple-500" />
                  </button>

                  {/* Send button */}
                  <button
                    onClick={sendMessage}
                    disabled={loading || (!input.trim() && selectedFiles.length === 0)}
                    className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
                      loading || (!input.trim() && selectedFiles.length === 0)
                        ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed'
                        : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <Send className="w-5 h-5 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Time</span>
                    <span className="font-mono text-sm">{stats.totalTime}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Context</span>
                    <span className="font-mono text-sm">{stats.contextTime}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Response</span>
                    <span className="font-mono text-sm">{stats.responseTime}ms</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No stats yet</p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Context Used</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.context ? (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Recent Messages</span>
                    <span className="font-mono text-sm">{stats.context.recentMessagesUsed || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Memories</span>
                    <span className="font-mono text-sm">{stats.context.memoriesUsed || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Facts</span>
                    <span className="font-mono text-sm">{stats.context.factsUsed || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Core Facts</span>
                    <span className="font-mono text-sm">{stats.context.coreFactsUsed || 0}</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No context yet</p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Quality Scores</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.quality ? (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Overall</span>
                    <Badge variant="outline">{(stats.quality.overall * 100).toFixed(0)}%</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Personality</span>
                    <Badge variant="outline">{(stats.quality.personality * 100).toFixed(0)}%</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Relevance</span>
                    <Badge variant="outline">{(stats.quality.relevance * 100).toFixed(0)}%</Badge>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No quality data yet</p>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Full Context Viewer - Shows everything sent to Maya */}
        {showFullContext && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Full Context Sent to Maya
                  {rawContext && (
                    <span className="text-xs font-normal text-gray-500">
                      ({rawContext.length.toLocaleString()} chars)
                    </span>
                  )}
                </span>
                {rawContext && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(rawContext)
                    }}
                  >
                    Copy
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[500px] overflow-y-auto bg-gray-950 font-mono text-xs p-4 rounded border border-gray-800">
                {!rawContext ? (
                  <div className="text-gray-500 text-center py-8">
                    <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Send a message to see the full context</p>
                    <p className="text-gray-600 mt-1">This shows everything Maya receives: personality, facts, memories, and conversation history</p>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap break-words text-gray-300 leading-relaxed">
                    {rawContext}
                  </pre>
                )}
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      {/* Voice Mode Modal - Choose xAI (fast) or ElevenLabs (expressive) */}
      <AnimatePresence>
        {showVoiceMode && (
          <VoiceChat
            mayaAvatar={mayaAvatar || undefined}
            onClose={() => setShowVoiceMode(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}