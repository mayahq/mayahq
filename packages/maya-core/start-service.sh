#!/bin/bash

# Maya Core v2.0 Microservice Startup Script

# Load environment from parent project
cd ../../website
source .env.local

# Set service port
export MAYA_CORE_PORT=3333

# Start the service
cd ../packages/maya-core
echo "🤖 Starting Maya Core v2.0 Microservice..."
echo "📊 Environment: $NEXT_PUBLIC_SUPABASE_URL"
echo "🔑 API Keys loaded: $([ -n "$ANTHROPIC_API_KEY" ] && echo "Anthropic ✅" || echo "Anthropic ❌") $([ -n "$COHERE_API_KEY" ] && echo "Cohere ✅" || echo "Cohere ❌")"
echo "🚀 Starting on port $MAYA_CORE_PORT..."

SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
COHERE_API_KEY="$COHERE_API_KEY" \
OPENAI_API_KEY="$OPENAI_API_KEY" \
pnpm service