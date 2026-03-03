/**
 * POST /api/roleplay/choose
 *
 * Blake picks a scenario from the offered list.
 * 1. Validates session exists and is in 'scenario_offered' state
 * 2. Matches choice to a scenario
 * 3. Generates ~600-word dialog with voice tags
 * 4. Saves dialog as Maya message
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const MAYA_CORE_URL = process.env.MAYA_CORE_URL || 'http://localhost:3333';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, choice, roomId } = body;

    if (!sessionId || !choice) {
      return NextResponse.json(
        { error: 'sessionId and choice are required' },
        { status: 400 }
      );
    }

    // Forward to memory-worker for the heavy LLM work
    const workerResponse = await fetch(`${MAYA_CORE_URL}/roleplay/choose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        choice,
        roomId: roomId || 'b5906d59-847b-4635-8db7-611a38bde6d0',
      }),
    });

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text();
      console.error('[/api/roleplay/choose] Worker error:', errorText);
      return NextResponse.json({ error: 'Failed to generate roleplay dialog' }, { status: 500 });
    }

    const result = await workerResponse.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[/api/roleplay/choose] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
