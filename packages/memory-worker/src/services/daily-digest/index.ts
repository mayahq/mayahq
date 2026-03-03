/**
 * Daily Digest Orchestrator
 * Coordinates research → generation → storage → posting pipeline
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { runResearch } from './researcher';
import { generatePosts } from './generator';
import { postToAllPlatforms } from './poster';
import type { DigestRun, DigestPost, GeneratedPost } from './types';

const GEMINI_MODEL = 'gemini-3-pro-image-preview';
const STORAGE_BUCKET = 'maya-media';
const DIGEST_IMAGES_PATH = 'digest-images';

let supabase: SupabaseClient;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabase;
}

/**
 * Run the full daily digest pipeline:
 * 1. Create run record
 * 2. Research across all sources
 * 3. Generate posts with Claude
 * 4. Store posts for review
 */
export async function runDailyDigest(): Promise<DigestRun> {
  const db = getSupabase();
  console.log('[Digest] Starting daily digest run...');

  // 1. Create run record
  const { data: run, error: runError } = await db
    .from('digest_runs')
    .insert({
      status: 'researching',
    })
    .select()
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create digest run: ${runError?.message}`);
  }

  const runId = run.id;
  console.log(`[Digest] Created run: ${runId}`);

  try {
    // 2. Research
    console.log('[Digest] Phase 1: Researching...');
    const research = await runResearch();

    await db
      .from('digest_runs')
      .update({
        status: 'generating',
        research_data: research,
        sources_used: [
          ...new Set([
            ...research.grokFindings.length > 0 ? ['grok_x'] : [],
            ...research.rssArticles.length > 0 ? ['rss'] : [],
            ...research.googleNewsArticles.length > 0 ? ['google_news'] : [],
          ]),
        ],
      })
      .eq('id', runId);

    // 2b. Fetch recent posts to avoid duplicate topics
    const { data: recentPosts } = await db
      .from('digest_posts')
      .select('topic, x_content')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    const recentTopics = (recentPosts || []).map((p: any) => p.topic);
    console.log(`[Digest] Found ${recentTopics.length} recent posts to avoid duplicating`);

    // 3. Generate posts
    console.log('[Digest] Phase 2: Generating posts...');
    const posts = await generatePosts(research, recentTopics);

    // 4. Store posts
    console.log(`[Digest] Phase 3: Storing ${posts.length} posts...`);
    const postRows = posts.map((post: GeneratedPost) => ({
      run_id: runId,
      topic: post.topic,
      tags: post.tags,
      x_content: post.xContent,
      linkedin_content: post.linkedinContent,
      source_urls: post.sourceUrls,
      source_context: post.sourceContext,
      image_prompt: post.imagePrompt || null,
      status: 'pending_review',
    }));

    const { error: postsError } = await db
      .from('digest_posts')
      .insert(postRows);

    if (postsError) {
      throw new Error(`Failed to insert posts: ${postsError.message}`);
    }

    // 5. Update run as completed
    const { data: completedRun } = await db
      .from('digest_runs')
      .update({
        status: 'completed',
        post_count: posts.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
      .select()
      .single();

    console.log(`[Digest] Run completed: ${posts.length} posts generated`);
    return completedRun as DigestRun;
  } catch (error: any) {
    console.error('[Digest] Run failed:', error.message);

    // Mark run as failed
    await db
      .from('digest_runs')
      .update({
        status: 'failed',
        error: error.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    throw error;
  }
}

/**
 * Post an approved digest post to X and LinkedIn
 */
export async function postApprovedDigest(
  postId: string
): Promise<{ x?: { success: boolean; postId?: string }; linkedin?: { success: boolean; postId?: string } }> {
  const db = getSupabase();

  // Fetch the post
  const { data: post, error } = await db
    .from('digest_posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (error || !post) {
    throw new Error(`Post not found: ${postId}`);
  }

  if (post.status !== 'approved') {
    throw new Error(`Post ${postId} is not approved (status: ${post.status})`);
  }

  console.log(`[Digest] Posting approved digest: ${post.topic}`);

  // Post to platforms
  const results = await postToAllPlatforms(post.x_content, post.linkedin_content);

  // Update post record
  const updates: Record<string, any> = {
    posted_at: new Date().toISOString(),
  };

  if (results.x?.success) {
    updates.x_post_id = results.x.postId;
  }
  if (results.linkedin?.success) {
    updates.linkedin_post_id = results.linkedin.postId;
  }

  // Only mark as posted if at least one platform succeeded
  if (results.x?.success || results.linkedin?.success) {
    updates.status = 'posted';
  } else {
    updates.status = 'failed';
  }

  await db
    .from('digest_posts')
    .update(updates)
    .eq('id', postId);

  return {
    x: results.x || undefined,
    linkedin: results.linkedin || undefined,
  };
}

/**
 * Get the latest digest run status
 */
export async function getDigestStatus(): Promise<{
  latestRun: DigestRun | null;
  pendingPosts: number;
  approvedPosts: number;
}> {
  const db = getSupabase();

  const [runResult, pendingResult, approvedResult] = await Promise.all([
    db
      .from('digest_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    db
      .from('digest_posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review'),
    db
      .from('digest_posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved'),
  ]);

  return {
    latestRun: (runResult.data as DigestRun) || null,
    pendingPosts: pendingResult.count || 0,
    approvedPosts: approvedResult.count || 0,
  };
}

/**
 * Generate an image for a digest post using Gemini
 */
export async function generateDigestImage(
  postId: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const db = getSupabase();

  // Fetch the post
  const { data: post, error } = await db
    .from('digest_posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (error || !post) {
    return { success: false, error: `Post not found: ${postId}` };
  }

  const prompt = post.image_prompt;
  if (!prompt) {
    return { success: false, error: 'No image prompt for this post' };
  }

  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'Gemini API key not configured' };
  }

  try {
    console.log(`[Digest/Image] Generating image for post: ${post.topic}`);

    const gemini = new GoogleGenAI({ apiKey });

    const fullPrompt = `Professional editorial photograph for a social media post about: ${post.topic}

${prompt}

Style: Clean, professional, photorealistic editorial photography. High resolution.
CRITICAL: Do NOT include any people, faces, workers, or human figures. Do NOT show datacenter interiors, server racks, cables, wiring, electrical panels, or equipment close-ups — these look fake when AI-generated. Focus on exteriors, aerial views, building facades, construction sites, signage, and architectural shots.
TEXT RULES: The ONLY text allowed is real company or brand logos naturally appearing on buildings or signage. Do NOT add any captions, labels, titles, annotations, banners, watermarks, or overlay text of any kind. The image must be clean with zero added text.`;

    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ parts: [{ text: fullPrompt }] }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: '16:9',
        },
      },
    });

    // Extract image data from response
    let imageData: string | null = null;

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if ((part as any).inlineData?.mimeType?.startsWith('image/')) {
          imageData = (part as any).inlineData.data;
          break;
        }
      }
    }

    if (!imageData) {
      const textPart = response.candidates?.[0]?.content?.parts?.find(
        (p: any) => p.text
      );
      const msg = textPart && 'text' in textPart ? (textPart as any).text : 'No image in response';
      console.error('[Digest/Image] Generation failed:', msg);
      return { success: false, error: `Image generation failed: ${msg.slice(0, 200)}` };
    }

    // Upload to Supabase Storage
    const imageId = crypto.randomUUID();
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `digest-${timestamp}-${imageId}.png`;
    const storagePath = `${DIGEST_IMAGES_PATH}/${filename}`;

    const imageBuffer = Buffer.from(imageData, 'base64');
    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[Digest/Image] Upload error:', uploadError);
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    const {
      data: { publicUrl },
    } = db.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

    // Update the post with the image URL
    await db
      .from('digest_posts')
      .update({ image_url: publicUrl })
      .eq('id', postId);

    console.log(`[Digest/Image] Image generated: ${publicUrl}`);
    return { success: true, imageUrl: publicUrl };
  } catch (err: any) {
    console.error('[Digest/Image] Error:', err.message);
    return { success: false, error: err.message };
  }
}
