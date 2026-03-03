import React, { useState } from 'react';
import { useMayaChat } from '@mayahq/chat-sdk';

/**
 * Example React component showing the new multimodal chat integration
 */
export function MultimodalChatExample() {
  const roomId = 'demo-room-123';
  const userId = '4c850152-30ef-4b1b-89b3-bc72af461e14'; // Blake's ID
  
  // Use the unified Maya chat hook
  const { 
    messages, 
    loading, 
    sending, 
    uploadProgress,
    sendMessage,
    sendTextMessage,
    sendImageMessage,
    error 
  } = useMayaChat({ 
    roomId, 
    userId,
    mayaApiUrl: '/api/maya-chat-v3' 
  });
  
  const [input, setInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  
  const handleSend = async () => {
    if (!input.trim() && selectedFiles.length === 0) return;
    
    try {
      // Send message with any attachments
      await sendMessage(input, selectedFiles);
      setInput('');
      setSelectedFiles([]);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };
  
  if (loading) {
    return <div>Loading chat history...</div>;
  }
  
  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      {/* Chat Header */}
      <div className="bg-purple-600 text-white p-4 rounded-t-lg">
        <h2 className="text-xl font-bold">Maya Chat (Multimodal)</h2>
        <p className="text-sm opacity-75">
          Enhanced with images, audio, and persistent history
        </p>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 min-h-[400px]">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${
            message.role === 'user' ? 'justify-end' : 'justify-start'
          }`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
              message.role === 'user' 
                ? 'bg-blue-500 text-white' 
                : 'bg-white border shadow-sm'
            }`}>
              {/* Render attachments */}
              {message.metadata?.attachments && (
                <div className="mb-2 space-y-2">
                  {message.metadata.attachments.map((attachment: any, i: number) => (
                    <div key={i} className="attachment">
                      {attachment.type === 'image' && (
                        <img 
                          src={attachment.publicUrl || attachment.url} 
                          alt="Attached image"
                          className="max-w-full rounded border"
                          style={{ maxHeight: '200px' }}
                        />
                      )}
                      
                      {attachment.type === 'audio' && (
                        <div className="flex items-center space-x-2">
                          <audio controls src={attachment.publicUrl || attachment.url} />
                          <span className="text-xs text-gray-500">{attachment.name}</span>
                        </div>
                      )}
                      
                      {attachment.type === 'video' && (
                        <video 
                          controls 
                          src={attachment.publicUrl || attachment.url}
                          className="max-w-full rounded"
                          style={{ maxHeight: '200px' }}
                        />
                      )}
                      
                      {attachment.uploading && (
                        <div className="text-xs text-gray-500">Uploading...</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Message text */}
              <p className="text-sm">{message.content}</p>
              
              {/* Timestamp */}
              <p className="text-xs opacity-60 mt-1">
                {new Date(message.created_at).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        
        {/* Loading indicator */}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white border shadow-sm rounded-lg px-4 py-2">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                <span className="text-sm text-gray-600">Maya is thinking...</span>
                {uploadProgress > 0 && uploadProgress < 1 && (
                  <span className="text-xs text-gray-500">
                    {Math.round(uploadProgress * 100)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Input Area */}
      <div className="border-t bg-white p-4">
        {/* File preview */}
        {selectedFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedFiles.map((file, i) => (
              <div key={i} className="flex items-center bg-gray-100 rounded px-2 py-1 text-sm">
                <span className="mr-2">
                  {file.type.startsWith('image/') ? '🖼️' : 
                   file.type.startsWith('audio/') ? '🎵' : 
                   file.type.startsWith('video/') ? '🎥' : '📎'}
                </span>
                <span className="truncate max-w-[100px]">{file.name}</span>
                <button 
                  onClick={() => setSelectedFiles(files => files.filter((_, idx) => idx !== i))}
                  className="ml-2 text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Input row */}
        <div className="flex space-x-2">
          {/* File input */}
          <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 rounded-lg p-2 transition-colors">
            <input
              type="file"
              multiple
              accept="image/*,audio/*,video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <span className="text-gray-600">📎</span>
          </label>
          
          {/* Text input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message... (attach images, audio, video)"
            className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled={sending}
          />
          
          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={sending || (!input.trim() && selectedFiles.length === 0)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
        
        {/* Error display */}
        {error && (
          <div className="mt-2 text-red-600 text-sm">
            Error: {error.message}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Example showing voice chat integration
 */
export function VoiceChatExample() {
  const { 
    messages,
    recording,
    startRecording,
    stopRecording,
    sendTextMessage 
  } = useMayaVoiceChat({
    roomId: 'voice-room-123',
    userId: '4c850152-30ef-4b1b-89b3-bc72af461e14'
  });
  
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Voice Chat with Maya</h2>
      
      {/* Messages */}
      <div className="space-y-2 mb-4">
        {messages.map(msg => (
          <div key={msg.id} className={`p-2 rounded ${
            msg.role === 'user' ? 'bg-blue-100 ml-auto' : 'bg-gray-100'
          } max-w-md`}>
            {msg.content}
          </div>
        ))}
      </div>
      
      {/* Voice controls */}
      <div className="flex space-x-2">
        <button
          onClick={recording ? stopRecording : startRecording}
          className={`px-4 py-2 rounded font-semibold ${
            recording 
              ? 'bg-red-500 text-white' 
              : 'bg-green-500 text-white'
          }`}
        >
          {recording ? '🛑 Stop Recording' : '🎤 Start Recording'}
        </button>
        
        <button
          onClick={() => sendTextMessage('Hey Maya!')}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Quick Text
        </button>
      </div>
    </div>
  );
}