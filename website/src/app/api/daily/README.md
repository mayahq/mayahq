# Daily Memories API Endpoint

This API endpoint generates a concise, friendly text message to Blake summarizing recent conversations with Maya, based on the records stored in the `maya_memories` table.

## Requirements

The endpoint requires the following environment variables to be set:
- `COHERE_API_KEY` - Required for generating vector embeddings
- `SUPABASE_SERVICE_ROLE_KEY` - Required for accessing the Supabase database
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase URL

## Usage

The endpoint supports both GET and POST methods for flexibility, especially when integrating with n8n or other automation tools.

### GET Request

```
GET /api/daily?days=7&limit=20
```

### POST Request

```
POST /api/daily
Content-Type: application/json

{
  "days": 7,
  "limit": 20
}
```

## Parameters

- `days` (optional): Number of days to look back for memories (default: 1, max: 30)
- `limit` (optional): Maximum number of memories to retrieve (default: 20, max: 100)

## Response Format

```json
{
  "summary": "Hey Blake, here's your daily update...",
  "count": 10,
  "generated_at": "2023-04-24T19:05:25.674Z"
}
```

### Error Response

```json
{
  "error": "Error message",
  "details": "Additional error details"
}
```

Common error status codes:
- `400` - Invalid parameters
- `429` - API rate limit exceeded
- `500` - Server error or missing configuration

## Special Features

### Memory Storage

The endpoint stores each generated daily update in the `maya_memories` table with:
- Metadata `type: "daily-update"`
- Special user ID `userId: "daily-update"`

When retrieving memories for summarization, it specifically excludes memories with the `daily-update` type to avoid duplication.

### No Memories Handling

If no recent memories are found, a default friendly message is returned and stored:
```
"Hey Blake, no updates today. Talk soon!"
```

### Emoji Handling

The prompt is specifically designed to prevent Claude from using emojis, emoticons, or special characters that represent faces/emotions in its responses.

## n8n Integration

This endpoint is designed to work well with n8n workflows. You can use the HTTP Request node to call this endpoint and then use the response in various ways:

1. Send the daily summary as an email or text message
2. Post it to a Slack channel
3. Create a task in your project management tool
4. Store it in a database
5. Trigger other automation workflows

Example n8n HTTP Request node configuration:
- Method: POST
- URL: https://yourdomain.com/api/daily
- Authentication: None (or as required)
- Request Body: JSON
  ```json
  {
    "days": 7,
    "limit": 20
  }
  ```

## Implementation Details

The API works by:
1. Querying the `maya_memories` table for recent memory entries (excluding daily-update type)
2. Formatting the memories into a prompt
3. Using the Maya agent with Cohere embeddings and LangChain to generate a summarized message
4. Storing the generated message as a new memory with type "daily-update"
5. Returning the result as JSON

## Troubleshooting

If you encounter rate limit errors:
1. Check your Cohere API usage and quotas
2. Consider reducing the frequency of API calls
3. Verify that all required environment variables are set correctly 