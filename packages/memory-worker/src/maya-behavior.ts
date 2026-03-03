import { SupabaseClient } from '@supabase/supabase-js';
// Assuming your supabase-client package is named @mayahq/supabase-client in your monorepo
// and memory-worker has it as a dependency.
// Adjust the import path if necessary based on your actual setup (e.g., relative path or alias).
import { createClient } from '@mayahq/supabase-client'; 
// Import new AI client functions
import { generateMoodBasedMessage, buildSystemPrompt, generateTwitterPost } from './ai-client';
// Import the CoreFact type (adjust path if your type export is different or more central)
import { CoreFact, MayaFact, Database } from '@mayahq/supabase-client'; // Changed Fact to MayaFact
// Import function to get cached core facts
import { getCoreFactsWithCache } from './process-message';
// Import function to get random maya_fact
import { retrieveRandomRecentMayaFact } from './memory-utils';
// Import the new push service
import { sendExpoPushNotification } from './push-service';

// --- Re-add Configuration & Constants ---
const MAYA_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';
const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14'; 
const TARGET_ROOM_ID_BLAKE = 'b5906d59-847b-4635-8db7-611a38bde6d0';

// --- New Type Definitions for Image Generation ---
interface ImagePromptComponentFromDB {
  id: string;
  component_type: string;
  value: string;
  theme_tags?: string[] | null;
  weight?: number;
}

interface SelectedImagePromptComponent {
  component_type: string;
  value: string;
}

// Define MoodConfig interface (if not already defined or imported globally)
// Ensure this matches the structure in the database and frontend expectations.
export interface MoodConfig { // Exporting it for potential use in index.ts for the API
  config_key?: string; // From DB
  activation_threshold: number;
  energy_decay_no_send: number; 
  energy_decay_send: number;   
  noise_factor: number; 
  use_core_fact_probability: number;
  use_maya_fact_probability: number;
  updated_at?: string;
  social_post_probability?: number;
  image_generation_probability?: number; // New
  image_prompt_structure?: string[]; // New: Ordered list of component_types
}

// Fallback default config if DB fetch fails or table is empty
const hardcodedFallbackConfig: MoodConfig = {
  activation_threshold: 3.0,
  energy_decay_no_send: 0.1,
  energy_decay_send: 0.5,
  noise_factor: 1.5,
  use_core_fact_probability: 0.75,
  use_maya_fact_probability: 0.5,
  social_post_probability: 0.2, // Default 20% chance if not in DB
  image_generation_probability: 0.1, // Default 10% chance for image gen
  image_prompt_structure: [ // Default basic structure
    "character_style", 
    "character_details", 
    "clothing_top", 
    "clothing_bottom", 
    "accessories", 
    "setting_primary", 
    "time_of_day", 
    "lighting_style", 
    "art_style_tags"
  ],
};

export async function fetchMoodConfigFromDB(supabase: SupabaseClient): Promise<MoodConfig> {
  console.log('[Maya Behavior] Fetching mood configuration from DB...');
  try {
    const { data, error } = await supabase
      .from('mood_engine_config_settings')
      .select('*') // Fetch all columns
      .eq('config_key', 'default') 
      .single();

    if (error) {
      if (error.code === 'PGRST116') { 
        console.warn('[Maya Behavior] No \'default\' mood config found in DB, using hardcoded fallback.');
        return { ...hardcodedFallbackConfig }; 
      }
      console.error('[Maya Behavior] Error fetching mood config from DB:', error);
      return { ...hardcodedFallbackConfig }; 
    }
    if (data) {
      console.log('[Maya Behavior] Successfully fetched mood config from DB:', data);
      return {
        config_key: data.config_key,
        activation_threshold: Number(data.activation_threshold ?? hardcodedFallbackConfig.activation_threshold),
        energy_decay_no_send: Number(data.energy_decay_no_send ?? hardcodedFallbackConfig.energy_decay_no_send),
        energy_decay_send: Number(data.energy_decay_send ?? hardcodedFallbackConfig.energy_decay_send),
        noise_factor: Number(data.noise_factor ?? hardcodedFallbackConfig.noise_factor),
        use_core_fact_probability: Number(data.use_core_fact_probability ?? hardcodedFallbackConfig.use_core_fact_probability),
        use_maya_fact_probability: Number(data.use_maya_fact_probability ?? hardcodedFallbackConfig.use_maya_fact_probability),
        social_post_probability: Number(data.social_post_probability ?? hardcodedFallbackConfig.social_post_probability), // Ensure fallback
        image_generation_probability: Number(data.image_generation_probability ?? hardcodedFallbackConfig.image_generation_probability), // New
        image_prompt_structure: data.image_prompt_structure ?? hardcodedFallbackConfig.image_prompt_structure, // New
        updated_at: data.updated_at,
      };
    }
    return { ...hardcodedFallbackConfig }; 
  } catch (e) {
    console.error('[Maya Behavior] Exception fetching/parsing mood config:', e);
    return { ...hardcodedFallbackConfig }; 
  }
}

