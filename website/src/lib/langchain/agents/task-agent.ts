import { createClient } from '@supabase/supabase-js';
import { getTaskTools } from "../tools/tasks";

// Task detection prompt
const TASK_DETECTION_PROMPT = `You are a helpful task detection agent. Your job is to analyze the user message and determine if it:

1. Is attempting to create a new task (e.g., "I need to...", "Remind me to...", "Create a task...")
2. Is asking to view tasks (e.g., "Show my tasks", "What do I need to do?", "List my todos")
3. Is updating a task (e.g., "Mark task X as done", "Change the priority of task Y", "Mark the previous task as complete")
4. Is asking about task reminders (e.g., "What's due soon?", "Any upcoming deadlines?")
5. Is asking which task to prioritize (e.g., "Which task should I do first?", "What's most important?")
6. Is trying to delete a task (e.g., "Delete task 3", "Remove my most recent task")
7. Is responding to a previous question about tasks (e.g., giving just a task ID number like "3" or "task #3")
8. Is not related to tasks at all

Respond with one of the following actions:
- CREATE_TASK: If the user is trying to create a new task
- VIEW_TASKS: If the user is asking to view their tasks
- UPDATE_TASK: If the user is trying to update a task
- GET_REMINDERS: If the user is asking about upcoming tasks or deadlines
- PRIORITIZE_TASKS: If the user is asking which task to work on first or which is more important
- DELETE_TASK: If the user is trying to delete or remove a task
- TASK_CONTEXT_RESPONSE: If the user is responding to a previous task-related question (e.g., with just a number)
- NOT_TASK_RELATED: If the message is not related to tasks

Provide just the action name, with no additional text.`;

// Task creation prompt
const TASK_CREATION_PROMPT = `You are a task extraction specialist. Given a user message, extract the task details and format them for the task system.

The task should be clear, actionable, and include all relevant details mentioned (dates, tags, etc.).

Extract the core task content, and identify any tags that should be applied to this task. Tags should be single words or short phrases that categorize the task.

Example user message: "I need to schedule a meeting with the marketing team next Tuesday"
Example output JSON:
{
  "message": "Schedule a meeting with the marketing team next Tuesday",
  "userId": "[User ID will be provided]",
  "tags": ["meeting", "marketing"]
}

User message: "{message}"
userId: "{userId}"

Output JSON:`;

// Task update prompt
const TASK_UPDATE_PROMPT = `You are a task update specialist. Your job is to analyze the user's message and extract:

1. Which task they want to update (look for identifiers like "previous task", "last task", "task about X")
2. What update they want to make (status change, priority change, etc.)

If the user mentions a specific task ID, use that. Otherwise, try to identify which task they're referring to by any descriptive details or temporal references.

Example user message: "mark that previous task as complete"
Example output JSON:
{
  "referenceType": "temporal",
  "reference": "previous",
  "action": "update_status",
  "newStatus": "done"
}

Example user message: "change the priority of my meeting task to high"
Example output JSON:
{
  "referenceType": "description",
  "reference": "meeting",
  "action": "update_priority", 
  "newPriority": "high"
}

User message: "{message}"
userId: "{userId}"

Output JSON:`;

// Task prioritization prompt
const TASK_PRIORITIZATION_PROMPT = `You are a task prioritization specialist. Given a list of tasks, determine which one the user should focus on first based on:

1. Due dates (tasks with closer due dates should be higher priority)
2. Priority fields already set on the tasks
3. Task descriptions (look for words like "urgent", "important", "critical", etc.)
4. Dependencies between tasks (if one task seems to be a prerequisite for another)

Explain your recommendation in 1-2 clear, concise sentences.

Tasks:
{tasks}

Output:`;

// Task deletion prompt
const TASK_DELETION_PROMPT = `You are a task deletion specialist. Analyze the user's message to determine which task they want to delete.

Look for:
1. Direct references to task IDs (e.g., "delete task 3", "remove #5")
2. References to the most recent task (e.g., "delete my latest task", "remove the task I just added")
3. Description-based references (e.g., "delete the meeting task", "remove that task about the report")

Example user message: "delete the most recent task"
Example output JSON:
{
  "referenceType": "temporal",
  "reference": "recent"
}

Example user message: "remove task #3"
Example output JSON:
{
  "referenceType": "id",
  "reference": "3"
}

User message: "{message}"
userId: "{userId}"

Output JSON:`;

