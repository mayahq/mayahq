# Memory Embeddings Process

This document explains how embeddings work for maya_memories, particularly for mobile app memories.

## How Embeddings Work

1. **Memory Creation**: 
   - When a memory is created (from web or mobile), it is stored in the `maya_memories` table
   - Initially, the `embedding` column is NULL
   - This allows for fast insertion without embedding generation delays

2. **Embedding Generation**:
   - A background process runs periodically to find memories without embeddings
   - For each memory, it calls the Cohere API to generate a vector embedding
   - The embedding is then stored in the `embedding` column

3. **Memory Search**:
   - Once embeddings are generated, memories can be searched semantically
   - Semantic search uses vector similarity between the query and stored memories

## Implementation Details

### Database Structure

- `maya_memories` table:
  - `id`: Primary key 
  - `content`: Text content of the memory
  - `metadata`: JSONB metadata (includes platform, user info, etc)
  - `embedding`: Vector(1536) column for Cohere embeddings (nullable)
  - `created_at`: Timestamp 
  - `tags`: Array of tags for categorization

### Embedding Generation Process

1. **Marking Memories**:
   - The `mark_memories_for_embedding` function selects memories that need embeddings
   - It uses FOR UPDATE SKIP LOCKED to handle concurrency safely

2. **Generating Embeddings**:
   - An API endpoint `/api/generate-embeddings` processes these marked memories
   - It calls Cohere's API to generate embeddings for each memory's content

3. **Updating Records**:
   - The `update_memory_with_embedding` function updates memories with embeddings
   - It also records the embedding model and version for future reference

## Running the Process

### Automated Scheduled Job

A cron job can be set up to run the embedding process regularly:

```bash
# Run every hour to process up to 100 memories
0 * * * * cd /path/to/project && EMBEDDING_GENERATION_API_KEY=your_key node website/scripts/process-embeddings.js 100
```

### Manual Processing

You can also trigger the process manually:

```bash
# Set the API key
export EMBEDDING_GENERATION_API_KEY=your_key

# Process 50 memories
node website/scripts/process-embeddings.js 50
```

## Mobile App Integration

The mobile app doesn't need to worry about embeddings at all. It simply:

1. Stores memories in `maya_memories` table (via our API endpoints) 
2. Leaves the `embedding` column NULL
3. The background process will handle embedding generation

This separation of concerns makes the mobile app simpler and more efficient.

## Troubleshooting

If embeddings aren't being generated:

1. Check system_logs table for embedding-related errors
2. Verify the Cohere API key is valid 
3. Make sure the cron job is running properly
4. Look for memory records stuck in "processing" state

## API Reference

### `/api/generate-embeddings`

POST endpoint that processes a batch of memories.

Headers:
- `x-api-key`: Authentication key 

Body:
```json
{
  "batchSize": 50 // Number of memories to process
}
```

Response:
```json
{
  "success": true,
  "processed": 50,
  "successful": 48,
  "timestamp": "2025-05-06T20:15:23.456Z"
}
``` 