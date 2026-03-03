require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Verify environment variables
console.log('Environment variables check:');
console.log('- SUPABASE_URL:', process.env.SUPABASE_URL ? 'exists' : 'missing');
console.log('- SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'exists' : 'missing');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables for Supabase connection');
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  try {
    console.log('===== Database Test =====');
    
    // 1. Check maya_memories table
    console.log('\n----- Testing maya_memories table -----');
    try {
      const { data: memoriesData, error: memoriesError } = await supabase
        .from('maya_memories')
        .select('id, content, embedding')
        .limit(5);
        
      if (memoriesError) {
        console.error('Error querying maya_memories:', memoriesError);
      } else {
        console.log(`Found ${memoriesData?.length || 0} memories`);
        
        // Check for embeddings
        const memoriesWithEmbedding = memoriesData?.filter(mem => mem.embedding && (
          Array.isArray(mem.embedding) ? mem.embedding.length > 0 : true
        ));
        
        console.log(`Memories with embeddings: ${memoriesWithEmbedding?.length || 0} / ${memoriesData?.length || 0}`);
        
        if (memoriesData && memoriesData.length > 0) {
          console.log('Sample memory:');
          const sample = memoriesData[0];
          console.log(`ID: ${sample.id}`);
          console.log(`Content: ${sample.content.substring(0, 100)}${sample.content.length > 100 ? '...' : ''}`);
          
          let embeddingDesc = 'NULL';
          if (sample.embedding) {
            if (Array.isArray(sample.embedding)) {
              embeddingDesc = `Array with ${sample.embedding.length} elements`;
            } else if (typeof sample.embedding === 'object') {
              embeddingDesc = 'Object (possibly pgvector)';
            } else {
              embeddingDesc = typeof sample.embedding;
            }
          }
          
          console.log(`Embedding: ${embeddingDesc}`);
        }
      }
    } catch (memoryError) {
      console.error('Exception during maya_memories query:', memoryError);
    }
    
    // 2. Check maya_facts table
    console.log('\n----- Testing maya_facts table -----');
    try {
      const { data: factsData, error: factsError } = await supabase
        .from('maya_facts')
        .select('id, subject, predicate, object, embedding')
        .limit(5);
        
      if (factsError) {
        console.error('Error querying maya_facts:', factsError);
      } else {
        console.log(`Found ${factsData?.length || 0} facts`);
        
        // Check for embeddings
        const factsWithEmbedding = factsData?.filter(fact => fact.embedding && (
          Array.isArray(fact.embedding) ? fact.embedding.length > 0 : true
        ));
        
        console.log(`Facts with embeddings: ${factsWithEmbedding?.length || 0} / ${factsData?.length || 0}`);
        
        if (factsData && factsData.length > 0) {
          console.log('Sample fact:');
          const sample = factsData[0];
          console.log(`ID: ${sample.id}`);
          console.log(`Triple: ${sample.subject} ${sample.predicate} ${sample.object}`);
          
          let embeddingDesc = 'NULL';
          if (sample.embedding) {
            if (Array.isArray(sample.embedding)) {
              embeddingDesc = `Array with ${sample.embedding.length} elements`;
            } else if (typeof sample.embedding === 'object') {
              embeddingDesc = 'Object (possibly pgvector)';
            } else {
              embeddingDesc = typeof sample.embedding;
            }
          }
          
          console.log(`Embedding: ${embeddingDesc}`);
        }
      }
    } catch (factError) {
      console.error('Exception during maya_facts query:', factError);
    }
    
    // 3. Check for RPC functions
    console.log('\n----- Testing Database Functions -----');
    
    try {
      // We can't directly query pg_proc with Supabase, so we'll test by calling the functions
      console.log('Testing match_memories RPC function (with dummy embedding)...');
      
      // Create a dummy 1024-dim embedding (for Cohere embed-english-v3.0)
      const dummyEmbedding = Array(1024).fill(0).map((_, i) => (i % 10) / 10);
      
      const { data: rpcData, error: rpcError } = await supabase.rpc('match_memories', {
        query_embedding: dummyEmbedding,
        match_threshold: 0.0,
        match_count: 1,
        user_id_param: 'test'
      });
      
      console.log('match_memories RPC result:', rpcError ? `Error: ${rpcError.message}` : 'Success');
      
      // Also test match_facts
      console.log('Testing match_facts RPC function (with dummy embedding)...');
      
      const { data: rpcFactsData, error: rpcFactsError } = await supabase.rpc('match_facts', {
        query_embedding: dummyEmbedding,
        match_threshold: 0.0,
        match_count: 1,
        user_id_param: 'test'
      });
      
      console.log('match_facts RPC result:', rpcFactsError ? `Error: ${rpcFactsError.message}` : 'Success');
      
    } catch (rpcError) {
      console.error('Exception during RPC function testing:', rpcError);
    }
    
    console.log('\n===== Test Complete =====');
  } catch (error) {
    console.error('Uncaught error in test:', error);
  }
}

main().catch(console.error); 