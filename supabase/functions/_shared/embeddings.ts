// Cohere embeddings instead of OpenAI (to avoid rate limiting)
const COHERE_API_KEY = Deno.env.get('COHERE_API_KEY')!;

export async function embed(text: string): Promise<number[]> {
  try {
    // Add a check for very long text which can cause timeouts
    if (text.length > 5000) {
      // Truncate very long text to prevent timeouts
      console.log(`Truncating long text from ${text.length} to 5000 characters`);
      text = text.substring(0, 5000);
    }

    const res = await fetch('https://api.cohere.ai/v1/embed', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'embed-english-v3.0',
        texts: [text],
        input_type: 'search_document'
      })
    });
    
    if (!res.ok) {
      throw new Error(`Cohere API error: ${res.status}`);
    }
    
    const result = await res.json();
    return result.embeddings[0];
  } catch (error) {
    console.error('Error generating embedding with Cohere:', error);
    throw error;
  }
} 