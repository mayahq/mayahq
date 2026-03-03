# Memory Worker

This service is responsible for processing user messages and generating AI responses with memory and context awareness.

## Key Features

- Realtime subscription to Supabase messaging events
- Direct API for processing messages
- Automatic duplicate message detection
- Memory and fact extraction
- AI response generation with context from:
  - Previous conversations
  - User facts 
  - Core system facts
  - Maya's personality
- **Web search capabilities** for current information with:
  - Rate limiting (10 searches/minute per user)
  - Result caching (30 minutes)
  - Multiple search providers (Serper, Brave)
  - Intelligent query handling

## Configuration

The following environment variables control operation:

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for Supabase operations
- `ANTHROPIC_API_KEY`: API key for Anthropic's Claude
- `COHERE_API_KEY`: API key for Cohere embeddings
- `MAYA_SYSTEM_USER_ID`: User ID for Maya (to avoid processing Maya's own messages)
- `MEMORY_PROCESSING_ENABLED`: Set to 'false' to disable memory processing (default true)
- `RESPONSE_GENERATION_ENABLED`: Set to 'false' to disable response generation (default true)
- `PORT`: Port to run the server on (default 3002)

### Web Search Configuration (Optional)

To enable web search capabilities, add at least one of these API keys:

- `SERPER_API_KEY`: API key for Serper.dev (2,500 free searches/month)
- `BRAVE_SEARCH_API_KEY`: API key for Brave Search (2,000 free searches/month)

## Architecture

As of the latest update, the memory worker is now the **sole component** responsible for generating AI responses to users. The website API no longer directly generates responses, instead forwarding all messages to the memory worker.

This architecture change fixed issues with:
- Duplicate messages (caused by both components generating responses)
- Inconsistent response generation
- Race conditions in database operations

## API Endpoints

- `GET /health`: Health check endpoint
- `POST /process-message`: Process a user message and generate a response
- `POST /test-message`: Test endpoint for manual message processing

## Usage

Run the memory worker service with:

```bash
npm run start
```

In development mode:

```bash
npm run dev
```