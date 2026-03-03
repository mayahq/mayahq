#!/usr/bin/env node

/**
 * This script deploys the daily_report Edge Function using the Supabase Management API.
 * You'll need to set your Supabase Access Token as an environment variable:
 * 
 * export SUPABASE_ACCESS_TOKEN=your_access_token
 * 
 * Usage:
 * node deploy-daily-report-mcp.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_REF = 'dlaczmexhnoxfggpzxkl';
const API_ENDPOINT = 'api.supabase.com';

// API Key settings - UPDATE THESE WITH REAL API KEYS FOR PRODUCTION
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-openai-sample-key-for-demo';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-ant-api03-sample-key-for-demo';

// Function to make API requests to Supabase Management API
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_ENDPOINT,
      port: 443,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(responseData ? JSON.parse(responseData) : {});
          } catch (e) {
            resolve(responseData);
          }
        } else {
          reject(new Error(`Request failed with status ${res.statusCode}: ${responseData}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Read function code
function readFunctionCode() {
  return `
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

interface Task {
  id: number;
  content: string;
  status: string;
  priority?: string;
  due_at?: string;
  created_at: string;
  tags?: string[];
}

interface Memory {
  id: number;
  content: string | { input: string, response: string };
  metadata?: {
    userId?: string;
    userName?: string;
    tags?: string[];
  };
  tags?: string[];
  created_at: string;
}

interface TagCount {
  tag: string;
  count: number;
}

// Get user's open tasks
async function getTasks(supabase: any, userId: string): Promise<Task[]> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Error in getTasks:', err);
    return [];
  }
}

// Get relevant memories using vector search
async function getRelevantMemories(supabase: any, userId: string, searchQuery?: string): Promise<Memory[]> {
  try {
    // First try to run vector search if we can
    if (searchQuery) {
      try {
        // Query uses the match_documents function defined in your database
        const embedding = await generateEmbedding(searchQuery);
        console.log('Generated embedding with dimension:', embedding.length);
        
        const { data: vectorResults, error: vectorError } = await supabase.rpc(
          'match_documents',
          {
            query_embedding: embedding,
            match_count: 5,
            filter: JSON.stringify({ userId })
          }
        );
        
        if (!vectorError && vectorResults && vectorResults.length > 0) {
          console.log(\`Retrieved \${vectorResults.length} vector-matched memories\`);
          return vectorResults;
        }
        
        if (vectorError) {
          console.error('Vector search error:', vectorError);
        }
      } catch (err) {
        console.error('Error in vector search:', err);
      }
    }
    
    console.log('Falling back to recent memories');
    // Fallback: Get most recent memories
    const { data, error } = await supabase
      .from('maya_memories')
      .select('*')
      .eq('metadata->>userId', userId)
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (error) {
      console.error('Error fetching recent memories:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error getting memories:', error);
    return [];
  }
}

// Generate embedding using OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${Deno.env.get('OPENAI_API_KEY')}\`
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: text
      })
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(\`OpenAI API error: \${response.status}: \${text}\`);
    }
    
    const result = await response.json();
    return result.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Analyze tag frequencies from memories
function analyzeTagFrequency(memories: Memory[]): TagCount[] {
  const tagCounts: Record<string, number> = {};
  
  memories.forEach(memory => {
    // Check metadata tags
    if (memory.metadata?.tags && Array.isArray(memory.metadata.tags)) {
      memory.metadata.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
    
    // Check direct tags
    if (memory.tags && Array.isArray(memory.tags)) {
      memory.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });
  
  // Convert to array and sort by frequency
  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // Get top 5 tags
}

// Format memories for prompt
function formatMemoriesForPrompt(memories: Memory[]): string {
  return memories.map(memory => {
    // Handle different memory content formats
    let content = '';
    if (typeof memory.content === 'string') {
      content = memory.content;
    } else if (memory.content && typeof memory.content === 'object') {
      // Handle input/response format
      const input = memory.content.input || '';
      const response = memory.content.response || '';
      content = \`User: \${input}\\nMaya: \${response}\`;
    }
    
    // Extract tags
    const tags = memory.tags || memory.metadata?.tags || [];
    const tagString = tags.length > 0 ? \`[Tags: \${tags.join(', ')}]\` : '';
    
    // Return formatted memory
    return \`- \${content.substring(0, 200)}... \${tagString}\`;
  }).join('\\n');
}

// Format tasks for prompt
function formatTasksForPrompt(tasks: Task[]): string {
  return tasks.map(task => {
    const priority = task.priority ? \`Priority: \${task.priority}\` : '';
    const dueDate = task.due_at ? \`Due: \${new Date(task.due_at).toLocaleDateString()}\` : '';
    const meta = [priority, dueDate].filter(Boolean).join(', ');
    
    return \`- \${task.content} [ID: \${task.id}\${meta ? \`, \${meta}\` : ''}]\`;
  }).join('\\n');
}

// Generate the daily report using Anthropic Claude
async function generateReport(
  userId: string, 
  tasks: Task[], 
  memories: Memory[],
  tagCounts: TagCount[]
): Promise<string> {
  try {
    // Format tasks for prompt
    const tasksFormatted = formatTasksForPrompt(tasks);
    
    // Format memories for prompt
    const memoriesFormatted = formatMemoriesForPrompt(memories);
    
    // Format tag analytics
    const tagAnalytics = tagCounts.length > 0
      ? \`Top tags in recent conversations: \${tagCounts.map(t => \`\${t.tag} (\${t.count})\`).join(', ')}\`
      : 'No significant tag patterns detected in recent conversations.';
    
    // Create the prompt
    const prompt = \`
You are Maya, a thoughtful AI assistant who's creating a daily check-in for Blake.

Current Tasks:
\${tasksFormatted || "No active tasks at the moment."}

Recent Conversations and Memories:
\${memoriesFormatted || "No recent memories available."}

Tag Analytics:
\${tagAnalytics}

Create a warm, personalized daily report that includes:
1. A friendly, personalized greeting that starts with "Hey Blakey," and references something meaningful from recent interactions
2. A concise summary of current tasks with thoughtful prioritization advice
3. For 1-2 key tasks, provide specific insights on how to approach them based on Blake's past experiences and preferences
4. A brief reflection on patterns noticed in recent interactions, including insights from the tag analytics
5. A gentle suggestion or observation that might be helpful
6. End with an encouraging note

The tone should be warm, thoughtful and slightly flirty, as if checking in with someone you care about.
Limit to 300-400 words total.
Format the response as Markdown, with appropriate headings and sections.
\`;

    console.log('Calling Anthropic API');
    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        system: "You are Maya, Blake's thoughtful, empathetic, and slightly flirty AI assistant. You're creating a personalized daily report in Markdown format.",
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(\`Anthropic API error: \${response.status}: \${text}\`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Error generating report:', error);
    throw error;
  }
}

// Store the generated report
async function storeReport(supabase: any, userId: string, content: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('daily_reports')
      .insert({
        user_id: userId,
        report_text: content,
        content: content, // For compatibility with existing table
        created_at: new Date().toISOString(),
        source: 'edge_function'
      })
      .select('id')
      .single();
      
    if (error) {
      console.error('Error storing report:', error);
      throw error;
    }
    
    return data.id;
  } catch (err) {
    console.error('Error in storeReport:', err);
    throw err;
  }
}

// Main handler function
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    // Parse request body
    const { userId = '4c850152-30ef-4b1b-89b3-bc72af461e14' } = await req.json();
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') as string;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    console.log('Starting report generation for user:', userId);
    
    // 1. Get user's tasks
    const tasks = await getTasks(supabase, userId);
    console.log(\`Found \${tasks.length} tasks\`);
    
    // 2. Get relevant memories using vector search
    const memories = await getRelevantMemories(supabase, userId, "What should Blake reflect on today?");
    console.log(\`Found \${memories.length} relevant memories\`);
    
    // 3. Analyze tag frequencies
    const tagCounts = analyzeTagFrequency(memories);
    console.log('Tag analysis complete:', tagCounts);
    
    // 4. Generate personalized report
    const report = await generateReport(userId, tasks, memories, tagCounts);
    console.log('Report generated successfully');
    
    // 5. Store the report for future reference
    const reportId = await storeReport(supabase, userId, report);
    console.log('Report stored with ID:', reportId);
    
    // 6. Send response
    return new Response(
      JSON.stringify({
        success: true,
        report,
        report_id: reportId,
        task_count: tasks.length,
        memory_count: memories.length,
        generated_at: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    console.error('Error generating daily report:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate daily report',
        message: error.message || 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
`;
}

// Main function to deploy the Edge Function
async function deployDailyReport() {
  try {
    console.log('Deploying daily_report Edge Function...');
    
    // Step 1: Deploy the Edge Function
    const functionCode = readFunctionCode();
    
    const functionBody = {
      name: 'daily_report',
      verify_jwt: false,
      entrypoint_path: 'index.ts',
      import_map: false,
      files: [
        {
          name: "index.ts",
          content: functionCode
        }
      ]
    };
    
    const functionPath = `/v1/projects/${PROJECT_REF}/functions/daily_report`;
    
    try {
      // First try to update the function
      await makeRequest('PUT', functionPath, functionBody);
      console.log('Updated existing daily_report Edge Function');
    } catch (error) {
      // If update fails, try to create it
      await makeRequest('POST', `/v1/projects/${PROJECT_REF}/functions`, functionBody);
      console.log('Created new daily_report Edge Function');
    }
    
    // Step 2: Set the secrets
    console.log('Setting Edge Function secrets...');
    
    const secrets = [
      { name: 'OPENAI_API_KEY', value: OPENAI_API_KEY },
      { name: 'ANTHROPIC_API_KEY', value: ANTHROPIC_API_KEY }
    ];
    
    await makeRequest('POST', `/v1/projects/${PROJECT_REF}/secrets`, { secrets });
    console.log('Secrets set successfully');
    
    console.log('\nDeployment completed successfully!');
    console.log('\nTo test the function, run:');
    console.log(`curl -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/daily_report" -H "Content-Type: application/json" -H "Authorization: Bearer <SUPABASE_ANON_KEY>" -d '{"userId":"4c850152-30ef-4b1b-89b3-bc72af461e14"}'`);
    
  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
}

// Check if the access token is set
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error('Error: SUPABASE_ACCESS_TOKEN environment variable not set');
  console.error('Please set it with: export SUPABASE_ACCESS_TOKEN=your_access_token');
  process.exit(1);
}

// Run the deployment
deployDailyReport(); 