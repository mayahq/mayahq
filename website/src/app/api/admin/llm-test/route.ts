import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, testMessage } = body;

    // Test the provider by sending a request to memory worker
    const memoryWorkerUrl = process.env.MEMORY_WORKER_URL || 'http://localhost:3002';
    
    const response = await fetch(`${memoryWorkerUrl}/api/test-llm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        message: testMessage || 'Hello, this is a test message. Please respond briefly that you are working correctly.',
        systemPrompt: 'You are Maya. Respond briefly and confirm you are working correctly.'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Memory worker test failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      response: data.response,
      provider: data.provider,
      model: data.model,
      responseTime: data.responseTime
    });
  } catch (error: any) {
    console.error('Error testing LLM provider:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to test LLM provider' 
      },
      { status: 500 }
    );
  }
}