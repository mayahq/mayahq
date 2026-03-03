import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Get Supabase client only if both URL and key are available
const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log('Supabase configuration missing');
    return null;
  }
  
  return createClient(supabaseUrl, supabaseAnonKey);
};

export async function POST(req: NextRequest) {
  try {
    // Parse the request body
    const body = await req.json();
    const { message, userId, tags = [] } = body;

    if (!message || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create Supabase client
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase client could not be initialized' },
        { status: 500 }
      );
    }

    // Try the RPC function first
    console.log('Trying RPC function add_task_from_message with params:', {
      p_message: message,
      p_user_id: userId,
      p_tags: tags,
      userId_type: typeof userId
    });
    const { data: rpcData, error: rpcError } = await supabase.rpc('add_task_from_message', {
      p_message: message,
      p_user_id: userId,
      p_tags: tags
    });

    if (rpcError) {
      console.error('RPC error:', rpcError);
      
      // Fall back to direct insertion
      console.log('Falling back to direct insertion');
      const { data: insertData, error: insertError } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          content: message,
          tags: tags,
          status: 'open',
          priority: 'normal',
          reminder_sent: false
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        return NextResponse.json(
          { error: `Task insertion failed: ${insertError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ taskId: insertData.id, method: 'direct' });
    }

    return NextResponse.json({ taskId: rpcData, method: 'rpc' });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
} 