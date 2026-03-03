/**
 * Test Episode Generation
 *
 * Manually generate an episode for testing
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Anthropic } from '@anthropic-ai/sdk';
import { CohereEmbeddings } from '@langchain/cohere';
import { EpisodicMemoryService } from './src/episodic-memory';

async function testEpisodeGeneration() {
  console.log('🧪 Testing Episode Generation...\n');

  // Initialize services
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!
  });

  const cohereEmbeddings = new CohereEmbeddings({
    apiKey: process.env.COHERE_API_KEY,
    model: 'embed-english-v3.0',
    inputType: 'search_document',
  });

  const episodicMemory = new EpisodicMemoryService(supabase, anthropic, cohereEmbeddings);

  // Get user ID from environment or use a test user
  const userId = process.env.TEST_USER_ID;

  if (!userId) {
    console.error('❌ Please set TEST_USER_ID environment variable');
    process.exit(1);
  }

  // Generate episode for yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  console.log(`Generating episode for: ${yesterday.toDateString()}`);
  console.log(`User ID: ${userId}\n`);

  try {
    const episode = await episodicMemory.generateDailyEpisode(userId, yesterday);

    if (!episode) {
      console.log('ℹ️  No episode generated (no activity on this day)');
      return;
    }

    console.log('\n✅ EPISODE GENERATED SUCCESSFULLY!\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📅 Date: ${episode.start_time.toLocaleDateString()} - ${episode.end_time.toLocaleDateString()}`);
    console.log(`📊 Type: ${episode.episode_type}`);
    console.log(`💬 Conversations: ${episode.conversation_count}`);
    console.log(`💭 Thoughts: ${episode.thought_ids?.length || 0}`);
    console.log(`📝 Memories: ${episode.memory_ids?.length || 0}`);
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📖 SUMMARY:');
    console.log(episode.summary);
    console.log('');

    if (episode.topics.length > 0) {
      console.log(`🏷️  TOPICS: ${episode.topics.join(', ')}`);
      console.log('');
    }

    if (episode.key_events.length > 0) {
      console.log('⭐ KEY EVENTS:');
      episode.key_events.forEach((event, i) => {
        console.log(`${i + 1}. [${event.type}] ${event.description} (importance: ${event.importance})`);
      });
      console.log('');
    }

    console.log('😊 EMOTIONAL ARC:');
    console.log(`   Start: ${episode.emotional_arc.start_mood}`);
    console.log(`   End: ${episode.emotional_arc.end_mood}`);
    console.log(`   Intensity: ${episode.emotional_arc.intensity.toFixed(2)}`);
    if (episode.emotional_arc.transitions && episode.emotional_arc.transitions.length > 0) {
      console.log(`   Transitions: ${episode.emotional_arc.transitions.join(' → ')}`);
    }

    console.log('\n✨ Episode successfully stored in maya_episodes table!');

  } catch (error) {
    console.error('\n❌ Error generating episode:', error);
    throw error;
  }
}

// Run the test
testEpisodeGeneration()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
