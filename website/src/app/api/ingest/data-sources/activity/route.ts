import { NextRequest, NextResponse } from 'next/server'

const INGEST_SERVICE_URL = process.env.INGEST_SERVICE_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get('limit') || '50'
    const source_id = searchParams.get('source_id')
    const status = searchParams.get('status')
    
    const params = new URLSearchParams({ limit })
    if (source_id) params.append('source_id', source_id)
    if (status) params.append('status', status)
    
    const response = await fetch(`${INGEST_SERVICE_URL}/api/v1/data-sources/activity?${params}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Ingest service responded with ${response.status}`)
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activity' },
      { status: 500 }
    )
  }
} 