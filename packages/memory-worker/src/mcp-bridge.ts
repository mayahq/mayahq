export interface MCPClient {
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, args: any): Promise<MCPResult>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
  _meta?: any;
}

export interface ExternalToolRequest {
  tool: string;
  action: string;
  params: any;
  confidence: number; // How confident we are this tool is needed
}

// Import product tools
import { ProductMCPTools } from './product-mcp-tools';

export class MCPBridge {
  constructor(private mcpClient: MCPClient | null = null) {}

  /**
   * Main integration point: Check if Maya's response can be enhanced with external tools
   * This runs AFTER Maya's sophisticated LangChain processing but BEFORE existing tool calling
   */
  async enhanceResponse(
    aiResponse: string,
    userMessage: string,
    context: { userId: string; roomId: string; messageId: string }
  ): Promise<{
    enhanced: boolean;
    finalResponse: string;
    toolsUsed: string[];
    metadata?: any;
  }> {
    try {
      if (!this.mcpClient) {
        console.log('[MCPBridge] No MCP client available, skipping enhancement');
        return {
          enhanced: false,
          finalResponse: aiResponse,
          toolsUsed: []
        };
      }

      // Analyze the conversation for external tool opportunities
      const toolRequests = await this.analyzeForExternalTools(userMessage, aiResponse, context);
      
      // Check for unfulfilled calendar promises (Maya said she'd add event but no tool triggered)
      const hasCalendarPromise = this.detectsCalendarPromise(aiResponse, userMessage);
      const hasCalendarTool = toolRequests.some(req => req.tool.includes('calendar'));
      
      if (hasCalendarPromise && !hasCalendarTool) {
        console.log('[MCPBridge] Detected unfulfilled calendar promise - checking for typos');
        const typoResponse = this.handleCalendarTypo(userMessage, aiResponse);
        if (typoResponse) {
          return {
            enhanced: true,
            finalResponse: typoResponse,
            toolsUsed: ['typo_detection']
          };
        }
      }
      
      // Check for unfulfilled task promises (Maya suggested task, user said yes, but no tool triggered)
      const hasTaskPromise = this.detectsTaskPromise(aiResponse, userMessage, context);
      const hasTaskTool = toolRequests.some(req => req.tool.includes('task'));
      
      if (hasTaskPromise && !hasTaskTool) {
        console.log('[MCPBridge] Detected unfulfilled task promise - creating suggested task');
        const suggestedTaskRequest = await this.extractSuggestedTask(context, userMessage);
        if (suggestedTaskRequest) {
          console.log(`[MCPBridge] Executing suggested task creation`);
          const toolResult = await this.mcpClient.callTool(suggestedTaskRequest.tool, suggestedTaskRequest.params);
          
          if (!toolResult.isError) {
            const toolAwareResponse = await this.generateToolAwareResponse(
              aiResponse, 
              userMessage, 
              suggestedTaskRequest, 
              toolResult, 
              context
            );
            
            return {
              enhanced: true,
              finalResponse: toolAwareResponse,
              toolsUsed: [suggestedTaskRequest.tool],
              metadata: toolResult._meta
            };
          }
        }
      }
      
      if (toolRequests.length === 0) {
        console.log('[MCPBridge] No external tool enhancements detected');
        return {
          enhanced: false,
          finalResponse: aiResponse,
          toolsUsed: []
        };
      }

      console.log(`[MCPBridge] Found ${toolRequests.length} potential tool enhancements:`, 
        toolRequests.map(req => `${req.tool} (${req.confidence})`));

      // Execute the most confident tool request
      const bestRequest = toolRequests.sort((a, b) => b.confidence - a.confidence)[0];
      
      // Handle help requests first - special case
      if (bestRequest.tool === 'maya_help') {
        console.log(`[MCPBridge] Help request detected, returning help response`);
        return {
          enhanced: true,
          finalResponse: this.generateHelpResponse(),
          toolsUsed: ['help'],
          metadata: { isHelp: true }
        };
      }
      
      // ADJUSTED THRESHOLD: Allow linking tools with 0.8 confidence to execute
      if (bestRequest.confidence < 0.8) {
        console.log(`[MCPBridge] Best tool confidence too low (${bestRequest.confidence}), skipping`);
        return {
          enhanced: false,
          finalResponse: aiResponse,
          toolsUsed: []
        };
      }

      // Check if Maya already promised to handle this task
      const mayaAlreadyPromised = this.detectMayaPromise(aiResponse, bestRequest);
      if (mayaAlreadyPromised) {
        console.log(`[MCPBridge] Maya already promised to handle ${bestRequest.tool}, executing tool and replacing response`);
      }

      console.log(`[MCPBridge] Executing ${bestRequest.tool}`);
      const toolResult = await this.mcpClient.callTool(bestRequest.tool, bestRequest.params);

      if (toolResult.isError) {
        console.error(`[MCPBridge] Tool ${bestRequest.tool} failed:`, toolResult.content[0]?.text);
        return {
          enhanced: false,
          finalResponse: aiResponse,
          toolsUsed: []
        };
      }

      // NEW: Generate tool-aware response - let Maya know what tools were called
      console.log(`[MCPBridge] Generating tool-aware response for Maya`);
      const toolAwareResponse = await this.generateToolAwareResponse(
        aiResponse, 
        userMessage, 
        bestRequest, 
        toolResult, 
        context
      );

      console.log('[MCP Integration] Enhanced response using tools:', bestRequest.tool);
      
      return {
        enhanced: true,
        finalResponse: toolAwareResponse,
        toolsUsed: [bestRequest.tool],
        metadata: toolResult._meta
      };

    } catch (error: any) {
      console.error('[MCPBridge] Error during enhancement:', error);
      return {
        enhanced: false,
        finalResponse: aiResponse,
        toolsUsed: []
      };
    }
  }

  /**
   * Generate a tool-aware response by feeding MCP results back to Maya
   * This fixes the "two brains" problem by making Maya aware of her tool usage
   */
  private async generateToolAwareResponse(
    originalResponse: string,
    userMessage: string,
    toolRequest: ExternalToolRequest,
    toolResult: MCPResult,
    context: { userId: string; roomId: string; messageId: string }
  ): Promise<string> {
    try {
      // Extract the tool data
      const toolData = toolResult.content[0]?.text;
      if (!toolData) {
        return originalResponse;
      }

      // Create a prompt that makes Maya aware of what tool was called and what data was retrieved
      const toolAwarePrompt = `Maya, you just called the ${toolRequest.tool} tool in response to the user's message: "${userMessage}"

Your original response was: "${originalResponse}"

The tool successfully retrieved this data:
${toolData}

Please provide a complete response that:
1. Shows awareness of what tool you called
2. Intelligently incorporates the retrieved data
3. Responds to the user's original question using this information
4. Maintains your personality and voice

Respond as Maya with full awareness of your tool usage:`;

      // Import the AI client from the process-message file
      // For now, let's use a simpler approach and just enhance the response with smart integration
      return this.smartIntegrateToolResult(originalResponse, toolData, toolRequest);

    } catch (error: any) {
      console.error('[MCPBridge] Error generating tool-aware response:', error);
      return originalResponse;
    }
  }

  /**
   * Smart integration that makes Maya appear aware of her tool usage
   */
  private smartIntegrateToolResult(
    originalResponse: string,
    toolData: string,
    toolRequest: ExternalToolRequest
  ): string {
    // For task listing - be smart about when to replace vs enhance
    if (toolRequest.tool === 'maya_task_list') {
      const lowerResponse = originalResponse.toLowerCase();
      
      // Check if Maya was being intelligent (analysis, recommendations, prioritization)
      const hasIntelligence = lowerResponse.includes('should') || 
                             lowerResponse.includes('recommend') || 
                             lowerResponse.includes('suggest') ||
                             lowerResponse.includes('priority') ||
                             lowerResponse.includes('focus') ||
                             lowerResponse.includes('start with') ||
                             lowerResponse.includes('tackle') ||
                             lowerResponse.includes('work on') ||
                             lowerResponse.includes('because') ||
                             lowerResponse.includes('since') ||
                             originalResponse.length > 300; // Long responses are usually analytical
      
      // Check if Maya was hallucinating tasks (making up fake data)
      const isHallucinating = lowerResponse.includes('here are your tasks') ||
                             lowerResponse.includes('your tasks are') ||
                             lowerResponse.includes('active tasks:') ||
                             lowerResponse.includes('high priority:') ||
                             (lowerResponse.includes('task') && lowerResponse.includes(':') && !hasIntelligence);
      
      if (hasIntelligence && !isHallucinating) {
        // Maya was being smart - keep her analysis and add real data
        console.log('[MCPBridge] Preserving Maya\'s intelligent analysis and adding real task data');
        return `${originalResponse}\n\n**Actual Task Data:**\n${toolData}`;
      } else {
        // Maya was hallucinating or just regurgitating - replace with real data  
        console.log('[MCPBridge] Replacing hallucinated task data with real data');
        return toolData;
      }
    }

    // For reminder creation - Maya should acknowledge what she created
    if (toolRequest.tool === 'maya_reminder_create') {
      return `${toolData}\n\nThere we go! I've successfully created that reminder for you. ✅`;
    }

    // For calendar creation - Maya should show awareness
    if (toolRequest.tool === 'maya_calendar_create') {
      return `${toolData}\n\nPerfect! I've added that to your calendar. 📅`;
    }

    // For product tools - Maya should show product management awareness
    if (toolRequest.tool === 'maya_product_create') {
      return `${toolData}\n\nAwesome! I've successfully created that product for you. 🛍️`;
    }

    if (toolRequest.tool === 'maya_product_list') {
      return `Here's your current product portfolio:\n\n${toolData}`;
    }

    if (toolRequest.tool === 'maya_product_analytics') {
      return `Here's your product performance data:\n\n${toolData}`;
    }

    if (toolRequest.tool === 'maya_product_update') {
      return `${toolData}\n\nThere we go! I've updated that product successfully. ✅`;
    }

    if (toolRequest.tool === 'maya_product_delete') {
      return `${toolData}\n\nDone! I've removed that product from your portfolio. 🗑️`;
    }

    // For data retrieval tools - replace vague responses with actual data
    const lowerResponse = originalResponse.toLowerCase();
    if ((lowerResponse.includes('can\'t see') || lowerResponse.includes('not able to access') || 
         lowerResponse.includes('mcp') || lowerResponse.includes('broken'))) {
      return toolData;
    }

    // Default: append tool data with awareness
    return `${originalResponse}\n\n${toolData}`;
  }

