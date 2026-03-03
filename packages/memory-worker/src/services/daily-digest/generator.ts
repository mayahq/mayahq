/**
 * Daily Digest Generator
 * Uses Claude to transform research findings into Maya-voiced social media posts
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ResearchBundle, GeneratedPost } from './types';
import { GENERATION_SYSTEM_PROMPT, GENERATION_USER_PROMPT, DIGEST_CONFIG } from './config';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generatePosts(research: ResearchBundle, recentTopics: string[] = []): Promise<GeneratedPost[]> {
  console.log('[Digest/Generator] Generating posts from research...');

  // Determine post count based on available research
  const totalSources =
    research.grokFindings.length +
    research.rssArticles.length +
    research.googleNewsArticles.length;

  const postCount = Math.min(
    DIGEST_CONFIG.postCount.max,
    Math.max(DIGEST_CONFIG.postCount.min, Math.ceil(totalSources / 3))
  );

  // Format research data for the prompt
  const researchSummary = formatResearchForPrompt(research);

  let userPrompt = GENERATION_USER_PROMPT
    .replace('{postCount}', String(postCount))
    .replace('{researchData}', researchSummary);

  // Add dedup context if we have recent posts
  if (recentTopics.length > 0) {
    userPrompt += `\n\nIMPORTANT — AVOID DUPLICATE TOPICS:\nThe following topics were already covered in recent posts. Do NOT cover the same topics or angles. Find fresh, different stories from the research data:\n${recentTopics.map((t) => `- ${t}`).join('\n')}`;
  }

  try {
    const response = await anthropic.messages.create({
      model: DIGEST_CONFIG.claudeModel,
      max_tokens: 8192,
      system: GENERATION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const content =
      response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse the JSON response
    const posts = parseGeneratedPosts(content);

    console.log(`[Digest/Generator] Generated ${posts.length} posts`);
    return posts;
  } catch (error: any) {
    console.error('[Digest/Generator] Generation failed:', error.message);
    throw new Error(`Post generation failed: ${error.message}`);
  }
}

function formatResearchForPrompt(research: ResearchBundle): string {
  const sections: string[] = [];

  // Grok findings
  if (research.grokFindings.length > 0) {
    sections.push('## X/Twitter Discussions (via Grok)');
    for (const finding of research.grokFindings) {
      sections.push(`\n### ${finding.topic}`);
      sections.push(finding.summary);
      if (finding.keyPoints.length > 0) {
        sections.push('Key points:');
        finding.keyPoints.forEach((p) => sections.push(`- ${p}`));
      }
      if (finding.citedPosts.length > 0) {
        sections.push('Notable posts:');
        finding.citedPosts.forEach((p) => {
          sections.push(`- @${p.author}: "${p.content}"${p.url ? ` (${p.url})` : ''}`);
        });
      }
    }
  }

  // RSS articles
  if (research.rssArticles.length > 0) {
    sections.push('\n## Industry News (RSS)');
    for (const article of research.rssArticles.slice(0, 15)) {
      sections.push(`- [${article.source}] ${article.title}`);
      if (article.snippet) sections.push(`  ${article.snippet.slice(0, 200)}`);
      if (article.url) sections.push(`  URL: ${article.url}`);
    }
  }

  // Google News
  if (research.googleNewsArticles.length > 0) {
    sections.push('\n## Google News');
    for (const article of research.googleNewsArticles.slice(0, 10)) {
      sections.push(`- ${article.title}`);
      if (article.snippet) sections.push(`  ${article.snippet.slice(0, 200)}`);
      if (article.url) sections.push(`  URL: ${article.url}`);
    }
  }

  return sections.join('\n');
}

function parseGeneratedPosts(content: string): GeneratedPost[] {
  // Try direct JSON parse
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return validatePosts(parsed);
    }
    if (parsed.posts && Array.isArray(parsed.posts)) {
      return validatePosts(parsed.posts);
    }
  } catch {
    // Try extracting JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed)) {
          return validatePosts(parsed);
        }
      } catch {
        // Fall through
      }
    }

    // Try finding array in the content
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) {
          return validatePosts(parsed);
        }
      } catch {
        // Fall through
      }
    }
  }

  console.error('[Digest/Generator] Failed to parse posts from response:', content.slice(0, 200));
  throw new Error('Failed to parse generated posts from Claude response');
}

function validatePosts(raw: any[]): GeneratedPost[] {
  return raw
    .filter((p) => p.topic && (p.xContent || p.x_content))
    .map((p) => ({
      topic: String(p.topic),
      tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
      xContent: String(p.xContent || p.x_content || ''),
      linkedinContent: String(p.linkedinContent || p.linkedin_content || ''),
      sourceUrls: Array.isArray(p.sourceUrls || p.source_urls)
        ? (p.sourceUrls || p.source_urls).map(String)
        : [],
      sourceContext: {
        keyDataPoints: Array.isArray(p.sourceContext?.keyDataPoints || p.source_context?.key_data_points)
          ? (p.sourceContext?.keyDataPoints || p.source_context?.key_data_points || []).map(String)
          : [],
        relevantQuotes: Array.isArray(p.sourceContext?.relevantQuotes || p.source_context?.relevant_quotes)
          ? (p.sourceContext?.relevantQuotes || p.source_context?.relevant_quotes || []).map(String)
          : [],
      },
      imagePrompt: String(p.imagePrompt || p.image_prompt || ''),
    }));
}
