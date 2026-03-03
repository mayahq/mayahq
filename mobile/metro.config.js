// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');

/** @type {import('metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure Metro resolves a single copy of react and react-native from the app
config.resolver.disableHierarchicalLookup = true;
// Look for modules in app and monorepo root to support Yarn workspaces hoisting
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '..', 'node_modules'),
];
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
};

// Watch local packages for live reload but avoid pulling their node_modules
config.watchFolders = [
  path.resolve(__dirname, '..', 'packages', 'chat-sdk'),
  path.resolve(__dirname, '..', 'packages', 'supabase-client'),
];

// Ensure symlinks are not resolved by Metro, important for monorepos
// config.resolver.resolveSymlinks = false; // We can re-add if necessary

// WatchFolders might be needed for monorepo live-reloading but keep minimal for now
// config.watchFolders = [
//   require('path').resolve(__dirname, '..', 'packages', 'supabase-client'),
//   require('path').resolve(__dirname, '..', 'packages', 'chat-sdk'),
//   require('path').resolve(__dirname, '..', 'packages', 'memory-worker')
// ];

// extraNodeModules also kept minimal for now
// config.resolver.extraNodeModules = {}; 

module.exports = config; 