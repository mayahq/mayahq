#!/usr/bin/env node
// Wrapper to strip unsupported flags for Expo SDK 51
const { execSync } = require('child_process');

// Get all arguments except --eager
const args = process.argv.slice(2).filter(arg => arg !== '--eager');

// Run expo export:embed with filtered arguments
const command = `expo export:embed ${args.join(' ')}`;
console.log('Running:', command);

try {
  execSync(command, { stdio: 'inherit' });
} catch (error) {
  process.exit(error.status || 1);
}