import { MCPClient, MCPTool, MCPResult } from './mcp-bridge';
import { CalendarMCPTools, MAYA_CALENDAR_TOOLS } from './calendar-mcp-tools';
import { ReminderMCPTools, MAYA_REMINDER_TOOLS } from './reminder-mcp-tools';
import { TaskMCPTools, MAYA_TASK_TOOLS } from './task-mcp-tools';
import { LinkingMCPTools, MAYA_LINKING_TOOLS } from './linking-mcp-tools';
import { ProductMCPTools, MAYA_PRODUCT_TOOLS } from './product-mcp-tools';

/**
 * Basic MCP Client implementation for complete Maya productivity integration
 * Handles GitHub integration + Maya calendar, reminder, task, and linking operations
 */
export class BasicMCPClient implements MCPClient {
  private githubToken: string | null = null;
  private baseUrl: string = 'http://localhost:3001'; // Default MCP server port
  
  constructor(config: {
    githubToken?: string;
    serverUrl?: string;
  } = {}) {
    this.githubToken = config.githubToken || process.env.GITHUB_TOKEN || null;
    this.baseUrl = config.serverUrl || process.env.MCP_SERVER_URL || this.baseUrl;
    
    if (!this.githubToken) {
      console.warn('[MCPClient] No GitHub token provided - GitHub integration will be limited');
    }
  }

  async listTools(): Promise<MCPTool[]> {
    const tools: MCPTool[] = [];
    
    // GitHub tools (if token available)
    if (this.githubToken) {
      tools.push(
        {
          name: 'github_list_commits',
          description: 'Get recent commits from a GitHub repository',
          inputSchema: {
            type: 'object',
            properties: {
              repo: { type: 'string', description: 'Repository name (will use lowvoltagenation as owner)' },
              limit: { type: 'number', description: 'Number of commits to fetch (default: 5)' }
            },
            required: ['repo']
          }
        },
        {
          name: 'github_list_issues',
          description: 'Get issues from a GitHub repository',
          inputSchema: {
            type: 'object',
            properties: {
              repo: { type: 'string', description: 'Repository name' },
              state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state (default: open)' },
              limit: { type: 'number', description: 'Number of issues to fetch (default: 5)' }
            },
            required: ['repo']
          }
        },
        {
          name: 'github_list_pull_requests',
          description: 'Get pull requests from a GitHub repository',
          inputSchema: {
            type: 'object',
            properties: {
              repo: { type: 'string', description: 'Repository name' },
              state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'PR state (default: open)' },
              limit: { type: 'number', description: 'Number of PRs to fetch (default: 5)' }
            },
            required: ['repo']
          }
        },
        {
          name: 'github_repo_info',
          description: 'Get information about a GitHub repository',
          inputSchema: {
            type: 'object',
            properties: {
              repo: { type: 'string', description: 'Repository name' }
            },
            required: ['repo']
          }
        }
      );
    }
    
    // Maya Calendar tools
    tools.push(...MAYA_CALENDAR_TOOLS);
    
    // Maya Reminder tools
    tools.push(...MAYA_REMINDER_TOOLS);
    
    // Maya Task tools
    tools.push(...MAYA_TASK_TOOLS);
    
    // Maya Linking tools
    tools.push(...MAYA_LINKING_TOOLS);
    
    // Maya Product tools
    tools.push(...MAYA_PRODUCT_TOOLS);
    
