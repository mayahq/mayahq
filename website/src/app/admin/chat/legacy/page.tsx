'use client'

import dynamicImport from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// Use dynamic import with ssr: false to skip static optimization
// This prevents Next.js from trying to use Supabase during build
const ChatWindowDynamic = dynamicImport(
  () => import('./components/chat-window-new').then(mod => mod.ChatWindow),
  { 
    ssr: false,
    loading: () => (
      <div className="h-[600px] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <span className="ml-2 text-lg text-purple-500">Loading chat...</span>
      </div>
    )
  }
)

export const dynamic = 'force-dynamic'

export default function ChatPage() {
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
        Chat with Maya
      </h1>
      <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-lg overflow-hidden">
        <ChatWindowDynamic />
      </div>
    </div>
  )
} 