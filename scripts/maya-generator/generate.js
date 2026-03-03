#!/usr/bin/env node

/**
 * Maya Image Generator CLI
 *
 * Generate consistent Maya character images for LVN social media
 * using Gemini 3 Pro Image with character consistency.
 *
 * Usage:
 *   node generate.js --platform instagram-post --pose pointing --clothing lvnBranded
 *   node generate.js --quick announcementPost
 *   node generate.js --dry-run --platform youtube-thumbnail --pose explaining
 *
 * Options:
 *   --platform <id>     Target platform (instagram-post, instagram-story, youtube-thumbnail, etc.)
 *   --pose <id>         Maya's pose (confident, explaining, pointing, excited, etc.)
 *   --clothing <id>     Clothing preset (lvnBranded, workUniform, businessCasual, etc.)
 *   --background <id>   Background preset (lvnGradient, solidTeal, dataCenter, etc.)
 *   --style <id>        Style/mood (professional, energetic, friendly, etc.)
 *   --text <string>     Text overlay hint for composition
 *   --custom <string>   Custom prompt additions
 *   --output <path>     Output directory (default: ./output)
 *   --size <size>       Image size: 1K, 2K, 4K (default: 2K)
 *   --quick <action>    Use a quick action preset
 *   --dry-run           Generate prompt only, don't call API
 *   --validate          Check setup (API key, reference images)
 */