    return tools;
  }

  async callTool(name: string, args: any): Promise<MCPResult> {
    try {
      console.log(`[MCPClient] Calling tool: ${name} with args:`, args);
      
      // GitHub tools
      if (name.startsWith('github_')) {
        if (!this.githubToken) {
          throw new Error('GitHub token not configured');
        }
        
        switch (name) {
          case 'github_list_commits':
            return await this.getGitHubCommits(args.repo || 'mayahq', args.limit || 5);
          case 'github_list_issues':
            return await this.getGitHubIssues(args.repo || 'mayahq', args.state || 'open', args.limit || 5);
          case 'github_list_pull_requests':
            return await this.getGitHubPullRequests(args.repo || 'mayahq', args.state || 'open', args.limit || 5);
          case 'github_repo_info':
            return await this.getGitHubRepoInfo(args.repo || 'mayahq');
          default:
            throw new Error(`Unknown GitHub tool: ${name}`);
        }
      }
      
      // Maya Calendar tools
      if (name.startsWith('maya_calendar_')) {
        switch (name) {
          case 'maya_calendar_today':
            return await CalendarMCPTools.getTodaysEvents(args);
          case 'maya_calendar_upcoming':
            return await CalendarMCPTools.getUpcomingEvents(args);
          case 'maya_calendar_create':
            return await CalendarMCPTools.createEvent(args);
          case 'maya_calendar_update':
            // Handle recent event updates
            if (args.eventId === 'recent') {
              return await this.updateRecentCalendarEvent(args.userId, args.updates);
            } else {
              return await CalendarMCPTools.updateEvent(args);
            }
          case 'maya_calendar_delete':
            // Handle recent event deletion
            if (args.eventId === 'recent' || args.deleteRecent) {
              return await this.deleteRecentCalendarEvent(args.userId);
            } else {
              return await CalendarMCPTools.deleteEvent(args);
            }
          default:
            throw new Error(`Unknown calendar tool: ${name}`);
        }
      }
      
      // Maya Reminder tools
      if (name.startsWith('maya_reminder_')) {
        switch (name) {
          case 'maya_reminder_create':
            return await ReminderMCPTools.createReminder(args);
          case 'maya_reminder_upcoming':
            return await ReminderMCPTools.getUpcomingReminders(args);
          case 'maya_reminder_list':
            return await ReminderMCPTools.getAllReminders(args);
          case 'maya_reminder_update':
            return await ReminderMCPTools.updateReminder(args);
          case 'maya_reminder_delete':
            // Handle smart deletion - find most recent if deleteRecent flag is set
            if (args.deleteRecent) {
              return await this.deleteRecentReminder(args.userId);
            } else {
              return await ReminderMCPTools.deleteReminder(args);
            }
          case 'maya_reminder_create_linked':
            return await ReminderMCPTools.createLinkedReminder(args);
          default:
            throw new Error(`Unknown reminder tool: ${name}`);
        }
      }
      
      // Maya Task tools
      if (name.startsWith('maya_task_')) {
        switch (name) {
          case 'maya_task_create':
            return await TaskMCPTools.createTask(args);
          case 'maya_task_list':
            return await TaskMCPTools.getTasks(args);
          case 'maya_task_update':
            return await TaskMCPTools.updateTask(args);
          case 'maya_task_delete':
            return await TaskMCPTools.deleteTask(args);
          case 'maya_task_complete':
            return await TaskMCPTools.completeTask(args);
          default:
            throw new Error(`Unknown task tool: ${name}`);
        }
      }
      
      // Maya Linking tools
      if (name.startsWith('maya_link_')) {
        switch (name) {
          case 'maya_link_create':
            return await LinkingMCPTools.createLink(args);
          case 'maya_link_get':
            return await LinkingMCPTools.getEntityLinks(args);
          case 'maya_link_find_related':
            return await LinkingMCPTools.findRelatedEntities(args);
          case 'maya_link_create_task':
            return await LinkingMCPTools.createLinkedTask(args);
          case 'maya_link_create_calendar_event':
            return await LinkingMCPTools.createLinkedCalendarEvent(args);
          case 'maya_link_block_time':
            return await LinkingMCPTools.blockTimeForTask(args);
          case 'maya_link_delete':
            return await LinkingMCPTools.deleteLink(args);
          default:
            throw new Error(`Unknown linking tool: ${name}`);
        }
      }
      
      // Maya Product tools
      if (name.startsWith('maya_product_')) {
        switch (name) {
          case 'maya_product_create':
            return await ProductMCPTools.createProduct(args);
          case 'maya_product_list':
            return await ProductMCPTools.getProducts(args);
          case 'maya_product_update':
            return await ProductMCPTools.updateProduct(args);
          case 'maya_product_delete':
            return await ProductMCPTools.deleteProduct(args);
          case 'maya_product_analytics':
            return await ProductMCPTools.getProductAnalytics(args);
          default:
            throw new Error(`Unknown product tool: ${name}`);
        }
      }
      
      throw new Error(`Unknown tool: ${name}`);
    } catch (error: any) {
      console.error(`[MCPClient] Error calling tool ${name}:`, error.message);
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }

  private async getGitHubCommits(repo: string, limit: number): Promise<MCPResult> {
    const url = `https://api.github.com/repos/lowvoltagenation/${repo}/commits?per_page=${limit}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${this.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Maya-AI-Assistant'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const commits = await response.json();
    
    return {
      content: [{ type: 'text', text: JSON.stringify(commits) }],
      isError: false,
      _meta: { source: 'github', action: 'list_commits', count: commits.length }
    };
  }

  private async getGitHubIssues(repo: string, state: string, limit: number): Promise<MCPResult> {
    const url = `https://api.github.com/repos/lowvoltagenation/${repo}/issues?state=${state}&per_page=${limit}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${this.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Maya-AI-Assistant'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const issues = await response.json();
    
    return {
      content: [{ type: 'text', text: JSON.stringify(issues) }],
      isError: false,
      _meta: { source: 'github', action: 'list_issues', count: issues.length }
    };
  }

  private async getGitHubPullRequests(repo: string, state: string, limit: number): Promise<MCPResult> {
    const url = `https://api.github.com/repos/lowvoltagenation/${repo}/pulls?state=${state}&per_page=${limit}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${this.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Maya-AI-Assistant'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const pullRequests = await response.json();
    
    return {
      content: [{ type: 'text', text: JSON.stringify(pullRequests) }],
      isError: false,
      _meta: { source: 'github', action: 'list_pull_requests', count: pullRequests.length }
    };
  }

  private async getGitHubRepoInfo(repo: string): Promise<MCPResult> {
    const url = `https://api.github.com/repos/lowvoltagenation/${repo}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${this.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Maya-AI-Assistant'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const repoInfo = await response.json();
    
    return {
      content: [{ type: 'text', text: JSON.stringify(repoInfo) }],
      isError: false,
      _meta: { source: 'github', action: 'repo_info', repo: repoInfo.name }
    };
  }

  /**
   * Delete the most recently created reminder for a user
   */
  private async deleteRecentReminder(userId: string): Promise<MCPResult> {
    try {
      // Find the most recent reminder for this user
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: recentReminder, error: findError } = await supabase
        .from('maya_reminders')
        .select('id, title, remind_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (findError || !recentReminder) {
        return {
          content: [{ type: 'text', text: '❌ No recent reminders found to delete.' }],
          isError: false
        };
      }

      // Delete the most recent reminder
      return await ReminderMCPTools.deleteReminder({
        userId,
        reminderId: recentReminder.id
      });

    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to delete recent reminder: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Update the most recently created calendar event for a user
   */
  private async updateRecentCalendarEvent(userId: string, updates: any): Promise<MCPResult> {
    try {
      // Find the most recent calendar event for this user
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: recentEvent, error: findError } = await supabase
        .from('calendar_events')
        .select('id, title, start_time')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (findError || !recentEvent) {
        return {
          content: [{ type: 'text', text: '❌ No recent calendar events found to update.' }],
          isError: false
        };
      }

      // Update the most recent event
      return await CalendarMCPTools.updateEvent({
        userId,
        eventId: recentEvent.id,
        ...updates
      });

    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to update recent calendar event: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Delete the most recently created calendar event for a user
   */
  private async deleteRecentCalendarEvent(userId: string): Promise<MCPResult> {
    try {
      // Find the most recent calendar event for this user
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: recentEvent, error: findError } = await supabase
        .from('calendar_events')
        .select('id, title, start_time')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (findError || !recentEvent) {
        return {
          content: [{ type: 'text', text: '❌ No recent calendar events found to delete.' }],
          isError: false
        };
      }

      // Delete the most recent event
      return await CalendarMCPTools.deleteEvent({
        userId,
        eventId: recentEvent.id
      });

    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to delete recent calendar event: ${error.message}` }],
        isError: true
      };
    }
  }
} 