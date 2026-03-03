/**
 * Simple API endpoint to fetch messages for the test interface
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('room_id');
    const limit = parseInt(searchParams.get('limit') || '10'); // Default to 10 recent messages

    if (!roomId) {
      return NextResponse.json({ error: 'room_id is required' }, { status: 400 });
    }

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from('messages')
      .select('id, content, user_id, role, created_at, metadata')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Messages query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      messages: data || [],
      count: data?.length || 0,
      room_id: roomId
    });

  } catch (error: any) {
    console.error('Messages API error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch messages',
      details: error.message 
    }, { status: 500 });
  }
}