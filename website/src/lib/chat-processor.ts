import { Maya } from './maya-agent';
import { getSemanticRelatedFacts, upsertTriples } from './facts';
import { handleTaskInChat } from './langchain/agents/task-agent';

interface ChatProcessorOptions {
    message: string;
    userId: string;
    userName: string;
    chatHistory?: string;
    imageBase64?: string; // base64 image data (optional)
}

interface ChatProcessorResult {
    message: string;
    duration: number;
    facts?: any[];
}

export async function processChatRequest(
    agent: Maya,
    options: ChatProcessorOptions,
    startTime: number
): Promise<ChatProcessorResult> {
    try {
        // Check if this is a task-related message
        const { isTaskRelated, response: taskResponse } = await handleTaskInChat(
            options.message, 
            options.userId
        );
        
        // If task-related, return the task response
        if (isTaskRelated) {
            const endTime = Date.now();
            return {
                message: taskResponse,
                duration: endTime - startTime
            };
        }
        
        // Standard chat processing for non-task messages
        let response: string;
        
        // Check if it's a multimodal request (image + text)
        if (options.imageBase64) {
            const base64Data = options.imageBase64.replace(/^data:image\/\w+;base64,/, '');
            const messages = [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: options.message
                        },
                        {
                            type: 'image_url',
                            image_url: { url: `data:image/jpeg;base64,${base64Data}` }
                        }
                    ]
                }
            ];
            response = await agent.chatWithVision(messages);
        } else {
            // Process semantic search
            let semanticResults = [];
            let memoryContext = '';
            
            try {
                // The function returns an array of facts
                semanticResults = await getSemanticRelatedFacts(
                    options.message,
                    options.userId
                );
                
                // Convert the facts to a memory context string if needed
                if (semanticResults && semanticResults.length > 0) {
                    memoryContext = `Related memories:\n${semanticResults.map(fact => 
                        `- ${fact.subject} ${fact.predicate} ${fact.object}`
                    ).join('\n')}`;
                }
            } catch (error) {
                console.warn('Could not get semantic search results:', error);
            }
            
            // Run inference with agent
            response = await agent.chat(options.message, {
                userId: options.userId,
                userName: options.userName,
                memoryContext,
                chatHistory: options.chatHistory
            });
        }
        
        // Post-processing: store triples
        try {
            await upsertTriples({
                text: options.message,
                userId: options.userId,
                sourceRef: {
                    type: 'chat',
                    chat_context: {
                        prompt: options.message,
                        response
                    }
                }
            });
        } catch (error) {
            console.warn('Could not store triples:', error);
        }
        
        const endTime = Date.now();
        return {
            message: response,
            duration: endTime - startTime
        };
    } catch (error) {
        console.error('Error in processChatRequest:', error);
        throw error;
    }
} 