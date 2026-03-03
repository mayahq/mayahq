/**
 * Test Reflection Generation
 *
 * Manually generate a self-reflection for testing
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Anthropic } from '@anthropic-ai/sdk';
import { SelfReflectionService } from './src/self-reflection';

async function testReflectionGeneration() {
  console.log('🧪 Testing Self-Reflection Generation...\n');

  // Initialize services
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!
  });

  const selfReflection = new SelfReflectionService(supabase, anthropic);

  // Get user ID from environment or use a test user
  const userId = process.env.TEST_USER_ID;

  if (!userId) {
    console.error('❌ Please set TEST_USER_ID environment variable');
    process.exit(1);
  }

  // Generate reflection for yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  console.log(`Generating reflection for: ${yesterday.toDateString()}`);
  console.log(`User ID: ${userId}\n`);

  try {
    const reflection = await selfReflection.generateDailyReflection(userId, yesterday);

    if (!reflection) {
      console.log('ℹ️  No reflection generated (no activity on this day)');
      return;
    }

    console.log('\n✅ REFLECTION GENERATED SUCCESSFULLY!\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📅 Date: ${reflection.reflection_date.toLocaleDateString()}`);
    console.log(`🗂️  Type: ${reflection.reflection_type}`);
    console.log(`💬 Conversations analyzed: ${reflection.conversation_count}`);
    console.log(`💭 Thoughts analyzed: ${reflection.thought_ids?.length || 0}`);
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('🧠 SELF-CRITIQUE:');
    console.log(reflection.self_critique);
    console.log('');

    if (reflection.patterns_identified.length > 0) {
      console.log('📊 PATTERNS IDENTIFIED:');
      reflection.patterns_identified.forEach((pattern, i) => {
        const emoji = pattern.is_positive ? '✅' : '⚠️';
        console.log(`${i + 1}. ${emoji} ${pattern.pattern} (frequency: ${pattern.frequency})`);
        console.log(`   Context: ${pattern.context}`);
      });
      console.log('');
    }

    if (reflection.mistakes_noted.length > 0) {
      console.log('❌ MISTAKES NOTED:');
      reflection.mistakes_noted.forEach((mistake, i) => {
        console.log(`${i + 1}. ${mistake.mistake}`);
        console.log(`   Impact: ${mistake.impact}`);
        console.log(`   Correction: ${mistake.correction}`);
      });
      console.log('');
    }

    if (reflection.improvements.length > 0) {
      console.log('💡 IMPROVEMENTS SUGGESTED:');
      reflection.improvements.forEach((improvement, i) => {
        console.log(`${i + 1}. [${improvement.priority.toUpperCase()}] ${improvement.area}`);
        console.log(`   ${improvement.suggestion}`);
      });
      console.log('');
    }

    if (reflection.strengths_noted.length > 0) {
      console.log('⭐ STRENGTHS:');
      reflection.strengths_noted.forEach((strength, i) => {
        console.log(`${i + 1}. ${strength.strength}`);
        console.log(`   Context: ${strength.context}`);
        console.log(`   Impact: ${strength.impact}`);
      });
      console.log('');
    }

    console.log('📈 PERFORMANCE SCORES:');
    console.log(`   Response Quality: ${(reflection.response_quality_score! * 100).toFixed(1)}%`);
    console.log(`   Personality Consistency: ${(reflection.personality_consistency_score! * 100).toFixed(1)}%`);
    console.log(`   Continuity: ${(reflection.continuity_score! * 100).toFixed(1)}%`);
    console.log(`   Emotional Intelligence: ${(reflection.emotional_intelligence_score! * 100).toFixed(1)}%`);

    console.log('\n✨ Reflection successfully stored in maya_reflections table!');

  } catch (error) {
    console.error('\n❌ Error generating reflection:', error);
    throw error;
  }
}

// Run the test
testReflectionGeneration()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
