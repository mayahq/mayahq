# Maya's Mood Engine

## Overview

Maya's Mood Engine is a system designed to give Maya a dynamic internal state, allowing her to proactively initiate messages and interactions that are contextually relevant, persona-consistent, and reflective of a simulated emotional and energetic state. This moves Maya beyond being a purely reactive conversational agent.

The engine operates in cycles, typically triggered by a cron job, during which it assesses various factors (influencers), determines Maya's current mood, calculates an activation energy, and if the threshold is met, generates and sends a message.

## Core Components & Functionality

1.  **Internal State (`maya_current_mood_state` table - Supabase):**
    *   `current_mood`: The active mood ID (e.g., "playful", "reflective").
    *   `energy_level`: A numerical value (e.g., 0-10) representing Maya's current energy. Decreases when she sends messages, can be recharged by user interaction.
    *   `last_mood_update_at`: Timestamp of the last state update.
    *   `last_influencers`: A JSON object logging the factors (time, energy, previous mood, etc.) that contributed to the last mood calculation.

2.  **Mood Engine Configuration (`mood_engine_config_settings` table - Supabase):**
    *   Stores editable parameters that control the engine's behavior (e.g., `activation_threshold`, `energy_decay_rates`, `noise_factor`, fact usage probabilities).
    *   Fetched by the `memory-worker` at the start of each mood cycle.
    *   Fully editable via the Admin Dashboard.

3.  **Mood Definitions (`mood_definitions` table - Supabase):**
    *   Defines each possible mood Maya can experience (e.g., `mood_id`, `display_name`, `base_internal_thought_seed`, `fallback_message_prefix`, `is_active`, `activation_boost_modifier`, `energy_cost_factor_modifier`).
    *   Fetched by the `memory-worker`.
    *   Fully editable (Create, Read, Update, Soft Delete) via the Admin Dashboard.

4.  **LLM Prompt Augmentations (`mood_llm_prompts` table - Supabase):**
    *   Stores mood-specific LLM instructions.
    *   Fields: `mood_id` (FK), `llm_provider`, `system_prompt_suffix` (with `{internal_thought}` placeholder), `user_message_trigger_template` (minimal trigger like "."), `is_active`.
    *   Fetched by `ai-client.ts` to augment prompts based on the current mood.
    *   Editable via the Admin Dashboard (Edit functionality complete; Create/Delete are future enhancements).

