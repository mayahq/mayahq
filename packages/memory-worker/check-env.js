// check-env.js

// Only attempt to load .env file if not in a production environment
if (process.env.NODE_ENV !== 'production') {
  try {
    console.log('Development/local environment detected, attempting to load .env file...');
    require('dotenv').config();
    console.log('.env file processed by dotenv.');
  } catch (e) {
    console.warn('Warning: dotenv package not found or .env file missing. Proceeding with environment variables as set.');
  }
} else {
  console.log('Production environment detected, skipping .env file load. Expecting environment variables to be set by the platform.');
}

console.log('\nPerforming runtime environment variables check:');
const requiredRuntimeVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'COHERE_API_KEY',
  'ANTHROPIC_API_KEY',
  'MAYA_SYSTEM_USER_ID'
];

let allVarsPresent = true;
requiredRuntimeVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ FATAL: Required runtime environment variable ${varName} is MISSING.`);
    allVarsPresent = false;
  } else {
    console.log(`✅ ${varName}: exists`);
  }
});

if (!allVarsPresent) {
  console.error('Halting application due to missing required environment variables.');
  process.exit(1);
}

console.log('✅ All required runtime environment variables are present.');

if (process.env.NODE_ENV !== 'production') {
  const fs = require('fs');
  try {
    const envExists = fs.existsSync('.env');
    console.log('\n.env file specific checks (for local development):');
    console.log('.env file exists locally:', envExists);
    
    if (envExists) {
      const envContent = fs.readFileSync('.env', 'utf8');
      console.log('.env file contains the following keys:');
      const keys = envContent
        .split('\n')
        .filter(line => line.trim() && !line.startsWith('#'))
        .map(line => line.split('=')[0]);
      console.log(keys.join(', '));
    }
  } catch (err) {
    console.error('Error during local .env file check:', err);
  }
} 