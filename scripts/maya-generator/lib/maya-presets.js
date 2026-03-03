/**
 * Maya Image Generator - Presets & Configuration
 *
 * Defines clothing, backgrounds, styles, and platform specifications
 * for consistent Maya character image generation.
 */

/**
 * Clothing presets for Maya
 */
export const CLOTHING = {
  // Professional
  workUniform: {
    id: 'workUniform',
    name: 'Technician Uniform',
    description: 'Gray-blue technician work shirt with tool belt around waist, sleeves rolled up'
  },
  businessCasual: {
    id: 'businessCasual',
    name: 'Business Casual',
    description: 'Navy blazer over crisp white blouse, professional but approachable'
  },
  safetyGear: {
    id: 'safetyGear',
    name: 'Safety Gear',
    description: 'White hard hat, high-visibility safety vest over work shirt'
  },
  casual: {
    id: 'casual',
    name: 'Casual',
    description: 'Simple solid-color t-shirt, relaxed professional appearance'
  },
  tealPolo: {
    id: 'tealPolo',
    name: 'Teal Polo',
    description: 'Professional teal polo shirt, clean and approachable'
  },
  // Artistic
  bohemian: {
    id: 'bohemian',
    name: 'Bohemian Artist',
    description: 'Flowing earth-tone blouse with layered necklaces, artistic and free-spirited vibe'
  },
  paintSmock: {
    id: 'paintSmock',
    name: 'Paint-Splattered',
    description: 'Oversized denim shirt with colorful paint splatters, messy bun, creative artist look'
  },
  avantGarde: {
    id: 'avantGarde',
    name: 'Avant-Garde',
    description: 'Asymmetrical black top with geometric cutouts, bold and fashion-forward'
  },
  // Edgy/Sexy
  leatherJacket: {
    id: 'leatherJacket',
    name: 'Leather Jacket',
    description: 'Fitted black leather moto jacket over a simple tank top, edgy and confident'
  },
  cocktailDress: {
    id: 'cocktailDress',
    name: 'Cocktail Dress',
    description: 'Elegant form-fitting black cocktail dress, sophisticated and alluring'
  },
  cropTop: {
    id: 'cropTop',
    name: 'Crop Top',
    description: 'Stylish fitted crop top with high-waisted jeans, casual but bold'
  },
  offShoulder: {
    id: 'offShoulder',
    name: 'Off-Shoulder Top',
    description: 'Elegant off-shoulder blouse, feminine and flirty'
  },
  // Grungy
  grungeFlannel: {
    id: 'grungeFlannel',
    name: 'Grunge Flannel',
    description: 'Oversized flannel shirt tied at waist over band tee, 90s grunge aesthetic'
  },
  distressedDenim: {
    id: 'distressedDenim',
    name: 'Distressed Denim',
    description: 'Ripped denim jacket with patches and pins over a vintage band shirt'
  },
  streetwear: {
    id: 'streetwear',
    name: 'Streetwear',
    description: 'Oversized hoodie with graphic print, urban street style vibe'
  },
  punkRock: {
    id: 'punkRock',
    name: 'Punk Rock',
    description: 'Studded leather vest over torn black shirt, punk aesthetic with attitude'
  }
};

/**
 * Background presets for Maya images
 */
export const BACKGROUNDS = {
  // Clean/Simple
  solidDark: {
    id: 'solidDark',
    name: 'Solid Dark',
    description: 'Solid dark navy (#0f172a), dramatic and professional'
  },
  gradient: {
    id: 'gradient',
    name: 'Dark Gradient',
    description: 'Dark moody gradient with subtle lighting, cinematic feel'
  },
  transparent: {
    id: 'transparent',
    name: 'Transparent (Cutout)',
    description: 'Transparent background for PNG cutout, suitable for overlays'
  },
  // Professional Spaces
  office: {
    id: 'office',
    name: 'Modern Office',
    description: 'Blurred modern office with glass walls and warm lighting'
  },
  podcastStudio: {
    id: 'podcastStudio',
    name: 'Podcast Studio',
    description: 'Professional podcast studio with microphone, monitors, acoustic panels, and warm lighting'
  },
  dataCenter: {
    id: 'dataCenter',
    name: 'Data Center',
    description: 'Blurred server racks with subtle blue LED lights, tech environment'
  },
  // Industrial/Trade
  construction: {
    id: 'construction',
    name: 'Construction Site',
    description: 'Blurred construction site background, industrial setting'
  },
  warehouse: {
    id: 'warehouse',
    name: 'Warehouse',
    description: 'Industrial warehouse with high ceilings, exposed beams, and dramatic lighting'
  },
  // Creative/Lifestyle
  coffeeShop: {
    id: 'coffeeShop',
    name: 'Coffee Shop',
    description: 'Cozy coffee shop with warm ambient lighting, exposed brick, and wooden accents'
  },
  artStudio: {
    id: 'artStudio',
    name: 'Art Studio',
    description: 'Creative art studio with large windows, natural light, and artistic elements'
  },
  loft: {
    id: 'loft',
    name: 'Urban Loft',
    description: 'Modern urban loft with exposed brick walls, industrial windows, and contemporary furniture'
  }
};

