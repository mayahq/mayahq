# Web Search Feature Setup Guide

## Overview

Maya now has the ability to search the web for current information, news, technical documentation, and more. This feature is implemented with built-in guardrails including rate limiting, caching, and token limits.

## Setup Instructions

### 1. Environment Variables

Add one or both of these API keys to your `.env` file:

```bash
# Primary search provider (recommended)
SERPER_API_KEY=your_serper_api_key_here

# Alternative search provider
BRAVE_SEARCH_API_KEY=your_brave_search_api_key_here
```

**Getting API Keys:**
- **Serper API**: Sign up at [serper.dev](https://serper.dev) - offers 2,500 free searches/month
- **Brave Search API**: Sign up at [brave.com/search/api](https://brave.com/search/api) - offers 2,000 free searches/month

### 2. Database Setup

Run the migration to create the required tables:

```sql
-- Run this in your Supabase SQL editor
-- Location: packages/memory-worker/migrations/create_web_search_tables.sql
```

### 3. Install Dependencies

```bash
cd packages/memory-worker
npm install
```

## How It Works

### Tool Calling Flow

1. User asks a question requiring current information
2. Maya recognizes the need for web search and generates: `TOOL_CALL_WEB_SEARCH: { "query": "...", "search_type": "...", "max_results": 5 }`
3. Memory worker performs the search with rate limiting and caching
4. Results are formatted and passed back to Maya
5. Maya synthesizes the information and responds conversationally

### Example Interactions

**News Query:**
```
User: "What's the latest news about SpaceX?"
Maya: *searches web* According to recent reports from Space.com and Reuters...
```

**Technical Query:**
```
User: "What's new in React 19?"
Maya: *searches web* Based on the latest React documentation and blog posts...
```

**Research Query:**
```
User: "What are the current AI safety regulations in the EU?"
Maya: *searches web* The EU's recent AI Act, which came into effect...
```

## Features & Guardrails

### Rate Limiting
- 10 searches per minute per user
- Prevents abuse and manages API costs

### Caching
- Results cached for 30 minutes
- Reduces redundant API calls
- Improves response speed

### Search Types
- `general`: Default web search
- `news`: Recent news articles
- `technical`: Technical documentation
- `academic`: Research papers and scholarly content

### Result Limits
- Default: 5 results
- Maximum: 10 results per search
- Prevents token overflow in responses

### Error Handling
- Graceful fallback between search providers
- Clear error messages to users
- Logging for debugging

## Monitoring & Analytics

### Search Logs Table
- Tracks all searches performed
- Useful for understanding usage patterns
- Can identify popular queries for optimization

### Cache Performance
- Monitor cache hit rates
- Identify frequently searched topics
- Optimize caching strategy

## Best Practices

1. **API Key Security**
   - Never commit API keys to git
   - Use environment variables only
   - Rotate keys periodically

2. **Cost Management**
   - Monitor API usage dashboards
   - Set up billing alerts
   - Consider implementing user quotas

3. **Search Quality**
   - Maya will automatically refine queries
   - Searches are context-aware
   - Results are synthesized, not just listed

4. **User Experience**
   - Maya indicates when searching
   - Cites sources appropriately
   - Admits when information conflicts

## Troubleshooting

### No Search Results
- Check API keys are correctly set
- Verify tables were created
- Check rate limit hasn't been exceeded

### Slow Searches
- Normal first search: 2-3 seconds
- Cached searches: <100ms
- Check network connectivity

### Error Messages
- "Rate limit exceeded": Wait 1 minute
- "No search API keys configured": Add API keys
- "Search failed": Check API key validity

## Future Enhancements

1. **Additional Providers**
   - Google Custom Search
   - Bing Search API
   - DuckDuckGo API

2. **Advanced Features**
   - Image search
   - Video search
   - Location-based search
   - Language-specific search

3. **Intelligence Layer**
   - Automatic query refinement
   - Result quality scoring
   - Source credibility assessment

## Security Considerations

1. **Input Sanitization**
   - All queries are sanitized
   - Prevents injection attacks
   - Limits query length

2. **Output Filtering**
   - No execution of code from results
   - URL validation
   - Content moderation

3. **User Privacy**
   - Searches logged with user ID
   - Can be anonymized if needed
   - Respect user preferences 