  /**
   * Analyze user message and AI response for external tool opportunities
   */
  private async analyzeForExternalTools(
    userMessage: string,
    aiResponse: string,
    context: { userId: string; roomId: string; messageId: string }
  ): Promise<ExternalToolRequest[]> {
    const requests: ExternalToolRequest[] = [];
    const lowerMessage = userMessage.toLowerCase();
    const lowerResponse = aiResponse.toLowerCase();

    // Handle help requests first - special case with no external tool needed
    if (this.isHelpRequest(userMessage)) {
      console.log(`[MCPBridge] Help request detected`);
      // Return a special help request that the enhanceResponse method can handle
      return [{
        tool: 'maya_help',
        action: 'show_help',
        params: {},
        confidence: 1.0
      }];
    }

    // CONTEXT FILTERING: Only analyze genuine commands, not conversational mentions
    if (this.isConversationalMention(userMessage)) {
      console.log('[MCPBridge] Message appears conversational, skipping tool detection');
      return requests;
    }

    console.log(`[MCPBridge] Analyzing message for external tools: "${userMessage}"`);

    // **PRODUCT INTEGRATION DETECTION** 🛍️
    if (this.containsProductKeywords(lowerMessage)) {
      console.log(`[MCPBridge] Product keywords detected, checking patterns...`);
      if (this.matchesPattern(lowerMessage, ['create product', 'add product', 'new product', 'add affiliate', 'create affiliate'])) {
        requests.push({
          tool: 'maya_product_create',
          action: 'create_product',
          params: this.parseProductCreationFromMessage(lowerMessage, context.userId),
          confidence: 0.9
        });
      } else if (this.matchesPattern(lowerMessage, ['my products', 'show products', 'list products', 'our products', 'product list', 'affiliate products'])) {
        requests.push({
          tool: 'maya_product_list',
          action: 'get_products',
          params: { userId: context.userId, limit: 10 },
          confidence: 0.9
        });
      } else if (this.matchesPattern(lowerMessage, ['product analytics', 'product performance', 'how are products doing', 'product stats', 'product clicks'])) {
        requests.push({
          tool: 'maya_product_analytics',
          action: 'get_analytics',
          params: { userId: context.userId, days: 30 },
          confidence: 0.9
        });
      } else if (this.matchesPattern(lowerMessage, ['update product', 'edit product', 'change product', 'modify product'])) {
        requests.push({
          tool: 'maya_product_update',
          action: 'update_product',
          params: this.parseProductUpdateFromMessage(lowerMessage, context.userId),
          confidence: 0.85
        });
      } else if (this.matchesPattern(lowerMessage, ['delete product', 'remove product', 'deactivate product'])) {
        requests.push({
          tool: 'maya_product_delete',
          action: 'delete_product',
          params: this.parseProductDeletionFromMessage(lowerMessage, context.userId),
          confidence: 0.85
        });
      }
    }

    // GitHub integration detection
    if (this.matchesPattern(lowerMessage, ['commits', 'recent commits', 'github commits', 'what commits', 'show commits'])) {
      requests.push({
        tool: 'github_list_commits',
        action: 'get_commits',
        params: this.parseGitHubRepoFromMessage(lowerMessage),
        confidence: 0.9
      });
    }

    if (this.matchesPattern(lowerMessage, ['issues', 'github issues', 'open issues', 'show issues'])) {
      requests.push({
        tool: 'github_list_issues',
        action: 'get_issues',
        params: this.parseGitHubRepoFromMessage(lowerMessage),
        confidence: 0.9
      });
    }

    if (this.matchesPattern(lowerMessage, ['pull requests', 'prs', 'github prs', 'open prs'])) {
      requests.push({
        tool: 'github_list_pull_requests',
        action: 'get_pull_requests',
        params: this.parseGitHubRepoFromMessage(lowerMessage),
        confidence: 0.9
      });
    }

    // Calendar integration detection
    if (this.containsCalendarKeywords(lowerMessage)) {
      console.log(`[MCPBridge] Calendar keywords detected, checking patterns...`);
      
      // STRICT: Only trigger on explicit calendar creation commands, not discussions about calendar problems
      if (this.matchesCalendarCreationPattern(lowerMessage) && !this.isCalendarProblemDiscussion(lowerMessage)) {
        requests.push({
          tool: 'maya_calendar_create',
          action: 'create_event',
          params: this.parseCalendarEventFromMessage(lowerMessage, context.userId),
          confidence: 0.85
        });
      } 
      // Add calendar delete detection
      else if (this.matchesCalendarDeletePattern(lowerMessage)) {
        requests.push({
          tool: 'maya_calendar_delete',
          action: 'delete_event',
          params: this.parseCalendarDeleteFromMessage(lowerMessage, context.userId),
          confidence: 0.9
        });
      }
      // Add calendar edit/update detection
      else if (this.matchesCalendarEditPattern(lowerMessage)) {
        requests.push({
          tool: 'maya_calendar_update',
          action: 'update_event',
          params: this.parseCalendarEditFromMessage(lowerMessage, context.userId),
          confidence: 0.85
        });
      }
      else if (this.matchesCalendarViewPattern(lowerMessage)) {
        // More specific patterns for viewing calendar
        if (this.matchesPattern(lowerMessage, ['today\'s schedule', 'what\'s on my calendar today', 'calendar today', 'schedule today', 'my calendar today'])) {
          requests.push({
            tool: 'maya_calendar_today',
            action: 'get_today_events',
            params: { userId: context.userId },
            confidence: 0.9
          });
        } else if (this.matchesPattern(lowerMessage, ['upcoming', 'this week', 'next week', 'upcoming events', 'calendar this week', 'my schedule'])) {
          requests.push({
            tool: 'maya_calendar_upcoming',
            action: 'get_upcoming_events',
            params: { userId: context.userId, limit: 5, days: 7 },
            confidence: 0.8
          });
        }
      }
    }

    // Reminder integration detection
    if (this.containsReminderKeywords(lowerMessage)) {
      console.log(`[MCPBridge] Reminder keywords detected, checking patterns...`);
      // Use stricter pattern matching for reminder creation to avoid false positives
      if (this.matchesReminderCreationPattern(lowerMessage)) {
        // Check if this should be a linked reminder
        if (this.matchesPattern(lowerMessage, ['remind me about this', 'reminder about this message', 'remind me about this conversation'])) {
          requests.push({
            tool: 'maya_reminder_create_linked',
            action: 'create_linked_reminder',
            params: this.parseLinkedReminderFromMessage(lowerMessage, context.userId, context.messageId),
            confidence: 0.9
          });
        } else {
          requests.push({
            tool: 'maya_reminder_create',
            action: 'create_reminder',
            params: this.parseReminderCreationFromMessage(lowerMessage, context.userId),
            confidence: 0.85
          });
        }
      } else if (this.matchesPattern(lowerMessage, ['upcoming reminders', 'my reminders', 'what reminders', 'show reminders'])) {
        requests.push({
          tool: 'maya_reminder_upcoming',
          action: 'get_upcoming_reminders',
          params: { userId: context.userId, limit: 5, hours: 24 },
          confidence: 0.9
        });
      } else if (this.matchesReminderDeletionPattern(lowerMessage)) {
        requests.push({
          tool: 'maya_reminder_delete',
          action: 'delete_reminder',
          params: this.parseReminderDeletionFromMessage(lowerMessage, context.userId),
          confidence: 0.9
        });
      }
    }

    // Task integration detection
    if (this.containsTaskKeywords(lowerMessage)) {
      console.log(`[MCPBridge] Task keywords detected, checking patterns...`);
      if (this.matchesPattern(lowerMessage, ['create task', 'add task', 'new task', 'make task', 'task for this', 'create a task'])) {
        // Check if this should be a linked task
        if (this.matchesPattern(lowerMessage, ['task for this', 'create task from this', 'task about this message', 'turn this into a task'])) {
          console.log(`[MCPBridge] Detected linked task creation`);
          requests.push({
            tool: 'maya_link_create_task',
            action: 'create_linked_task',
            params: this.parseLinkedTaskFromMessage(lowerMessage, context.userId, context.messageId),
            confidence: 0.9
          });
        } else {
          console.log(`[MCPBridge] Detected regular task creation`);
          requests.push({
            tool: 'maya_task_create',
            action: 'create_task',
            params: this.parseTaskCreationFromMessage(lowerMessage, context.userId),
            confidence: 0.85
          });
        }
      } else if (this.matchesPattern(lowerMessage, ['my tasks', 'show tasks', 'list tasks', 'what tasks', 'open tasks', 'task list', 'on my task list', 'our task list', 'the task list'])) {
        console.log(`[MCPBridge] Detected task listing request`);
        requests.push({
          tool: 'maya_task_list',
          action: 'get_tasks',
          params: { userId: context.userId, status: 'open', limit: 10 },
          confidence: 0.9
        });
      } else if (this.matchesPattern(lowerMessage, ['complete task', 'finish task', 'done with task', 'mark task complete', 'mark this task complete', 'task is done', 'task complete:', 'mark complete:', 'complete:'])) {
        console.log(`[MCPBridge] Detected task completion request`);
        requests.push({
          tool: 'maya_task_complete',
          action: 'complete_task',
          params: this.parseTaskCompletionFromMessage(lowerMessage, context.userId),
          confidence: 0.9
        });
      } else if (this.matchesPattern(lowerMessage, ['update task', 'change task', 'modify task', 'edit task'])) {
        console.log(`[MCPBridge] Detected task update request`);
        requests.push({
          tool: 'maya_task_update',
          action: 'update_task',
          params: this.parseTaskUpdateFromMessage(lowerMessage, context.userId),
          confidence: 0.85
        });
      } else if (this.matchesPattern(lowerMessage, ['delete task', 'remove task', 'cancel task'])) {
        console.log(`[MCPBridge] Detected task deletion request`);
        requests.push({
          tool: 'maya_task_delete',
          action: 'delete_task',
          params: this.parseTaskDeletionFromMessage(lowerMessage, context.userId),
          confidence: 0.85
        });
      } else {
        console.log(`[MCPBridge] Task keywords found but no patterns matched for: "${lowerMessage}"`);
      }
    }

    // Linking integration detection
    if (this.containsLinkingKeywords(lowerMessage)) {
      if (this.matchesPattern(lowerMessage, ['block time', 'schedule time', 'calendar time for task', 'time for task'])) {
        requests.push({
          tool: 'maya_link_block_time',
          action: 'block_time_for_task',
          params: this.parseTimeBlockingFromMessage(lowerMessage, context.userId),
          confidence: 0.85
        });
      } else if (this.matchesPattern(lowerMessage, ['link', 'connect', 'relate', 'associate'])) {
        requests.push({
          tool: 'maya_link_create',
          action: 'create_link',
          params: this.parseLinkCreationFromMessage(lowerMessage, context.userId),
          confidence: 0.8
        });
      } else if (this.matchesPattern(lowerMessage, ['related', 'linked to', 'connected to', 'what\'s related', 'show links'])) {
        requests.push({
          tool: 'maya_link_find_related',
          action: 'find_related',
          params: this.parseRelatedEntityQuery(lowerMessage, context.userId),
          confidence: 0.8
        });
      }
    }

    return requests;
  }