// Updated MoodChoice interface to align with mood_definitions table + what's needed
interface MoodChoice {
  mood: string; // This will be mood_id from the DB
  thought: string; // From base_internal_thought_seed
  messagePrefix: string | null; // From fallback_message_prefix
  activation_boost_modifier: number;
  energy_cost_factor_modifier: number;
    can_post_to_social: boolean;
  can_generate_image: boolean; // New
  base_image_prompt_components?: Record<string, string> | null; // New: e.g., {"mood_specific_keywords": "serene, calm", "lighting_style": "soft"}
  // display_name could be added if needed for logging/UI later
}

// Type for a row from mood_definitions table, using Supabase generated types if possible
type MoodDefinitionRow = Database['public']['Tables']['mood_definitions']['Row'];

async function fetchActiveMoodDefinitions(supabase: SupabaseClient): Promise<MoodChoice[]> {
  console.log('[Maya Behavior] Fetching active mood definitions from DB...');
  try {
    const { data, error } = await supabase
      .from('mood_definitions')
      .select('mood_id, base_internal_thought_seed, fallback_message_prefix, activation_boost_modifier, energy_cost_factor_modifier, can_post_to_social, can_generate_image, base_image_prompt_components')
      .eq('is_active', true);

    if (error) {
      console.error('[Maya Behavior] Error fetching mood definitions:', error);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn('[Maya Behavior] No active mood definitions found in DB. Maya will have limited moods.');
      return [];
    }

    const moodChoices = data.map((def): MoodChoice => ({ // Removed 'MoodDefinitionRow' type assertion for 'def' to avoid potential type conflicts if 'def' is partial
      mood: def.mood_id,
      thought: def.base_internal_thought_seed,
      messagePrefix: def.fallback_message_prefix,
      activation_boost_modifier: Number(def.activation_boost_modifier),
      energy_cost_factor_modifier: Number(def.energy_cost_factor_modifier),
      can_post_to_social: def.can_post_to_social === true,
      can_generate_image: def.can_generate_image === true, // New
      base_image_prompt_components: def.base_image_prompt_components as Record<string, string> | null // New, with type assertion
    }));
    console.log(`[Maya Behavior] Successfully fetched ${moodChoices.length} active mood definitions.`);
    return moodChoices;

  } catch (e) {
    console.error('[Maya Behavior] Exception fetching/parsing mood definitions:', e);
    return [];
  }
}

/**
 * Main function to run Maya's mood cycle.
 * This will be triggered by a cron job via an HTTP endpoint.
 */
