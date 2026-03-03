// Simple Express server to simulate the memory worker functionality
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dlaczmexhnoxfggpzxkl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYWN6bWV4aG5veGZnZ3B6eGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTYxMTMzMzQsImV4cCI6MjAzMTY4OTMzNH0.yW9r-EOPXH_Ubi1TMFt-bUXKcm9bBQFXqwl5DxATFE4'; // Temporary anon key for testing
const PORT = process.env.PORT || 3002; // Use port 3002 to avoid conflict with website
const MAYA_SYSTEM_USER_ID = process.env.MAYA_SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000000';

// Simple UUID generation without requiring uuid package
function generateSimpleId() {
  return 'maya-' + Date.now() + '-' + Math.floor(Math.random() * 10000000);
}

// Create Express app
const app = express();

// Add middleware
app.use(express.json());

// Enable CORS middleware for local development - must come before routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Create Supabase client
let supabase;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('Supabase client initialized successfully');
} catch (error) {
  console.error('Error initializing Supabase client:', error);
  process.exit(1);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Function to generate a simple response
function generateSimpleResponse(message) {
  const lowerMessage = message.toLowerCase();
  
  // Simple response templates
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return "Hello there! I'm Maya, your helpful assistant. How can I assist you today?";
  }
  
  if (lowerMessage.includes('how are you')) {
    return "I'm doing well, thank you for asking! How can I help you today?";
  }
  
  if (lowerMessage.includes('thank')) {
    return "You're welcome! Is there anything else I can help you with?";
  }
  
  if (lowerMessage.includes('help')) {
    return "I'd be happy to help! What specifically do you need assistance with?";
  }
  
  if (lowerMessage.includes('bye') || lowerMessage.includes('goodbye')) {
    return "Goodbye! Feel free to reach out if you need anything else.";
  }
  
  // Default response for any other message
  return "I've received your message. The memory worker is running in development mode with simplified responses. Once fully configured with the Maya agent, I'll provide more helpful and personalized responses!";
}

// Endpoint to manually process a message
app.post('/process-message', async (req, res) => {
  try {
    console.log('Received process-message request:', req.body);
    const { roomId, userId, content } = req.body;
    
    if (!roomId || !userId || !content) {
      return res.status(400).json({ error: 'Missing required fields: roomId, userId, content' });
    }
    
    console.log(`Processing message: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
    
    // Generate a simple response
    const response = generateSimpleResponse(content);
    const messageId = generateSimpleId();
    
    // Insert Maya's response into the database
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          id: messageId,
          content: response,
          user_id: MAYA_SYSTEM_USER_ID,
          room_id: roomId,
          role: 'assistant',
          created_at: new Date().toISOString()
        });
      
      if (error) {
        console.error('Error inserting Maya response:', error);
        return res.status(500).json({ error: 'Failed to insert response', details: error });
      }
      
      console.log(`Maya responded with ID ${messageId}: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`);
      
      res.status(200).json({ 
        success: true, 
        response,
        message_id: messageId
      });
    } catch (dbError) {
      console.error('Database error:', dbError);
      return res.status(500).json({ error: 'Database error', details: dbError });
    }
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: 'Failed to process message', details: error });
  }
});

// Log a warning about permissions
console.log('Starting memory worker server');
console.log('WARNING: The anon key likely does not have permissions to insert messages. If you see permission errors, use your service role key.');
console.log('To use your service role key, run: SUPABASE_SERVICE_ROLE_KEY=your_key node run-local.js');

// Start the server
app.listen(PORT, () => {
  console.log(`Memory worker server running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
  console.log(`Manual message processing available at: http://localhost:${PORT}/process-message`);
  console.log(`Website is likely running on http://localhost:3000 or http://localhost:3001`);
}); 