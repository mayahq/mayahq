import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    // Check if user is authenticated
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt, temperature, message } = await request.json();

    // Send test request to memory worker
    const memoryWorkerUrl = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002';
    const response = await fetch(`${memoryWorkerUrl}/api/test-prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemPrompt: prompt,
        temperature,
        userMessage: message,
        userId: session.user.id,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to test prompt');
    }

    const data = await response.json();
    return NextResponse.json({ response: data.response });

  } catch (error) {
    console.error('Error testing prompt:', error);
    return NextResponse.json(
      { error: 'Failed to test prompt' },
      { status: 500 }
    );
  }
}