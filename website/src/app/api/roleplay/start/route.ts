/**
 * POST /api/roleplay/start
 *
 * Initiates a Midnight Maya roleplay session.
 * 1. Checks for existing pending session today
 * 2. Picks 3 non-recent scenarios
 * 3. Generates a flirty scenario offer message
 * 4. Inserts message + session record
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14';
const MAYA_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';
const MAYA_CORE_URL = process.env.MAYA_CORE_URL || 'http://localhost:3333';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await request.json().catch(() => ({}));
    const roomId = body.roomId || 'b5906d59-847b-4635-8db7-611a38bde6d0';

    // Check for existing pending session today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: existingSession } = await supabase
      .from('roleplay_sessions')
      .select('*')
      .eq('status', 'scenario_offered')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingSession) {
      return NextResponse.json({
        success: true,
        session: existingSession,
        message: 'Existing session found',
        reused: true,
      });
    }

    // Call memory-worker to handle scenario generation
    // The heavy lifting (LLM calls) happens there
    const workerResponse = await fetch(`${MAYA_CORE_URL}/roleplay/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text();
      console.error('[/api/roleplay/start] Worker error:', errorText);
      return NextResponse.json({ error: 'Failed to start roleplay session' }, { status: 500 });
    }

    const result = await workerResponse.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[/api/roleplay/start] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
