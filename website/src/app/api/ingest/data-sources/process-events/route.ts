import { NextRequest, NextResponse } from 'next/server'

const INGEST_SERVICE_URL = process.env.INGEST_SERVICE_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const { limit = 50 } = await request.json().catch(() => ({}))

    const response = await fetch(`${INGEST_SERVICE_URL}/api/v1/data-sources/process-events?limit=${limit}`, {
      method: 'POST',
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
    console.error('Error processing events:', error)
    return NextResponse.json(
      { error: 'Failed to process events' },
      { status: 500 }
    )
  }
}
