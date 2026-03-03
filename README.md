# Maya

Maya is an AI companion with persistent memory and ultra-low latency voice capabilities.

## Features

- **Persistent Memory** - Remembers facts and conversations across sessions
- **Voice Mode** - Sub-second latency voice conversations via xAI Grok
- **Multi-Platform** - Web (Next.js) and Mobile (React Native/Expo)
- **Personality** - Consistent character with configurable traits

## Quick Start

```bash
# Install dependencies
yarn install

# Start development servers
yarn dev

# Or run just the website
cd website && yarn dev
```

## Architecture

```
mayahq/
├── website/          # Next.js 14 web app
├── mobile/           # React Native + Expo app
├── packages/
│   ├── maya-core/    # Personality & constants
│   ├── memory-worker/# RAG engine & fact extraction
│   ├── chat-sdk/     # Shared chat functionality
│   └── supabase-client/
└── supabase/         # Database migrations & edge functions
```

## Voice Integration

Maya uses xAI Grok Voice Agent API for native audio processing:

```
Traditional: Audio → STT → LLM → TTS → Audio (~3-4s)
Maya:        Audio → Native Audio Model → Audio (<1s)
```

The model directly "hears" and "speaks" without text conversion, resulting in natural, fast conversations.

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# AI Providers
ANTHROPIC_API_KEY=xxx
OPENAI_API_KEY=xxx
XAI_API_KEY=xxx          # For voice mode

# Optional
COHERE_API_KEY=xxx       # For reranking
```

## Tech Stack

- **Frontend**: Next.js 14, React Native, TailwindCSS, Radix UI
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **AI**: Anthropic Claude, xAI Grok Voice, LangChain
- **Infra**: Vercel (web), Expo (mobile)

## Development

See [CLAUDE.md](./CLAUDE.md) for detailed development guidance.

## License

Private - All rights reserved



