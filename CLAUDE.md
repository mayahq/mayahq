# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Maya?

Maya is an AI companion/girlfriend for Blake (single-user system). She has:
- **Persistent memory** - Remembers facts and conversations across sessions
- **Personality** - Defined in `packages/maya-core/src/constants.ts` (MAYA_PERSONALITY)
- **Voice mode** - Ultra-low latency (<1s) voice conversations via xAI Grok
- **Text chat** - Web and mobile interfaces

### Key User IDs (Hardcoded)
```typescript
const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14'
const MAYA_USER_ID = '61770892-9e5b-46a5-b622-568be7066664'
```

## Development Commands

**Monorepo Management:**
- `yarn dev` - Start development servers for all workspaces
- `yarn build` - Build all workspaces
- `yarn lint` - Run linting across all workspaces
- `yarn test` - Run tests across all workspaces

**Website (Next.js):**
- `cd website && yarn dev` - Start Next.js development server
- `cd website && yarn build` - Build production website
- `cd website && yarn lint` - Run ESLint
- `cd website && yarn test` - Run Jest tests
- `cd website && yarn test:watch` - Run tests in watch mode

**Mobile (React Native + Expo):**
- `cd mobile && yarn start` - Start Expo development server
- `cd mobile && yarn android` - Run on Android
- `cd mobile && yarn ios` - Run on iOS
- `cd mobile && yarn test` - Run mobile tests
- `cd mobile && yarn lint` - Run mobile linting

**Maya Gradio (HuggingFace Demo):**
- `cd packages/maya-gradio && python src/app.py` - Start Gradio demo
- `cd packages/maya-gradio && pip install -r requirements.txt` - Install Python deps
- `cd packages/maya-gradio && gradio deploy` - Deploy to HF Spaces

## Architecture Overview

This is a **monorepo** using **yarn workspaces** with three main components:

### 1. Website (`/website`)
- **Next.js 14** application with App Router
- **Supabase** for authentication and database
- **TailwindCSS** + **Radix UI** for styling
- **LangChain** integration for AI functionality
- **TypeScript** throughout

### 2. Mobile App (`/mobile`) 
- **React Native** with **Expo SDK**
- Shares Supabase backend with website
- **Zustand** for state management
- Custom chat UI and voice capabilities

### 3. Shared Packages (`/packages`)
- `@mayahq/supabase-client` - Shared Supabase client
- `@mayahq/chat-sdk` - Chat functionality
- `@mayahq/calendar-core` - Calendar operations
- `@mayahq/maya-gradio` - HuggingFace Gradio demo with RAG and multi-model support
- `@mayahq/memory-worker` - Core RAG engine with LangChain and Supabase vector storage
- `@mayahq/maya-core` - Core Maya utilities and constants

### 4. Backend Services
- **Supabase Edge Functions** (`/supabase/functions`) for serverless API
- **Python scripts** (`/scripts`) for image processing and S3 operations
- Database migrations in `/supabase/migrations`

## Key Technologies

- **Database:** Supabase (PostgreSQL with real-time capabilities)
- **AI/ML:** LangChain, Anthropic Claude, OpenAI integration
- **Storage:** Supabase Storage + S3 for images
- **Authentication:** Supabase Auth
- **Styling:** TailwindCSS, Radix UI components
- **State Management:** React hooks (website), Zustand (mobile)
- **Testing:** Jest for both web and mobile

## Voice Integration (xAI Grok)

Maya has ultra-low latency voice mode using xAI Grok Voice Agent API.

### How It Works
```
Audio → [xAI Native Audio Model <1s] → Audio
```
This is NOT traditional STT→LLM→TTS. The model directly processes audio input/output.

### Key Files
- `website/src/app/api/voice/session/route.ts` - Creates ephemeral tokens, loads user context
- `website/src/hooks/use-xai-voice.ts` - React hook for WebSocket voice connection
- `website/src/components/xai-voice-chat.tsx` - Voice chat UI component
- `website/src/app/api/voice/save-exchange/route.ts` - Saves voice conversations to memory

### Voice Features
- **Memory-aware** - Loads Blake's facts/memories into voice session context
- **Persistent** - Voice conversations are saved to `messages` and `maya_memories` tables
- **5 preset voices** - Ara (default), Eve, Rex, Leo, Sal (no custom voice cloning yet)

### Environment Variables
```bash
XAI_API_KEY=xxx  # Required for voice
```

## Memory System

### Database Tables
- `maya_facts` - Extracted facts about Blake (permanent and weighted)
- `maya_core_facts` - Immutable core facts
- `maya_memories` - Conversation memories and context
- `messages` - All chat messages (text and voice)
- `rooms` - Chat room metadata

### Memory Flow
1. User sends message (text or voice)
2. Retrieve relevant facts/memories via hybrid search
3. Include in LLM context
4. Extract new facts from response
5. Store conversation in memories

### Key Files
- `packages/maya-core/src/constants.ts` - MAYA_PERSONALITY (NEVER modify personality)
- `packages/memory-worker/src/` - RAG engine and fact extraction

## API Routes

| Route | Purpose |
|-------|---------|
| `/api/maya-chat-v3` | Main chat endpoint (calls memory-worker microservice) |
| `/api/voice/session` | Creates xAI voice session with memory context |
| `/api/voice/save-exchange` | Saves voice transcripts to database |
| `/api/auth/*` | Supabase auth handlers |

## Supabase Rules

### After ANY DDL/migration changes, ALWAYS regenerate TypeScript types:
1. Use the Supabase MCP `generate_typescript_types` tool
2. Write the output to `website/src/lib/database.types.ts`
3. Verify with `npx tsc --noEmit` — zero errors required

**NEVER use `as any` to work around missing table types.** If `.from('table_name')` has a type error, the types file is stale — regenerate it, don't cast around it.

### RLS Policy Pattern
- **Always enable RLS** on new tables (`ALTER TABLE x ENABLE ROW LEVEL SECURITY`)
- **Always add policies** — RLS enabled with no policies = table is inaccessible via API
- For authenticated user access: `TO authenticated USING (true)` or scope with `auth.uid()`
- Maya's cron jobs use service role which bypasses RLS — no special policy needed for her
- **Never disable RLS** as a workaround. If a query returns empty, check for missing policies first.

### Migration Best Practices
- Use `apply_migration` MCP tool for DDL changes (not `execute_sql`)
- Run `get_advisors` (security) after schema changes to catch RLS issues
- Seed data can go in a separate migration from schema changes

## Git Workflow

- **Always commit and push after making changes.** When you finish implementing a feature, fix, or any code change, create a git commit and push to the remote immediately without being asked.
- Follow standard commit message conventions (concise summary of what changed and why).

## Important Notes

- This is a **yarn workspace** - always use `yarn` instead of npm/pnpm
- Mobile app requires building shared packages first (handled by postinstall script)
- Supabase functions are deployed separately from the main applications
- The codebase includes extensive AI/chat functionality with memory and context management
- Both web and mobile share the same Supabase backend and authentication system
- **Single user system** - Blake only, no multi-tenant logic needed
- **Preserve Maya's personality** - Don't modify MAYA_PERSONALITY in maya-core