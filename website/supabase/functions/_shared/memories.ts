import { db, Memory } from './db.ts';
import { embed } from './embeddings.ts';

// Get insightful memories using semantic search + recency
export async function getInsightfulMemories(uid: string): Promise<Memory[]> {
  try {
    console.log(`Getting insightful memories for user ${uid}`);
    
    // Get vector-based results - semantically similar to "important update or decision"
    let vecResults: Memory[] = [];
    try {
      const queryEmbedding = await embed('important update or decision');
      const { data, error } = await db.matchDocs(queryEmbedding, uid);
      
      if (error) {
        console.error("Error with vector search:", error);
      } else {
        vecResults = data as Memory[] || [];
        console.log(`Retrieved ${vecResults.length} memories via vector search`);
      }
    } catch (error) {
      console.error("Error in vector search:", error);
    }
    
    // Also get newest memories
    const { data: recentData, error: recentError } = await db.newestMem(3);
    
    if (recentError) {
      console.error("Error getting recent memories:", recentError);
    }
    
    const recentMemories = recentData as Memory[] || [];
    console.log(`Retrieved ${recentMemories.length} recent memories`);
    
    // Combine vector results and recent memories, deduplicating by ID
    const combinedMemories = [...vecResults, ...recentMemories];
    const uniqueMemories = Array.from(
      new Map(combinedMemories.map(memory => [memory.id, memory])).values()
    );
    
    console.log(`Final combined unique memories: ${uniqueMemories.length}`);
    return uniqueMemories;
  } catch (error) {
    console.error("Error in getInsightfulMemories:", error);
    return [];
  }
} 