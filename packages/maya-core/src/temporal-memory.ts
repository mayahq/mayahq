/**
 * Temporal Memory Retrieval for Maya
 * 
 * Provides advanced time-based memory search capabilities
 */

import * as chrono from 'chrono-node';

export interface TemporalRange {
  start: Date;
  end: Date;
  description: string;
}

export class TemporalMemoryRetriever {
  /**
   * Parse natural language temporal expressions using chrono-node
   */
  static parseTemporalExpression(expression: string, referenceTime: Date = new Date()): TemporalRange | null {
    // Try chrono-node first for sophisticated parsing
    const parsed = chrono.parse(expression, referenceTime, { forwardDate: false });
    
    if (parsed.length > 0) {
      const result = parsed[0];
      
      // Handle single point in time by creating a range
      if (result.start && !result.end) {
        const start = result.start.date();
        let end = new Date(start);
        
        // Create appropriate ranges based on the precision
        if (result.start.isCertain('hour')) {
          // Hour precision: +1 hour
          end = new Date(start.getTime() + 60 * 60 * 1000);
        } else if (result.start.isCertain('day')) {
          // Day precision: end of day
          end.setHours(23, 59, 59, 999);
        } else if (result.start.isCertain('month')) {
          // Month precision: end of month
          end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
        }
        
        return { start, end, description: expression };
      }
      
      // Handle explicit range
      if (result.start && result.end) {
        return {
          start: result.start.date(),
          end: result.end.date(),
          description: expression
        };
      }
    }
    
    // Fallback for common patterns chrono might miss
    const expr = expression.toLowerCase().trim();
    const now = new Date(referenceTime);
    
    switch (expr) {
      case 'last night':
        // Last night: 6 PM yesterday to 6 AM today
        const lastNightStart = new Date(now);
        lastNightStart.setDate(lastNightStart.getDate() - 1);
        lastNightStart.setHours(18, 0, 0, 0);
        const lastNightEnd = new Date(now);
        lastNightEnd.setHours(6, 0, 0, 0);
        return { start: lastNightStart, end: lastNightEnd, description: 'last night' };
        
      case 'this morning':
        // 6 AM to noon today
        const morningStart = new Date(now);
        morningStart.setHours(6, 0, 0, 0);
        const morningEnd = new Date(now);
        morningEnd.setHours(12, 0, 0, 0);
        return { start: morningStart, end: morningEnd, description: 'this morning' };
    }
    
    return null;
  }
  
  /**
   * Build temporal context for system prompt
   */
  static buildTemporalContext(memories: any[], referenceTime: Date = new Date()): string {
    const now = referenceTime.getTime();
    const grouped: Record<string, any[]> = {
      'last_hour': [],
      'today': [],
      'yesterday': [],
      'this_week': [],
      'older': []
    };
    
    memories.forEach(memory => {
      const memoryTime = new Date(memory.created_at).getTime();
      const hoursDiff = (now - memoryTime) / (1000 * 60 * 60);
      const daysDiff = hoursDiff / 24;
      
      if (hoursDiff < 1) {
        grouped.last_hour.push(memory);
      } else if (daysDiff < 1) {
        grouped.today.push(memory);
      } else if (daysDiff < 2) {
        grouped.yesterday.push(memory);
      } else if (daysDiff < 7) {
        grouped.this_week.push(memory);
      } else {
        grouped.older.push(memory);
      }
    });
    
    let context = '';
    
    if (grouped.last_hour.length > 0) {
      context += `\nMemories from the last hour:\n`;
      grouped.last_hour.forEach(m => {
        context += `- ${m.content}\n`;
      });
    }
    
    if (grouped.today.length > 0) {
      context += `\nMemories from earlier today:\n`;
      grouped.today.forEach(m => {
        context += `- ${m.content}\n`;
      });
    }
    
    if (grouped.yesterday.length > 0) {
      context += `\nMemories from yesterday:\n`;
      grouped.yesterday.forEach(m => {
        context += `- ${m.content}\n`;
      });
    }
    
    return context;
  }
  
  /**
   * Extract temporal hints from user query
   */
  static extractTemporalHints(query: string): string[] {
    const temporalPatterns = [
      /last night/gi,
      /yesterday/gi,
      /today/gi,
      /this morning/gi,
      /last (week|month|hour)/gi,
      /\d+ (hours?|days?|weeks?|months?) ago/gi,
      /remember when/gi,
      /that time when/gi
    ];
    
    const hints: string[] = [];
    
    temporalPatterns.forEach(pattern => {
      const matches = query.match(pattern);
      if (matches) {
        hints.push(...matches.map(m => m.toLowerCase()));
      }
    });
    
    return [...new Set(hints)]; // Remove duplicates
  }
}

// Example enhanced memory retrieval query for Supabase
export const TEMPORAL_MEMORY_SEARCH_FUNCTION = `
CREATE OR REPLACE FUNCTION temporal_memory_search(
  query_embedding vector(1024),
  start_time timestamptz,
  end_time timestamptz,
  similarity_threshold float DEFAULT 0.7,
  max_results int DEFAULT 10
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.content,
    m.metadata,
    m.created_at,
    1 - (m.embedding <=> query_embedding) as similarity
  FROM maya_memories m
  WHERE 
    m.created_at BETWEEN start_time AND end_time
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY 
    similarity DESC,
    m.created_at DESC
  LIMIT max_results;
END;
$$;
`;