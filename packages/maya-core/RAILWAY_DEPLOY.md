# Deploy Maya Core v2.0 to Railway

Simple deployment guide for the Maya Core v2.0 microservice.

## Quick Deploy

1. **Connect Repository**
   ```bash
   # In Railway dashboard, click "New Project" > "Deploy from GitHub"
   # Select: mayahq/packages/maya-core
   ```

2. **Set Environment Variables**
   ```bash
   SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ANTHROPIC_API_KEY=your-anthropic-key
   COHERE_API_KEY=your-cohere-key
   OPENAI_API_KEY=your-openai-key
   NODE_ENV=production
   ```

3. **Configure Build**
   - **Build Command**: `pnpm install && pnpm build`
   - **Start Command**: `pnpm start`
   - **Health Check**: `/health`

## That's it! 🚀

Railway will:
- ✅ Auto-detect Node.js project
- ✅ Install dependencies with pnpm
- ✅ Build TypeScript to JavaScript
- ✅ Start the service on the assigned PORT
- ✅ Provide a public URL

## Local Testing

Test locally before deploying:
```bash
# Start Maya Core service
pnpm dev

# Test health endpoint
curl http://localhost:3333/health

# Test message processing
curl -X POST http://localhost:3333/process \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Maya!", "userId": "test-user"}'
```

## Environment Variables Guide

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (admin access) | ✅ |
| `ANTHROPIC_API_KEY` | Claude 4 Opus API key | ✅ |
| `COHERE_API_KEY` | For embeddings (embed-english-v3.0) | ✅ |
| `OPENAI_API_KEY` | Backup LLM provider | ⚠️ |
| `PORT` | Service port (Railway sets automatically) | 🔧 |
| `NODE_ENV` | Set to "production" | 🔧 |

## Troubleshooting

**Service won't start?**
- Check all required environment variables are set
- Verify Supabase credentials have proper permissions
- Check Railway logs for specific error messages

**Can't connect to database?**
- Ensure Supabase URL is correct (should start with https://)
- Verify service role key has access to maya_memories, maya_facts tables
- Check if pgvector extension is enabled

**API requests failing?**
- Test health endpoint first: `GET /health`
- Verify API keys are valid and have sufficient credits
- Check request format matches expected schema