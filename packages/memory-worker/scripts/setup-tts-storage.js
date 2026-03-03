#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupTTSStorage() {
  console.log('Setting up TTS storage bucket...');
  
  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase
      .storage
      .listBuckets();
    
    if (listError) {
      console.error('Error listing buckets:', listError);
      return;
    }
    
    const bucketExists = buckets.some(bucket => bucket.name === 'audio-files');
    
    if (bucketExists) {
      console.log('✅ Bucket "audio-files" already exists');
    } else {
      // Create the bucket
      const { data, error: createError } = await supabase
        .storage
        .createBucket('audio-files', {
          public: true,
          fileSizeLimit: 10485760, // 10MB limit per file
          allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav']
        });
      
      if (createError) {
        console.error('Error creating bucket:', createError);
        return;
      }
      
      console.log('✅ Created bucket "audio-files"');
    }
    
    // Set up storage policies (if needed)
    // Note: With service role key, we have full access
    // For client access, you might want to add RLS policies
    
    console.log('\n📝 Storage bucket setup complete!');
    console.log('\nNext steps:');
    console.log('1. Ensure ELEVEN_LABS_API_KEY is set in your .env file');
    console.log('2. Optionally set ELEVEN_LABS_VOICE_ID (default: Bella voice)');
    console.log('3. Start the memory worker to enable TTS processing');
    
  } catch (error) {
    console.error('Error setting up TTS storage:', error);
  }
}

// Run the setup
setupTTSStorage(); 