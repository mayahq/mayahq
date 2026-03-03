#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Script to build workspace packages before EAS Build starts.
 * This ensures our local workspace packages have their dist files
 * ready to be used during the EAS build process.
 */
console.log('Running EAS prebuild hook to build workspace packages...');

// Navigate up to the monorepo root
const currentDir = process.cwd();
const monorepoRoot = path.resolve(currentDir, '..');

// Build packages in the right order
try {
  console.log('Building @mayahq/supabase-client...');
  execSync('pnpm build', { 
    cwd: path.join(monorepoRoot, 'packages/supabase-client'),
    stdio: 'inherit' 
  });
  
  console.log('Building @mayahq/chat-sdk...');
  execSync('pnpm build', { 
    cwd: path.join(monorepoRoot, 'packages/chat-sdk'),
    stdio: 'inherit' 
  });
  
  console.log('Successfully built all workspace packages!');
  
  // Make directories if they don't exist 
  const mobileNodeModules = path.join(currentDir, 'node_modules/@mayahq');
  if (!fs.existsSync(mobileNodeModules)) {
    fs.mkdirSync(mobileNodeModules, { recursive: true });
  }
  
  // Copy the built packages to mobile/node_modules to ensure they're available during build
  console.log('Copying built packages to mobile node_modules...');
  
  // Copy supabase-client
  const supabaseClientSrc = path.join(monorepoRoot, 'packages/supabase-client');
  const supabaseClientDest = path.join(mobileNodeModules, 'supabase-client');
  execSync(`cp -R ${supabaseClientSrc} ${mobileNodeModules}/`, { stdio: 'inherit' });
  
  // Copy chat-sdk
  const chatSdkSrc = path.join(monorepoRoot, 'packages/chat-sdk');
  const chatSdkDest = path.join(mobileNodeModules, 'chat-sdk');
  execSync(`cp -R ${chatSdkSrc} ${mobileNodeModules}/`, { stdio: 'inherit' });
  
  console.log('All workspace packages built and copied successfully!');
} catch (error) {
  console.error('Error building workspace packages:', error);
  process.exit(1);
} 