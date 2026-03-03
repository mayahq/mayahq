import { NextRequest, NextResponse } from 'next/server'

const INGEST_SERVICE_URL = process.env.INGEST_SERVICE_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const response = await fetch(`${INGEST_SERVICE_URL}/api/v1/data-sources/rss/process`, {
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
    console.error('Error processing RSS feeds:', error)
    return NextResponse.json(
      { error: 'Failed to process RSS feeds' },
      { status: 500 }
    )
  }
} 