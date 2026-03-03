#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Check if environment variables are set
if (!supabaseUrl || !supabaseKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

async function setupVectorStorage() {
  console.log('Setting up vector storage...');
  
  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Read SQL file
    const sqlFilePath = path.join(__dirname, '..', 'supabase', 'setup-vector-storage.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Split into statements
    const statements = sql.split(';').filter(statement => statement.trim() !== '');
    
    // Execute each statement
    for (const statement of statements) {
      const trimmedStatement = statement.trim() + ';';
      console.log(`Executing: ${trimmedStatement.substring(0, 80)}${trimmedStatement.length > 80 ? '...' : ''}`);
      
      const { error } = await supabase.rpc('exec_sql', { query: trimmedStatement });
      
      if (error) {
        console.error(`Error executing SQL: ${error.message}`);
        console.error('Statement:', trimmedStatement);
        
        // Try a more direct approach if the helper function doesn't exist
        try {
          // Execute as raw query (less safe but might work in some cases)
          const { error: directError } = await supabase.from('_exec_sql').select().eq('query', trimmedStatement);
          if (directError) {
            console.error(`Direct query also failed: ${directError.message}`);
          } else {
            console.log('Successfully executed with direct method');
          }
        } catch (directError) {
          console.error('Direct method also failed:', directError);
        }
      } else {
        console.log('Successfully executed');
      }
    }
    
    console.log('Vector storage setup complete');
    console.log('Run the check-memories-table.js script to verify the setup');
  } catch (error) {
    console.error('Error setting up vector storage:', error);
  }
}

// Run the setup
setupVectorStorage().catch(console.error); 