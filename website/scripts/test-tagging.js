// Test script for tagging functionality
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testTagMessage() {
  console.log('Testing tag_message PL/pgSQL function...');
  
  const testMessages = [
    { 
      message: "User: I need to remember to call my mom tomorrow.\nMaya: I'll make a note of that. You should call your mom tomorrow.",
      expectedTags: ['todo']
    },
    { 
      message: "User: I'm feeling so tired today. I didn't sleep well last night.\nMaya: I'm sorry to hear that. It's important to get enough rest. Is there anything keeping you from sleeping well?",
      expectedTags: ['sleep', 'energy'] 
    },
    { 
      message: "User: Fact: I love Italian food, especially pasta.\nMaya: I've noted that you love Italian food, particularly pasta. That's a delicious preference!",
      expectedTags: ['core-fact'] 
    },
    { 
      message: "User: I've been procrastinating on my work project.\nMaya: It happens to everyone. Let's think about ways to break down your project into smaller, more manageable tasks.",
      expectedTags: ['productivity', 'work'] 
    }
  ];
  
  for (const test of testMessages) {
    try {
      console.log(`\nTesting message: "${test.message.substring(0, 50)}..."`);
      
      const { data, error } = await supabase.rpc('tag_message', { msg: test.message });
      
      if (error) {
        console.error('Error calling tag_message:', error);
        continue;
      }
      
      console.log('Tags returned:', data);
      
      // Check if the expected tags are present
      const missingTags = test.expectedTags.filter(tag => !data.includes(tag));
      const unexpectedTags = data.filter(tag => !test.expectedTags.includes(tag));
      
      if (missingTags.length > 0) {
        console.log(`❌ Missing expected tags: ${missingTags.join(', ')}`);
      } else if (unexpectedTags.length > 0) {
        console.log(`⚠️ Found unexpected tags: ${unexpectedTags.join(', ')}`);
      } else {
        console.log(`✅ Found all expected tags: ${test.expectedTags.join(', ')}`);
      }
    } catch (error) {
      console.error('Test error:', error);
    }
  }
}

async function testTagStats() {
  console.log('\nTesting tag stats...');
  
  try {
    const { data, error } = await supabase
      .from('tag_stats')
      .select('slug, hit_count, last_hit')
      .order('hit_count', { ascending: false });
      
    if (error) {
      console.error('Error fetching tag stats:', error);
      return;
    }
    
    console.log('Tag usage statistics:');
    data.forEach(stat => {
      console.log(`- ${stat.slug}: ${stat.hit_count} hits (last: ${new Date(stat.last_hit).toLocaleString()})`);
    });
  } catch (error) {
    console.error('Test error:', error);
  }
}

async function testStoreWithTags() {
  console.log('\nTesting memory storage with tags...');
  
  try {
    const testContent = `User: Todo: finish the project by Friday.\nMaya: I'll remind you to finish the project by Friday.`;
    const userId = process.env.TEST_USER_ID || 'test-user';
    
    // First, get initial tag counts
    const { data: initialStats } = await supabase
      .from('tag_stats')
      .select('slug, hit_count')
      .eq('slug', 'todo');
      
    const initialCount = initialStats && initialStats[0] ? initialStats[0].hit_count : 0;
    console.log(`Initial 'todo' tag count: ${initialCount}`);
    
    // Insert a test memory
    const { data, error } = await supabase.rpc('tag_message', { msg: testContent });
    
    if (error) {
      console.error('Error tagging content:', error);
      return;
    }
    
    console.log('Tags for test content:', data);
    
    // Store memory with tags
    const { error: insertError } = await supabase.from('maya_memories').insert({
      content: testContent,
      metadata: { 
        userId: userId,
        userName: 'Test User',
        timestamp: new Date().toISOString(),
        type: 'conversation'
      },
      tags: data
    });
    
    if (insertError) {
      console.error('Error inserting memory:', insertError);
      return;
    }
    
    console.log('Memory stored successfully');
    
    // Check if tag stats were updated
    setTimeout(async () => {
      const { data: finalStats } = await supabase
        .from('tag_stats')
        .select('slug, hit_count')
        .eq('slug', 'todo');
        
      const finalCount = finalStats && finalStats[0] ? finalStats[0].hit_count : 0;
      console.log(`Final 'todo' tag count: ${finalCount}`);
      
      if (finalCount > initialCount) {
        console.log('✅ Tag stats updated successfully');
      } else {
        console.log('❌ Tag stats were not updated as expected');
      }
    }, 1000); // Give the trigger a moment to execute
  } catch (error) {
    console.error('Test error:', error);
  }
}

async function main() {
  console.log('Starting tagging system tests...');
  
  await testTagMessage();
  await testTagStats();
  await testStoreWithTags();
  
  console.log('\nTests completed');
}

main().catch(console.error); 