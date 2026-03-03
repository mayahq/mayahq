/**
 * Inspect Working Memory Context
 *
 * Shows the exact formatted context that gets injected into Maya's system prompt
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Anthropic } from '@anthropic-ai/sdk';
import { WorkingMemoryExtractor } from './src/working-memory-extractor';

const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14';

async function inspectContext() {
  console.log('🔍 Inspecting Working Memory Context for Maya\n');
  console.log('='.repeat(80));

  // Initialize services
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const extractor = new WorkingMemoryExtractor(anthropic, supabase);

  try {
    // Get raw working memory data
    console.log('\n📊 RAW WORKING MEMORY DATA:\n');
    const workingMemory = await extractor.getWorkingMemory(BLAKE_USER_ID, 20);

    console.log(JSON.stringify(workingMemory, null, 2));

    // Get formatted prompt
    console.log('\n' + '='.repeat(80));
    console.log('\n✨ FORMATTED CONTEXT (injected into Maya\'s system prompt):\n');
    console.log('─'.repeat(80));

    const formattedPrompt = extractor.formatForPrompt(workingMemory);
    console.log(formattedPrompt);

    console.log('─'.repeat(80));

    // Show how it would appear in full system prompt
    console.log('\n📝 EXAMPLE: Full System Prompt with Working Memory:\n');
    console.log('─'.repeat(80));

    const exampleSystemPrompt = `You are Maya, a helpful AI assistant.

${formattedPrompt}
Please help the user with their request, keeping the above context in mind.`;

    console.log(exampleSystemPrompt);
    console.log('─'.repeat(80));

    // Statistics
    console.log('\n📈 STATISTICS:\n');
    console.log(`Total working memory items: ${workingMemory.length}`);

    const byType = workingMemory.reduce((acc: any, item: any) => {
      acc[item.memory_type] = (acc[item.memory_type] || 0) + 1;
      return acc;
    }, {});

    console.log('Breakdown by type:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });

    const avgImportance = workingMemory.reduce((sum: number, item: any) =>
      sum + item.importance_score, 0) / workingMemory.length;
    console.log(`\nAverage importance score: ${(avgImportance * 100).toFixed(1)}%`);

    // Show top 5 by importance
    console.log('\n🏆 TOP 5 BY IMPORTANCE:\n');
    const sorted = [...workingMemory].sort((a: any, b: any) =>
      b.importance_score - a.importance_score
    ).slice(0, 5);

    sorted.forEach((item: any, i: number) => {
      console.log(`${i + 1}. [${(item.importance_score * 100).toFixed(0)}%] ${item.memory_type}: ${item.value}`);
      console.log(`   Mentions: ${item.mention_count}, Last seen: ${new Date(item.last_mentioned).toLocaleDateString()}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ Inspection complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

inspectContext().catch(console.error);
