/**
 * Debug endpoint to check Maya's data in Supabase
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Format userId (matches memory-worker exactly)
function formatUserId(userId: string): string {
  const formatted = `admin-user-${userId.replace(/-/g, '')}`;
  return formatted.substring(0, 36);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId') || 'f58b8c6f-7a2b-4e59-a6b5-8b3f5c2e4d92';
    const formattedUserId = formatUserId(userId);

    console.log(`[DEBUG] Checking data for userId: ${userId}`);
    console.log(`[DEBUG] Formatted userId: ${formattedUserId}`);

    // Check messages table
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .limit(5);

    // Check maya_memories table
    const { data: memories, error: memoriesError } = await supabaseAdmin
      .from('maya_memories')
      .select('*')
      .eq('userId', formattedUserId)
      .limit(5);

    // Check maya_facts table  
    const { data: facts, error: factsError } = await supabaseAdmin
      .from('maya_facts')
      .select('*')
      .eq('user_id', userId)
      .limit(5);

    // Check maya_core_facts table
    const { data: coreFacts, error: coreFactsError } = await supabaseAdmin
      .from('maya_core_facts')
      .select('*')
      .eq('active', true)
      .limit(5);

    // Get counts
    const { count: messagesCount } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: memoriesCount } = await supabaseAdmin
      .from('maya_memories')
      .select('*', { count: 'exact', head: true })
      .eq('userId', formattedUserId);

    const { count: factsCount } = await supabaseAdmin
      .from('maya_facts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: coreFactsCount } = await supabaseAdmin
      .from('maya_core_facts')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    return NextResponse.json({
      debug: {
        originalUserId: userId,
        formattedUserId: formattedUserId,
        tableCounts: {
          messages: messagesCount,
          memories: memoriesCount,
          facts: factsCount,
          coreFacts: coreFactsCount
        },
        sampleData: {
          messages: messages?.slice(0, 2),
          memories: memories?.slice(0, 2),
          facts: facts?.slice(0, 2),
          coreFacts: coreFacts?.slice(0, 2)
        },
        errors: {
          messagesError: messagesError?.message,
          memoriesError: memoriesError?.message,
          factsError: factsError?.message,
          coreFactsError: coreFactsError?.message
        }
      }
    });

  } catch (error: any) {
    console.error('[DEBUG] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}