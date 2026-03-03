# Advanced Memory Retrieval Techniques for Maya

## Current State vs. Future Vision

### What Maya Has Now
- Basic vector similarity search using Cohere embeddings
- Keyword fallback search with ILIKE
- Simple timestamp storage (created_at)
- Limited to 10 memories per query

### What Maya Needs

## 1. Temporal Memory Retrieval 🕐

Enable queries like:
- "What did we talk about last night?"
- "Remember that conversation from yesterday?"
- "What happened 3 days ago?"

### Implementation Plan

```typescript
// Enhanced memory retrieval in service.ts
private async retrieveRelevantMemories(
  userId: string, 
  query: string, 
  options: {
    limit?: number;
    temporalHint?: string;
    dateRange?: { start: Date; end: Date };
  } = {}
) {
  // Parse temporal expressions
  if (options.temporalHint) {
    const range = TemporalMemoryRetriever.parseTemporalExpression(options.temporalHint);
    // Add date filtering to query
  }
}
```

## 2. Knowledge Graph Architecture 🕸️

Transform flat memories into interconnected knowledge:

### Entity Extraction
- People: Blake, Maya, friends mentioned
- Places: Nashville, venues, locations
- Concepts: Projects, ideas, topics
- Events: Meetings, conversations, activities

### Relationship Mapping
```typescript
// Example graph structure
{
  nodes: [
    { id: "memory_4811", type: "memory", content: "Silicon Valley..." },
    { id: "entity_nashville", type: "place", name: "Nashville" },
    { id: "entity_oracle", type: "company", name: "Oracle" }
  ],
  edges: [
    { from: "memory_4811", to: "entity_nashville", type: "mentions" },
    { from: "memory_4811", to: "entity_oracle", type: "about" }
  ]
}
```

### Benefits
- Query by entity: "What do you know about Oracle?"
- Relationship queries: "How is Nashville connected to tech?"
- Context clustering: Group related memories automatically

## 3. Multi-Stage Retrieval Pipeline 🔍

### Stage 1: Broad Recall
- Vector search (semantic similarity)
- BM25 search (keyword relevance)
- Temporal filtering
- Entity matching

### Stage 2: Reranking
- Cross-encoder model for relevance scoring
- Recency weighting
- Importance scoring
- User interaction history

### Stage 3: Context Enrichment
- Pull related memories
- Add temporal context
- Include entity relationships

## 4. Adaptive Memory Importance 📊

### Dynamic Importance Scoring
```typescript
importance = base_importance 
  * recency_factor         // Recent memories weighted higher
  * access_frequency       // Often retrieved = important
  * emotional_weight       // Emotional moments = memorable
  * explicit_importance    // User marked as important
```

### Memory Decay
- Gradual importance reduction over time
- Unless reinforced by retrieval or reference
- Exceptions for core memories

## 5. Conversational Memory Chains 🔗

Link memories by conversation context:
- Group memories from same conversation session
- Track topic evolution across sessions
- Maintain conversation threads

## 6. Multimodal Memory Integration 🖼️

Currently Maya stores image descriptions, but could:
- Generate embeddings from images directly
- Cross-modal retrieval (text query → image memories)
- Scene understanding and object relationships

## Industry Approaches

### OpenAI (ChatGPT)
- Simple key-value pairs
- No complex retrieval
- User-controlled memory management
- Privacy-first design

### Google (Gemini + Knowledge Graph)
- Leverages massive knowledge graph
- Temporal reasoning in model
- Cross-modal understanding
- Entity-centric retrieval

### Meta (LLaMA)
- Focus on efficient retrieval
- Graph neural networks
- Learned retrieval (model decides what to fetch)

## Recommended Next Steps for Maya

### Phase 1: Temporal Retrieval (Immediate)
1. Implement temporal expression parser
2. Add date range filtering to memory queries
3. Create temporal memory search function in Supabase
4. Update UI to support time-based queries

### Phase 2: Knowledge Graph (Short-term)
1. Entity extraction pipeline
2. Graph database integration (Neo4j or Supabase graph extensions)
3. Relationship extraction from memories
4. Graph-based retrieval endpoints

### Phase 3: Advanced Pipeline (Long-term)
1. Implement reranking model
2. Add importance decay system
3. Build conversation threading
4. Multimodal embedding generation

## Database Migrations Needed

```sql
-- Add temporal indexing
CREATE INDEX idx_maya_memories_created_at ON maya_memories(created_at DESC);

-- Add importance decay
ALTER TABLE maya_memories ADD COLUMN last_accessed timestamptz DEFAULT NOW();
ALTER TABLE maya_memories ADD COLUMN access_count integer DEFAULT 0;

-- Entity extraction table
CREATE TABLE maya_entities (
  id bigserial PRIMARY KEY,
  entity_type text NOT NULL,
  entity_name text NOT NULL,
  attributes jsonb,
  created_at timestamptz DEFAULT NOW()
);

-- Memory-entity relationships
CREATE TABLE maya_memory_entities (
  memory_id bigint REFERENCES maya_memories(id),
  entity_id bigint REFERENCES maya_entities(id),
  relationship_type text,
  confidence float,
  PRIMARY KEY (memory_id, entity_id)
);
```

## Performance Considerations

- Hybrid search requires multiple queries (use parallel execution)
- Reranking adds latency (cache results)
- Graph queries can be expensive (use materialized views)
- Temporal parsing should be cached

## Privacy & User Control

- Users should be able to:
  - Delete memories by time range
  - Mark memories as private
  - Export their memory graph
  - Control importance weights
  - Disable certain memory types