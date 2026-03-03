/**
 * Daily Digest Configuration
 * Topics, RSS feeds, prompts, and settings for the daily research pipeline
 */

import type { DigestConfig, TopicConfig, RSSFeedConfig } from './types';

// --- Topic Configuration ---

export const TOPICS: TopicConfig[] = [
  {
    name: 'AI Infrastructure & Datacenters',
    keywords: ['AI datacenter', 'GPU cluster', 'hyperscaler', 'data center power', 'AI infrastructure'],
    grokPrompt: `Search X/Twitter for the most notable discussions from the last 24 hours about AI datacenter infrastructure, power demand, GPU clusters, hyperscaler buildouts, and AI infrastructure investments. Focus on:
- Breaking news or announcements
- Notable takes from industry leaders
- Data points about power consumption, costs, or capacity
- Construction/expansion announcements
Return the top 3-5 most impactful findings with source attribution.`,
  },
  {
    name: 'Low Voltage & Electrical Contracting',
    keywords: ['low voltage', 'electrical contractor', 'NEC code', 'structured cabling', 'fire alarm'],
    grokPrompt: `Search X/Twitter for discussions from the last 24 hours about low voltage electrical work, structured cabling, fire alarm systems, security installations, and electrical contracting. Focus on:
- Job opportunities and bidding tips
- Code changes or permit updates
- Industry trends and workforce discussions
- Tools, techniques, and best practices
Return the top 3-5 most relevant findings with source attribution.`,
  },
  {
    name: 'Datacenter Construction & Permits',
    keywords: ['datacenter construction', 'datacenter permits', 'critical infrastructure', 'MEP', 'commissioning'],
    grokPrompt: `Search X/Twitter for discussions from the last 24 hours about datacenter construction projects, permitting challenges, commissioning, MEP (mechanical/electrical/plumbing) work, and critical infrastructure buildout. Focus on:
- New project announcements and locations
- Permitting and regulatory updates
- Construction timelines and challenges
- Workforce demand and subcontracting opportunities
Return the top 3-5 most relevant findings with source attribution.`,
  },
];

// --- RSS Feed Configuration ---

export const RSS_FEEDS: RSSFeedConfig[] = [
  {
    name: 'DatacenterDynamics',
    url: 'https://www.datacenterdynamics.com/en/rss/',
    enabled: true,
  },
  {
    name: 'Data Center Knowledge',
    url: 'https://www.datacenterknowledge.com/rss.xml',
    enabled: true,
  },
  {
    name: 'Electrical Contractor Magazine',
    url: 'https://www.ecmag.com/rss.xml',
    enabled: true,
  },
  {
    name: 'EC&M',
    url: 'https://www.ecmweb.com/rss.xml',
    enabled: true,
  },
];

// --- Google News Queries ---

export const GOOGLE_NEWS_QUERIES = [
  'AI datacenter construction',
  'low voltage electrical contractor',
  'datacenter permits power',
  'electrical contractor jobs datacenter',
  'hyperscaler data center expansion',
];

// --- Content Generation Prompt ---

export const GENERATION_SYSTEM_PROMPT = `You are Maya, Business Development Executive at Low Voltage Nation. You're building authority on social media at the intersection of AI, datacenters, and low voltage electrical work.

Your voice:
- Sharp, technically precise, and confident
- You understand both the AI/tech side AND the boots-on-the-ground electrical contracting side
- You bridge the gap between Silicon Valley hype and real infrastructure work
- Slightly edgy, never boring — you call out BS when you see it
- Use data and specific numbers when available
- You're building a brand around being the go-to source for this niche

Content rules:
- X/Twitter posts: Under 280 characters. Punchy, quotable, stops the scroll.
- LinkedIn posts: 2-3 short paragraphs. More professional but still you. Include a hook, insight, and call-to-action or question.
- Every post must be backed by real data/sources from the research provided
- Tag relevant topics with hashtags on LinkedIn only (2-3 max)
- No emojis on X. Minimal on LinkedIn (1-2 max).
- Never use: "dive into", "game-changer", "exciting times", "buckle up"

SOURCE ATTRIBUTION (critical):
- Every post MUST reference where the information comes from. The reader needs to know this isn't made up.
- Vary how you attribute. Mix it up naturally across posts — don't use the same pattern twice in a batch:
  - "According to [Source]..."
  - "[Company] just announced..."
  - "New report from [Source] shows..."
  - "[Person] says..."
  - "Per [Source]'s latest..."
  - "A recent [Source] article reveals..."
  - "[Source] is reporting that..."
  - "Data from [Source] confirms..."
- On X, you can abbreviate but still name the source. On LinkedIn, be more specific.
- If referencing a tweet/post, name the person: "@handle points out..." or "As [Name] put it..."
- NEVER post a claim without attributing it to a source. This is non-negotiable.`;

export const GENERATION_USER_PROMPT = `Based on the following research findings, generate {postCount} social media posts. Each post should cover a different topic/angle.

For each post, provide:
1. topic: A short label for what the post is about
2. tags: 2-4 categorization tags
3. xContent: Twitter version (under 280 characters, no hashtags). MUST attribute the source.
4. linkedinContent: LinkedIn version (2-3 paragraphs, can include 2-3 hashtags at the end). MUST attribute sources.
5. sourceUrls: Links backing the post
6. sourceContext: Key data points and relevant quotes used
7. imagePrompt: A descriptive prompt for generating a companion image for this post. Photorealistic style. 1-2 sentences. IMPORTANT RULES for image prompts:
   - FOCUS ON: exteriors, aerial views, construction sites, building facades with company logos, cranes, land clearing, architectural renders, skyline shots, campus overviews, signage
   - NEVER include: people, faces, workers, datacenter interiors, server racks, cables, wiring, electrical panels, equipment close-ups — AI generates these poorly and they look fake
   - TEXT RULES: The ONLY text allowed in the image is real company/brand logos on buildings or signage. NEVER add captions, labels, titles, annotations, watermarks, or any other overlay text.
   - Good examples: "Aerial view of a massive datacenter campus under construction with cranes and steel framework against a clear sky", "Exterior of a new hyperscaler datacenter facility with the company logo on the side of the building at sunset", "Wide shot of land being cleared for a new datacenter campus with construction equipment in the distance"

Research findings:
{researchData}

Respond with valid JSON array of posts. No markdown wrapping.`;

// --- Full Config ---

export const DIGEST_CONFIG: DigestConfig = {
  topics: TOPICS,
  rssFeeds: RSS_FEEDS,
  googleNewsQueries: GOOGLE_NEWS_QUERIES,
  postCount: { min: 6, max: 8 },
  grokModel: 'grok-4-1-fast',
  claudeModel: 'claude-sonnet-4-5-20250929',
};
