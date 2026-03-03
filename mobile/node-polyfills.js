// This file provides polyfills for Node.js core modules in React Native

// Add global.Buffer
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// Add process.nextTick
if (!process.nextTick) {
  process.nextTick = setImmediate;
}

// Add missing node globals
import process from 'process';
global.process = process;
global.process.env = global.process.env || {};

// Avoid pulling Node stream polyfills in RN to prevent deep readable-stream deps
// Only attach a minimal stub if absolutely needed by a dependency
if (!global.stream) {
  global.stream = {
    Stream: function() {},
    Readable: function() {},
    Writable: function() {},
    Duplex: function() {},
    Transform: function() {},
    PassThrough: function() {},
  };
}

// Add URL polyfill using the official package for React Native and force override
try {
  require('react-native-url-polyfill/auto');
  const { URL: RNURL, URLSearchParams: RNURLSearchParams } = require('react-native-url-polyfill');
  if (RNURL) {
    global.URL = RNURL;
  }
  if (RNURLSearchParams) {
    global.URLSearchParams = RNURLSearchParams;
  }
  console.log('Loaded react-native-url-polyfill and forced override');
} catch (e) {
  console.warn('Failed to load react-native-url-polyfill:', e);
}

// Do not load 'url-polyfill' or Node 'url' to avoid overriding the RN polyfill

// Add assert module
global.assert = require('assert');

// Handle crypto - with simple custom implementation for randomBytes
const customRandomBytes = function(size) {
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return buffer;
};

// Safe implementation of crypto that works with Hermes
global.crypto = global.crypto || {};
global.crypto.getRandomValues = global.crypto.getRandomValues || function(arr) {
  const bytes = arr.length;
  for (let i = 0; i < bytes; i++) {
    arr[i] = Math.floor(Math.random() * 256);
  }
  return arr;
};
global.crypto.randomBytes = global.crypto.randomBytes || customRandomBytes;

// Ensure setTimeout and setInterval are defined
global.setTimeout = global.setTimeout || require('react-native').InteractionManager.runAfterInteractions;
global.setInterval = global.setInterval || require('react-native').InteractionManager.runAfterInteractions;

// Initialize basic React Native Gesture Handler polyfill
try {
  if (!global.ReactNativeGestureHandler) {
    global.ReactNativeGestureHandler = {
      State: {
        UNDETERMINED: 0,
        BEGAN: 1,
        ACTIVE: 2,
        CANCELLED: 3,
        FAILED: 4,
        END: 5
      },
      Direction: {
        RIGHT: 1,
        LEFT: 2,
        UP: 4,
        DOWN: 8
      }
    };
    console.log('Initialized basic gesture handler polyfill');
  }
} catch (e) {
  console.warn('Failed to initialize gesture handler polyfill:', e);
}

// Export for importing in other files
module.exports = {
  Buffer: global.Buffer,
  process: global.process,
  stream: global.stream,
  URL: global.URL,
  URLSearchParams: global.URLSearchParams,
  assert: global.assert,
  crypto: global.crypto
};

// Minimal polyfills for common functions
import { decode as atob, encode as btoa } from 'base-64';

// Polyfill btoa and atob
global.atob = atob;
global.btoa = btoa;

// Add polyfill for net module (used by ws)
global.net = {
  Socket: class MockSocket {
    constructor() {
      console.log('Mock Socket created');
    }
    connect() { 
      console.log('Mock Socket connect called'); 
      return this;
    }
    on() { 
      console.log('Mock Socket on event registered'); 
      return this;
    }
    write() { 
      console.log('Mock Socket write called'); 
      return true;
    }
    end() { 
      console.log('Mock Socket end called'); 
    }
    destroy() { 
      console.log('Mock Socket destroy called'); 
    }
  },
  createConnection: () => new global.net.Socket()
};

// Minimal tls implementation
global.tls = {
  connect: (options, callback) => {
    console.log('Mock TLS connect called');
    const socket = new global.net.Socket();
    if (callback) {
      setTimeout(callback, 0);
    }
    return socket;
  }
}; 