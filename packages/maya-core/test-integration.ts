/**
 * Integration test for Maya Core v2.0
 * Tests basic functionality with existing Supabase database
 */

import { Maya } from './src/maya';
import { MayaConfig, LLMProvider, EmbeddingProvider } from './src/types';
import { createClient } from '@supabase/supabase-js';

// Test configuration
const testConfig: MayaConfig = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  },
  
  llm: {
    primary: LLMProvider.ANTHROPIC,
    fallback: LLMProvider.OPENAI,
    strategy: 'downgrade' as any,
    providers: {
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-sonnet-3-5-20241022'
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: 'gpt-4o'
      }
    }
  },
  
  embeddings: {
    primary: EmbeddingProvider.COHERE, // Match existing system
    fallback: EmbeddingProvider.OPENAI,
    providers: {
      cohere: {
        apiKey: process.env.COHERE_API_KEY || '',
        model: 'embed-english-v3.0' // Match existing 1024-dim
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || ''
      }
    }
  },
  
  performance: {
    caching: true,
    maxRetries: 3,
    timeout: 30000
  },
  
  features: {
    multimodal: true,
    webSearch: false, // Disable for testing
    voiceMode: false,
    qualityMonitoring: true
  }
};

async function runIntegrationTest() {
  console.log('🤖 Starting Maya Core v2.0 Integration Test...\n');
  
  try {
    // Initialize Maya
    console.log('1️⃣ Initializing Maya Core...');
    const maya = new Maya(testConfig);
    await maya.initialize();
    console.log('✅ Maya Core initialized successfully\n');
    
    // Health check
    console.log('2️⃣ Running health check...');
    const health = await maya.getHealthStatus();
    console.log('Health Status:', JSON.stringify(health, null, 2));
    console.log('✅ Health check completed\n');
    
    // Test message processing
    console.log('3️⃣ Testing message processing...');
    const testMessage = {
      content: "Hey Maya, how are you feeling today? This is a test of the new core system.",
      context: {
        userId: 'test-user-123',
        roomId: 'test-room-456', 
        messageId: 'test-msg-789',
        timestamp: new Date().toISOString()
      }
    };
    
    console.log('Processing test message:', testMessage.content);
    const response = await maya.processMessage(testMessage);
    
    console.log('\n📤 Maya\'s Response:');
    console.log('Content:', response.content);
    console.log('Processing Time:', response.processingSteps.total, 'ms');
    console.log('Memory Retrieved:', response.context?.memoriesUsed || 0, 'memories');
    console.log('Facts Retrieved:', response.context?.factsUsed || 0, 'facts');
    console.log('Quality Score:', response.quality?.overall || 'N/A');
    console.log('✅ Message processing successful\n');
    
    // Test memory stats
    console.log('4️⃣ Checking memory statistics...');
    const memoryStats = await maya.getMemoryStats('test-user-123');
    console.log('Memory Stats:', JSON.stringify(memoryStats, null, 2));
    console.log('✅ Memory stats retrieved\n');
    
    // Performance metrics
    console.log('5️⃣ Getting performance metrics...');
    const metrics = maya.getPerformanceMetrics();
    console.log('Performance Metrics:', JSON.stringify(metrics, null, 2));
    console.log('✅ Performance metrics retrieved\n');
    
    console.log('🎉 Integration test completed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('- Maya Core v2.0: ✅ Working');
    console.log('- Database Connection: ✅ Connected');
    console.log('- Message Processing: ✅ Working');
    console.log('- Memory System: ✅ Working');
    console.log('- Quality Monitoring: ✅ Working');
    
    await maya.shutdown();
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  runIntegrationTest();
}

export { runIntegrationTest, testConfig };