/**
 * Style/mood presets
 */
export const STYLES = {
  professional: {
    id: 'professional',
    name: 'Professional',
    description: 'Clean, corporate photography style with good lighting'
  },
  energetic: {
    id: 'energetic',
    name: 'Energetic',
    description: 'Dynamic, vibrant style with slightly saturated colors'
  },
  friendly: {
    id: 'friendly',
    name: 'Friendly',
    description: 'Warm, approachable style with soft lighting'
  },
  authoritative: {
    id: 'authoritative',
    name: 'Authoritative',
    description: 'Confident, expert style with dramatic lighting'
  },
  educational: {
    id: 'educational',
    name: 'Educational',
    description: 'Clear, instructional style optimized for teaching content'
  }
};

/**
 * Platform specifications with aspect ratios and sizes
 */
export const PLATFORMS = {
  'instagram-post': {
    id: 'instagram-post',
    name: 'Instagram Post',
    aspectRatio: '1:1',
    imageSize: '2K',
    description: 'Square format for Instagram feed posts'
  },
  'instagram-story': {
    id: 'instagram-story',
    name: 'Instagram Story/Reel',
    aspectRatio: '9:16',
    imageSize: '2K',
    description: 'Vertical format for Stories and Reels'
  },
  'youtube-thumbnail': {
    id: 'youtube-thumbnail',
    name: 'YouTube Thumbnail',
    aspectRatio: '16:9',
    imageSize: '2K',
    description: 'Widescreen format for YouTube thumbnails'
  },
  'linkedin': {
    id: 'linkedin',
    name: 'LinkedIn Post',
    aspectRatio: '1:1',
    imageSize: '2K',
    description: 'Square format for LinkedIn posts'
  },
  'twitter': {
    id: 'twitter',
    name: 'Twitter/X Post',
    aspectRatio: '16:9',
    imageSize: '2K',
    description: 'Widescreen format for Twitter posts'
  },
  'cutout': {
    id: 'cutout',
    name: 'PNG Cutout',
    aspectRatio: '1:1',
    imageSize: '2K',
    transparent: true,
    description: 'Transparent background for overlays and composites'
  },
  'facebook': {
    id: 'facebook',
    name: 'Facebook Post',
    aspectRatio: '1:1',
    imageSize: '2K',
    description: 'Square format for Facebook feed posts'
  }
};

/**
 * Quick action presets for common use cases
 */
export const QUICK_ACTIONS = {
  announcementPost: {
    id: 'announcementPost',
    name: 'Announcement Post',
    description: 'Maya announcing something exciting',
    defaults: {
      platform: 'instagram-post',
      pose: 'excited',
      clothing: 'businessCasual',
      background: 'podcastStudio',
      style: 'energetic'
    }
  },
  tutorialThumbnail: {
    id: 'tutorialThumbnail',
    name: 'Tutorial Thumbnail',
    description: 'Maya teaching or explaining',
    defaults: {
      platform: 'youtube-thumbnail',
      pose: 'explaining',
      clothing: 'businessCasual',
      background: 'office',
      style: 'educational'
    }
  },
  welcomePost: {
    id: 'welcomePost',
    name: 'Welcome Post',
    description: 'Maya welcoming new members',
    defaults: {
      platform: 'instagram-post',
      pose: 'welcome',
      clothing: 'casual',
      background: 'coffeeShop',
      style: 'friendly'
    }
  },
  jobAlert: {
    id: 'jobAlert',
    name: 'Job Alert',
    description: 'Maya pointing to job opportunity',
    defaults: {
      platform: 'instagram-story',
      pose: 'pointing',
      clothing: 'workUniform',
      background: 'construction',
      style: 'professional'
    }
  },
  certificationPromo: {
    id: 'certificationPromo',
    name: 'Certification Promo',
    description: 'Maya promoting certifications',
    defaults: {
      platform: 'instagram-post',
      pose: 'thumbsUp',
      clothing: 'businessCasual',
      background: 'dataCenter',
      style: 'professional'
    }
  },
  industryNews: {
    id: 'industryNews',
    name: 'Industry News',
    description: 'Maya presenting industry news',
    defaults: {
      platform: 'youtube-thumbnail',
      pose: 'thinking',
      clothing: 'businessCasual',
      background: 'loft',
      style: 'authoritative'
    }
  }
};

/**
 * Get all options for a preset category
 */
export function getOptions(category) {
  const categories = {
    clothing: CLOTHING,
    backgrounds: BACKGROUNDS,
    styles: STYLES,
    platforms: PLATFORMS,
    quickActions: QUICK_ACTIONS
  };
  return categories[category] || {};
}

/**
 * Get preset by ID from any category
 */
export function getPreset(category, id) {
  const options = getOptions(category);
  return options[id] || null;
}

/**
 * Get default configuration for a platform
 */
export function getPlatformConfig(platformId) {
  return PLATFORMS[platformId] || PLATFORMS['instagram-post'];
}

export default {
  CLOTHING,
  BACKGROUNDS,
  STYLES,
  PLATFORMS,
  QUICK_ACTIONS,
  getOptions,
  getPreset,
  getPlatformConfig
};