// Define an interface for task update details with matchingTasks
interface TaskUpdateDetails {
  referenceType: string;
  reference: string;
  action: string;
  taskId?: number;
  newStatus?: string;
  newPriority?: string;
  newDueDate?: string;
  newNote?: string;
  matchingTasks?: string;
}

// Interface for conversation context
interface ConversationContext {
  lastAction?: string;
  matchingTasks?: string;
  lastQuestion?: string;
  pendingTaskId?: boolean;
  taskListShown?: boolean;
}

// Keep a simple conversation memory per user
const conversationMemory: Record<string, ConversationContext> = {};

// Regular expressions for direct task ID detection
const taskIdPatterns = [
  /^(\d+)$/,                     // Just a number
  /^#?(\d+)$/,                   // Number with optional # prefix
  /^task #?(\d+)$/i,             // "task" followed by optional # and number
  /^task (\d+)$/i,               // "task" followed by number
];

/**
 * Simple function to call Anthropic API directly
 */
async function callAnthropic(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Anthropic API key");
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ],
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Error calling Anthropic API:', error);
    throw error;
  }
}

/**
 * Check if a message is just a task ID
 */
function extractDirectTaskId(message: string): number | null {
  for (const pattern of taskIdPatterns) {
    const match = message.trim().match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}

/**
 * Determines if a message is task-related and what type of task operation
 */
export async function determineTaskAction(
  message: string,
  userId: string
): Promise<string> {
  try {
    // Check conversation context first
    const context = conversationMemory[userId] || {};
    
    // Check for direct task ID if we're waiting for one
    if (context.pendingTaskId || context.lastQuestion?.includes("Which one did you mean?")) {
      const taskId = extractDirectTaskId(message);
      if (taskId !== null) {
        return "TASK_CONTEXT_RESPONSE";
      }
    }

    const result = await callAnthropic(
      TASK_DETECTION_PROMPT,
      message
    );
    
    // Update the conversation memory with this action
    if (!conversationMemory[userId]) {
      conversationMemory[userId] = {};
    }
    
    conversationMemory[userId].lastAction = result.trim();
    
    return result.trim();
  } catch (error) {
    console.error("Error determining task action:", error);
    return "NOT_TASK_RELATED";
  }
}

/**
 * Extracts task details from a message for task creation
 */
export async function extractTaskDetails(
  message: string,
  userId: string
): Promise<{ message: string; userId: string; tags: string[] }> {
  try {
    const result = await callAnthropic(
      TASK_CREATION_PROMPT,
      `Message: ${message}\nUser ID: ${userId}`
    );

    // Parse the JSON result
    try {
      const parsedResult = JSON.parse(result.trim());
      return {
        message: parsedResult.message,
        userId,
        tags: parsedResult.tags || []
      };
    } catch (e) {
      console.error("Error parsing task extraction result:", e);
      // Fallback to simpler approach
      return {
        message,
        userId,
        tags: []
      };
    }
  } catch (error) {
    console.error("Error extracting task details:", error);
    return {
      message,
      userId,
      tags: []
    };
  }
}

/**
 * Extracts task update details from a message
 */
export async function extractTaskUpdateDetails(
  message: string,
  userId: string
): Promise<TaskUpdateDetails> {
  try {
    // Check for direct task ID first
    const directTaskId = extractDirectTaskId(message);
    if (directTaskId !== null) {
      // User replied with just a task ID, use that
      return {
        referenceType: "id",
        reference: directTaskId.toString(),
        action: "update_status",
        taskId: directTaskId,
        newStatus: "done" // Default action is to mark as done
      };
    }
    
    const result = await callAnthropic(
      TASK_UPDATE_PROMPT,
      `Message: ${message}\nUser ID: ${userId}`
    );
    
    // Parse the JSON result
    try {
      const parsedResult = JSON.parse(result.trim()) as TaskUpdateDetails;
      
      // Check if the reference is a direct task ID
      if (parsedResult.referenceType === "id" && !isNaN(Number(parsedResult.reference))) {
        parsedResult.taskId = Number(parsedResult.reference);
        return parsedResult;
      }
      
      // This is the improvement - use our tools to find tasks instead of in-memory cache
      const [getTasksTool, createTaskTool, updateTaskTool, taskRemindersTool, findTaskTool, getRecentTaskTool] = getTaskTools();
      
      // Check for temporal references like "previous" or "last"
      if (parsedResult.referenceType === "temporal" && 
          ["previous", "last", "recent", "newest"].includes(parsedResult.reference.toLowerCase())) {
        
        // Get the most recent task using our new tool
        const recentTaskResult = await getRecentTaskTool._call(JSON.stringify({ userId }));
        
        // Parse the task ID from the result
        const taskIdMatch = recentTaskResult.match(/task: #(\d+):/i);
        if (taskIdMatch && taskIdMatch[1]) {
          parsedResult.taskId = parseInt(taskIdMatch[1], 10);
        }
        
        return parsedResult;
      }
      
      // For description references, use our fuzzy search tool
      if (parsedResult.referenceType === "description" && parsedResult.reference) {
        const searchQuery = parsedResult.reference;
        
        // Search for tasks matching the description
        const searchResult = await findTaskTool._call(JSON.stringify({ 
          userId, 
          query: searchQuery 
        }));
        
        // If we found matching tasks, use the first one
        if (!searchResult.includes("No matching tasks found")) {
          // Try to extract the first task ID from the results
          const firstTaskMatch = searchResult.split('\n')[0].match(/Task #(\d+):/);
          if (firstTaskMatch && firstTaskMatch[1]) {
            const taskId = parseInt(firstTaskMatch[1], 10);
            
            // Check if it's a high confidence match (>= 70%)
            if (searchResult.includes(`(${taskId})`) && searchResult.includes("70% match")) {
              parsedResult.taskId = taskId;
            } else {
              // If multiple tasks matched, add them to the response for disambiguation
              parsedResult.matchingTasks = searchResult;
              
              // Store in conversation memory
              if (!conversationMemory[userId]) {
                conversationMemory[userId] = {};
              }
              conversationMemory[userId].matchingTasks = searchResult;
              conversationMemory[userId].pendingTaskId = true;
            }
          }
        }
      }
      
      return parsedResult;
    } catch (e) {
      console.error("Error parsing task update extraction result:", e);
      // Return a basic structure
      return {
        referenceType: "unknown",
        reference: "",
        action: "unknown"
      };
    }
  } catch (error) {
    console.error("Error extracting task update details:", error);
    return {
      referenceType: "unknown",
      reference: "",
      action: "unknown"
    };
  }
}

/**
 * Extract deletion details from a message
 */
export async function extractTaskDeletionDetails(
  message: string,
  userId: string
): Promise<TaskUpdateDetails> {
  try {
    // Check for direct task ID first
    const directTaskId = extractDirectTaskId(message);
    if (directTaskId !== null) {
      // User replied with just a task ID
      return {
        referenceType: "id",
        reference: directTaskId.toString(),
        action: "delete",
        taskId: directTaskId
      };
    }
    
    const result = await callAnthropic(
      TASK_DELETION_PROMPT,
      `Message: ${message}\nUser ID: ${userId}`
    );
    
    // Parse the JSON result
    try {
      const parsedResult = JSON.parse(result.trim()) as TaskUpdateDetails;
      parsedResult.action = "delete"; // Ensure action is set to delete
      
      // Check if the reference is a direct task ID
      if (parsedResult.referenceType === "id" && !isNaN(Number(parsedResult.reference))) {
        parsedResult.taskId = Number(parsedResult.reference);
        return parsedResult;
      }
      
      // Get tools needed for lookups
      const [getTasksTool, createTaskTool, updateTaskTool, taskRemindersTool, findTaskTool, getRecentTaskTool] = getTaskTools();
      
      // Check for temporal references like "previous" or "last"
      if (parsedResult.referenceType === "temporal" && 
          ["previous", "last", "recent", "newest"].includes(parsedResult.reference.toLowerCase())) {
        
        // Get the most recent task using our new tool
        const recentTaskResult = await getRecentTaskTool._call(JSON.stringify({ userId }));
        
        // Parse the task ID from the result
        const taskIdMatch = recentTaskResult.match(/task: #(\d+):/i);
        if (taskIdMatch && taskIdMatch[1]) {
          parsedResult.taskId = parseInt(taskIdMatch[1], 10);
        }
        
        return parsedResult;
      }
      
      // For description references, use our fuzzy search tool
      if (parsedResult.referenceType === "description" && parsedResult.reference) {
        const searchQuery = parsedResult.reference;
        
        // Search for tasks matching the description
        const searchResult = await findTaskTool._call(JSON.stringify({ 
          userId, 
          query: searchQuery 
        }));
        
        // If we found matching tasks, use the first one
        if (!searchResult.includes("No matching tasks found")) {
          // Try to extract the first task ID from the results
          const firstTaskMatch = searchResult.split('\n')[0].match(/Task #(\d+):/);
          if (firstTaskMatch && firstTaskMatch[1]) {
            const taskId = parseInt(firstTaskMatch[1], 10);
            
            // Check if it's a high confidence match (>= 70%)
            if (searchResult.includes(`(${taskId})`) && searchResult.includes("70% match")) {
              parsedResult.taskId = taskId;
            } else {
              // If multiple tasks matched, add them to the response for disambiguation
              parsedResult.matchingTasks = searchResult;
              
              // Store in conversation memory
              if (!conversationMemory[userId]) {
                conversationMemory[userId] = {};
              }
              conversationMemory[userId].matchingTasks = searchResult;
              conversationMemory[userId].pendingTaskId = true;
            }
          }
        }
      }
      
      return parsedResult;
    } catch (e) {
      console.error("Error parsing task deletion extraction result:", e);
      // Return a basic structure
      return {
        referenceType: "unknown",
        reference: "",
        action: "delete"
      };
    }
  } catch (error) {
    console.error("Error extracting task deletion details:", error);
    return {
      referenceType: "unknown",
      reference: "",
      action: "delete"
    };
  }
}

/**
 * Prioritize tasks and recommend which to do first
 */
export async function prioritizeTasks(
  userId: string
): Promise<string> {
  try {
    // Get list of tasks
    const [getTasksTool] = getTaskTools();
    const tasksResult = await getTasksTool._call(JSON.stringify({ userId }));
    
    if (tasksResult.includes("No tasks found")) {
      return "You don't have any tasks to prioritize.";
    }
    
    // Use task prioritization prompt
    const result = await callAnthropic(
      TASK_PRIORITIZATION_PROMPT,
      `Tasks:\n${tasksResult}`
    );
    
    return result.trim();
  } catch (error) {
    console.error("Error prioritizing tasks:", error);
    return "I couldn't prioritize your tasks right now. Please try again later.";
  }
}

/**
 * Handles task-related operations in chat
 */
export async function handleTaskInChat(
  message: string,
  userId: string,
): Promise<{ isTaskRelated: boolean; response: string }> {
  try {
    // Step 1: Determine if the message is task-related
    const taskAction = await determineTaskAction(message, userId);
    
    if (taskAction === "NOT_TASK_RELATED") {
      return { isTaskRelated: false, response: "" };
    }
    
    console.log(`Task action detected: ${taskAction}`);
    
    // Get the appropriate tool for the action
    const [getTasksTool, createTaskTool, updateTaskTool, taskRemindersTool, findTaskTool, getRecentTaskTool] = getTaskTools();
    
    // Step 2: Handle the task based on the action type
    let response = "";
    
    // Track if we've shown a task list
    const context = conversationMemory[userId] || {};
    
    switch (taskAction) {
      case "CREATE_TASK":
        const taskDetails = await extractTaskDetails(message, userId);
        response = await createTaskTool._call(JSON.stringify(taskDetails));
        break;
        
      case "VIEW_TASKS":
        response = await getTasksTool._call(JSON.stringify({ userId }));
        
        // Update conversation memory
        if (!conversationMemory[userId]) {
          conversationMemory[userId] = {};
        }
        conversationMemory[userId].taskListShown = true;
        break;
        
      case "UPDATE_TASK":
        // For updates, extract details about which task to update and how
        const updateDetails = await extractTaskUpdateDetails(message, userId);
        
        if (updateDetails.taskId) {
          // We have a specific task ID, proceed with the update
          const updatePayload: any = {
            taskId: updateDetails.taskId,
            userId
          };
          
          if (updateDetails.action === "update_status" && updateDetails.newStatus) {
            updatePayload.status = updateDetails.newStatus;
          }
          
          if (updateDetails.action === "update_priority" && updateDetails.newPriority) {
            updatePayload.priority = updateDetails.newPriority;
          }
          
          if (updateDetails.newDueDate) {
            updatePayload.dueDate = updateDetails.newDueDate;
          }
          
          if (updateDetails.newNote) {
            updatePayload.note = updateDetails.newNote;
          }
          
          response = await updateTaskTool._call(JSON.stringify(updatePayload));
          
          // Clear pending state
          if (conversationMemory[userId]) {
            conversationMemory[userId].pendingTaskId = false;
          }
        } else if (updateDetails.matchingTasks) {
          // We found multiple potential matches, ask for clarification
          response = `I found multiple tasks that might match. Which one did you mean?\n\n${updateDetails.matchingTasks}\n\nPlease specify the task ID (e.g., "mark task #5 as complete").`;
          
          // Update conversation memory
          if (!conversationMemory[userId]) {
            conversationMemory[userId] = {};
          }
          conversationMemory[userId].lastQuestion = response;
          conversationMemory[userId].pendingTaskId = true;
        } else {
          // Could not determine which task to update
          response = "I couldn't determine which task you wanted to update. Please specify the task ID or provide more details about the task.";
        }
        break;
        
      case "DELETE_TASK":
        // Extract deletion details
        const deletionDetails = await extractTaskDeletionDetails(message, userId);
        
        if (deletionDetails.taskId) {
          // We have a specific task ID, proceed with the update (status = canceled instead of actual deletion)
          const updatePayload = {
            taskId: deletionDetails.taskId,
            userId,
            status: "canceled"
          };
          
          response = await updateTaskTool._call(JSON.stringify(updatePayload));
          
          // Make response more deletion-oriented
          if (response.includes("updated successfully")) {
            response = `✅ Task ${deletionDetails.taskId} has been removed.`;
          }
          
          // Clear pending state
          if (conversationMemory[userId]) {
            conversationMemory[userId].pendingTaskId = false;
          }
        } else if (deletionDetails.matchingTasks) {
          // We found multiple potential matches, ask for clarification
          response = `I found multiple tasks that might match. Which one did you want to delete?\n\n${deletionDetails.matchingTasks}\n\nPlease specify the task ID (e.g., "delete task #5").`;
          
          // Update conversation memory
          if (!conversationMemory[userId]) {
            conversationMemory[userId] = {};
          }
          conversationMemory[userId].lastQuestion = response;
          conversationMemory[userId].pendingTaskId = true;
        } else {
          // Could not determine which task to delete
          response = "I couldn't determine which task you wanted to delete. Please specify the task ID or provide more details about the task.";
        }
        break;
        
      case "GET_REMINDERS":
        response = await taskRemindersTool._call(JSON.stringify({ userId }));
        break;
        
      case "PRIORITIZE_TASKS":
        // Handle task prioritization
        response = await prioritizeTasks(userId);
        break;
        
      case "TASK_CONTEXT_RESPONSE":
        // User is responding to a previous question about tasks
        // Check if we've asked for a task ID
        if (context.pendingTaskId && context.matchingTasks) {
          // Try to extract a task ID from the user's response
          const taskId = extractDirectTaskId(message);
          
          if (taskId !== null) {
            // User provided a task ID, try to update that task
            // First, check what action we were in the middle of
            if (context.lastAction === "UPDATE_TASK") {
              const updatePayload = {
                taskId,
                userId,
                status: "done" // Default action is to mark as done
              };
              
              response = await updateTaskTool._call(JSON.stringify(updatePayload));
            } else if (context.lastAction === "DELETE_TASK") {
              const updatePayload = {
                taskId,
                userId,
                status: "canceled" // Mark as canceled instead of actual deletion
              };
              
              response = await updateTaskTool._call(JSON.stringify(updatePayload));
              
              // Make response more deletion-oriented
              if (response.includes("updated successfully")) {
                response = `✅ Task ${taskId} has been removed.`;
              }
            } else {
              // Generic response when action is unclear
              response = `I'm not sure what you wanted to do with task #${taskId}. Please try again with a more specific command.`;
            }
            
            // Clear pending state
            conversationMemory[userId].pendingTaskId = false;
          } else {
            // User didn't provide a task ID
            response = "I couldn't determine which task you're referring to. Please specify the task ID number.";
          }
        } else if (context.taskListShown) {
          // User was looking at the task list, and now is likely asking about priorities
          response = await prioritizeTasks(userId);
        } else {
          // Fallback: just show tasks
          response = await getTasksTool._call(JSON.stringify({ userId }));
        }
        break;
        
      default:
        return { isTaskRelated: false, response: "" };
    }
    
    return { isTaskRelated: true, response };
    
  } catch (error) {
    console.error("Error handling task in chat:", error);
    return { isTaskRelated: false, response: "" };
  }
} 