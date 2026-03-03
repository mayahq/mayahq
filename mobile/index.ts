// Ensure URL and related APIs are polyfilled before any other imports
import 'react-native-url-polyfill/auto';
// Import Node.js polyfills next
import './node-polyfills';

// Use our custom wrapper for gesture handler
import './gesture-handler-import';

// Make sure React Native modules are loaded first
import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';

// Import the main app
import App from './App';

// Ensure the app is registered with AppRegistry
AppRegistry.registerComponent('main', () => App);

// Also use the Expo registration 
registerRootComponent(App);
