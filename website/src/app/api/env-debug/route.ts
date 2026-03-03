import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Mask sensitive values but show if they exist
  const envVars = {
    // Supabase variables
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'not set',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set [masked]' : 'not set',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set [masked]' : 'not set',
    
    // LLM variables
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'set [masked]' : 'not set',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'set [masked]' : 'not set',
    COHERE_API_KEY: process.env.COHERE_API_KEY ? 'set [masked]' : 'not set',
    
    // Config variables
    PRIMARY_LLM_PROVIDER: process.env.PRIMARY_LLM_PROVIDER || 'default: openai',
    OPENAI_MODEL_NAME: process.env.OPENAI_MODEL_NAME || 'default: gpt-4',
    ANTHROPIC_MODEL_NAME: process.env.ANTHROPIC_MODEL_NAME || 'default: claude-opus-4-20250514',
  };

  return NextResponse.json({ 
    message: 'Environment variable check',
    environment: process.env.NODE_ENV || 'unknown',
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
    variables: envVars
  });
} 