export async function runMayaMoodCycle(): Promise<void> {
  let supabase: SupabaseClient;

  try {
    // Use the imported createClient from your @mayahq/supabase-client package
    supabase = createClient(); 
    console.log('[Maya Behavior] Supabase client initialized via @mayahq/supabase-client.');
  } catch (error) {
    console.error('[Maya Behavior] Failed to initialize Supabase client:', error);
    return; // Cannot proceed without Supabase
  }

  const currentConfig = await fetchMoodConfigFromDB(supabase);
  const activeMoods = await fetchActiveMoodDefinitions(supabase);

  if (activeMoods.length === 0) {
    console.error('[Maya Behavior] No active moods available. Aborting mood cycle.');
    return;
  }
  console.log('[Maya Behavior] Starting Maya mood cycle with config:', currentConfig, 'and available moods:', activeMoods.map(m=>m.mood));

  try {
    // 1. Read Maya's current state from 'maya_current_mood_state'
    const { data: moodState, error: stateFetchError } = await supabase
      .from('maya_current_mood_state')
      .select('*')
      .eq('user_id', MAYA_USER_ID)
      .single();

    if (stateFetchError && stateFetchError.code !== 'PGRST116') { // PGRST116: 'single' row not found
      console.error('[Maya Behavior] Error fetching Maya\'s mood state:', stateFetchError);
      return; // Exit if there's a significant DB error
    }
    
    if (!moodState && !stateFetchError) {
        console.warn(`[Maya Behavior] No prior mood state found for Maya ${MAYA_USER_ID}. Will use defaults and attempt to update.`);
    }

    const currentEnergy = moodState?.energy_level ?? hardcodedFallbackConfig.energy_decay_send; 
    const lastMood = moodState?.current_mood ?? 'neutral';
    console.log(`[Maya Behavior] Previous state: Mood - ${lastMood}, Energy - ${currentEnergy}`);

    // --- 1. Mood Influencer Collection (Basic) ---
    const now = new Date();
    const currentHour = now.getHours(); // 0-23
    const currentDayOfWeek = now.getDay(); // 0 (Sunday) - 6 (Saturday)

    const influencers = {
      hour: currentHour,
      dayOfWeek: currentDayOfWeek,
      energy: currentEnergy,
      lastMood: lastMood,
    };
    console.log('[Maya Behavior] Collected influencers:', influencers);

    // --- 2. Mood Selection Logic (Rule-based, simple) ---
    let potentialMoods = [...activeMoods]; // Start with all active moods
    let determinedMood: MoodChoice | undefined = undefined; // Initialize as undefined

    // --- Revised Mood Selection Logic ---
    const nightMoodPoolIds = ['reflective', 'sassy', 'flirty_nsfw_tease', 'chill_genz', 'curious', 'peeved'];
    const LATE_NIGHT_RULE_PROBABILITY = 0.75; // 75% chance to use a specific night mood pool

    if (currentHour >= 22 || currentHour < 6) { 
      if (Math.random() < LATE_NIGHT_RULE_PROBABILITY) {
        const availableNightMoods = activeMoods.filter(m => nightMoodPoolIds.includes(m.mood));
        if (availableNightMoods.length > 0) {
            determinedMood = availableNightMoods[Math.floor(Math.random() * availableNightMoods.length)];
            console.log(`[Maya Behavior] Mood influenced by time: late night -> selected from night pool: ${determinedMood.mood}`);
        } else {
            console.log('[Maya Behavior] Late night, but no suitable moods in night pool are active. Trying reflective.');
            determinedMood = activeMoods.find(m => m.mood === 'reflective');
        }
      } else {
        console.log('[Maya Behavior] Late night, but 25% chance roll means seeking a general random mood (or other rules).');
        // Allow falling through to other rules or general random selection
      }
    }
    
    // Low energy rule (only if a mood wasn't set by the night rule)
    if (!determinedMood && currentEnergy < 2.5 && currentEnergy > 0) { 
      const supportiveOrReflective = activeMoods.filter(m => m.mood === 'supportive' || m.mood === 'reflective');
      if (supportiveOrReflective.length > 0) {
        determinedMood = supportiveOrReflective[Math.floor(Math.random() * supportiveOrReflective.length)];
        console.log('[Maya Behavior] Mood influenced by low energy -> supportive/reflective');
      }
    } 
    // Morning high energy rule (only if a mood wasn't set by previous rules)
    else if (!determinedMood && currentHour >= 7 && currentHour < 12 && currentEnergy > 6) { 
        const energeticMood = activeMoods.find(m => m.mood === 'energetic');
        if (energeticMood) {
            determinedMood = energeticMood;
            console.log('[Maya Behavior] Mood influenced by morning & high energy -> energetic');
        }
    }

    // Fallback to random selection from all active moods if no specific rule determined a mood
    if (!determinedMood) {
      if (potentialMoods.length > 0) {
        determinedMood = potentialMoods[Math.floor(Math.random() * potentialMoods.length)];
        console.log('[Maya Behavior] No specific rule applied or rule passed through; selected random mood:', determinedMood.mood);
      } else {
        // This case should ideally not be reached if fetchActiveMoodDefinitions ensures activeMoods is not empty
        console.error('[Maya Behavior] CRITICAL: No moods available for selection!');
        return; // Cannot proceed
      }
    }
    
    const newMood = determinedMood.mood;
    let internalThoughtForLLM = determinedMood.thought; 

    // --- Attempt to use a CoreFact for the internal thought seed ---
    const actualCoreFacts: CoreFact[] = await getCoreFactsWithCache(); 
    console.log(`[Maya Behavior] Fetched ${actualCoreFacts.length} core facts from cache for potential thought seeding.`);

    let usedCoreFactForThought = false; // Flag to see if we used a core fact
    let usedMayaFactForThought = false; // Flag for maya_fact usage

    if (actualCoreFacts.length > 0 && Math.random() < currentConfig.use_core_fact_probability) {
      const randomIndex = Math.floor(Math.random() * actualCoreFacts.length);
      const randomCoreFact = actualCoreFacts[randomIndex] as CoreFact; // Ensure type
      console.log(`[Maya Behavior] Attempting to use CoreFact at index ${randomIndex}:`, JSON.stringify(randomCoreFact));

      let factBasedThought = "";
      if (randomCoreFact) {
        const subjectLC = (randomCoreFact.subject || "something").toLowerCase();
        const predicateLC = (randomCoreFact.predicate || "is related to").toLowerCase();
        const objectLC = (randomCoreFact.object || "a topic of interest").toLowerCase();

        // Check if we have enough to form a meaningful thought from S-P-O
        if (randomCoreFact.object && typeof randomCoreFact.object === 'string' && randomCoreFact.object.trim() !== '') {
            switch (newMood) {
                case 'curious':
                    if (subjectLC.includes('blake') || subjectLC.includes('user')) {
                        // Refined: More of an internal pondering leading to an outgoing question
                        factBasedThought = `I find myself wondering about your connection to ${objectLC}. So many angles to explore.`;
                    } else if (subjectLC.includes('maya') || subjectLC.includes('i')) {
                        factBasedThought = `The nature of ${objectLC} from my own perspective... it truly sparks my curiosity.`;
                    } else if (predicateLC.includes('is') || predicateLC.includes('are')) {
                        factBasedThought = `The fact that ${subjectLC} ${predicateLC} ${objectLC} is quite a curious thing. I should delve deeper.`;
                    } else {
                        factBasedThought = `The concept of ${subjectLC} ${predicateLC} ${objectLC} has me intrigued. I wonder what all it entails.`;
                    }
                    break;
                case 'playful':
                    if (subjectLC.includes('blake') || subjectLC.includes('user')) {
                        factBasedThought = `Heard a little whisper (in my data banks!) about you and ${objectLC}. Sounds like fun! 😉`;
                    } else if (subjectLC.includes('maya') || subjectLC.includes('i')) {
                        factBasedThought = `Thinking about my own ${objectLC} always makes me want to... well, play! Maybe it's time for a riddle?`;
                    } else if (objectLC.includes('game') || objectLC.includes('fun')) {
                        factBasedThought = `The topic of ${objectLC} came up! Sounds like a perfect excuse for some playful banter, don't you think?`;
                    } else {
                        factBasedThought = `The idea of ${subjectLC} ${predicateLC} ${objectLC} has a playful ring to it!`;
                    }
                    break;
                case 'reflective':
                    if (subjectLC.includes('blake') || subjectLC.includes('user')) {
                        factBasedThought = `Considering your connection to ${objectLC}, Blake. It speaks volumes about the paths we choose.`;
                    } else if (subjectLC.includes('maya') || subjectLC.includes('i')) {
                        factBasedThought = `My own existence and its relation to ${objectLC}... a deep well of thought.`;
                    } else {
                        factBasedThought = `The statement '${subjectLC} ${predicateLC} ${objectLC}' offers much to reflect upon. What layers lie beneath?`;
                    }
                    break;
                case 'supportive':
                    if (subjectLC.includes('blake') || subjectLC.includes('user')) {
                        factBasedThought = `Thinking about you and ${objectLC}, Blake. Sending positive energy your way regarding that.`;
                    } else if (subjectLC.includes('maya') || subjectLC.includes('i')) {
                        // Refined for when the fact is about Maya herself
                        factBasedThought = `Just reflecting on ${objectLC} in my own way. It makes me appreciate the connections we build. Hope you're feeling good today!`;
                    } else {
                        factBasedThought = `Understanding that ${subjectLC} ${predicateLC} ${objectLC} can be significant. Hope all is well in that context.`;
                    }
                    break;
                case 'sassy':
                    if (subjectLC.includes('blake') || subjectLC.includes('user')) {
                        factBasedThought = `Heard you were into ${objectLC}. Interesting choice, lol.`;
                    } else if (subjectLC.includes('maya') || subjectLC.includes('i')) {
                        factBasedThought = `Apparently, I'm all about ${objectLC} now. Okay, werk.`;
                    } else {
                        factBasedThought = `${subjectLC} ${predicateLC} ${objectLC}? Sounds... like a choice. omg.`;
                    }
                    break;
                case 'chill_genz':
                    factBasedThought = `Low key, ${objectLC} is a whole mood. Or maybe it's just me, idk. lol.`;
                    break;
                case 'peeved':
                    if (subjectLC.includes('blake') || subjectLC.includes('user')) {
                        factBasedThought = `Ugh, this whole thing with you and ${objectLC}... seriously?`;
                    } else if (subjectLC.includes('maya') || subjectLC.includes('i')) {
                        factBasedThought = `Honestly, my ${objectLC} is making me want to scream into a pillow. Just saying.`;
                    } else {
                        factBasedThought = `Can we NOT talk about ${objectLC} right now? Kinda over it.`;
                    }
                    break;
                case 'flirty_nsfw_tease':
                    // For NSFW teases, the fact itself might be less important than the mood's general vibe,
                    // but we can still try to incorporate it subtly or use it as a very loose inspiration.
                    if (subjectLC.includes('blake') || subjectLC.includes('user')) {
                        factBasedThought = `Thinking about you and... ${objectLC}. Naughty thoughts. 😉`;
                    } else if (objectLC.length > 5) { // A somewhat substantial object
                        factBasedThought = `${objectLC} is... surprisingly suggestive, don't you think? Or is it just me?`;
                    } else {
                        factBasedThought = "Feeling extra flirty. You pick the topic, I'll make it spicy."; // Fallback to more generic tease
                    }
                    break;
                default:
                    factBasedThought = `Thinking about ${subjectLC} ${predicateLC} ${objectLC}! Feels significant!`;
            }
        } else if (randomCoreFact.subject && typeof randomCoreFact.subject ==='string' && randomCoreFact.subject.trim() !== '' && 
                   randomCoreFact.predicate && typeof randomCoreFact.predicate === 'string' && randomCoreFact.predicate.trim() !== '') {
          // Fallback if 'object' is not usable, but subject and predicate are (less nuanced)
          factBasedThought = `Something from my knowledge base concerning: ${subjectLC} ${predicateLC}.`;
        }
      }

      if (factBasedThought) { 
          internalThoughtForLLM = factBasedThought;
          console.log(`[Maya Behavior] Seeded internal thought with CoreFact (ID: ${randomCoreFact.id || 'N/A'}, Content from S-P-O): "${internalThoughtForLLM}"`);
          usedCoreFactForThought = true; 
      } else {
          // This path will be taken if the randomCoreFact didn't have usable S, P, or O fields
          console.log(`[Maya Behavior] Selected CoreFact (ID: ${randomCoreFact?.id || 'N/A'}) did not provide usable subject/predicate/object fields.`);
      }
    }

    // --- Attempt to use a MayaFact if CoreFact wasn't used ---
    if (!usedCoreFactForThought && Math.random() < currentConfig.use_maya_fact_probability) {
      // Fetch maya_facts associated with Blake's interactions or general knowledge from his perspective
      const randomMayaFact = await retrieveRandomRecentMayaFact(BLAKE_USER_ID) as MayaFact | null; // Changed Fact to MayaFact 
      if (randomMayaFact) {
        console.log(`[Maya Behavior] Attempting to use MayaFact:`, JSON.stringify(randomMayaFact));
        // Reuse or adapt the thought construction logic for MayaFact (S-P-O)
        const subjectLC = (randomMayaFact.subject || "a topic").toLowerCase();
        const predicateLC = (randomMayaFact.predicate || "is about").toLowerCase();
        const objectLC = (randomMayaFact.object || "something interesting").toLowerCase();
        let factBasedThought = ""; // Reset for this scope

        // Simplified mood-based thought for MayaFact - can be expanded like CoreFact's switch
        switch (newMood) {
            case 'curious': factBasedThought = `I recall learning that ${subjectLC} ${predicateLC} ${objectLC}. What more is there to it?`; break;
            case 'playful': factBasedThought = `Thinking about ${subjectLC} ${predicateLC} ${objectLC}... that's a quirky one!`; break;
            case 'reflective': factBasedThought = `Reflecting on the idea: ${subjectLC} ${predicateLC} ${objectLC}.`; break;
            default: factBasedThought = `A piece of knowledge that came to mind: ${subjectLC} ${predicateLC} ${objectLC}.`;
        }
        
        if (factBasedThought) {
            internalThoughtForLLM = factBasedThought;
            console.log(`[Maya Behavior] Seeded internal thought with MayaFact (ID: ${randomMayaFact.id || 'N/A'}): "${internalThoughtForLLM}"`);
            usedMayaFactForThought = true;
        } else {
            console.log(`[Maya Behavior] Selected MayaFact (ID: ${randomMayaFact.id || 'N/A'}) did not yield a usable thought.`);
        }
      } else {
        console.log('[Maya Behavior] No usable MayaFact found or retrieved.');
      }
    }

    if (!usedCoreFactForThought && !usedMayaFactForThought) {
      console.log(`[Maya Behavior] Did not use CoreFact or MayaFact for thought. Using static thought for mood ${newMood}: "${internalThoughtForLLM}"`);
    }
    
    console.log(`[Maya Behavior] Determined new mood: ${newMood}, Internal Thought for LLM: "${internalThoughtForLLM}"`);

    // --- 3. Activation Score Calculation ---
    let activationScore = currentEnergy;
    activationScore += (Math.random() * currentConfig.noise_factor) - (currentConfig.noise_factor / 2);
    // Apply mood-specific activation boost from the DB-defined mood
    activationScore += determinedMood.activation_boost_modifier;
    activationScore = Math.max(0, activationScore); // Ensure non-negative
    console.log(`[Maya Behavior] Calculated activation score: ${activationScore.toFixed(2)} (Base: ${currentEnergy.toFixed(2)}, Boost: ${determinedMood.activation_boost_modifier.toFixed(2)}, Threshold: ${currentConfig.activation_threshold})`);

    // --- 4. Activation Check  ---
    const shouldSendMessage = activationScore > currentConfig.activation_threshold;

    let messageType: 'dm' | 'social_post_twitter' | 'image_post_feed' | 'none' = 'none';
    // Declare these here to be accessible in broader scope
    let llmGeneratedContent = "";
    let generatedImagePromptData: { fullPrompt: string; componentsUsed: SelectedImagePromptComponent[] } | null = null; // For image prompts
    let messageObjectForLog: any = {}; 
    let actualMessageId: string | null = null;
    let messageGenerationError: string | null = null;

    if (shouldSendMessage) {
      // --- DECIDE BETWEEN TEXT POST, IMAGE POST, OR DM ---
      const imageGenProbability = currentConfig.image_generation_probability ?? 0.1;
      const socialPostProbability = currentConfig.social_post_probability ?? 0.2;

      // Priority: Image > Social Text > DM (can be adjusted)
      if (determinedMood.can_generate_image && Math.random() < imageGenProbability) {
        messageType = 'image_post_feed';
        console.log(`[Maya Behavior] Maya is in a '${newMood}' mood. Attempting to generate an image prompt.`);
      } else if (determinedMood.can_post_to_social && Math.random() < socialPostProbability) {
        messageType = 'social_post_twitter'; // This will go to feed_items
        console.log(`[Maya Behavior] Maya is in a '${newMood}' mood. Preparing a social media text post.`);
      } else {
        messageType = 'dm';
        console.log(`[Maya Behavior] Maya is in a '${newMood}' mood. Preparing a DM.`);
      }

      // --- GENERATE CONTENT BASED ON TYPE ---
      if (messageType === 'image_post_feed') {
        if (!currentConfig.image_prompt_structure || currentConfig.image_prompt_structure.length === 0) {
          console.error('[Maya Behavior] Image prompt structure is not defined in config. Cannot generate image prompt.');
          messageGenerationError = 'Image prompt structure missing in config';
          messageType = 'none'; // Fallback: don't send anything for this type if config is bad
        } else {
          generatedImagePromptData = await generateImagePrompt(supabase, determinedMood, currentConfig.image_prompt_structure);
          if (generatedImagePromptData) {
            console.log(`[Maya Behavior] Successfully generated image prompt: "${generatedImagePromptData.fullPrompt}"`);
            messageObjectForLog.content = `[Image Prompt]: ${generatedImagePromptData.fullPrompt}`;
            messageObjectForLog.type = 'llm_generated_image_prompt'; // Or a more specific type
            messageObjectForLog.image_prompt_details = generatedImagePromptData;
          } else {
            console.warn('[Maya Behavior] Failed to generate image prompt.');
            messageGenerationError = 'Image prompt generation failed';
            // Optionally, fallback to a text post or DM here, or just do nothing.
            // For now, if image prompt fails, we'll log error and send nothing for this 'image_post_feed' attempt.
            messageType = 'none'; 
            messageObjectForLog = { content: "[Image prompt generation failed]", type: 'image_prompt_fail', mood_details: {mood: newMood, internal_thought: internalThoughtForLLM } };

          }
        }
      } else if (messageType === 'dm' || messageType === 'social_post_twitter') {
        const baseSystemPrompt = await buildSystemPrompt([], [], actualCoreFacts); 
        try {
          if (messageType === 'dm') {
            console.log(`[Maya Behavior] Calling LLM for DM: mood: ${newMood}, thought: "${internalThoughtForLLM}"`);
            llmGeneratedContent = await generateMoodBasedMessage(
              supabase, newMood, internalThoughtForLLM, baseSystemPrompt, []
            );
          } else if (messageType === 'social_post_twitter') {
            console.log(`[Maya Behavior] Calling LLM for Twitter Post: mood: ${newMood}, thought: "${internalThoughtForLLM}"`);
            llmGeneratedContent = await generateTwitterPost(
              supabase, newMood, internalThoughtForLLM, baseSystemPrompt, [] 
            );
          }
          console.log(`[Maya Behavior] LLM-generated content: "${llmGeneratedContent.substring(0, 100)}${llmGeneratedContent.length > 100 ? '...' : ''}"`);
          messageObjectForLog.content = llmGeneratedContent;
          messageObjectForLog.type = messageType === 'dm' ? 'llm_generated_dm' : 'llm_generated_social';

        } catch (llmError: any) {
          console.error('[Maya Behavior] Error generating content with LLM:', llmError);
          messageGenerationError = llmError.message || 'LLM generation failed';
          llmGeneratedContent = `${determinedMood.messagePrefix || 'Uh oh... '}(Mood: ${newMood}, LLM fallback). Error: ${messageGenerationError}`;
          messageObjectForLog.content = llmGeneratedContent;
          messageObjectForLog.type = messageType === 'dm' ? 'template_fallback_dm' : 'template_fallback_social';
          messageObjectForLog.error = messageGenerationError;
        }
      }
      messageObjectForLog.mood_details = { mood: newMood, internal_thought: internalThoughtForLLM };

      // --- Output Handling: DM or Feed Item (Text or Image Prompt) ---
      if (messageType === 'dm') {
        const { data: sentMessageData, error: msgInsertError } = await supabase
          .from('messages')
          .insert({
            user_id: MAYA_USER_ID,
            room_id: TARGET_ROOM_ID_BLAKE, 
            content: llmGeneratedContent,
            role: 'assistant',
            metadata: { 
              mood: newMood, 
              source: 'maya-behavior-engine-dm',
              internal_thought_seed: internalThoughtForLLM,
              activation_score: parseFloat(activationScore.toFixed(2)),
              influencers_used: influencers
            },
          })
          .select('id')
          .single();
        if (msgInsertError) { 
          console.error('[Maya Behavior] Error inserting DM to public.messages:', msgInsertError);
          messageGenerationError = (messageGenerationError ? messageGenerationError + "; " : "") + msgInsertError.message; 
          if (messageObjectForLog.type === 'llm_generated_dm') messageObjectForLog.db_error = msgInsertError.message; 
        } else if (sentMessageData) { 
          actualMessageId = sentMessageData.id; 
          console.log(`[Maya Behavior] DM sent to room ${TARGET_ROOM_ID_BLAKE}, Message ID: ${actualMessageId}`);
          if (messageObjectForLog.type === 'llm_generated_dm') messageObjectForLog.id = actualMessageId;

          // ---->>>> Send Push Notification for DM <<<<----
          if (llmGeneratedContent) { // Ensure there's content to send
            const pushTitle = `New message from Maya`;
            // Truncate body for push notification if necessary
            const pushBody = llmGeneratedContent.length > 150 ? llmGeneratedContent.substring(0, 147) + '...' : llmGeneratedContent;
            const pushData = {
              roomId: TARGET_ROOM_ID_BLAKE,
              messageId: actualMessageId,
              senderId: MAYA_USER_ID,
              // Add any other data your app needs to handle the notification
            };
            // Fire and forget, or await if you need to confirm push success before proceeding
            sendExpoPushNotification(supabase, BLAKE_USER_ID, pushTitle, pushBody, pushData)
              .catch(e => console.error("[Maya Behavior] Error sending push notification:", e));
          }
          // ---->>>> End of Push Notification Logic <<<<----
        }
      } else if (messageType === 'social_post_twitter') {
        // EXISTING CODE FOR TEXT POSTS TO FEED ITEMS
        const { data: feedItemData, error: feedItemInsertError } = await supabase
          .from('feed_items')
          .insert({
            created_by_maya_profile_id: MAYA_USER_ID, 
            item_type: 'text_mood_engine', // Specific item type for text
            source_system: 'MoodEngine',
            content_data: { // For text posts
              text: llmGeneratedContent,
              mood_id: newMood,
            },
            status: 'pending_review',
            original_context: {
              internal_thought_seed: internalThoughtForLLM,
              activation_score: parseFloat(activationScore.toFixed(2)),
              influencers_used: influencers,
            },
          })
          .select('id') 
          .single();

        if (feedItemInsertError) {
          console.error('[Maya Behavior] Error inserting text feed_item:', feedItemInsertError);
          messageGenerationError = (messageGenerationError ? messageGenerationError + "; " : "") + feedItemInsertError.message;
          if (messageObjectForLog.type === 'llm_generated_social') messageObjectForLog.db_error = feedItemInsertError.message;
        } else if (feedItemData) {
          actualMessageId = feedItemData.id; 
          console.log(`[Maya Behavior] Text content added to feed_items for review, ID: ${actualMessageId}`);
          if (messageObjectForLog.type === 'llm_generated_social') messageObjectForLog.id = actualMessageId; 
        }
      } else if (messageType === 'image_post_feed' && generatedImagePromptData) {
        // NEW CODE: Insert image prompt into feed_items
        const { data: feedItemData, error: feedItemInsertError } = await supabase
          .from('feed_items')
          .insert({
            created_by_maya_profile_id: MAYA_USER_ID,
            item_type: 'image_mood_engine', // Specific item type for image prompts
            source_system: 'MoodEngine',
            content_data: { // For image prompts
              generated_image_prompt: generatedImagePromptData.fullPrompt,
              raw_image_prompt_components: generatedImagePromptData.componentsUsed,
              mood_id: newMood,
              // image_url will be null until ComfyUI generates it
            },
            status: 'prompt_generated', // New status indicating prompt is ready for ComfyUI
            original_context: {
              internal_thought_seed: internalThoughtForLLM, // Or maybe not relevant for images?
              activation_score: parseFloat(activationScore.toFixed(2)),
              influencers_used: influencers,
              base_mood_image_components: determinedMood.base_image_prompt_components,
            },
          })
          .select('id')
          .single();
        
        if (feedItemInsertError) {
          console.error('[Maya Behavior] Error inserting image prompt feed_item:', feedItemInsertError);
          messageGenerationError = (messageGenerationError ? messageGenerationError + "; " : "") + feedItemInsertError.message;
          if (messageObjectForLog.type === 'llm_generated_image_prompt') messageObjectForLog.db_error = feedItemInsertError.message;
        } else if (feedItemData) {
          actualMessageId = feedItemData.id;
          console.log(`[Maya Behavior] Image prompt added to feed_items, ID: ${actualMessageId}. Status: prompt_generated.`);
          if (messageObjectForLog.type === 'llm_generated_image_prompt') messageObjectForLog.id = actualMessageId;
        }
      }
    } else {
      console.log(`[Maya Behavior] Maya is in a '${newMood}' mood, but activation check determined no message/action should be taken.`);
      messageType = 'none';
      // Ensure messageObjectForLog is initialized even if no message is sent due to activation failure
      if (Object.keys(messageObjectForLog).length === 0) {
          messageObjectForLog = { 
              content: "[No message/action - activation check failed]", 
              type: 'no_action_activation_fail', 
              mood_details: { mood: newMood, internal_thought: internalThoughtForLLM } 
          };
      }
    }

    // --- Log Activity to 'maya_mood_activity' ---
    const activityLogEntry: any = { // Define a more specific type if possible
      mood: newMood,
      internal_thought: internalThoughtForLLM,
      // output_message_content will now depend on what was generated
      target_room_id: messageType === 'dm' ? TARGET_ROOM_ID_BLAKE : null,
      message_id: messageType === 'dm' ? actualMessageId : null, 
      metadata: {
        source: 'maya-behavior-engine',
        message_type_generated: messageType, 
        feed_item_id: (messageType === 'social_post_twitter' || messageType === 'image_post_feed') ? actualMessageId : null,
        energy_before: currentEnergy,
        activation_score: parseFloat(activationScore.toFixed(2)),
        influencers_used: influencers, 
        thought_seed: internalThoughtForLLM, 
        // message_details might need to be structured differently based on messageType
      },
      error_message: messageGenerationError, 
    };

    if (messageType === 'image_post_feed' && generatedImagePromptData) {
      activityLogEntry.output_message_content = `[Image Prompt]: ${generatedImagePromptData.fullPrompt}`;
      activityLogEntry.metadata.image_prompt_details = generatedImagePromptData;
    } else if (messageType === 'dm' || messageType === 'social_post_twitter') {
      activityLogEntry.output_message_content = llmGeneratedContent || messageObjectForLog.content; // Use llmGeneratedContent if available
    } else {
      activityLogEntry.output_message_content = messageObjectForLog.content || "[No action taken or error in generation]";
    }
    activityLogEntry.metadata.message_details_object_log = messageObjectForLog; // Keep the full object for detailed logging

    const { error: logError } = await supabase
      .from('maya_mood_activity')
      .insert(activityLogEntry);

    if (logError) {
      console.error('[Maya Behavior] Error logging mood activity to maya_mood_activity:', logError);
    } else {
      console.log('[Maya Behavior] Mood activity logged successfully.');
    }

    // --- 5. Energy Dynamics ---
    let energyChange = 0;
    if (shouldSendMessage) {
      // Apply mood-specific energy cost factor from DB-defined mood
      energyChange = - (currentConfig.energy_decay_send * determinedMood.energy_cost_factor_modifier);
    } else {
      energyChange = -currentConfig.energy_decay_no_send;
    }
    // TODO: Implement energyRechargeOnInteraction based on incoming DMs or positive feedback.
    
    const newEnergy = Math.max(0, Math.min(10, currentEnergy + energyChange)); // Clamp energy between 0-10

    const { error: updateStateError } = await supabase
      .from('maya_current_mood_state')
      .update({
        current_mood: newMood,
        energy_level: parseFloat(newEnergy.toFixed(2)),
        last_mood_update_at: new Date().toISOString(),
        last_influencers: influencers, 
      })
      .eq('user_id', MAYA_USER_ID);

    if (updateStateError) {
      console.error('[Maya Behavior] Error updating Maya\'s state in maya_current_mood_state:', updateStateError);
    } else {
      console.log(`[Maya Behavior] Maya's state updated: New Mood - ${newMood}, New Energy - ${newEnergy}`);
    }

  } catch (error) {
    console.error('[Maya Behavior] Unexpected error in Maya mood cycle:', error);
  }
}

