import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelName } = body;

    if (!modelName) {
      return NextResponse.json(
        { error: 'Model name is required' }, 
        { status: 400 }
      );
    }

    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    // First check if Ollama is available
    try {
      const statusResponse = await fetch(`${baseUrl}/api/version`, {
        signal: AbortSignal.timeout(3000),
      });

      if (!statusResponse.ok) {
        throw new Error('Ollama not available');
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Ollama is not available. Please ensure Ollama is running.' }, 
        { status: 503 }
      );
    }

    // Initiate the model pull
    const pullResponse = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: modelName,
        stream: false, // For now, don't stream the response
      }),
    });

    if (!pullResponse.ok) {
      const errorText = await pullResponse.text();
      console.error('Ollama pull error:', errorText);
      
      return NextResponse.json(
        { 
          error: `Failed to pull model: ${pullResponse.status} ${pullResponse.statusText}`,
          details: errorText 
        }, 
        { status: pullResponse.status }
      );
    }

    // For streaming responses, we would need to handle the stream
    // For now, we'll return a success message
    let result;
    try {
      result = await pullResponse.json();
    } catch (jsonError) {
      // Some responses might not be JSON
      result = { status: 'success' };
    }

    console.log(`Successfully initiated pull for model: ${modelName}`);

    return NextResponse.json({
      message: `Successfully started pulling model: ${modelName}`,
      modelName,
      status: 'pulling',
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error pulling Ollama model:', error);
    return NextResponse.json(
      { 
        error: error.message,
        timestamp: new Date().toISOString(),
      }, 
      { status: 500 }
    );
  }
}

// Optional: Add a streaming version for real-time progress
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelName } = body;

    if (!modelName) {
      return NextResponse.json(
        { error: 'Model name is required' }, 
        { status: 400 }
      );
    }

    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    // Create a streaming response
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const pullResponse = await fetch(`${baseUrl}/api/pull`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: modelName,
              stream: true,
            }),
          });

          if (!pullResponse.ok) {
            throw new Error(`Pull failed: ${pullResponse.statusText}`);
          }

          const reader = pullResponse.body?.getReader();
          if (!reader) {
            throw new Error('No response body');
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Forward the chunk to the client
            controller.enqueue(value);
          }

          controller.close();
        } catch (error: any) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Error in streaming pull:', error);
    return NextResponse.json(
      { error: error.message }, 
      { status: 500 }
    );
  }
}