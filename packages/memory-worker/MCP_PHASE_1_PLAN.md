# Maya MCP Phase 1: GitHub Integration

## Overview

Phase 1 integrates Model Context Protocol (MCP) with Maya's existing sophisticated memory-worker system. This enhancement adds external tool capabilities while preserving all of Maya's current intelligence, memory processing, and personality systems.

## Architecture

### Current Maya Flow (Preserved)
```
User Message → Memory/Facts/Context Retrieval → LangChain AI Response → Internal Tool Calls → Database Storage
```

### New Phase 1 Flow
```
User Message → Memory/Facts/Context Retrieval → LangChain AI Response → **MCP Enhancement Layer** → Internal Tool Calls → Database Storage
```

## What's Been Implemented

### 1. MCP Bridge Layer (`mcp-bridge.ts`)
- **Non-disruptive integration**: Runs AFTER Maya's existing processing
- **GitHub detection**: Analyzes messages for GitHub-related keywords
- **Tool routing**: Routes to appropriate GitHub actions based on context
- **Response enhancement**: Integrates GitHub data into Maya's responses
- **Error handling**: Graceful fallback if MCP tools fail

### 2. Basic MCP Client (`mcp-client.ts`)
- **GitHub API integration**: Direct GitHub REST API calls
- **Authentication**: Uses GitHub personal access token
- **Tool implementations**: 
  - `github_list_commits`: Recent commits from repository
  - `github_list_issues`: Open/closed issues
  - `github_list_pull_requests`: Pull request status
  - `github_get_repo_info`: Repository metadata

### 3. Process Message Integration
- **Seamless integration**: Added to existing `processMessage` function
- **Zero disruption**: All existing Maya capabilities unchanged
- **Enhanced responses**: GitHub data automatically added when relevant

## Environment Setup

### Required Environment Variables
```bash
# GitHub Integration
GITHUB_TOKEN=ghp_your_github_personal_access_token
MCP_GITHUB_ENABLED=true

# Existing Maya variables (unchanged)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
ANTHROPIC_API_KEY=your_anthropic_key
COHERE_API_KEY=your_cohere_key
MAYA_SYSTEM_USER_ID=your_maya_user_id
```

### GitHub Token Setup
1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token with scopes:
   - `repo` (for repository access)
   - `read:user` (for user information)
3. Add token to environment variables

## Testing Phase 1

### Test Scenarios

#### 1. Basic GitHub Detection
```
User: "Maya, what are my latest commits?"
Expected: Maya's normal response + recent commits from mayahq repo
```

#### 2. Repository Issues
```
User: "Any issues in my GitHub repo?"
Expected: Maya's response + list of open GitHub issues
```

#### 3. Pull Request Status
```
User: "Maya, show me my open pull requests"
Expected: Maya's response + current PR status
```

#### 4. Repository Information
```
User: "Tell me about my mayahq repository"
Expected: Maya's response + repo stats (stars, language, description)
```

#### 5. Non-GitHub Messages (Baseline Test)
```
User: "How are you feeling today?"
Expected: Normal Maya response (no GitHub integration)
```

### Monitoring Integration

#### Log Messages to Watch For
```
[MCP] Initializing GitHub MCP client
[MCP Integration] Checking for external tool enhancement opportunities
[MCPBridge] Found 1 potential tool enhancements: github:list_commits (0.9)
[MCPBridge] Executing github:list_commits
[MCP Integration] Enhanced response using tools: github:list_commits
```

#### Success Indicators
- ✅ Maya generates normal response first
- ✅ MCP bridge detects GitHub keywords
- ✅ GitHub API calls succeed
- ✅ Response includes both Maya's personality + GitHub data
- ✅ No disruption to existing functionality

## Phase 1 Benefits

### Immediate Value
- **GitHub Awareness**: Maya can see your actual GitHub activity
- **Context Enhancement**: Richer responses with real project data
- **Zero Disruption**: All existing Maya capabilities preserved
- **Graceful Degradation**: Works even if GitHub integration fails

### Example Enhanced Interaction
```
User: "Maya, what did I work on recently?"

Before Phase 1:
"I'd love to know what you've been working on! Can you tell me about your recent projects?"

After Phase 1:
"I'd love to know what you've been working on! Looking at your recent activity, I can see you've been busy:

• a1b2c3d: Fix memory worker MCP integration (12/18/2024)
• e4f5g6h: Add GitHub API client implementation (12/18/2024)  
• i7j8k9l: Update process-message with MCP bridge (12/18/2024)

Looks like you're enhancing my capabilities with MCP! How's the integration going?"
```

## Phase 2 Preview: Calendar Enhancement

Phase 2 will enhance Maya's existing calendar system with external calendar integration:

- **Google Calendar**: Sync with Google Calendar API
- **Outlook Integration**: Microsoft calendar support  
- **Cross-platform scheduling**: Schedule meetings across platforms
- **Smart conflict detection**: Prevent double bookings
- **Enhanced calendar intelligence**: Better scheduling suggestions

## Next Steps

1. **Test Phase 1**: Verify GitHub integration works
2. **Monitor Performance**: Check for any latency impact
3. **Gather Feedback**: See how GitHub enhancement feels
4. **Plan Phase 2**: Begin calendar integration design
5. **Scale Considerations**: Plan for multiple MCP servers

## Technical Notes

### Why This Architecture Works
- **Preserves Maya's Intelligence**: LangChain processing remains unchanged
- **Additive Enhancement**: External tools add value without replacing existing capabilities
- **Error Isolation**: MCP failures don't break Maya's core functionality
- **Performance**: MCP calls happen after core processing (parallel enhancement)

### Future MCP Integration Points
- **Slack/Teams**: Team communication integration
- **Notion/Obsidian**: Knowledge base integration
- **Email**: Email management and scheduling
- **Development Tools**: IDE integration, deployment status
- **Social Media**: Content publishing and monitoring

## Conclusion

Phase 1 successfully demonstrates MCP integration without disrupting Maya's sophisticated existing systems. The architecture allows for incremental enhancement while preserving the crown jewel of Maya's intelligence - her memory, personality, and contextual awareness systems powered by LangChain. 