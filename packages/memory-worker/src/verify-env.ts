import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

/**
 * Verify the contents of the .env file
 */
function verifyEnvFile() {
  console.log('Verifying environment variables...');
  
  // Check if .env file exists
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ Error: .env file not found');
    console.log('Please create a .env file in the packages/memory-worker directory with the required variables.');
    return;
  }
  
  console.log('✅ .env file found');
  
  // Read .env file contents
  const envContents = fs.readFileSync(envPath, 'utf8');
  const envLines = envContents.split('\n').filter(line => 
    line.trim() !== '' && !line.startsWith('#')
  );
  
  // Expected environment variables
  const expectedVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY',
    'COHERE_API_KEY',
    'MAYA_SYSTEM_USER_ID'
  ];
  
  // Check for missing variables
  const definedVars = envLines.map(line => line.split('=')[0].trim());
  const missingVars = expectedVars.filter(v => !definedVars.includes(v));
  
  if (missingVars.length > 0) {
    console.error('❌ Error: The following variables are missing from your .env file:');
    missingVars.forEach(v => console.error(` - ${v}`));
  } else {
    console.log('✅ All required variables are defined in .env');
  }
  
  // Check API key formats
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  if (!anthropicKey.startsWith('sk-ant-')) {
    console.error('❌ Error: ANTHROPIC_API_KEY does not have the expected format (should start with sk-ant-)');
  } else {
    console.log('✅ ANTHROPIC_API_KEY format looks correct');
  }
  
  const cohereKey = process.env.COHERE_API_KEY || '';
  if (cohereKey.length < 30) {
    console.error('❌ Error: COHERE_API_KEY appears to be too short');
  } else {
    console.log('✅ COHERE_API_KEY length looks reasonable');
  }
  
  // Additional suggestions
  console.log('\nSuggested next steps:');
  console.log('1. Make sure you have valid API keys from Anthropic (https://www.anthropic.com/)');
  console.log('2. Make sure you have valid API keys from Cohere (https://cohere.com/)');
  console.log('3. Check that your Supabase credentials are correct');
  console.log('4. Try restarting the memory worker with: pnpm run dev');
}

// Run the verification
verifyEnvFile(); 