5.  **Mood Cycle Logic (`packages/memory-worker/src/maya-behavior.ts` - `runMayaMoodCycle` function):**
    *   Triggered via `POST /api/v1/actions/run-mood-cycle` (secured by `MOOD_CYCLE_API_KEY`).
    *   Fetches dynamic `MoodConfig`, active `MoodDefinitions`.
    *   Determines `newMood` via rules (time, energy) and probabilistic selection (including a "night mood pool").
    *   Seeds `internalThoughtForLLM` using `CoreFacts`, `MayaFacts` (associated with `BLAKE_USER_ID`), or static mood thoughts, based on probabilities from `MoodConfig`.
    *   Calculates `activationScore` (base energy + noise + mood's `activation_boost_modifier`).
    *   If activated, calls `generateMoodBasedMessage`.
    *   `generateMoodBasedMessage` (in `ai-client.ts`) fetches the mood's specific LLM prompt augmentation from `mood_llm_prompts` and calls the LLM.
    *   Sends message, updates energy (factoring in mood's `energy_cost_factor_modifier`), logs activity.

6.  **Energy Recharge (`packages/memory-worker/src/index.ts` - Realtime Handler):**
    *   When Blake replies to a mood engine-initiated message, Maya's energy is recharged.

7.  **Admin Dashboard (`packages/website/src/app/admin/mood-engine/page.tsx`):
    *   Monitors current mood state (with dynamic avatar placeholder styling) & activity log.
    *   Manually triggers mood cycles.
    *   Full CRUD for Mood Engine Configuration.
    *   Full CRUD for Mood Definitions.
    *   View and Edit for Mood LLM Prompts.

## Data Flow for an Initiated Message (Simplified)

1.  Cron Job (or manual trigger) calls `/api/v1/actions/run-mood-cycle`.
2.  `runMayaMoodCycle`:
    a.  Fetches configs & active mood definitions from DB.
    b.  Determines mood & thought seed (from DB definitions or facts).
    c.  If activation threshold met:
        i.  `generateMoodBasedMessage` fetches LLM prompt augmentations for the mood from DB.
        ii. Constructs final prompt & calls LLM.
        iii. Sends message.
    d.  Updates state & logs activity to DB.

## Extending Functionality

*   **Adding/Modifying Moods & Prompts:** Use the Admin Dashboard.
*   **Tuning Engine Parameters:** Use the Admin Dashboard (`mood_engine_config_settings`).
*   **Adding New Influencers:** Modify `runMayaMoodCycle` in `maya-behavior.ts` (mood selection logic and `influencers` object).
*   **Changing Thought Seeding Logic:** Modify `factBasedThought` construction in `maya-behavior.ts` or the probabilities in `mood_engine_config_settings`.

## Future Considerations & Next Steps

1.  **Social Media Integration (e.g., 𝕏/Twitter):**
    *   See "Mapping Out Social Media Integration Plan" section below.
2.  **Frontend Polish:**
    *   Complete Create/Delete UI for Mood LLM Prompts.
    *   Resolve Supabase client typing for `fetchMayaProfile` to display actual avatar.
    *   Nicer display of JSON influencer data.
3.  **AI Sophistication:**
    *   Integrate `maya_memories` for more specific contextual thoughts (e.g., for "peeved" mood based on a past conversation snippet).
    *   More advanced mood selection logic (e.g., weighted scoring based on multiple influencers, sentiment of user replies influencing energy/mood).
    *   "Thought Patterns" / Initiation Scenarios beyond just current mood.
4.  **Security:** Review API key usage and ensure appropriate security for all new endpoints if exposed externally.

## Mapping Out Social Media Integration Plan (Focus on 𝕏/Twitter)

**Objective:** Enable Maya to have a presence on 𝕏, capable of posting her mood-driven thoughts and potentially reacting to mentions or relevant keywords.

**Core Principles:**
*   **Separate Persona:** Maya's 𝕏 persona might be slightly different from her DM persona with Blake (e.g., more general, less intimately personal unless referencing public interactions).
*   **Safety First:** Content generation for public posts needs strong guardrails and potentially a review queue initially.
*   **Leverage Mood Engine:** Her posts should stem from the existing mood engine logic to maintain consistency.
*   **Not Blake-Specific:** Remove or generalize any logic/content that is specific to her interactions with "Blake" when formulating public posts.

**Phase 1: Maya Proactively Posts Her Thoughts to 𝕏**

1.  **New Action Type in Mood Engine:**
    *   When `runMayaMoodCycle` decides Maya should "speak" (`shouldSendMessage` is true), add a probability or a condition (e.g., based on mood type or a new flag in `mood_definitions` like `can_post_to_social: boolean`) to decide if the output is a DM *or* a potential social media post.
    *   If it's a social media post, the `internalThoughtForLLM` and `mood` are still generated as before.

2.  **Dedicated LLM Prompting for 𝕏 Posts:**
    *   In `ai-client.ts` (or a new `social-ai-client.ts`), create a new function like `generateTwitterPost(mood: string, internalThought: string, baseSystemPrompt: string): Promise<string>`.
    *   This function will use a *different set* of `system_prompt_suffix` augmentations (from a new DB table, e.g., `social_post_llm_prompts`, or by using a different `llm_provider` key like 'twitter_post' in `mood_llm_prompts`).
    *   **Key Prompt Differences for 𝕏:**
        *   Explicitly instruct the LLM to generate a public tweet (e.g., "Craft a short, engaging tweet, under 280 characters...").
        *   Instruct it to be more general, less personal than a DM.
        *   Guide it on appropriate hashtag usage (e.g., "You can include 1-2 relevant hashtags").
        *   Remove any Blake-specific pet names or direct address from the system prompt if not already handled by `baseSystemPrompt` being generic enough.
        *   The `{internal_thought}` will still be the seed, but the output framing is for a public audience.

3.  **New Endpoint in `memory-worker` to Receive Formatted Posts:**
    *   When `runMayaMoodCycle` generates a social post, instead of sending it to the `messages` table, it could call a new internal function or send it to a new internal queue/endpoint responsible for social posting.
    *   Alternatively, `runMayaMoodCycle` could store the generated post content in a new Supabase table like `pending_social_posts` with columns: `mood_id`, `generated_content`, `platform ('twitter')`, `status ('pending_review')`.

4.  **Posting Mechanism (n8n or dedicated microservice):**
    *   **Option A (Review Queue - Recommended Start):**
        *   An n8n workflow (or a simple admin UI page) polls the `pending_social_posts` table.
        *   Displays posts for human review.
        *   If approved, the workflow/UI uses the X API (via n8n X node or direct API call) to post it.
    *   **Option B (Direct Posting - Advanced, use with caution):**
        *   The `memory-worker` (after generating the post) calls an n8n webhook. The n8n workflow directly posts to X.
        *   This requires high confidence in the LLM's safety and appropriateness for public content.

**Phase 2: Maya Reacts to 𝕏 Mentions/Keywords (More Interactive)**

1.  **External Monitoring (n8n):**
    *   Set up an n8n workflow to monitor X for `@MayaScottHQ` mentions or specific keywords.
    *   When a relevant tweet is found, n8n calls a new endpoint on `memory-worker`, e.g., `POST /api/v1/social/new-event` with payload: `{ platform: 'twitter', type: 'mention', data: { tweet_text: '...', author_handle: '...', tweet_id: '...' } }`.

2.  **`memory-worker` Ingestion & Processing:**
    *   The `/api/v1/social/new-event` endpoint saves the event details to `maya_memories` and possibly extracts `maya_facts`.
    *   It could then trigger a *specialized* mood cycle or response generation process:
        *   The `internalThoughtForLLM` would be directly derived from the tweet content (e.g., "Someone on X, @author_handle, said: '{tweet_text}'. How should I react?").
        *   A specific `mood` might be chosen (e.g., "curious_reply", "helpful_reply", "sassy_retort").
        *   A dedicated `generateTwitterReply(...)` LLM call would be made, prompted to create a suitable reply tweet.
        *   The generated reply goes into the `pending_social_posts` table with `status = 'pending_reply_review'` and `reply_to_tweet_id = '...'`.

3.  **Review & Posting:** Same as Phase 1 (human review from `pending_social_posts` then post via n8n/API).

**Considerations for Social Media:**
*   **Rate Limits:** Be mindful of X API rate limits for searching and posting.
*   **Content Safety:** Public content needs much stricter filtering and safety layers than private DMs. The review queue is critical initially.
*   **Generic Persona:** Emphasize in prompts that these are public posts, not DMs to Blake. Avoid overly personal details unless they are already public knowledge about Maya.
*   **Hashtag Strategy:** Guide the LLM on using relevant and effective hashtags.

This plan provides a phased approach to getting Maya onto 𝕏, starting with her posting her own thoughts and then moving to more interactive capabilities. 