import { program } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../web/.env.local') });
dotenv.config({ path: path.join(__dirname, '../video-images/.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

import mayaClient from './lib/maya-client.js';
import { buildMayaPrompt, POSES } from './lib/maya-prompts.js';
import presets from './lib/maya-presets.js';

const OUTPUT_DIR = path.join(__dirname, 'output');

/**
 * Generate content package markdown file for a Maya image
 */
function generateContentPackageMd(config) {
  const {
    imagePath,
    filename,
    platform,
    platformConfig,
    pose,
    poseName,
    clothing,
    clothingName,
    clothingDesc,
    background,
    backgroundName,
    style,
    styleName,
    customPrompt,
    textOverlay,
    prompt,
    imageSize
  } = config;

  const date = new Date().toISOString().split('T')[0];
  const platformFormatted = platformConfig?.name || platform;
  const aspectRatio = platformConfig?.aspectRatio || '1:1';

  // Generate content ideas based on the image configuration
  const contentIdeas = generateContentIdeas(config);

  return `# Maya Image Content Package

**Generated:** ${date}
**Image:** \`${filename}\`

---

## Image Configuration

| Setting | Value |
|---------|-------|
| Platform | ${platformFormatted} (${aspectRatio}) |
| Pose | ${poseName} |
| Clothing | ${clothingName} |
| Background | ${backgroundName} |
| Style | ${styleName} |
| Size | ${imageSize} |
${customPrompt ? `| Custom | ${customPrompt} |\n` : ''}${textOverlay ? `| Text Overlay | ${textOverlay} |\n` : ''}

---

## Generation Prompt

\`\`\`
${prompt}
\`\`\`

---

## Content Ideas

${contentIdeas.map((idea, i) => `### ${i + 1}. ${idea.title}

**Use Case:** ${idea.useCase}

**Description:** ${idea.description}

**Social Post Options:**
${idea.posts.map(post => `- ${post}`).join('\n')}
`).join('\n')}

---

## Quick Copy Posts

### Instagram
${contentIdeas[0]?.posts[0] || 'Maya bringing the energy today! 💪'}

### LinkedIn
${contentIdeas[1]?.posts[0] || 'Empowering the next generation of low voltage professionals.'}

### Twitter/X
${contentIdeas[2]?.posts[0] || 'Who else is ready to level up? 🚀'}

---

## Hashtags

### Instagram/TikTok
#lowvoltage #electrician #datacenter #tech #skillstrade #bluecollar #careergrowth #tradejobs #techjobs #construction

### LinkedIn
#LowVoltage #DataCenter #SkilledTrades #CareerDevelopment #TechCareers #Construction #ProfessionalDevelopment

---

## File Location

\`${imagePath}\`
`;
}

/**
 * Generate content ideas based on image configuration
 */
function generateContentIdeas(config) {
  const { pose, poseName, clothing, clothingName, background, backgroundName, platform, customPrompt } = config;

  const ideas = [];

  // Idea based on pose
  const poseIdeas = {
    confident: {
      title: 'Confidence & Leadership',
      useCase: 'Motivational content, career advice, empowerment posts',
      description: 'Maya radiates confidence - perfect for posts about owning your career, leadership in the trades, or celebrating professional wins.',
      posts: [
        'Confidence isn\'t given. It\'s built. One project at a time. 💪',
        'The best in the trade didn\'t start there. They earned it.',
        'Your skills are your superpower. Own them.'
      ]
    },
    explaining: {
      title: 'Education & Training',
      useCase: 'Tutorial announcements, tip posts, educational content',
      description: 'Maya in teaching mode - ideal for educational content, training announcements, or sharing industry knowledge.',
      posts: [
        'Quick tip: Always test before you terminate. Trust, but verify.',
        'New tutorial dropping soon! Who wants to level up their fiber skills?',
        'The difference between good and great? Continuous learning.'
      ]
    },
    pointing: {
      title: 'Call to Action',
      useCase: 'Announcements, promotions, directing attention',
      description: 'Maya pointing draws attention - perfect for announcements, CTAs, or highlighting important information.',
      posts: [
        'This is your sign to get certified. Do it now. 👆',
        'New opportunity alert! Check the link in bio.',
        'Stop scrolling. This one\'s important.'
      ]
    },
    excited: {
      title: 'Celebration & Announcements',
      useCase: 'Good news, milestones, community celebrations',
      description: 'Maya celebrating - great for sharing wins, announcing good news, or community celebrations.',
      posts: [
        'WE DID IT! 🎉 Another milestone for the LVN community!',
        'When the project wraps perfectly and the client is thrilled...',
        'Friday energy! Who else crushed it this week?'
      ]
    },
    thinking: {
      title: 'Industry Insights',
      useCase: 'Thought leadership, industry trends, questions',
      description: 'Maya in thoughtful pose - perfect for industry commentary, asking questions, or sharing insights.',
      posts: [
        'What\'s the biggest change you\'ve seen in low voltage this year?',
        'The industry is evolving. Are you evolving with it?',
        'Sometimes the best move is to pause and plan.'
      ]
    },
    welcome: {
      title: 'Community & Onboarding',
      useCase: 'Welcoming new members, community posts, introductions',
      description: 'Maya welcoming - ideal for community-building, welcoming new members, or inclusive content.',
      posts: [
        'Welcome to the LVN family! 🤝 Ready to grow together?',
        'New here? You\'re in the right place. Let\'s build.',
        'This community is built different. Glad you\'re here.'
      ]
    },
    thumbsUp: {
      title: 'Approval & Encouragement',
      useCase: 'Celebrating others, approval, encouragement',
      description: 'Maya giving approval - great for celebrating community wins, encouraging others, or showing support.',
      posts: [
        'You got this! 👍 Keep pushing.',
        'Shoutout to everyone grinding this week. We see you.',
        'That\'s the way it\'s done!'
      ]
    },
    presenting: {
      title: 'Professional Content',
      useCase: 'Webinars, presentations, professional announcements',
      description: 'Maya presenting - perfect for professional content, webinar promos, or business announcements.',
      posts: [
        'Join us live for the next LVN webinar. Link in bio.',
        'Breaking down the latest industry updates...',
        'Let\'s talk about what\'s next in low voltage.'
      ]
    }
  };

  // Add pose-based idea
  if (poseIdeas[pose]) {
    ideas.push(poseIdeas[pose]);
  } else {
    ideas.push(poseIdeas.confident); // Default
  }

  // Idea based on clothing/setting
  const clothingIdeas = {
    workUniform: {
      title: 'In the Field',
      useCase: 'Field work content, job site posts, hands-on content',
      description: 'Maya in work gear - authentic field content that resonates with working technicians.',
      posts: [
        'Another day, another project. Let\'s get it done right.',
        'Hands-on is how we learn. Hands-on is how we grow.',
        'The job site is the real classroom.'
      ]
    },
    businessCasual: {
      title: 'Professional Development',
      useCase: 'Career content, business posts, professional networking',
      description: 'Maya dressed professionally - perfect for career advancement content or business-focused posts.',
      posts: [
        'Dress for the job you want. Work for the career you deserve.',
        'Professional growth starts with professional standards.',
        'From the field to the office - your path is yours to design.'
      ]
    },
    safetyGear: {
      title: 'Safety First',
      useCase: 'Safety reminders, construction content, compliance',
      description: 'Maya in safety gear - essential for safety-focused content and construction site posts.',
      posts: [
        'Safety isn\'t optional. It\'s the standard.',
        'PPE on, hazards off. Every single time.',
        'The best tech is a safe tech. No shortcuts.'
      ]
    },
    leatherJacket: {
      title: 'Bold & Edgy',
      useCase: 'Edgy content, breaking norms, disruptive messaging',
      description: 'Maya with edge - perfect for bold statements, challenging norms, or standing out.',
      posts: [
        'Break the mold. Build your own path.',
        'Not everyone will get it. That\'s fine.',
        'Bold moves only.'
      ]
    },
    cocktailDress: {
      title: 'Celebration & Events',
      useCase: 'Event content, celebrations, elevated moments',
      description: 'Maya dressed up - great for event promotions, celebrations, or premium content.',
      posts: [
        'Celebrating the wins, big and small.',
        'When hard work meets opportunity...',
        'Elevate everything.'
      ]
    }
  };

  // Add clothing-based idea
  const clothingKey = Object.keys(clothingIdeas).find(key => clothing.toLowerCase().includes(key.toLowerCase()));
  if (clothingKey && clothingIdeas[clothingKey]) {
    ideas.push(clothingIdeas[clothingKey]);
  } else {
    ideas.push({
      title: 'Brand Presence',
      useCase: 'General brand content, awareness posts',
      description: 'Maya representing the brand - versatile content for general brand awareness.',
      posts: [
        'This is Low Voltage Nation. Welcome.',
        'Building the future, one connection at a time.',
        'Where skilled trades meet community.'
      ]
    });
  }

  // Idea based on platform
  const platformIdeas = {
    'instagram-post': {
      title: 'Instagram Feed Post',
      useCase: 'Carousel potential, saved content, evergreen value',
      description: 'Square format optimized for Instagram feed - high engagement potential.',
      posts: [
        'Save this for later 📌',
        'Tag someone who needs to see this.',
        'Double tap if you agree 👊'
      ]
    },
    'instagram-story': {
      title: 'Story/Reel Content',
      useCase: 'Quick hits, polls, time-sensitive content',
      description: 'Vertical format for stories and reels - high visibility, quick engagement.',
      posts: [
        'Swipe up to learn more! ⬆️',
        'Quick question: What\'s your biggest challenge right now?',
        'This or that? Vote now!'
      ]
    },
    'youtube-thumbnail': {
      title: 'Video Thumbnail',
      useCase: 'YouTube content, video promotion',
      description: 'Widescreen thumbnail format - designed to drive clicks and views.',
      posts: [
        'New video is LIVE! Link in bio.',
        'You asked for it, we made it. Watch now.',
        'This one\'s a must-watch.'
      ]
    },
    'linkedin': {
      title: 'LinkedIn Professional',
      useCase: 'Professional networking, career content',
      description: 'LinkedIn-optimized content for professional audiences.',
      posts: [
        'Investing in skills that matter. What are you learning this quarter?',
        'The low voltage industry continues to evolve. Here\'s what I\'m seeing...',
        'Connection is everything - in our work and our networks.'
      ]
    }
  };

  // Add platform-based idea
  if (platformIdeas[platform]) {
    ideas.push(platformIdeas[platform]);
  }

  return ideas;
}

/**
 * Parse a freestyle natural language prompt into structured options
 * @param {string} prompt - Natural language prompt
 * @returns {Object} Parsed options
 */
function parseFreestylePrompt(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const parsed = {
    platform: 'instagram-story', // Default to story for freestyle
    pose: 'confident',
    clothing: null,
    background: null,
    style: 'professional',
    custom: [],
    count: 1,
    varyClothing: false
  };

  // Extract count (e.g., "3 images", "create 5", "generate 2")
  const countMatch = lowerPrompt.match(/(?:create|generate|make)?\s*(\d+)\s*(?:images?|pics?|photos?)/i);
  if (countMatch) {
    parsed.count = Math.min(parseInt(countMatch[1]), 10); // Max 10
  }

  // Check for variation requests
  if (lowerPrompt.includes('various') || lowerPrompt.includes('different') || lowerPrompt.includes('vary')) {
    if (lowerPrompt.includes('cloth') || lowerPrompt.includes('outfit')) {
      parsed.varyClothing = true;
    }
  }

  // Platform detection
  if (lowerPrompt.includes('story') || lowerPrompt.includes('reel') || lowerPrompt.includes('vertical') || lowerPrompt.includes('9:16')) {
    parsed.platform = 'instagram-story';
  } else if (lowerPrompt.includes('thumbnail') || lowerPrompt.includes('youtube') || lowerPrompt.includes('16:9') || lowerPrompt.includes('widescreen')) {
    parsed.platform = 'youtube-thumbnail';
  } else if (lowerPrompt.includes('square') || lowerPrompt.includes('1:1') || lowerPrompt.includes('feed')) {
    parsed.platform = 'instagram-post';
  } else if (lowerPrompt.includes('linkedin')) {
    parsed.platform = 'linkedin';
  } else if (lowerPrompt.includes('twitter') || lowerPrompt.includes('x post')) {
    parsed.platform = 'twitter';
  }

  // Pose detection
  const poseKeywords = {
    confident: ['confident', 'strong', 'powerful', 'straight ahead', 'looking forward', 'direct'],
    explaining: ['explaining', 'teaching', 'tutorial', 'gesturing'],
    pointing: ['pointing', 'point at', 'directing'],
    excited: ['excited', 'celebrating', 'happy', 'cheering', 'hands up'],
    thinking: ['thinking', 'thoughtful', 'contemplating', 'pondering'],
    welcome: ['welcome', 'welcoming', 'open arms', 'inviting'],
    thumbsUp: ['thumbs up', 'approval', 'approve', 'encouraging'],
    presenting: ['presenting', 'professional', 'formal', 'business']
  };

  for (const [pose, keywords] of Object.entries(poseKeywords)) {
    if (keywords.some(kw => lowerPrompt.includes(kw))) {
      parsed.pose = pose;
      break;
    }
  }

  // Clothing detection by category
  const clothingKeywords = {
    // Edgy/Sexy
    leatherJacket: ['leather jacket', 'moto jacket', 'biker'],
    cocktailDress: ['cocktail dress', 'dress', 'elegant dress', 'formal dress'],
    cropTop: ['crop top', 'cropped'],
    offShoulder: ['off shoulder', 'off-shoulder'],
    // Professional
    workUniform: ['work uniform', 'technician', 'tool belt', 'work shirt'],
    businessCasual: ['blazer', 'business casual', 'professional'],
    safetyGear: ['hard hat', 'safety vest', 'ppe', 'construction gear'],
    casual: ['casual', 't-shirt', 'tee', 'relaxed'],
    tealPolo: ['polo', 'teal polo'],
    // Artistic
    bohemian: ['bohemian', 'boho', 'earth tone', 'flowy'],
    paintSmock: ['paint', 'artist', 'smock', 'splatter'],
    avantGarde: ['avant garde', 'avant-garde', 'geometric', 'asymmetric'],
    // Grungy
    grungeFlannel: ['flannel', 'grunge', '90s', 'band tee'],
    distressedDenim: ['distressed', 'ripped', 'denim jacket', 'patches'],
    streetwear: ['streetwear', 'hoodie', 'urban'],
    punkRock: ['punk', 'studded', 'leather vest']
  };

  // Check for category keywords first
  if (lowerPrompt.includes('sexy') || lowerPrompt.includes('edgy') || lowerPrompt.includes('hot')) {
    // Pick from edgy category
    const edgyOptions = ['leatherJacket', 'cocktailDress', 'cropTop', 'offShoulder'];
    parsed.clothing = edgyOptions[Math.floor(Math.random() * edgyOptions.length)];
  } else if (lowerPrompt.includes('grungy') || lowerPrompt.includes('grunge')) {
    const grungyOptions = ['grungeFlannel', 'distressedDenim', 'streetwear', 'punkRock'];
    parsed.clothing = grungyOptions[Math.floor(Math.random() * grungyOptions.length)];
  } else if (lowerPrompt.includes('artistic') || lowerPrompt.includes('creative')) {
    const artisticOptions = ['bohemian', 'paintSmock', 'avantGarde'];
    parsed.clothing = artisticOptions[Math.floor(Math.random() * artisticOptions.length)];
  }

  // Then check for specific clothing
  if (!parsed.clothing) {
    for (const [clothing, keywords] of Object.entries(clothingKeywords)) {
      if (keywords.some(kw => lowerPrompt.includes(kw))) {
        parsed.clothing = clothing;
        break;
      }
    }
  }

  // Default clothing if not found
  if (!parsed.clothing) {
    parsed.clothing = 'businessCasual';
  }

  // Background detection
  const backgroundKeywords = {
    tealGradient: ['gradient', 'teal gradient', 'blue gradient'],
    solidTeal: ['solid teal', 'teal background'],
    solidDark: ['dark', 'navy', 'dramatic', 'moody'],
    dataCenter: ['data center', 'server', 'tech', 'datacenter'],
    construction: ['construction', 'job site', 'building'],
    office: ['office', 'corporate', 'professional', 'glass'],
    transparent: ['transparent', 'cutout', 'no background', 'png']
  };

  // Check for specific background/setting mentions
  if (lowerPrompt.includes('podcast') || lowerPrompt.includes('studio')) {
    parsed.background = 'office'; // Office works for podcast studio
    parsed.custom.push('podcast studio with microphone visible in background');
  } else if (lowerPrompt.includes('gym') || lowerPrompt.includes('fitness')) {
    parsed.background = 'office'; // Use office as base
    parsed.custom.push('modern gym or fitness studio background');
  } else if (lowerPrompt.includes('outdoor') || lowerPrompt.includes('outside')) {
    parsed.background = 'construction'; // Construction has outdoor vibes
    parsed.custom.push('outdoor urban setting');
  } else {
    for (const [bg, keywords] of Object.entries(backgroundKeywords)) {
      if (keywords.some(kw => lowerPrompt.includes(kw))) {
        parsed.background = bg;
        break;
      }
    }
  }

  // Default background if not found
  if (!parsed.background) {
    parsed.background = 'tealGradient';
  }

  // Extract custom appearance attributes
  const customAttributes = [];

  // Hair
  if (lowerPrompt.includes('blonde') || lowerPrompt.includes('blond')) {
    customAttributes.push('blonde hair');
  }
  if (lowerPrompt.includes('braids') || lowerPrompt.includes('braided')) {
    customAttributes.push('braided hair');
  }
  if (lowerPrompt.includes('curly')) {
    customAttributes.push('curly hair');
  }
  if (lowerPrompt.includes('straight hair')) {
    customAttributes.push('straight hair');
  }
  if (lowerPrompt.includes('ponytail')) {
    customAttributes.push('hair in ponytail');
  }
  if (lowerPrompt.includes('bun')) {
    customAttributes.push('hair in bun');
  }

  // Accessories
  if (lowerPrompt.includes('glasses') || lowerPrompt.includes('reading glasses')) {
    customAttributes.push('wearing reading glasses');
  }
  if (lowerPrompt.includes('sunglasses')) {
    customAttributes.push('wearing sunglasses');
  }
  if (lowerPrompt.includes('headphones')) {
    customAttributes.push('wearing headphones');
  }
  if (lowerPrompt.includes('earrings')) {
    customAttributes.push('wearing earrings');
  }
  if (lowerPrompt.includes('necklace')) {
    customAttributes.push('wearing a necklace');
  }
  if (lowerPrompt.includes('watch')) {
    customAttributes.push('wearing a watch');
  }

  // Props
  if (lowerPrompt.includes('tablet') || lowerPrompt.includes('ipad')) {
    customAttributes.push('holding a tablet');
  }
  if (lowerPrompt.includes('phone') || lowerPrompt.includes('smartphone')) {
    customAttributes.push('holding a smartphone');
  }
  if (lowerPrompt.includes('laptop')) {
    customAttributes.push('with a laptop');
  }
  if (lowerPrompt.includes('coffee') || lowerPrompt.includes('cup')) {
    customAttributes.push('holding a coffee cup');
  }
  if (lowerPrompt.includes('microphone') || lowerPrompt.includes('mic')) {
    customAttributes.push('with a microphone');
  }

  // Combine custom attributes with any custom background notes
  parsed.custom = [...parsed.custom, ...customAttributes];

  return parsed;
}

/**
 * Get clothing variations for multi-image generation
 */
function getClothingVariations(baseClothing, count, category = null) {
  const clothingByCategory = {
    sexy: ['leatherJacket', 'cocktailDress', 'cropTop', 'offShoulder'],
    professional: ['workUniform', 'businessCasual', 'tealPolo', 'casual'],
    artistic: ['bohemian', 'paintSmock', 'avantGarde'],
    grungy: ['grungeFlannel', 'distressedDenim', 'streetwear', 'punkRock']
  };

  // Determine category from base clothing
  let clothingPool = [];
  for (const [cat, items] of Object.entries(clothingByCategory)) {
    if (items.includes(baseClothing)) {
      clothingPool = [...items];
      break;
    }
  }

  // If not found in any category, use all clothing
  if (clothingPool.length === 0) {
    clothingPool = Object.keys(presets.CLOTHING);
  }

  // Shuffle and pick
  const shuffled = clothingPool.sort(() => Math.random() - 0.5);
  const variations = [];
  for (let i = 0; i < count; i++) {
    variations.push(shuffled[i % shuffled.length]);
  }
  return variations;
}

program
  .name('maya-generator')
  .description('Generate consistent Maya character images for LVN social media')
  .argument('[freestyle...]', 'Freestyle prompt (natural language)')
  .option('-p, --platform <id>', 'Target platform', 'instagram-post')
  .option('--pose <id>', 'Maya pose', 'confident')
  .option('-c, --clothing <id>', 'Clothing preset', 'tealPolo')
  .option('-b, --background <id>', 'Background preset', 'tealGradient')
  .option('-s, --style <id>', 'Style/mood', 'professional')
  .option('-t, --text <string>', 'Text overlay hint')
  .option('--custom <string>', 'Custom prompt additions')
  .option('-o, --output <path>', 'Output directory', OUTPUT_DIR)
  .option('--size <size>', 'Image size (1K, 2K, 4K)', '2K')
  .option('-n, --count <number>', 'Number of images to generate', '1')
  .option('-q, --quick <action>', 'Use a quick action preset')
  .option('--dry-run', 'Generate prompt only, don\'t call API')
  .option('--validate', 'Check setup (API key, reference images)')
  .option('--list-options', 'List all available options')
  .parse();

const options = program.opts();
const freestyleArgs = program.args;

async function main() {
  const spinner = ora();

  try {
    // Handle --list-options
    if (options.listOptions) {
      printOptions();
      return;
    }

    // Handle --validate
    if (options.validate) {
      await validateSetup(spinner);
      return;
    }

    // Handle freestyle prompt mode
    if (freestyleArgs.length > 0) {
      const freestylePrompt = freestyleArgs.join(' ');
      console.log(chalk.bold('\n🎨 Freestyle Mode'));
      console.log(chalk.gray(`Prompt: "${freestylePrompt}"\n`));

      const parsed = parseFreestylePrompt(freestylePrompt);

      console.log(chalk.bold('Parsed Configuration:'));
      console.log(`  Platform: ${chalk.cyan(parsed.platform)}`);
      console.log(`  Pose: ${chalk.cyan(parsed.pose)}`);
      console.log(`  Clothing: ${chalk.cyan(parsed.clothing)}`);
      console.log(`  Background: ${chalk.cyan(parsed.background)}`);
      console.log(`  Count: ${chalk.cyan(parsed.count)}`);
      if (parsed.custom.length > 0) {
        console.log(`  Custom: ${chalk.cyan(parsed.custom.join(', '))}`);
      }
      if (parsed.varyClothing) {
        console.log(`  Vary Clothing: ${chalk.cyan('Yes')}`);
      }

      // Get clothing variations if requested
      let clothingList = [parsed.clothing];
      if (parsed.varyClothing && parsed.count > 1) {
        clothingList = getClothingVariations(parsed.clothing, parsed.count);
        console.log(chalk.gray(`  Clothing variations: ${clothingList.join(', ')}`));
      } else if (parsed.count > 1) {
        clothingList = Array(parsed.count).fill(parsed.clothing);
      }

      // Estimate cost
      const costEstimate = mayaClient.estimateCost(options.size || '2K', parsed.count);
      console.log(chalk.bold('\nCost Estimate:'));
      console.log(`  ${parsed.count} image(s): ${chalk.cyan('$' + costEstimate.totalEstimate)}`);

      // Check reference images
      spinner.start('Checking reference images...');
      const hasRefs = await mayaClient.hasReferenceImages();
      if (!hasRefs) {
        spinner.warn('No reference images found');
      } else {
        spinner.succeed('Reference images loaded');
      }

      // Generate images
      const outputDir = options.output || OUTPUT_DIR;
      const results = [];

      for (let i = 0; i < parsed.count; i++) {
        const currentClothing = clothingList[i];
        const imageNum = parsed.count > 1 ? ` (${i + 1}/${parsed.count})` : '';

        spinner.start(`Generating Maya image${imageNum}...`);

        const timestamp = Date.now();
        const filename = `maya-freestyle-${parsed.platform}-${i + 1}-${timestamp}.png`;
        const outputPath = path.join(outputDir, filename);

        const result = await mayaClient.generateAndSave({
          platform: parsed.platform,
          pose: parsed.pose,
          clothing: currentClothing,
          background: parsed.background,
          style: parsed.style,
          customPrompt: parsed.custom.join(', '),
          imageSize: options.size || '2K'
        }, outputPath);

        if (result.success) {
          spinner.succeed(`Image ${i + 1} generated`);

          // Generate content package MD
          const prompt = buildMayaPrompt({
            pose: parsed.pose,
            clothing: currentClothing,
            background: parsed.background,
            style: parsed.style,
            customPrompt: parsed.custom.join(', ')
          });

          const platformConfig = presets.getPlatformConfig(parsed.platform);
          const mdFilename = filename.replace('.png', '.md');
          const mdPath = path.join(outputDir, mdFilename);
          const mdContent = generateContentPackageMd({
            imagePath: result.path,
            filename,
            platform: parsed.platform,
            platformConfig,
            pose: parsed.pose,
            poseName: POSES[parsed.pose]?.name || parsed.pose,
            clothing: currentClothing,
            clothingName: presets.CLOTHING[currentClothing]?.name || currentClothing,
            clothingDesc: presets.CLOTHING[currentClothing]?.description || '',
            background: parsed.background,
            backgroundName: presets.BACKGROUNDS[parsed.background]?.name || parsed.background,
            style: parsed.style,
            styleName: presets.STYLES[parsed.style]?.name || parsed.style,
            customPrompt: parsed.custom.join(', '),
            textOverlay: '',
            prompt,
            imageSize: options.size || '2K'
          });

          await fs.writeFile(mdPath, mdContent);
          results.push({ success: true, path: result.path, mdPath });
        } else {
          spinner.fail(`Image ${i + 1} failed: ${result.error}`);
          results.push({ success: false, error: result.error });
        }
      }

      // Summary
      const successCount = results.filter(r => r.success).length;
      console.log(chalk.bold(`\n✨ Generated ${successCount}/${parsed.count} images`));
      results.filter(r => r.success).forEach(r => {
        console.log(chalk.green(`  ${r.path}`));
        console.log(chalk.gray(`  ${r.mdPath}`));
      });

      return;
    }

    // Apply quick action preset if specified
    let finalOptions = { ...options };
    if (options.quick) {
      const quickAction = presets.QUICK_ACTIONS[options.quick];
      if (!quickAction) {
        console.error(chalk.red(`Unknown quick action: ${options.quick}`));
        console.log(chalk.gray('Available quick actions:'));
        Object.entries(presets.QUICK_ACTIONS).forEach(([id, action]) => {
          console.log(chalk.gray(`  ${id}: ${action.description}`));
        });
        process.exit(1);
      }
      console.log(chalk.blue(`Using quick action: ${quickAction.name}`));
      console.log(chalk.gray(`  ${quickAction.description}`));
      finalOptions = { ...options, ...quickAction.defaults };
    }

    // Validate options
    if (!POSES[finalOptions.pose]) {
      console.error(chalk.red(`Unknown pose: ${finalOptions.pose}`));
      console.log(chalk.gray('Available poses: ' + Object.keys(POSES).join(', ')));
      process.exit(1);
    }

    if (!presets.PLATFORMS[finalOptions.platform]) {
      console.error(chalk.red(`Unknown platform: ${finalOptions.platform}`));
      console.log(chalk.gray('Available platforms: ' + Object.keys(presets.PLATFORMS).join(', ')));
      process.exit(1);
    }

    // Build the prompt
    const prompt = buildMayaPrompt({
      pose: finalOptions.pose,
      clothing: finalOptions.clothing,
      background: finalOptions.background,
      style: finalOptions.style,
      customPrompt: finalOptions.custom,
      textOverlay: finalOptions.text
    });

    // Get platform config
    const platformConfig = presets.getPlatformConfig(finalOptions.platform);

    // Show configuration
    console.log(chalk.bold('\nMaya Image Configuration:'));
    console.log(`  Platform: ${chalk.cyan(platformConfig.name)} (${platformConfig.aspectRatio})`);
    console.log(`  Pose: ${chalk.cyan(POSES[finalOptions.pose]?.name || finalOptions.pose)}`);
    console.log(`  Clothing: ${chalk.cyan(presets.CLOTHING[finalOptions.clothing]?.name || finalOptions.clothing)}`);
    console.log(`  Background: ${chalk.cyan(presets.BACKGROUNDS[finalOptions.background]?.name || finalOptions.background)}`);
    console.log(`  Style: ${chalk.cyan(presets.STYLES[finalOptions.style]?.name || finalOptions.style)}`);
    console.log(`  Size: ${chalk.cyan(finalOptions.size)}`);
    if (finalOptions.text) {
      console.log(`  Text Overlay: ${chalk.cyan(finalOptions.text)}`);
    }

    // Show cost estimate
    const costEstimate = mayaClient.estimateCost(finalOptions.size, 1);
    console.log(chalk.bold('\nCost Estimate:'));
    console.log(`  Per Image: ${chalk.cyan('$' + costEstimate.pricePerImage.toFixed(2))}`);

    // Dry run - show prompt and exit
    if (options.dryRun) {
      console.log(chalk.bold('\n[DRY RUN] Generated Prompt:\n'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(prompt);
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.yellow('\nDry run complete. No image generated.'));
      return;
    }

    // Check reference images
    spinner.start('Checking reference images...');
    const hasRefs = await mayaClient.hasReferenceImages();
    if (!hasRefs) {
      spinner.warn('No reference images found');
      console.log(chalk.yellow('\nWarning: No reference images in reference-images/'));
      console.log(chalk.gray('For consistent Maya appearance, add 3-5 reference images.'));
      console.log(chalk.gray('See reference-images/README.md for instructions.\n'));
    } else {
      spinner.succeed('Reference images loaded');
    }

    // Generate the image
    const outputDir = finalOptions.output;
    const filename = mayaClient.generateFilename(finalOptions);
    const outputPath = path.join(outputDir, filename);

    spinner.start('Generating Maya image...');

    const result = await mayaClient.generateAndSave({
      platform: finalOptions.platform,
      pose: finalOptions.pose,
      clothing: finalOptions.clothing,
      background: finalOptions.background,
      style: finalOptions.style,
      customPrompt: finalOptions.custom,
      textOverlay: finalOptions.text,
      imageSize: finalOptions.size
    }, outputPath);

    if (result.success) {
      spinner.succeed('Image generated successfully');
      console.log(chalk.green(`\nSaved to: ${result.path}`));

      // Generate accompanying MD file with content ideas
      const mdFilename = filename.replace('.png', '.md');
      const mdPath = path.join(outputDir, mdFilename);
      const mdContent = generateContentPackageMd({
        imagePath: result.path,
        filename,
        platform: finalOptions.platform,
        platformConfig,
        pose: finalOptions.pose,
        poseName: POSES[finalOptions.pose]?.name || finalOptions.pose,
        clothing: finalOptions.clothing,
        clothingName: presets.CLOTHING[finalOptions.clothing]?.name || finalOptions.clothing,
        clothingDesc: presets.CLOTHING[finalOptions.clothing]?.description || '',
        background: finalOptions.background,
        backgroundName: presets.BACKGROUNDS[finalOptions.background]?.name || finalOptions.background,
        style: finalOptions.style,
        styleName: presets.STYLES[finalOptions.style]?.name || finalOptions.style,
        customPrompt: finalOptions.custom,
        textOverlay: finalOptions.text,
        prompt,
        imageSize: finalOptions.size
      });

      await fs.writeFile(mdPath, mdContent);
      console.log(chalk.gray(`Content package: ${mdPath}`));
    } else {
      spinner.fail('Image generation failed');
      console.error(chalk.red(`\nError: ${result.error}`));
      process.exit(1);
    }

  } catch (error) {
    spinner.stop();
    console.error(chalk.red(`\nError: ${error.message}`));
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Validate setup and print status
 */
async function validateSetup(spinner) {
  spinner.start('Validating setup...');
  const validation = await mayaClient.validateSetup();
  spinner.stop();

  console.log(chalk.bold('\nMaya Generator Setup Validation:\n'));

  // API Key
  if (validation.apiKey) {
    console.log(chalk.green('  [OK] API Key configured'));
  } else {
    console.log(chalk.red('  [MISSING] API Key'));
    console.log(chalk.gray('       Set GOOGLE_GENAI_API_KEY in environment or .env file'));
  }

  // Reference Images
  if (validation.referenceImages) {
    console.log(chalk.green(`  [OK] Reference images: ${validation.referenceCount} found`));
  } else if (validation.referenceCount > 0) {
    console.log(chalk.yellow(`  [WARN] Reference images: ${validation.referenceCount} found (recommend 3-5)`));
  } else {
    console.log(chalk.red('  [MISSING] Reference images'));
    console.log(chalk.gray('       Add Maya reference images to reference-images/'));
  }

  // Summary
  console.log('');
  if (validation.errors.length === 0) {
    console.log(chalk.green('Setup is complete! Ready to generate Maya images.'));
  } else {
    console.log(chalk.yellow('Setup incomplete. Please address the issues above.'));
  }
}

/**
 * Print all available options
 */
function printOptions() {
  console.log(chalk.bold('\nMaya Generator - Available Options\n'));

  console.log(chalk.bold('Platforms:'));
  Object.entries(presets.PLATFORMS).forEach(([id, p]) => {
    console.log(`  ${chalk.cyan(id.padEnd(20))} ${p.aspectRatio.padEnd(6)} ${p.name}`);
  });

  console.log(chalk.bold('\nPoses:'));
  Object.entries(POSES).forEach(([id, p]) => {
    console.log(`  ${chalk.cyan(id.padEnd(15))} ${p.description}`);
  });

  console.log(chalk.bold('\nClothing:'));
  Object.entries(presets.CLOTHING).forEach(([id, c]) => {
    console.log(`  ${chalk.cyan(id.padEnd(18))} ${c.name}`);
  });

  console.log(chalk.bold('\nBackgrounds:'));
  Object.entries(presets.BACKGROUNDS).forEach(([id, b]) => {
    console.log(`  ${chalk.cyan(id.padEnd(15))} ${b.name}`);
  });

  console.log(chalk.bold('\nStyles:'));
  Object.entries(presets.STYLES).forEach(([id, s]) => {
    console.log(`  ${chalk.cyan(id.padEnd(15))} ${s.name}`);
  });

  console.log(chalk.bold('\nQuick Actions:'));
  Object.entries(presets.QUICK_ACTIONS).forEach(([id, a]) => {
    console.log(`  ${chalk.cyan(id.padEnd(20))} ${a.description}`);
  });

  console.log(chalk.bold('\nImage Sizes:'));
  console.log(`  ${chalk.cyan('1K')}    Standard quality`);
  console.log(`  ${chalk.cyan('2K')}    High quality (recommended)`);
  console.log(`  ${chalk.cyan('4K')}    Ultra high quality (higher cost)`);
}

main();
