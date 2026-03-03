'use client'

/**
 * Maya Core v2.0 Test Interface - Clean Version
 * Based on working admin/chat patterns
 */

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Send, Bot, User, Paperclip, X, Terminal } from 'lucide-react'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'
import { useRoomMessages } from '@mayahq/chat-sdk'

// Maya's system user ID - same as working admin/chat
const MAYA_SYSTEM_USER_ID = process.env.NEXT_PUBLIC_MAYA_SYSTEM_USER_ID || '61770892-9e5b-46a5-b622-568be7066664';
const ROOM_ID = 'b5906d59-847b-4635-8db7-611a38bde6d0'

interface LogEntry {
  timestamp: string
  type: 'info' | 'success' | 'error' | 'debug'
  message: string
  data?: any
}

export default function MayaV2TestPageClean() {
  // Use client and user info from AuthContext (same as working admin/chat)
  const { user, profile, supabase } = useAuth(); 
  
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [showLogs, setShowLogs] = useState(true)
  const [mayaAvatar, setMayaAvatar] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  
  // Use our chat SDK hook to get messages (same as working admin/chat)
  const { messages, loading: messagesLoading } = useRoomMessages(ROOM_ID, {
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
  
  // Add log entry
  const addLog = (type: LogEntry['type'], message: string, data?: any) => {
    const logEntry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      data
    }
    setLogs(prev => [...prev, logEntry])
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
        content: lastMessage.content.substring(0, 50) + '...' 
      })
      
      addLog('success', `Loaded ${messages.length} messages from Chat SDK`, {
        'User Messages': messages.filter(m => m.role === 'user').length,
        'Assistant Messages': messages.filter(m => m.role === 'assistant').length,
        'Last Message': lastMessage.role + ': ' + lastMessage.content.substring(0, 30) + '...'
      })
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

  const sendTestMessage = async () => {
    if ((!input.trim() && selectedFiles.length === 0) || loading) return

    const userMessage = input.trim()
    setInput('')
    setLoading(true)

    try {
      addLog('info', `Sending message: "${userMessage.substring(0, 50)}..."`)

      const response = await fetch('/api/maya-chat-v3', {
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

      const data = await response.json()
      
      // Enhanced RAG logging with detailed context from Maya Core
      if (data.processing?.context) {
        const context = data.processing.context
        
        addLog('debug', '🔍 RAG CONTEXT SUMMARY', {
          'Total Time': `${data.processing.totalTime}ms`,
          'Context Time': `${data.processing.contextTime}ms`,
          'Recent Messages': `${context.recentMessagesUsed || 0}/8`,
          'Memories Retrieved': `${context.memoriesUsed || 0}/5`,
          'Facts Retrieved': `${context.factsUsed || 0}/5`, 
          'Core Facts': `${context.coreFactsUsed || 0} (ALL active)`,
          'Multimodal Items': context.multimodalAttachments || 0
        })
      }
      
      addLog('info', `🤖 Maya responding (${data.processing?.totalTime}ms total)...`)

      if (response.ok && data.mayaResponse) {
        setStats(data.processing)
        addLog('success', `Maya responded (${data.processing?.totalTime}ms)`)
        
        // Messages will update via useRoomMessages hook
        setTimeout(scrollToBottom, 200)
      } else {
        addLog('error', 'API Error', data)
      }
    } catch (error) {
      addLog('error', 'Request failed', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      setSelectedFiles(prev => [...prev, ...files])
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

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
            Maya Core v2.0 Enhanced Interface
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowLogs(!showLogs)}>
              <Terminal className="w-4 h-4 mr-1" />
              {showLogs ? 'Hide Logs' : 'Show Logs'}
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
                
                {messages?.map((message, index) => (
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
                    <div className={`max-w-[70%] rounded-2xl p-4 ${
                      message.role === 'user' 
                        ? 'bg-blue-600 text-white shadow-lg' 
                        : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    }`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs opacity-60">
                          {new Date(message.created_at as string).toLocaleTimeString()}
                        </p>
                      </div>
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
                ))}
                
                {loading && (
                  <div className="flex justify-start gap-3">
                    <div className="flex-shrink-0">
                      <div className="relative w-10 h-10 overflow-hidden rounded-full border-2 border-purple-400 opacity-50">
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
                <div className="mb-3 space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Attachments:</p>
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 rounded-lg p-2">
                      <div className="flex items-center gap-2">
                        <Paperclip className="w-4 h-4 text-gray-500" />
                        <span className="text-sm">{file.name}</span>
                        <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(1)}KB)</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="flex gap-2">
                {/* File upload button */}
                <div className="relative">
                  <input
                    type="file"
                    multiple
                    accept="image/*,audio/*,video/*"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-[60px] px-3"
                    disabled={loading}
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>
                </div>
                
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Test message for Maya... (attach images, audio, video)"
                  className="min-h-[60px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendTestMessage()
                    }
                  }}
                />
                <Button 
                  onClick={sendTestMessage} 
                  disabled={loading || (!input.trim() && selectedFiles.length === 0)}
                  size="lg"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
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
        
        {/* RAG Logging Terminal */}
        {showLogs && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                RAG Debug Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[500px] overflow-y-auto bg-black text-green-400 font-mono text-xs p-4 rounded border">
                {logs.length === 0 ? (
                  <div className="text-gray-500">🔮 Waiting for RAG operations...</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className={`mb-2 ${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'debug' ? 'text-cyan-400' :
                      'text-gray-300'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">[{log.timestamp}]</span>
                        <span className={`uppercase px-2 py-0.5 rounded text-xs ${
                          log.type === 'error' ? 'bg-red-900 text-red-200' :
                          log.type === 'success' ? 'bg-green-900 text-green-200' :
                          log.type === 'debug' ? 'bg-cyan-900 text-cyan-200' :
                          'bg-gray-700 text-gray-300'
                        }`}>
                          {log.type}
                        </span>
                        <span className="flex-1">{log.message}</span>
                      </div>
                      {log.data && (
                        <div className="ml-4 mt-2 p-3 bg-gray-900 rounded border border-gray-700">
                          {typeof log.data === 'object' ? (
                            <div className="space-y-2">
                              {Object.entries(log.data).map(([key, value]) => (
                                <div key={key} className="flex items-start">
                                  <span className="text-yellow-400 w-32 shrink-0 font-semibold">{key}:</span>
                                  <span className="text-gray-300 flex-1">
                                    {typeof value === 'object' ? (
                                      <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                                    ) : (
                                      <span className={`${
                                        String(value).includes('ms') ? 'text-cyan-300' :
                                        String(value).includes('/') ? 'text-green-300' :
                                        'text-gray-300'
                                      }`}>{String(value)}</span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-300">{String(log.data)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}