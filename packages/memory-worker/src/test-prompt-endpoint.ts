import { Request, Response } from 'express';
import { buildSystemPrompt } from './ai-client';
import { generateResponse as aiGenerateResponse } from './ai-client';

export async function testPromptEndpoint(req: Request, res: Response) {
  try {
    const { systemPrompt, temperature, userMessage, userId } = req.body;

    if (!systemPrompt || !userMessage) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Build the full system prompt with the custom base
    const fullPrompt = await buildSystemPrompt([], [], [], systemPrompt);

    // Generate response using the test parameters
    const response = await aiGenerateResponse(
      userMessage,
      fullPrompt,
      [], // no conversation history for testing
      {
        temperature: temperature || 0.7,
        maxTokens: 200, // shorter for testing
        userId: userId
      }
    );

    // Log the test for analysis
    console.log('[Test Prompt] Generated response:', response.substring(0, 100) + '...');

    res.json({ response });
  } catch (error) {
    console.error('[Test Prompt] Error:', error);
    res.status(500).json({ error: 'Failed to generate test response' });
  }
}