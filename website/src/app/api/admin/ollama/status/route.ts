import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    
    // Check if Ollama is available
    let available = false;
    let models: any[] = [];
    let version = '';

    try {
      // Test connection with a timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        available = true;
        const data = await response.json();
        models = data.models || [];
        
        // Try to get version info
        try {
          const versionResponse = await fetch(`${baseUrl}/api/version`, {
            signal: AbortSignal.timeout(3000),
          });
          if (versionResponse.ok) {
            const versionData = await versionResponse.json();
            version = versionData.version || '';
          }
        } catch (versionError) {
          // Version endpoint might not be available in older versions
          console.log('Could not fetch Ollama version');
        }
      }
    } catch (error: any) {
      console.log('Ollama not available:', error.message);
      available = false;
    }

    // Transform models to include useful information
    const transformedModels = models.map((model: any) => ({
      name: model.name,
      size: model.size,
      modified: model.modified_at || model.modified,
      digest: model.digest,
      details: model.details,
    }));

    return NextResponse.json({
      available,
      baseUrl,
      version,
      models: transformedModels,
      modelCount: transformedModels.length,
      lastChecked: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error checking Ollama status:', error);
    return NextResponse.json({
      available: false,
      error: error.message,
      models: [],
      modelCount: 0,
      lastChecked: new Date().toISOString(),
    });
  }
}