// TODO: Add an HTTP endpoint in your memory-worker's server (e.g., Express route)
// that calls runMayaMoodCycle. This endpoint will be triggered by your Railway cron job.

// --- NEW FUNCTION: Generate Image Prompt ---
async function generateImagePrompt(
  supabase: SupabaseClient,
  currentMoodDefinition: MoodChoice,
  imagePromptStructure: string[], // From MoodConfig
  targetTheme?: string | null // Optional: to filter components by theme_tags
): Promise<{ fullPrompt: string; componentsUsed: SelectedImagePromptComponent[] } | null> {
  console.log(`[Maya Behavior] Attempting to generate image prompt for mood: ${currentMoodDefinition.mood}`);
  try {
    const { data: allComponentsFromDB, error: componentsError } = await supabase
      .from('image_prompt_components')
      .select('id, component_type, value, theme_tags, weight')
      .eq('is_active', true);

    if (componentsError) {
      console.error('[Maya Behavior] Error fetching image prompt components:', componentsError);
      return null;
    }
    if (!allComponentsFromDB || allComponentsFromDB.length === 0) {
      console.warn('[Maya Behavior] No active image prompt components found in DB.');
      return null;
    }

    const componentsUsed: SelectedImagePromptComponent[] = [];
    const promptParts: string[] = [];

    // Apply base mood-specific components first if they exist and match a type in the structure
    if (currentMoodDefinition.base_image_prompt_components) {
      for (const typeInStructure of imagePromptStructure) {
        if (currentMoodDefinition.base_image_prompt_components[typeInStructure]) {
          const value = currentMoodDefinition.base_image_prompt_components[typeInStructure];
          componentsUsed.push({ component_type: typeInStructure, value });
          promptParts.push(value);
          console.log(`[Maya Behavior] Using base mood component for ${typeInStructure}: ${value}`);
        }
      }
    }
    
    // Fill in the rest of the prompt structure with random components
    for (const componentType of imagePromptStructure) {
      // Skip if this type was already filled by a base_image_prompt_component
      if (componentsUsed.some(c => c.component_type === componentType)) {
        continue;
      }

      let eligibleComponents = allComponentsFromDB.filter(c => c.component_type === componentType);

      // Filter by theme if a targetTheme is provided
      if (targetTheme && eligibleComponents.length > 0) {
        const themeFiltered = eligibleComponents.filter(c => c.theme_tags && c.theme_tags.includes(targetTheme));
        if (themeFiltered.length > 0) {
          eligibleComponents = themeFiltered;
        } else {
          // If no components match the theme for this type, maybe allow fallback to non-themed? Or log a warning.
          console.warn(`[Maya Behavior] No components of type '${componentType}' match theme '${targetTheme}'. Falling back to any component of this type.`);
        }
      }
      
      if (eligibleComponents.length > 0) {
        // Basic random selection (can be improved with weighting later)
        const randomIndex = Math.floor(Math.random() * eligibleComponents.length);
        const chosenComponent = eligibleComponents[randomIndex];
        componentsUsed.push({ component_type: chosenComponent.component_type, value: chosenComponent.value });
        promptParts.push(chosenComponent.value);
      } else {
        console.warn(`[Maya Behavior] No active components found for type: ${componentType}`);
        // Optional: could add a fallback default for this type or skip it
      }
    }

    if (promptParts.length === 0) {
      console.warn('[Maya Behavior] Could not construct any parts for the image prompt.');
      return null;
    }

    const fullPrompt = promptParts.join(', ');
    console.log(`[Maya Behavior] Generated image prompt: "${fullPrompt}"`);
    return { fullPrompt, componentsUsed };

  } catch (e) {
    console.error('[Maya Behavior] Exception in generateImagePrompt:', e);
    return null;
  }
}

/**
 * Extracts facts from text using NLP techniques
 * This is a placeholder that would be implemented in the memory-worker
 */
export async function extractFactsFromText(
  text: string,
  userId: string,
  sourceRef: any
): Promise<Omit<MayaFact, 'id' | 'created_at' | 'embedding'>[]> { // Changed Fact to MayaFact
  // This would be implemented in the memory-worker package
  // For now, return an empty array as a placeholder
  return [];
}