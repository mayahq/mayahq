# Web Search Metadata Documentation

## Overview

When Maya performs web searches, the system adds metadata to both system event messages and Maya's responses to track the source of information and provide transparency.

## Metadata Structure

### 1. System Event Message (Web Search Event)

When a web search is performed, a system message is stored with the following metadata:

```json
{
  "type": "web_search_event",
  "search_query": "What's the latest news about AI?",
  "search_type": "news",
  "result_count": 5,
  "sources": [
    {
      "title": "Breaking: New AI Model Released",
      "url": "https://example.com/article1",
      "source": "techcrunch.com"
    },
    // ... more sources
  ]
}
```

### 2. Maya's Response Message

When Maya's response contains web search results, her message includes:

```json
{
  "replyTo": "message-id-being-replied-to",
  "timestamp": "2024-01-15T10:30:00Z",
  "contains_web_search": true,
  "web_search_query": "What's the latest news about AI?",
  "web_search_type": "news",
  "source": "web_search_enhanced"
}
```

## Benefits

This metadata structure provides:

1. **Transparency**: Users and developers can identify when information comes from web searches
2. **Traceability**: Track which searches led to which responses
3. **Analytics**: Analyze web search usage patterns
4. **Filtering**: Query messages that contain web-sourced information
5. **Source Attribution**: Know exactly which websites provided the information

## Querying Web Search Messages

### Find all messages containing web search results:

```sql
SELECT * FROM messages 
WHERE metadata->>'contains_web_search' = 'true'
ORDER BY created_at DESC;
```

### Find all web search events:

```sql
SELECT * FROM messages 
WHERE role = 'system' 
AND metadata->>'type' = 'web_search_event'
ORDER BY created_at DESC;
```

### Get search queries and their results:

```sql
SELECT 
  metadata->>'search_query' as query,
  metadata->>'search_type' as type,
  metadata->>'result_count' as results,
  created_at
FROM messages 
WHERE metadata->>'type' = 'web_search_event'
ORDER BY created_at DESC;
```

### Find Maya's responses for a specific search query:

```sql
SELECT * FROM messages 
WHERE role = 'assistant'
AND metadata->>'web_search_query' = 'your search query here'
ORDER BY created_at DESC;
```

## Memory Storage

When these messages are processed by the memory ingestion queue, they maintain their metadata, allowing Maya to:
- Remember that certain information came from web searches
- Potentially weight web-sourced information differently
- Provide citations when recalling web-sourced facts
- Understand the temporal nature of web-sourced information (news becomes outdated) 