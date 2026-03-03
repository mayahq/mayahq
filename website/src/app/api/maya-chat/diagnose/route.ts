import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Make initialization conditional to handle build-time missing env vars
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Initialize Supabase client only if keys are available
const getSupabaseClient = () => {
  // Skip during build if keys are missing
  if (!supabaseUrl || !supabaseServiceKey) {
    console.log('Supabase configuration missing');
    return null;
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
};

// Define types for diagnostic results
interface DiagnosticResults {
  memory_schema: any;
  test_insert_result: any;
  test_select_result: any;
  test_query_count: any;
  recommended_fixes: string[];
}

export async function GET(request: NextRequest) {
  // Basic auth check (simplified for diagnostic endpoint)
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Get token from header
  const token = authHeader.split(' ')[1];

  // Compare with expected token - for diagnostic use only, not secure!
  const expectedToken = process.env.DIAGNOSTIC_TOKEN || 'mobile-memory-diagnostic';
  if (token !== expectedToken) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }
  
  // Initialize Supabase client
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    return NextResponse.json(
      { error: 'Failed to initialize Supabase client' },
      { status: 500 }
    );
  }
  
  // Check table structures
  try {
    const diagnosticResults: DiagnosticResults = {
      memory_schema: null,
      test_insert_result: null,
      test_select_result: null,
      test_query_count: null,
      recommended_fixes: []
    };
    
    // Check maya_memories table
    try {
      // Get table info from Postgres Information Schema
      const { data: columns, error } = await supabaseClient.from('information_schema.columns')
        .select('column_name, data_type, is_nullable')
        .eq('table_name', 'maya_memories');
        
      if (error) {
        console.error('Failed to get schema:', error);
        diagnosticResults.memory_schema = { error: error.message };
        diagnosticResults.recommended_fixes.push('Check that maya_memories table exists and service role has access to information_schema');
      } else {
        diagnosticResults.memory_schema = columns;
        
        // Check for expected columns
        const requiredColumns = ['id', 'content', 'metadata', 'embedding', 'created_at', 'tags'];
        const missingColumns = requiredColumns.filter(column => 
          !columns.some(c => c.column_name === column)
        );
        
        if (missingColumns.length > 0) {
          diagnosticResults.recommended_fixes.push(`Missing required columns: ${missingColumns.join(', ')}`);
        }
      }
    } catch (schemaError: any) {
      console.error('Schema check error:', schemaError);
      diagnosticResults.memory_schema = { error: schemaError.message };
    }
    
    // Try a test insert
    try {
      const testContent = 'Diagnostic test memory - safe to delete';
      const testId = `test-${Date.now()}`;
      
      const { data: insertData, error: insertError } = await supabaseClient.from('maya_memories')
        .insert({
          content: testContent,
          metadata: {
            userId: testId,
            userName: 'DiagnosticTest',
            timestamp: new Date().toISOString(),
            type: 'test'
          },
          created_at: new Date().toISOString()
        })
        .select();
        
      if (insertError) {
        diagnosticResults.test_insert_result = { error: insertError.message, code: insertError.code };
        
        // Add specific recommendations based on error
        if (insertError.message.includes('violates not-null constraint')) {
          diagnosticResults.recommended_fixes.push('Add NOT NULL columns with default values');
        } else if (insertError.message.includes('embedding')) {
          diagnosticResults.recommended_fixes.push('Make embedding column nullable or add a default empty vector');
        } else if (insertError.message.includes('permission denied')) {
          diagnosticResults.recommended_fixes.push('Grant INSERT permission on maya_memories to service_role');
        }
      } else {
        diagnosticResults.test_insert_result = { success: true, data: insertData };
        
        // Clean up test insert
        const insertedId = insertData[0]?.id;
        if (insertedId) {
          await supabaseClient.from('maya_memories')
            .delete()
            .eq('id', insertedId);
        }
      }
    } catch (insertError: any) {
      diagnosticResults.test_insert_result = { error: insertError.message };
    }
    
    // Count existing memories
    try {
      const { count, error: countError } = await supabaseClient.from('maya_memories')
        .select('*', { count: 'exact', head: true });
        
      if (countError) {
        diagnosticResults.test_query_count = { error: countError.message };
      } else {
        diagnosticResults.test_query_count = { count };
      }
    } catch (countError: any) {
      diagnosticResults.test_query_count = { error: countError.message };
    }
    
    // Check for RPC function
    try {
      const { error: rpcError } = await supabaseClient.rpc('store_mobile_memory', {
        p_content: 'Test content - will not be stored',
        p_user_id: 'test-id',
        p_user_name: 'TestUser',
        p_tags: ['test']
      });
      
      if (rpcError) {
        diagnosticResults.recommended_fixes.push('Create the store_mobile_memory RPC function');
      } else {
        diagnosticResults.recommended_fixes.push('RPC function exists and is working');
      }
    } catch (rpcError: any) {
      diagnosticResults.recommended_fixes.push(`Create the RPC function: ${rpcError.message}`);
    }
    
    // Based on all diagnostics, give overall recommendation
    if (diagnosticResults.recommended_fixes.length === 0) {
      diagnosticResults.recommended_fixes.push('No issues detected with the maya_memories table. The problem may be with embedding generation.');
    }
    
    // Return diagnostic results
    return NextResponse.json(diagnosticResults);
  } catch (error: any) {
    return NextResponse.json({ error: 'Diagnostic failed', details: error.message }, { status: 500 });
  }
} 