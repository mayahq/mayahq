#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Check if environment variables are set
if (!supabaseUrl || !supabaseKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

async function checkVectorTable() {
  console.log('Checking vector table setup...');
  
  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Check if table exists
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'maya_memories')
      .eq('table_schema', 'public');
    
    if (tablesError) {
      console.error('Error checking if table exists:', tablesError);
      return;
    }
    
    if (!tables || tables.length === 0) {
      console.error('Error: maya_memories table does not exist');
      console.log('Try running the setup-vector-storage.sql script to create the table');
      return;
    }
    
    console.log('✅ maya_memories table exists');
    
    // Check pgvector extension
    const { data: extensions, error: extensionsError } = await supabase
      .from('pg_extension')
      .select('extname')
      .eq('extname', 'vector');
    
    if (extensionsError) {
      console.error('Error checking pgvector extension:', extensionsError);
      return;
    }
    
    if (!extensions || extensions.length === 0) {
      console.error('Error: pgvector extension is not enabled');
      console.log('Try running "CREATE EXTENSION IF NOT EXISTS vector;"');
      return;
    }
    
    console.log('✅ pgvector extension is enabled');
    
    // Check match_documents function
    const { data: functions, error: functionsError } = await supabase
      .from('pg_proc')
      .select('proname')
      .eq('proname', 'match_documents');
    
    if (functionsError) {
      console.error('Error checking match_documents function:', functionsError);
      return;
    }
    
    if (!functions || functions.length === 0) {
      console.error('Error: match_documents function does not exist');
      console.log('Try running the setup-vector-storage.sql script to create the function');
      return;
    }
    
    console.log('✅ match_documents function exists');
    
    // Check if we can insert and query records
    try {
      // Test embedding (1536 dimensions with small values)
      const testEmbedding = Array(1536).fill(0).map(() => Math.random() * 0.01);
      
      // Insert test record
      const { data: insertData, error: insertError } = await supabase
        .from('maya_memories')
        .insert({
          content: 'This is a test memory for diagnostic purposes',
          metadata: { 
            userId: 'diagnostics-user',
            timestamp: new Date().toISOString(),
            type: 'test'
          },
          embedding: testEmbedding
        })
        .select();
      
      if (insertError) {
        console.error('Error inserting test record:', insertError);
        return;
      }
      
      console.log('✅ Successfully inserted test record');
      
      // Test match_documents function
      const { data: matchData, error: matchError } = await supabase
        .rpc('match_documents', {
          query_embedding: testEmbedding,
          match_count: 1,
          filter: { userId: 'diagnostics-user' }
        });
      
      if (matchError) {
        console.error('Error calling match_documents function:', matchError);
        return;
      }
      
      console.log('✅ Successfully called match_documents function');
      
      // Clean up test record
      const { error: deleteError } = await supabase
        .from('maya_memories')
        .delete()
        .eq('metadata->userId', 'diagnostics-user');
      
      if (deleteError) {
        console.error('Error deleting test record:', deleteError);
      } else {
        console.log('✅ Successfully cleaned up test record');
      }
      
      console.log('\n🎉 Vector storage is correctly set up and functional!');
    } catch (error) {
      console.error('Error during test operation:', error);
    }
  } catch (error) {
    console.error('Error checking vector table setup:', error);
  }
}

// Run the check
checkVectorTable().catch(console.error); 