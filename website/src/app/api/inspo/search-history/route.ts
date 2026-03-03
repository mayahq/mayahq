import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@mayahq/supabase-client';

// Validate API key
function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const expectedKey = process.env.CLAWDBOT_API_KEY;

  if (!expectedKey) {
    console.error('CLAWDBOT_API_KEY not configured');
    return false;
  }

  return apiKey === expectedKey;
}

interface SearchHistoryCreate {
  search_term: string;
  search_type?: string;
  results_found?: number;
}

// POST /api/inspo/search-history - Log a search
export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const supabase = createSupabaseClient();
    const body: SearchHistoryCreate = await request.json();

    // Validate required fields
    if (!body.search_term) {
      return NextResponse.json(
        { error: 'search_term is required' },
        { status: 400 }
      );
    }

    const insertData = {
      search_term: body.search_term,
      search_type: body.search_type || 'hashtag',
      results_found: body.results_found ?? 0,
      last_searched: new Date().toISOString(),
    };

    // Check if this search already exists, update if so
    const { data: existing } = await (supabase as any)
      .from('inspo_search_history')
      .select('id')
      .eq('search_term', body.search_term)
      .eq('search_type', insertData.search_type)
      .single();

    if (existing) {
      // Update existing record
      const { data: updated, error } = await (supabase as any)
        .from('inspo_search_history')
        .update({
          results_found: insertData.results_found,
          last_searched: insertData.last_searched,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating search history:', error);
        return NextResponse.json(
          { error: 'Failed to update search history' },
          { status: 500 }
        );
      }

      return NextResponse.json(updated);
    }

    // Create new record
    const { data: history, error } = await (supabase as any)
      .from('inspo_search_history')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating search history:', error);
      return NextResponse.json(
        { error: 'Failed to create search history' },
        { status: 500 }
      );
    }

    return NextResponse.json(history, { status: 201 });
  } catch (error) {
    console.error('Error in search history POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/inspo/search-history - Get recent searches
export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const supabase = createSupabaseClient();
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const limit = parseInt(searchParams.get('limit') || '20');
    const searchType = searchParams.get('search_type');

    // Build query
    let query = (supabase as any)
      .from('inspo_search_history')
      .select('*');

    if (searchType) {
      query = query.eq('search_type', searchType);
    }

    query = query
      .order('last_searched', { ascending: false })
      .limit(limit);

    const { data: searches, error } = await query;

    if (error) {
      console.error('Error fetching search history:', error);
      return NextResponse.json(
        { error: 'Failed to fetch search history' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      searches: searches || [],
    });
  } catch (error) {
    console.error('Error in search history GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