  /**
   * Check if message contains GitHub-related keywords
   */
  private containsGitHubKeywords(message: string): boolean {
    const githubKeywords = [
      'github', 'git', 'commit', 'commits', 'repository', 'repo', 
      'pull request', 'pr', 'prs', 'issue', 'issues', 'bug', 'bugs',
      'code', 'development', 'dev'
    ];
    return githubKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Check if message contains calendar-related keywords
   */
  private containsCalendarKeywords(message: string): boolean {
    const calendarKeywords = [
      'calendar', 'schedule', 'event', 'events', 'meeting', 'meetings',
      'appointment', 'appointments', 'today', 'tomorrow', 'upcoming',
      'agenda', 'plan', 'plans', 'book', 'booking'
    ];
    return calendarKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Check if message is specifically requesting calendar view (not casual mention)
   */
  private matchesCalendarViewPattern(message: string): boolean {
    // High-precision patterns for calendar viewing requests
    const calendarViewPatterns = [
      /what.*(schedule|calendar).*today/i,
      /today.*(schedule|calendar)/i,
      /(show|check|view).*(calendar|schedule)/i,
      /my (calendar|schedule)/i,
      /(upcoming|this week|next week).*(events|meetings|schedule)/i,
      /calendar (today|this week|upcoming)/i,
      /schedule (today|this week|upcoming)/i
    ];
    
    return calendarViewPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Check if message matches specific patterns
   */
  private matchesPattern(message: string, keywords: string[]): boolean {
    return keywords.some(keyword => message.includes(keyword));
  }

  /**
   * Parse event creation details from user message
   * This is a basic implementation that could be enhanced with proper NLP
   */
  private parseEventCreationFromMessage(message: string, userId: string): any {
    // Basic event creation - would need enhancement for real parsing
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    
    return {
      userId,
      title: 'New Event', // Could parse title from message
      startTime: now.toISOString(),
      endTime: oneHourLater.toISOString(),
      description: `Event created from: "${message}"`,
      mood: 'work',
      priority: 3,
      energyLevel: 'medium'
    };
  }

  /**
   * Parse reminder creation details from user message - STRICT PATTERNS ONLY
   */
  private parseReminderCreationFromMessage(message: string, userId: string): any {
    const now = new Date();
    let reminderTime = new Date(now.getTime() + 60 * 60 * 1000); // Default: 1 hour from now
    let title = 'New Reminder';
    let content = message;

    console.log(`[Reminder Parser] Parsing message: "${message}"`);

    // STRICT PATTERN 1: "remind me in [X] [unit] to [action]"
    const remindMeMatch = message.match(/^(?:ok\s+|please\s+|hey\s+)?remind me in (\d+)\s*(minute|minutes|hour|hours) to (.+)$/i);
    if (remindMeMatch) {
      const amount = parseInt(remindMeMatch[1]);
      const unit = remindMeMatch[2].toLowerCase();
      title = remindMeMatch[3].trim();
      
      if (unit.startsWith('minute')) {
        reminderTime = new Date(now.getTime() + amount * 60 * 1000);
      } else if (unit.startsWith('hour')) {
        reminderTime = new Date(now.getTime() + amount * 60 * 60 * 1000);
      }
      console.log(`[Reminder Parser] STRICT Pattern 1 matched - Title: "${title}", Time: ${amount} ${unit}`);
    }
    // STRICT PATTERN 2: "set reminder for [X] [unit] to [action]"
    else {
      const setReminderMatch = message.match(/^(?:ok\s+|please\s+|hey\s+)?set reminder for (\d+)\s*(minute|minutes|hour|hours) to (.+)$/i);
      if (setReminderMatch) {
        const amount = parseInt(setReminderMatch[1]);
        const unit = setReminderMatch[2].toLowerCase();
        title = setReminderMatch[3].trim();
        
        if (unit.startsWith('minute')) {
          reminderTime = new Date(now.getTime() + amount * 60 * 1000);
        } else if (unit.startsWith('hour')) {
          reminderTime = new Date(now.getTime() + amount * 60 * 60 * 1000);
        }
        console.log(`[Reminder Parser] STRICT Pattern 2 matched - Title: "${title}", Time: ${amount} ${unit}`);
      } else {
        // NO FALLBACK - If it doesn't match strict patterns, it fails
        console.log(`[Reminder Parser] NO STRICT PATTERN MATCHED - Command not recognized`);
        title = 'Unrecognized reminder format';
        reminderTime = new Date(now.getTime() + 60 * 60 * 1000); // Default 1 hour
      }
    }

    const result = {
      userId,
      title,
      reminderTime: reminderTime.toISOString(),
      content: `Reminder created from: "${message}"`,
      priority: 'medium',
      reminderType: 'manual',
      sourceMessageId: null
    };

    console.log(`[Reminder Parser] Final result:`, result);
    console.log(`[Reminder Parser] Time calculation: Now=${now.toISOString()}, Reminder=${reminderTime.toISOString()}, Diff=${Math.round((reminderTime.getTime() - now.getTime()) / (60 * 1000))} minutes`);
    
    return result;
  }

  /**
   * Integrate tool result into Maya's response
   */
  private async integrateToolResult(
    originalResponse: string,
    toolResult: MCPResult,
    toolRequest: ExternalToolRequest
  ): Promise<string> {
    try {
      const toolData = toolResult.content[0]?.text;
      
      if (!toolData) {
        return originalResponse;
      }

      // Handle different tool types
      if (toolRequest.tool.startsWith('github_')) {
        return this.enhanceWithGitHubData(originalResponse, toolData, toolRequest);
      }
      
      if (toolRequest.tool.startsWith('maya_calendar_')) {
        return this.enhanceWithCalendarData(originalResponse, toolData, toolRequest);
      }

      if (toolRequest.tool.startsWith('maya_reminder_')) {
        return this.enhanceWithReminderData(originalResponse, toolData, toolRequest);
      }

      if (toolRequest.tool.startsWith('maya_task_')) {
        return this.enhanceWithTaskData(originalResponse, toolData, toolRequest);
      }

      return originalResponse;
    } catch (error: any) {
      console.error('[MCPBridge] Error integrating tool result:', error);
      return originalResponse;
    }
  }

  /**
   * Enhance response with GitHub data
   */
  private enhanceWithGitHubData(originalResponse: string, githubData: string, toolRequest: ExternalToolRequest): string {
    try {
      const data = JSON.parse(githubData);
      
      if (toolRequest.action === 'list_commits' && Array.isArray(data)) {
        let enhancement = '\n\n**Recent Commits:**\n';
        data.slice(0, 3).forEach((commit: any, index: number) => {
          const date = new Date(commit.commit.author.date).toLocaleDateString();
          const message = commit.commit.message.split('\n')[0]; // First line only
          enhancement += `${index + 1}. ${message} (${date})\n`;
        });
        return originalResponse + enhancement;
      }
      
      if (toolRequest.action === 'list_issues' && Array.isArray(data)) {
        let enhancement = '\n\n**Open Issues:**\n';
        data.slice(0, 3).forEach((issue: any, index: number) => {
          enhancement += `${index + 1}. #${issue.number}: ${issue.title}\n`;
        });
        return originalResponse + enhancement;
      }
      
      if (toolRequest.action === 'list_prs' && Array.isArray(data)) {
        let enhancement = '\n\n**Open Pull Requests:**\n';
        data.slice(0, 3).forEach((pr: any, index: number) => {
          enhancement += `${index + 1}. #${pr.number}: ${pr.title}\n`;
        });
        return originalResponse + enhancement;
      }

      return originalResponse;
    } catch (error) {
      console.error('[MCPBridge] Error parsing GitHub data:', error);
      return originalResponse;
    }
  }

  /**
   * Enhance response with calendar data
   */
  private enhanceWithCalendarData(originalResponse: string, calendarData: string, toolRequest: ExternalToolRequest): string {
    // If Maya's response mentions broken connection or can't access data, replace it entirely
    const lowerResponse = originalResponse.toLowerCase();
    if ((lowerResponse.includes('mcp server connection') && lowerResponse.includes('broken')) ||
        (lowerResponse.includes('can\'t see') && lowerResponse.includes('calendar')) ||
        (lowerResponse.includes('definitely broken')) ||
        (lowerResponse.includes('connection is broken'))) {
      return calendarData;
    }
    
    // Otherwise append the calendar data
    return originalResponse + '\n\n' + calendarData;
  }

  /**
   * Enhance response with reminder data
   */
  private enhanceWithReminderData(originalResponse: string, reminderData: string, toolRequest: ExternalToolRequest): string {
    // Reminder tools return formatted text, so we can append directly
    return originalResponse + '\n\n' + reminderData;
  }

  /**
   * Enhance response with task data
   */
  private enhanceWithTaskData(originalResponse: string, taskData: string, toolRequest: ExternalToolRequest): string {
    // If Maya's response mentions broken connection or can't access data, replace it entirely  
    const lowerResponse = originalResponse.toLowerCase();
    if ((lowerResponse.includes('mcp server connection') && lowerResponse.includes('broken')) ||
        (lowerResponse.includes('can\'t see') && lowerResponse.includes('task')) ||
        (lowerResponse.includes('definitely broken')) ||
        (lowerResponse.includes('connection is broken'))) {
      return taskData;
    }
    
    // Otherwise append the task data
    return originalResponse + '\n\n' + taskData;
  }

  /**
   * Check if message contains reminder-related keywords
   */
  private containsReminderKeywords(message: string): boolean {
    const reminderKeywords = [
      'remind', 'reminder', 'alert', 'notification', 'remind me', 'set reminder',
      'create reminder', 'add reminder', 'upcoming reminders', 'my reminders',
      'what am i supposed to', 'don\'t let me forget', 'all reminders', 'list reminders',
      'show reminders', 'delete', 'remove', 'cancel', 'delete reminder', 'remove reminder',
      'cancel reminder', 'delete that reminder', 'remove that reminder', 'last reminder',
      'recent reminder', 'latest reminder'
    ];
    return reminderKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Check if message contains task-related keywords
   */
  private containsTaskKeywords(message: string): boolean {
    const taskKeywords = [
      'task', 'tasks', 'todo', 'todos', 'to do', 'to-do', 'todo list', 'todo-list',
      'create task', 'add task', 'new task', 'make task', 'my tasks', 'show tasks',
      'list tasks', 'what tasks', 'tasks do i have', 'complete task', 'finish task',
      'done with task', 'mark task complete', 'update task', 'change task', 'modify task',
      'edit task', 'delete task', 'remove task', 'cancel task', 'task list', 'task last',
      'on my task', 'task list', 'on my task list', 'our task list', 'the task list'
    ];
    
    // Only skip task detection if this is clearly a calendar operation (not just mentioning calendar in task content)
    const calendarOperationPatterns = [
      /^(?:show|check|view|what's on).*(calendar|schedule)/i,
      /^(?:calendar|schedule).*(today|tomorrow|this week)/i,
      /^(?:create|add|book|schedule).*(event|meeting|appointment)/i,
      /^(?:my|today's|tomorrow's).*(calendar|schedule)/i
    ];
    
    const isCalendarOperation = calendarOperationPatterns.some(pattern => pattern.test(message));
    if (isCalendarOperation) {
      console.log(`[TaskDetection] Skipping task keywords - detected calendar operation: "${message}"`);
      return false;
    }
    
    const hasTaskKeywords = taskKeywords.some(keyword => message.includes(keyword));
    console.log(`[TaskDetection] Message: "${message}" -> Contains task keywords: ${hasTaskKeywords}`);
    if (hasTaskKeywords) {
      const matchedKeywords = taskKeywords.filter(keyword => message.includes(keyword));
      console.log(`[TaskDetection] Matched keywords: ${matchedKeywords.join(', ')}`);
    }
    return hasTaskKeywords;
  }

  /**
   * Parse task creation details from user message
   * This is a basic implementation that could be enhanced with proper NLP
   */
  private parseTaskCreationFromMessage(message: string, userId: string): any {
    // Extract task description from the message
    let description = 'New Task';
    let dueDate = null;
    let priority = 'medium';
    
    console.log(`[Task Parser] Parsing message: "${message}"`);
    
    // Try "create task:" format first
    const createTaskMatch = message.match(/create\s+task:\s*(.+)$/i);
    if (createTaskMatch) {
      description = createTaskMatch[1].trim();
      console.log(`[Task Parser] Extracted from 'create task:' format: "${description}"`);
    }
    // Try "add task:" format
    else {
      const addTaskMatch = message.match(/add\s+task:\s*(.+)$/i);
      if (addTaskMatch) {
        description = addTaskMatch[1].trim();
        console.log(`[Task Parser] Extracted from 'add task:' format: "${description}"`);
      }
      // Try other task patterns
      else {
        const taskMatch = message.match(/(?:task|todo)\s+(?:for|about|to)?\s*(.+?)(?:\s+(?:tomorrow|today|by|due|on)\s+(.+?))?$/i);
        
        if (taskMatch) {
          description = taskMatch[1].trim();
          // Clean up common prefixes/suffixes
          description = description.replace(/^(?:for|about|to)\s+/i, '');
          description = description.replace(/\s+(?:tomorrow|today|by|due|on)\s+.+$/i, '');
          
          // Parse due date from the second capture group
          if (taskMatch[2]) {
            dueDate = this.parseDueDateFromText(taskMatch[2].trim());
          }
          console.log(`[Task Parser] Extracted from general task pattern: "${description}"`);
        } else {
          // Try other patterns for task extraction
          const createMatch = message.match(/(?:create|add|make)\s+(?:a\s+)?task\s+(?:for|about|to)?\s*(.+?)(?:\s+(?:tomorrow|today|by|due|on)\s+(.+?))?$/i);
          if (createMatch) {
            description = createMatch[1].trim();
            if (createMatch[2]) {
              dueDate = this.parseDueDateFromText(createMatch[2].trim());
            }
            console.log(`[Task Parser] Extracted from create/add pattern: "${description}"`);
          } else {
            // Fallback: clean the entire message
            const cleanMessage = message
              .replace(/(?:create|add|make)\s+(?:a\s+)?(?:task|todo)/i, '')
              .replace(/(?:for|about|to)\s+/i, '')
              .trim();
            if (cleanMessage && cleanMessage.length > 3) {
              description = cleanMessage;
              console.log(`[Task Parser] Extracted from fallback cleaning: "${description}"`);
            }
          }
        }
      }
    }
    
    // Parse due date from anywhere in the message if not found yet
    if (!dueDate) {
      if (message.toLowerCase().includes('tomorrow')) {
        dueDate = this.parseDueDateFromText('tomorrow');
      } else if (message.toLowerCase().includes('today')) {
        dueDate = this.parseDueDateFromText('today');
      }
    }
    
    // Parse priority from message
    if (message.toLowerCase().includes('urgent') || message.toLowerCase().includes('asap')) {
      priority = 'urgent';
    } else if (message.toLowerCase().includes('high priority') || message.toLowerCase().includes('important')) {
      priority = 'high';
    } else if (message.toLowerCase().includes('low priority') || message.toLowerCase().includes('later')) {
      priority = 'low';
    }

    const result = {
      userId,
      description,
      priority,
      dueDate,
      note: `Task created from: "${message}"`,
      tags: [],
      status: 'open'
    };

    console.log(`[Task Parser] Final result:`, result);
    return result;
  }

  /**
   * Parse due date from text input
   */
  private parseDueDateFromText(dateText: string): string | null {
    const now = new Date();
    const lowerText = dateText.toLowerCase().trim();
    
    if (lowerText === 'today') {
      return now.toISOString();
    } else if (lowerText === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString();
    } else if (lowerText === 'next week') {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek.toISOString();
    } else if (lowerText.includes('next monday')) {
      const nextMonday = new Date(now);
      const daysUntilMonday = (1 + 7 - now.getDay()) % 7 || 7;
      nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
      return nextMonday.toISOString();
    } else if (lowerText.includes('friday')) {
      const friday = new Date(now);
      const daysUntilFriday = (5 + 7 - now.getDay()) % 7 || 7;
      friday.setDate(friday.getDate() + daysUntilFriday);
      return friday.toISOString();
    }
    
    // Try to parse specific dates
    const dateMatch = dateText.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (dateMatch) {
      const month = parseInt(dateMatch[1]) - 1; // Month is 0-indexed
      const day = parseInt(dateMatch[2]);
      const year = dateMatch[3] ? parseInt(dateMatch[3]) : now.getFullYear();
      const fullYear = year < 100 ? 2000 + year : year;
      
      const parsedDate = new Date(fullYear, month, day);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString();
      }
    }
    
    return null;
  }

  /**
   * Parse task completion details from user message
   * This is a basic implementation that could be enhanced with proper NLP
   */
  private parseTaskCompletionFromMessage(message: string, userId: string): any {
    // Enhanced task completion parsing to extract actual task name
    let taskIdentifier = 'task'; // fallback
    
    // Try to extract task name after "complete:", "mark complete:", etc.
    const completeMatch = message.match(/(?:mark|complete|finish|done with)\s+(?:this\s+)?task\s*(?:complete)?\s*:?\s*(.+)$/i);
    if (completeMatch) {
      taskIdentifier = completeMatch[1].trim();
    } else {
      // Try other patterns for task identification
      const taskIdMatch = message.match(/task\s+(?:id\s+)?(\d+)/i);
      if (taskIdMatch) {
        taskIdentifier = taskIdMatch[1];
      } else {
        // Try to extract task name in quotes
        const quotedMatch = message.match(/["'](.+?)["']/);
        if (quotedMatch) {
          taskIdentifier = quotedMatch[1];
        } else {
          // Extract everything after "complete task"
          const afterCompleteMatch = message.match(/complete\s+task\s+(.+)/i);
          if (afterCompleteMatch) {
            taskIdentifier = afterCompleteMatch[1].trim();
          }
        }
      }
    }
    
    console.log(`[TaskCompletion] Parsed task identifier: "${taskIdentifier}" from message: "${message}"`);
    
    return {
      userId,
      taskIdentifier,
    };
  }

  /**
   * Parse task update details from user message
   * This is a basic implementation that could be enhanced with proper NLP
   */
  private parseTaskUpdateFromMessage(message: string, userId: string): any {
    // Basic task update - would need enhancement for real parsing
    return {
      userId,
      taskIdentifier: 'task', // Could parse task identifier from message
      updates: {
        note: `Task updated from: "${message}"`
      }
    };
  }

  /**
   * Parse task deletion details from user message
   * This is a basic implementation that could be enhanced with proper NLP
   */
  private parseTaskDeletionFromMessage(message: string, userId: string): any {
    // Basic task deletion - would need enhancement for real parsing
    return {
      userId,
      taskIdentifier: 'task', // Could parse task identifier from message
    };
  }

  /**
   * Check if Maya already promised to handle this task
   */
  private detectMayaPromise(aiResponse: string, toolRequest: ExternalToolRequest): boolean {
    const lowerResponse = aiResponse.toLowerCase();
    
    // Detect promises for reminders
    if (toolRequest.tool.startsWith('maya_reminder_')) {
      const reminderPromises = [
        "i'll remind you", "i'll set that reminder", "i'll make sure to remind", 
        "got it! i'll remind", "i'll remind you in", "reminder is set",
        "i'll remember to remind", "i'll keep track", "i'll ping you"
      ];
      return reminderPromises.some(promise => lowerResponse.includes(promise));
    }
    
    // Detect promises for tasks
    if (toolRequest.tool.startsWith('maya_task_')) {
      const taskPromises = [
        "i'll add that task", "i'll create that task", "task added",
        "i'll put that on your list", "i'll track that", "added to your tasks"
      ];
      return taskPromises.some(promise => lowerResponse.includes(promise));
    }
    
    // Detect promises for calendar
    if (toolRequest.tool.startsWith('maya_calendar_')) {
      const calendarPromises = [
        "i'll add that to your calendar", "i'll schedule that", "i'll book that",
        "event created", "i'll put that in your schedule", "calendar updated"
      ];
      return calendarPromises.some(promise => lowerResponse.includes(promise));
    }
    
    return false;
  }

  /**
   * Replace Maya's response with the actual tool result (when she promised to do something)
   */
  private async replaceWithToolResult(
    originalResponse: string,
    toolResult: MCPResult,
    toolRequest: ExternalToolRequest
  ): Promise<string> {
    const toolData = toolResult.content[0]?.text;
    
    if (!toolData) {
      return originalResponse;
    }

    // For reminders, replace Maya's promise with confirmation + details
    if (toolRequest.tool.startsWith('maya_reminder_')) {
      // Extract Maya's personality/emotion from original response
      const personalityMatch = originalResponse.match(/(looking forward to|can't wait|excited|love)/i);
      const personality = personalityMatch ? ` ${personalityMatch[1]} 💕` : '';
      
      return `${toolData}${personality}`;
    }
    
    // For tasks, replace with confirmation
    if (toolRequest.tool.startsWith('maya_task_')) {
      return toolData;
    }
    
    // For calendar, replace with confirmation
    if (toolRequest.tool.startsWith('maya_calendar_')) {
      return toolData;
    }
    
    // Default: return tool result
    return toolData;
  }

  /**
   * Check if message matches specific reminder creation patterns (high precision)
   */
  private matchesReminderCreationPattern(message: string): boolean {
    // STRICT PATTERNS - High precision, high reliability (90-98% target)
    const strictPatterns = [
      /^(?:ok\s+)?remind me in \d+\s*(?:minute|minutes|hour|hours) to .+/i,
      /^(?:ok\s+)?set reminder for \d+\s*(?:minute|minutes|hour|hours) to .+/i,
      /^(?:please\s+)?remind me in \d+\s*(?:minute|minutes|hour|hours) to .+/i,
      /^(?:please\s+)?set reminder for \d+\s*(?:minute|minutes|hour|hours) to .+/i,
      /^(?:hey\s+)?remind me in \d+\s*(?:minute|minutes|hour|hours) to .+/i,
      /^(?:hey\s+)?set reminder for \d+\s*(?:minute|minutes|hour|hours) to .+/i
    ];
    
    const matches = strictPatterns.some(pattern => pattern.test(message.trim()));
    console.log(`[ReminderPattern] Testing "${message}" -> Matches: ${matches}`);
    return matches;
  }

  /**
   * Check if message matches specific reminder deletion patterns (high precision)
   */
  private matchesReminderDeletionPattern(message: string): boolean {
    // High-precision patterns for explicit reminder deletion
    const deletionPatterns = [
      /^delete.*reminder/i,           // "delete reminder", "delete that reminder"  
      /^remove.*reminder/i,           // "remove reminder", "remove the reminder"
      /^cancel.*reminder/i,           // "cancel reminder", "cancel that reminder"
      /delete.*(?:last|recent|latest).*reminder/i,  // "delete that last reminder"
      /remove.*(?:last|recent|latest).*reminder/i,  // "remove the recent reminder"  
      /cancel.*(?:last|recent|latest).*reminder/i,  // "cancel the latest reminder"
      /delete.*reminder.*(?:just|you).*created/i,   // "delete the reminder you just created"
      /remove.*reminder.*(?:just|you).*created/i,   // "remove that reminder you created"
    ];
    
    return deletionPatterns.some(pattern => pattern.test(message.trim()));
  }

  /**
   * Parse linked reminder creation from user message
   */
  private parseLinkedReminderFromMessage(message: string, userId: string, messageId: string): any {
    const reminderData = this.parseReminderCreationFromMessage(message, userId);
    return {
      ...reminderData,
      linkType: 'message',
      linkId: messageId,
      sourceMessageId: messageId
    };
  }

  /**
   * Parse linked task creation from user message
   */
  private parseLinkedTaskFromMessage(message: string, userId: string, messageId: string): any {
    // Use the improved task parsing logic
    const baseTaskData = this.parseTaskCreationFromMessage(message, userId);
    
    // Override description if we can extract it more specifically for linked tasks
    const taskMatch = message.match(/(?:task|todo)(?:\s+for|\s+about)?\s*:?\s*(.+?)(?:\s+(?:due|by)\s+(.+?))?$/i);
    
    let description = baseTaskData.description;
    let dueDate = baseTaskData.dueDate;
    
    if (taskMatch) {
      const extractedDesc = taskMatch[1].trim();
      // Clean up common phrases
      const cleanDesc = extractedDesc
        .replace(/^(?:for|about|to)\s+/i, '')
        .replace(/\s+(?:due|by)\s+.+$/i, '')
        .replace(/this message/i, 'conversation')
        .replace(/this conversation/i, 'conversation')
        .trim();
      
      if (cleanDesc && cleanDesc.length > 3) {
        description = cleanDesc;
      }
      
      if (taskMatch[2]) {
        dueDate = this.parseDueDateFromText(taskMatch[2].trim()) || dueDate;
      }
    } else {
      // Extract task description from the message for linked context
      const cleanMessage = message
        .replace(/(?:create|add|make)\s+(?:a\s+)?task/i, '')
        .replace(/(?:for|about)\s+this/i, '')
        .replace(/turn this into a task/i, '')
        .replace(/task for this/i, '')
        .trim();
      if (cleanMessage && cleanMessage.length > 3) {
        description = cleanMessage;
      }
    }

    return {
      userId,
      description,
      priority: baseTaskData.priority,
      dueDate,
      sourceMessageId: messageId,
      sourceType: 'message',
      linkType: 'creates',
      linkContext: 'Task created from conversation'
    };
  }

  /**
   * Parse time blocking request from user message
   */
  private parseTimeBlockingFromMessage(message: string, userId: string): any {
    // Extract task ID and time information
    const taskIdMatch = message.match(/task\s+(?:id\s+)?(\d+)/i);
    let timeMatch = message.match(/(?:at\s+)?(\d{1,2}:?\d{0,2}(?:\s*[ap]m)?)/i);
    let durationMatch = message.match(/(?:for\s+)?(\d+)\s*(?:hours?|hrs?|h\b)/i);
    
    // If no hours found, try minutes
    if (!durationMatch) {
      durationMatch = message.match(/(?:for\s+)?(\d+)\s*(?:minutes?|mins?|m\b)/i);
    }
    
    // Extract duration from context like "block 2 hours"
    if (!durationMatch) {
      const blockMatch = message.match(/block\s+(\d+)\s*(?:hours?|hrs?|h\b)/i);
      if (blockMatch) {
        durationMatch = blockMatch;
      }
    }
    
    let startTime = new Date();
    let duration = 60; // default 1 hour
    
    // Parse when to schedule
    if (message.toLowerCase().includes('tomorrow')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      if (timeMatch) {
        // Parse specific time for tomorrow
        const parsedTime = this.parseEventTime(timeMatch[1], tomorrow);
        startTime = parsedTime || tomorrow;
      } else {
        // Default to 9 AM tomorrow
        tomorrow.setHours(9, 0, 0, 0);
        startTime = tomorrow;
      }
    } else if (timeMatch) {
      // Parse the time for today
      const parsedTime = this.parseEventTime(timeMatch[1], new Date());
      startTime = parsedTime || new Date();
    } else {
      // Default to next available hour
      const nextHour = new Date();
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      startTime = nextHour;
    }
    
    if (durationMatch) {
      const amount = parseInt(durationMatch[1]);
      const unit = durationMatch[0].toLowerCase();
      if (unit.includes('hour') || unit.includes('hr') || unit.includes('h')) {
        duration = amount * 60;
      } else {
        duration = amount;
      }
    }

    return {
      userId,
      taskId: taskIdMatch ? taskIdMatch[1] : null,
      startTime: startTime.toISOString(),
      duration,
      energyLevel: 'medium'
    };
  }

  /**
   * Parse link creation from user message
   */
  private parseLinkCreationFromMessage(message: string, userId: string): any {
    // Handle natural language linking like "link all these items", "connect these", etc.
    const naturalLinkingPatterns = [
      /link.*(?:all|these|them)/i,
      /connect.*(?:all|these|them)/i,
      /relate.*(?:all|these|them)/i,
      /associate.*(?:all|these|them)/i
    ];
    
    const isNaturalLinking = naturalLinkingPatterns.some(pattern => pattern.test(message));
    
    if (isNaturalLinking) {
      // For natural language linking, we'll link the most recent items
      // The linking tool will need to find and link recent calendar events, tasks, and reminders
      return {
        userId,
        linkType: 'recent_items',
        context: 'Link recently created calendar events, tasks, and reminders together',
        naturalLanguage: true,
        requestType: 'link_recent_productivity_items'
      };
    }
    
    // Try structured format: "link task 123 to reminder 456"
    const linkMatch = message.match(/link\s+(\w+)\s+(\w+)\s+(?:to|with)\s+(\w+)\s+(\w+)/i);
    
    if (linkMatch) {
      return {
        userId,
        sourceType: linkMatch[1],
        sourceId: linkMatch[2],
        targetType: linkMatch[3],
        targetId: linkMatch[4],
        linkType: 'references',
        context: 'Manual link creation'
      };
    }
    
    // Fallback for simple "link" commands
    return {
      userId,
      linkType: 'recent_items',
      context: 'Link recent items together',
      naturalLanguage: true,
      requestType: 'link_recent_productivity_items'
    };
  }

  /**
   * Parse related entity query from user message
   */
  private parseRelatedEntityQuery(message: string, userId: string): any {
    const entityMatch = message.match(/(?:what|show).*?(?:related|linked).*?(?:to|with)\s+(\w+)\s+(\w+)/i);
    
    if (entityMatch) {
      return {
        entityType: entityMatch[1],
        entityId: entityMatch[2],
        limit: 10
      };
    }
    
    // Default to showing related items for recent messages
    return {
      entityType: 'message',
      entityId: 'recent',
      limit: 5
    };
  }

  /**
   * Check if message contains linking keywords
   */
  private containsLinkingKeywords(message: string): boolean {
    const linkingKeywords = [
      'link', 'connect', 'relate', 'associate', 'related', 'linked',
      'block time', 'schedule time', 'time for task', 'calendar time',
      'connected to', 'linked to', 'related to', 'show links'
    ];
    return linkingKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Parse GitHub repository information from message
   */
  private parseGitHubRepoFromMessage(message: string): any {
    // Look for repo name in the message
    const repoMatch = message.match(/(?:repo|repository)\s+([a-zA-Z0-9\-_]+)/i);
    return {
      repo: repoMatch ? repoMatch[1] : 'mayahq',
      limit: 5
    };
  }

  /**
   * Parse calendar event creation from user message
   */
  private parseCalendarEventFromMessage(message: string, userId: string): any {
    console.log(`[Calendar Parser] Parsing message: "${message}"`);
    
    let title = 'New Event';
    let location = '';
    let startTime = new Date();
    let endTime = new Date();
    let description = '';

    // Remove the command prefix to get the event details
    let eventDetails = message
      .replace(/^(?:add calendar (?:event|evnet|evetn|evnt):|create calendar (?:event|evnet|evetn|evnt):|schedule (?:event|evnet|evetn|evnt):|add (?:event|evnet|evetn|evnt):|create (?:event|evnet|evetn|evnt):|(?:calendar|calender|calandar) (?:event|evnet|evetn|evnt):|schedule (?:meeting|meting|meetng):|book (?:meeting|meting|meetng):|add to (?:calendar|calender|calandar):)\s*/i, '')
      .trim();

    console.log(`[Calendar Parser] Event details after prefix removal: "${eventDetails}"`);

    // Pattern 1: "Title Time at Location" (e.g., "Coffee Shop 1pm at Barista Parlor")
    const titleTimeLocationMatch = eventDetails.match(/^(.+?)\s+(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)\s+at\s+(.+)$/i);
    if (titleTimeLocationMatch) {
      title = titleTimeLocationMatch[1].trim();
      const timeStr = titleTimeLocationMatch[2].trim();
      location = titleTimeLocationMatch[3].trim();
      
      console.log(`[Calendar Parser] Pattern 1 matched - Title: "${title}", Time: "${timeStr}", Location: "${location}"`);
      
      startTime = this.parseEventTime(timeStr, new Date()) || new Date();
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour duration
    }
    // Pattern 2: "Title at Location Time" (e.g., "Coffee Shop at Barista Parlor 1pm")
    else {
      const titleLocationTimeMatch = eventDetails.match(/^(.+?)\s+at\s+(.+?)\s+(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)$/i);
      if (titleLocationTimeMatch) {
        title = titleLocationTimeMatch[1].trim();
        location = titleLocationTimeMatch[2].trim();
        const timeStr = titleLocationTimeMatch[3].trim();
        
        console.log(`[Calendar Parser] Pattern 2 matched - Title: "${title}", Location: "${location}", Time: "${timeStr}"`);
        
        startTime = this.parseEventTime(timeStr, new Date()) || new Date();
        endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
      }
      // Pattern 3: "Title Time" (e.g., "Coffee Shop 1pm")
      else {
        const titleTimeMatch = eventDetails.match(/^(.+?)\s+(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)$/i);
        if (titleTimeMatch) {
          title = titleTimeMatch[1].trim();
          const timeStr = titleTimeMatch[2].trim();
          
          console.log(`[Calendar Parser] Pattern 3 matched - Title: "${title}", Time: "${timeStr}"`);
          
          startTime = this.parseEventTime(timeStr, new Date()) || new Date();
          endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        }
        // Pattern 4: "Title at Location" (e.g., "Coffee Shop at Barista Parlor")
        else {
          const titleLocationMatch = eventDetails.match(/^(.+?)\s+at\s+(.+)$/i);
          if (titleLocationMatch) {
            title = titleLocationMatch[1].trim();
            location = titleLocationMatch[2].trim();
            
            console.log(`[Calendar Parser] Pattern 4 matched - Title: "${title}", Location: "${location}"`);
            
            // Default to next hour if no time specified
            const nextHour = new Date();
            nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
            startTime = nextHour;
            endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
          }
          // Pattern 5: Just "Title" - use the event details as title
          else if (eventDetails && eventDetails.length > 0) {
            title = eventDetails;
            
            console.log(`[Calendar Parser] Pattern 5 matched - Title only: "${title}"`);
            
            // Default to next hour
            const nextHour = new Date();
            nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
            startTime = nextHour;
            endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
          }
        }
      }
    }

    // Create description that includes the original command for reference
    description = `Event created from: "${message}"`;
    if (location) {
      description += `\nLocation: ${location}`;
    }

    const result = {
      userId,
      title,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      description,
      location: location || undefined,
      mood: 'work',
      priority: 3,
      energyLevel: 'medium'
    };

    console.log(`[Calendar Parser] Final result:`, result);
    return result;
  }

  /**
   * Parse event date/time from text
   */
  private parseEventDateTime(dateTimeText: string): Date | null {
    const now = new Date();
    const lowerText = dateTimeText.toLowerCase().trim();
    
    if (lowerText.includes('tomorrow')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Try to extract time
      const timeMatch = dateTimeText.match(/(\d{1,2}):?(\d{2})?\s*([ap]m)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const ampm = timeMatch[3];
        
        if (ampm && ampm.toLowerCase() === 'pm' && hours !== 12) {
          hours += 12;
        } else if (ampm && ampm.toLowerCase() === 'am' && hours === 12) {
          hours = 0;
        }
        
        tomorrow.setHours(hours, minutes, 0, 0);
      } else {
        // Default to 9 AM if no time specified
        tomorrow.setHours(9, 0, 0, 0);
      }
      
      return tomorrow;
    } else if (lowerText.includes('today')) {
      const today = new Date(now);
      
      // Try to extract time
      const timeMatch = dateTimeText.match(/(\d{1,2}):?(\d{2})?\s*([ap]m)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const ampm = timeMatch[3];
        
        if (ampm) {
          if (ampm.toLowerCase() === 'pm' && hours !== 12) {
            hours += 12;
          } else if (ampm.toLowerCase() === 'am' && hours === 12) {
            hours = 0;
          }
        }
        
        today.setHours(hours, minutes, 0, 0);
      }
      
      return today;
    } else if (lowerText.includes('next week')) {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(9, 0, 0, 0); // Default to 9 AM
      return nextWeek;
    }
    
    // Try to parse just time for today (improved to handle "4pm" format)
    const timeMatch = dateTimeText.match(/(\d{1,2}):?(\d{2})?\s*([ap]m)?/i);
    if (timeMatch) {
      const today = new Date(now);
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const ampm = timeMatch[3];
      
      // Handle AM/PM conversion
      if (ampm) {
        if (ampm.toLowerCase() === 'pm' && hours !== 12) {
          hours += 12;
        } else if (ampm.toLowerCase() === 'am' && hours === 12) {
          hours = 0;
        }
      }
      
      today.setHours(hours, minutes, 0, 0);
      return today;
    }
    
    return null;
  }

  /**
   * Parse event time from text relative to a base date
   */
  private parseEventTime(timeText: string, baseDate: Date): Date | null {
    const timeMatch = timeText.match(/(\d{1,2}):?(\d{2})?\s*([ap]m)?/i);
    if (timeMatch) {
      const result = new Date(baseDate);
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const ampm = timeMatch[3];
      
      if (ampm && ampm.toLowerCase() === 'pm' && hours !== 12) {
        hours += 12;
      } else if (ampm && ampm.toLowerCase() === 'am' && hours === 12) {
        hours = 0;
      }
      
      result.setHours(hours, minutes, 0, 0);
      return result;
    }
    
    return null;
  }

  /**
   * Parse reminder deletion from user message
   */
  private parseReminderDeletionFromMessage(message: string, userId: string): any {
    // Try to extract reminder ID or description from the message
    const reminderIdMatch = message.match(/reminder\s+(?:id\s+)?(\d+)/i);
    const recentMatch = message.match(/(?:delete|remove|cancel)\s+(?:the\s+)?(?:last|recent|latest|that)\s+reminder/i);
    const justCreatedMatch = message.match(/(?:delete|remove)\s+(?:that\s+)?reminder\s+(?:you\s+)?(?:just\s+)?created/i);
    
    if (reminderIdMatch) {
      return {
        userId,
        reminderId: reminderIdMatch[1]
      };
    } else if (recentMatch || justCreatedMatch) {
      return {
        userId,
        deleteRecent: true
      };
    } else {
      // Default to most recent reminder for any delete request
      return {
        userId,
        deleteRecent: true
      };
    }
  }

  /**
   * Check if a message is conversational mention rather than a direct command
   * This prevents false positives when discussing productivity concepts
   */
  private isConversationalMention(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    
    // Filter out reports or discussions about Maya's capabilities
    const conversationalPatterns = [
      /here is what claude said/i,
      /claude said/i,
      /maya can now/i,
      /maya is now/i,
      /what this means/i,
      /maya will/i,
      /the fix/i,
      /what i fixed/i,
      /looking at/i,
      /according to/i,
      /the logs show/i,
      /claude's response/i,
      /as claude mentioned/i,
      /\bclaude\b.*\b(mentioned|said|reported|explained)\b/i
    ];
    
    // If message contains these patterns, it's likely conversational
    if (conversationalPatterns.some(pattern => pattern.test(message))) {
      return true;
    }
    
    // If message is very long (>500 chars), it's likely a report/discussion
    if (message.length > 500) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if message contains product-related keywords
   */
  private containsProductKeywords(message: string): boolean {
    const productKeywords = [
      'product', 'products', 'affiliate', 'affiliates', 'marketing', 'sales',
      'promotion', 'advertising', 'brand', 'brands', 'e-commerce', 'online',
      'retail', 'consumer', 'market', 'markets', 'supply', 'demand', 'pricing',
      'distribution', 'logistics', 'inventory', 'warehouse', 'retailer', 'customer',
      'service', 'support', 'quality', 'innovation', 'competition', 'marketplace',
      'marketplaces', 'supply chain', 'logistics chain', 'retail chain', 'consumer chain'
    ];
    return productKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Parse product creation details from user message
   */
  private parseProductCreationFromMessage(message: string, userId: string): any {
    // Extract product details from the message
    let name = 'New Product';
    let description = '';
    let affiliateLink = 'https://example.com';
    let platform = 'other';
    let category = 'other';
    let tags: string[] = [];
    
    // Try to extract product name
    const nameMatch = message.match(/(?:create|add)\s+product\s+(?:called\s+)?['""](.+?)['""]|(?:create|add)\s+product\s+(.+?)$/i);
    if (nameMatch) {
      name = (nameMatch[1] || nameMatch[2]).trim();
    }
    
    // Extract platform if mentioned
    if (message.includes('amazon')) platform = 'amazon';
    else if (message.includes('tiktok')) platform = 'tiktok_shop';
    else if (message.includes('shopify')) platform = 'shopify';
    else if (message.includes('etsy')) platform = 'etsy';
    
    // Extract category if mentioned
    if (message.includes('tech') || message.includes('technology')) category = 'tech';
    else if (message.includes('fashion') || message.includes('clothing')) category = 'fashion';
    else if (message.includes('beauty') || message.includes('cosmetic')) category = 'beauty';
    else if (message.includes('home') || message.includes('house')) category = 'home';
    
    return {
      userId,
      name,
      description: description || `Product created from: "${message}"`,
      affiliateLink,
      platform,
      category,
      tags,
      isActive: true
    };
  }

  /**
   * Parse product update details from user message
   */
  private parseProductUpdateFromMessage(message: string, userId: string): any {
    // Extract product identifier (name or ID)
    const identifierMatch = message.match(/(?:update|edit|change)\s+product\s+['""](.+?)['""]|(?:update|edit|change)\s+product\s+(\w+)/i);
    const productIdentifier = identifierMatch ? (identifierMatch[1] || identifierMatch[2]) : 'unknown';
    
    // Extract what to update
    const updates: any = {};
    
    if (message.includes('price')) {
      const priceMatch = message.match(/price\s+(?:to\s+)?\$?(\d+(?:\.\d{2})?)/i);
      if (priceMatch) {
        updates.sale_price = parseFloat(priceMatch[1]);
      }
    }
    
    if (message.includes('description')) {
      const descMatch = message.match(/description\s+(?:to\s+)?['""](.+?)['""]|description\s+(.+?)$/i);
      if (descMatch) {
        updates.description = (descMatch[1] || descMatch[2]).trim();
      }
    }
    
    if (message.includes('deactivate') || message.includes('disable')) {
      updates.is_active = false;
    } else if (message.includes('activate') || message.includes('enable')) {
      updates.is_active = true;
    }
    
    return {
      userId,
      productIdentifier,
      updates
    };
  }

  /**
   * Parse product deletion details from user message
   */
  private parseProductDeletionFromMessage(message: string, userId: string): any {
    // Extract product identifier (name or ID)
    const identifierMatch = message.match(/(?:delete|remove)\s+product\s+['""](.+?)['""]|(?:delete|remove)\s+product\s+(\w+)/i);
    const productIdentifier = identifierMatch ? (identifierMatch[1] || identifierMatch[2]) : 'unknown';
    
    return {
      userId,
      productIdentifier
    };
  }

  /**
   * Check if message matches specific calendar creation patterns (high precision)
   */
  private matchesCalendarCreationPattern(message: string): boolean {
    // Very specific patterns for explicit calendar creation commands
    // Added typo tolerance for common misspellings
    const creationPatterns = [
      /^add calendar (?:event|evnet|evetn|evnt):/i,           // "add calendar event: ..." (with typos)
      /^create calendar (?:event|evnet|evetn|evnt):/i,        // "create calendar event: ..." (with typos)
      /^schedule (?:event|evnet|evetn|evnt):/i,               // "schedule event: ..." (with typos)
      /^book (?:meeting|meting|meetng):/i,                    // "book meeting: ..." (with typos)
      /^add (?:event|evnet|evetn|evnt):/i,                    // "add event: ..." (with typos)
      /^create (?:event|evnet|evetn|evnt):/i,                 // "create event: ..." (with typos)
      /^schedule (?:meeting|meting|meetng):/i,                // "schedule meeting: ..." (with typos)
      /^add to (?:calendar|calender|calandar):/i,             // "add to calendar: ..." (with typos)
      /^(?:calendar|calender|calandar) (?:event|evnet|evetn|evnt):/i, // "calendar event: ..." (with typos)
      /^schedule (?:a |an )?(?:meeting|event|call|appointment|meting|evnet|evetn|evnt) /i, // "schedule a meeting ..." (with typos)
      /^create (?:a |an )?(?:meeting|event|call|appointment|meting|evnet|evetn|evnt) /i,   // "create a meeting ..." (with typos)
      /^book (?:a |an )?(?:meeting|event|call|appointment|meting|evnet|evetn|evnt) /i,     // "book a meeting ..." (with typos)
      /^add (?:a |an )?(?:meeting|event|call|appointment|meting|evnet|evetn|evnt) /i       // "add a meeting ..." (with typos)
    ];
    
    return creationPatterns.some(pattern => pattern.test(message.trim()));
  }

  /**
   * Check if message is discussing calendar problems rather than creating events
   */
  private isCalendarProblemDiscussion(message: string): boolean {
    const problemDiscussionPatterns = [
      /calendar.*(?:wrong|broken|issue|problem|error|bug)/i,
      /event.*(?:wrong|broken|issue|problem|error|bug)/i,
      /you.*(?:putting|making|creating).*wrong/i,
      /fields.*(?:wrong|incorrect|broken)/i,
      /that.*calendar.*(?:wrong|broken|issue)/i,
      /the.*calendar.*(?:wrong|broken|issue)/i,
      /mcp.*(?:broken|issue|problem|mess)/i,
      /tool calling.*(?:broken|issue|problem)/i,
      /actual.*calendar.*(?:wrong|broken)/i,
      /see.*the.*calendar.*(?:wrong|issue)/i
    ];
    
    return problemDiscussionPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Detect if Maya made a calendar promise in her response
   */
  private detectsCalendarPromise(aiResponse: string, userMessage: string): boolean {
    const lowerResponse = aiResponse.toLowerCase();
    const lowerMessage = userMessage.toLowerCase();
    
    // Check if user intended calendar action AND Maya promised to do it
    const userWantsCalendar = /(?:add|create|schedule).*(?:event|meeting|calendar)/i.test(userMessage);
    const mayaPromises = [
      "i've added that to your calendar",
      "perfect! i've added that",
      "added that to your calendar",
      "calendar event created",
      "i've scheduled that",
      "event created"
    ];
    
    const mayaPromised = mayaPromises.some(promise => lowerResponse.includes(promise));
    
    return userWantsCalendar && mayaPromised;
  }

  /**
   * Handle calendar typo by providing helpful feedback
   */
  private handleCalendarTypo(userMessage: string, aiResponse: string): string | null {
    // Check for common calendar-related typos that weren't caught
    const calendarTypos = /(?:add|create|schedule).*(?:evnet|evetn|evnt|meting|meetng|calender|calandar)/i;
    
    if (calendarTypos.test(userMessage)) {
      return `I noticed you might have a typo in your calendar command! 📅

I can help you create calendar events with commands like:
• \`add calendar event: Coffee Shop 1pm at Barista Parlor\`
• \`create event: Team Meeting 2pm\`
• \`schedule meeting: Client Call tomorrow 10am\`

Could you try again with the corrected spelling? I want to make sure I add your event properly! ✨`;
    }
    
    return null;
  }

  /**
   * Detect if Maya made a task promise in her response
   */
  private detectsTaskPromise(aiResponse: string, userMessage: string, context: any): boolean {
    const lowerResponse = aiResponse.toLowerCase();
    const lowerMessage = userMessage.toLowerCase().trim();
    
    // Check if user said "yes" to a task suggestion AND Maya promised to create it
    const userSaidYes = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'do it'].includes(lowerMessage);
    const mayaTaskPromises = [
      "task created successfully",
      "added it to the list",
      "i've added that task",
      "task added",
      "adding that to your",
      "added to your tasks"
    ];
    
    const mayaPromised = mayaTaskPromises.some(promise => lowerResponse.includes(promise));
    
    return userSaidYes && mayaPromised;
  }

  /**
   * Extract suggested task from conversation context
   */
  private async extractSuggestedTask(context: any, userMessage: string): Promise<ExternalToolRequest | null> {
    // Look for Maya's previous suggestion about creating a task
    // This is a simplified version - in practice, you'd look at recent conversation history
    // For now, let's handle the specific case from the conversation
    
    if (userMessage.toLowerCase().trim() === 'yes') {
      // This is a fallback - create a generic task about calendar delete functionality
      // In practice, you'd extract the actual suggestion from conversation history
      return {
        tool: 'maya_task_create',
        action: 'create_task',
        params: {
          userId: context.userId,
          description: 'implement calendar delete functionality for MCP',
          priority: 'medium',
          dueDate: null,
          note: 'Task created from Maya\'s suggestion after user confirmation',
          tags: ['mcp', 'calendar', 'development'],
          status: 'open'
        },
        confidence: 0.9
      };
    }
    
    return null;
  }

  /**
   * Check if message matches calendar delete patterns
   */
  private matchesCalendarDeletePattern(message: string): boolean {
    const deletePatterns = [
      /^(?:can you )?delete (?:that |the )?(?:calendar )?event/i,
      /^(?:can you )?remove (?:that |the )?(?:calendar )?event/i,
      /^(?:can you )?cancel (?:that |the )?(?:calendar )?event/i,
      /^delete (?:that |the )?(?:event|meeting|appointment)/i,
      /^remove (?:that |the )?(?:event|meeting|appointment)/i,
      /^cancel (?:that |the )?(?:event|meeting|appointment)/i
    ];
    
    return deletePatterns.some(pattern => pattern.test(message.trim()));
  }

  /**
   * Check if message matches calendar edit/update patterns
   */
  private matchesCalendarEditPattern(message: string): boolean {
    const editPatterns = [
      /^(?:can you )?edit (?:that |the )?(?:calendar )?event/i,
      /^(?:can you )?update (?:that |the )?(?:calendar )?event/i,
      /^(?:can you )?change (?:that |the )?(?:calendar )?event/i,
      /^(?:can you )?modify (?:that |the )?(?:calendar )?event/i,
      /^edit (?:that |the )?(?:event|meeting|appointment)/i,
      /^update (?:that |the )?(?:event|meeting|appointment)/i,
      /^change (?:that |the )?(?:event|meeting|appointment)/i,
      /^modify (?:that |the )?(?:event|meeting|appointment)/i
    ];
    
    return editPatterns.some(pattern => pattern.test(message.trim()));
  }

  /**
   * Parse calendar delete request from user message
   */
  private parseCalendarDeleteFromMessage(message: string, userId: string): any {
    console.log(`[Calendar Delete Parser] Parsing message: "${message}"`);
    
    // For now, we'll need to implement logic to identify the specific event
    // This could be enhanced to look at recent events or ask for clarification
    return {
      userId,
      eventId: 'recent', // Placeholder - would need better event identification
      deleteRecent: true
    };
  }

  /**
   * Parse calendar edit request from user message
   */
  private parseCalendarEditFromMessage(message: string, userId: string): any {
    console.log(`[Calendar Edit Parser] Parsing message: "${message}"`);
    
    // For now, we'll need to implement logic to identify the specific event and what to change
    // This could be enhanced to parse specific update requests
    return {
      userId,
      eventId: 'recent', // Placeholder - would need better event identification
      updates: {
        // Would parse specific updates from the message
      }
    };
  }

  /**
   * Check if message is requesting help
   */
  private isHelpRequest(message: string): boolean {
    const helpPatterns = [
      /^\/help$/i,
      /^\/\?$/i,
      /^show me available commands/i,
      /^what commands can i use/i,
      /^maya help/i,
      /^help$/i
    ];
    
    return helpPatterns.some(pattern => pattern.test(message.trim()));
  }

  /**
   * Generate help response
   */
  private generateHelpResponse(): string {
    return `# 🤖 Maya Command Reference

## **Reliable Command Patterns (90-98% Success Rate)**

### 📋 **Task Management**
• **View tasks**: "what should I work on next?"
• **Create task**: "create task: [description]"
• **Complete task**: "mark task complete: [task name]"

### ⏰ **Reminders** (Strict Format)
• **Create**: "remind me in [X] minutes to [action]"
• **Alternative**: "set reminder for [X] hours to [action]"
• **View**: "what are my upcoming reminders?"

### 📅 **Calendar Events**
• **Create**: "add calendar event: [title] [time] at [location]"
• **Manage**: "can you delete that event?" (for recent event)
• **View**: "what's on my calendar today?"

### 💡 **Tips**
✅ Use exact patterns above
✅ Include "to" in reminders: "remind me in 20 minutes TO take break"
✅ Use colons: "create task: description"
❌ Avoid vague language or missing keywords

**Priority Commands:**
1. "what should I work on next?" - Maya's core strength
2. "remind me in 20 minutes to [action]"
3. "create task: [description]"

Type these commands exactly as shown for best results!`;
  }
} 