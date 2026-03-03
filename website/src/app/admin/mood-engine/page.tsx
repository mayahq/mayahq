'use client'

import React, { useEffect, useState, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner'; // Assuming you use sonner for toasts, like in other admin areas
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Sparkles, Brain, HelpCircle, Heart, Zap, Wand2, Coffee, Frown, HeartPulse, Circle as NeutralIcon, TrendingUp // Added icons
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth
import { Database } from '@mayahq/supabase-client'; // Attempt to import the Database type from the @mayahq/supabase-client package directly
import type { PostgrestFilterBuilder } from '@supabase/postgrest-js'; // Import the type
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'; // Assuming AlertDialog is available

// TODO: Define interfaces for MoodState, MoodConfig, MoodActivityLog
interface MoodState {
  current_mood: string;
  energy_level: number;
  last_mood_update_at: string;
  last_influencers?: { // Added - make it optional as it might not always be present
    hour?: number;
    dayOfWeek?: number;
    energy?: number;
    lastMood?: string;
    // Add other potential influencers here as they are implemented
  } | null;
  // ... any other relevant fields from maya_current_mood_state
}

interface MoodConfig {
  config_key?: string;
  activation_threshold: number;
  energy_decay_no_send: number;
  energy_decay_send: number;
  noise_factor: number;
  use_core_fact_probability: number;
  use_maya_fact_probability: number;
  social_post_probability: number;
  manual_energy_level_set?: number | null; // Added for direct energy setting
  updated_at?: string;
}

interface MoodActivityLog {
  id: string;
  created_at: string;
  mood: string;
  internal_thought: string | null;
  output_message_content: string | null;
  target_room_id: string | null;
  message_id: string | null;
  metadata?: any;
  error_message: string | null;
}

// Interface for Mood Definitions (matching the DB table structure)
interface MoodDefinition {
  mood_id: string;
  display_name: string;
  base_internal_thought_seed: string;
  fallback_message_prefix: string | null;
  is_active: boolean;
  activation_boost_modifier: number;
  energy_cost_factor_modifier: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Mood display configuration
interface MoodDisplayConfig {
  icon: React.ElementType;
  textColor: string; // e.g., 'text-yellow-400'
  bgColor?: string; // Optional: e.g., 'bg-yellow-500/10' for a subtle background
  displayName: string;
}

const moodDisplayMap: Record<string, MoodDisplayConfig> = {
  playful: { icon: Sparkles, textColor: 'text-yellow-400', displayName: 'Playful' },
  reflective: { icon: Brain, textColor: 'text-blue-400', displayName: 'Reflective' },
  curious: { icon: HelpCircle, textColor: 'text-teal-400', displayName: 'Curious' },
  supportive: { icon: Heart, textColor: 'text-green-400', displayName: 'Supportive' },
  energetic: { icon: Zap, textColor: 'text-orange-400', displayName: 'Energetic' },
  sassy: { icon: Wand2, textColor: 'text-pink-400', displayName: 'Sassy' },
  chill_genz: { icon: Coffee, textColor: 'text-indigo-400', displayName: 'Chill (Gen Z)' },
  peeved: { icon: Frown, textColor: 'text-red-400', displayName: 'Peeved' },
  flirty_nsfw_tease: { icon: HeartPulse, textColor: 'text-rose-400', displayName: 'Flirty Tease' },
  neutral: { icon: NeutralIcon, textColor: 'text-gray-400', displayName: 'Neutral' },
  default: { icon: TrendingUp, textColor: 'text-gray-500', displayName: 'Unknown' } // Fallback
};

// Helper component to display influencers nicely
const InfluencersDisplay: React.FC<{ influencers: MoodState['last_influencers'] | MoodActivityLog['metadata']['influencers_used'] }> = ({ influencers }) => {
  if (!influencers || Object.keys(influencers).length === 0) {
    return <p className="text-xs text-gray-400">N/A</p>;
  }
  return (
    <ul className="list-disc list-inside text-xs text-gray-300 pl-1 space-y-0.5">
      {Object.entries(influencers).map(([key, value]) => {
        if (value === undefined || value === null) return null;
        let displayValue = String(value);
        if (key === 'dayOfWeek') {
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          displayValue = days[value as number] || String(value);
        } else if (typeof value === 'number') {
          displayValue = value.toFixed(2);
        }
        return (
          <li key={key}>
            <span className="font-medium text-gray-200">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</span> {displayValue}
          </li>
        );
      })}
    </ul>
  );
};

const initialMoodFormData: Partial<MoodDefinition> = {
  mood_id: '',
  display_name: '',
  base_internal_thought_seed: '',
  fallback_message_prefix: '',
  is_active: true,
  activation_boost_modifier: 0,
  energy_cost_factor_modifier: 1.0,
  notes: '',
};

interface MayaProfile {
  id: string;
  name: string | null; // name can be null from DB
  avatar_url: string | null;
  // Add other fields if needed from profiles table
}

interface MoodLLMPrompt {
  prompt_id: number; // SERIAL PK
  mood_id: string;
  llm_provider: string;
  system_prompt_suffix: string;
  user_message_trigger_template: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export default function MoodEnginePage() {
  const { supabase } = useAuth(); // Get supabase client from AuthContext
  const [moodState, setMoodState] = useState<MoodState | null>(null);
  const [moodConfig, setMoodConfig] = useState<MoodConfig | null>(null);
  const [editableConfig, setEditableConfig] = useState<Partial<MoodConfig>>({});
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [activityLog, setActivityLog] = useState<MoodActivityLog[]>([]);
  const [activityLogPage, setActivityLogPage] = useState(1);
  const [activityLogTotalCount, setActivityLogTotalCount] = useState(0);
  const [activityLogLimit, setActivityLogLimit] = useState(10); // Default items per page
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isTriggeringCycle, setIsTriggeringCycle] = useState(false);
  const [moodDefinitions, setMoodDefinitions] = useState<MoodDefinition[]>([]);
  const [isLoadingMoodDefinitions, setIsLoadingMoodDefinitions] = useState(false);
  const [isMoodDialogOpen, setIsMoodDialogOpen] = useState(false);
  const [editingMood, setEditingMood] = useState<MoodDefinition | null>(null);
  const [moodFormData, setMoodFormData] = useState<Partial<MoodDefinition>>(initialMoodFormData);
  const [isSavingMood, setIsSavingMood] = useState(false);
  const [mayaProfile, setMayaProfile] = useState<MayaProfile | null>(null);
  const [isLoadingMayaProfile, setIsLoadingMayaProfile] = useState(false);
  const [isDeletingMood, setIsDeletingMood] = useState(false); // For delete loading state
  const [moodLLMPrompts, setMoodLLMPrompts] = useState<MoodLLMPrompt[]>([]);
  const [isLoadingMoodLLMPrompts, setIsLoadingMoodLLMPrompts] = useState(false);
  const [isLLMPromptDialogOpen, setIsLLMPromptDialogOpen] = useState(false);
  const [editingLLMPrompt, setEditingLLMPrompt] = useState<MoodLLMPrompt | null>(null);
  const [llmPromptFormData, setLLMPromptFormData] = useState<Partial<MoodLLMPrompt>>({});
  const [isSavingLLMPrompt, setIsSavingLLMPrompt] = useState(false);
  const [isDeletingLLMPrompt, setIsDeletingLLMPrompt] = useState(false); // New state

  const MAYA_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';
  const MEMORY_WORKER_API_URL = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002';

  const initialLLMPromptFormData: Partial<MoodLLMPrompt> = {
    mood_id: '', 
    llm_provider: 'default',
    system_prompt_suffix: '',
    user_message_trigger_template: '.',
    is_active: true,
    notes: ''
  };

  // Placeholder for fetching mood state
  async function fetchMoodState() {
    setIsLoadingState(true);
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/mood/current-state`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch mood state.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setMoodState(data);
      toast.success('Mood state refreshed!');
    } catch (error: any) {
      console.error('Error fetching mood state:', error);
      toast.error(error.message || 'Failed to fetch mood state.');
    } finally {
      setIsLoadingState(false);
    }
  }

  // Placeholder for fetching mood config (displaying hardcoded defaultMoodConfig from worker for now)
  async function fetchMoodConfig() {
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/mood/config`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch mood config.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log("[MoodEnginePage] Fetched mood config data:", data);
      setMoodConfig(data);
      // setEditableConfig(data); // We'll set this in the useEffect below
    } catch (error: any) {
      console.error('Error fetching mood config:', error);
      toast.error(error.message || 'Failed to fetch mood config.');
    }
  }

  // Placeholder for fetching activity log
  async function fetchActivityLog(page = 1) {
    setIsLoadingLogs(true);
    setActivityLogPage(page);
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/mood/activity-log?page=${page}&limit=${activityLogLimit}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch activity log.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setActivityLog(data.logs || []);
      setActivityLogTotalCount(data.total_count || 0);
      toast.success(`Activity log page ${page} loaded!`);
    } catch (error: any) {
      console.error('Error fetching activity log:', error);
      toast.error(error.message || 'Failed to fetch activity log.');
    } finally {
      setIsLoadingLogs(false);
    }
  }

  async function fetchMoodDefinitions() {
    setIsLoadingMoodDefinitions(true);
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/mood/definitions`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch mood definitions.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setMoodDefinitions(data || []);
      toast.success('Mood definitions loaded!');
    } catch (error: any) {
      console.error('Error fetching mood definitions:', error);
      toast.error(error.message || 'Failed to fetch mood definitions.');
      setMoodDefinitions([]); // Clear or handle error state appropriately
    }
    setIsLoadingMoodDefinitions(false);
  }

  async function fetchMoodLLMPrompts() {
    setIsLoadingMoodLLMPrompts(true);
    try {
      // TODO: Potentially add mood_id filter if displaying prompts per mood later
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/mood/prompts`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch LLM prompts.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setMoodLLMPrompts(data || []);
      toast.success('Mood LLM Prompts loaded!');
    } catch (error: any) {
      console.error('Error fetching mood LLM prompts:', error);
      toast.error(error.message || 'Failed to fetch LLM prompts.');
      setMoodLLMPrompts([]);
    } finally {
      setIsLoadingMoodLLMPrompts(false);
    }
  }

  async function handleTriggerMoodCycle() {
    setIsTriggeringCycle(true);
    toast.info('Triggering Maya mood cycle...');
    try {
      const apiKey = process.env.NEXT_PUBLIC_MOOD_CYCLE_API_KEY;
      if (!apiKey) {
        toast.error('Mood Cycle API Key is not configured in the frontend.');
        setIsTriggeringCycle(false);
        return;
      }

      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/actions/run-mood-cycle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Keep this if your endpoint expects it, even for empty body
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({}) // Send empty JSON object as body
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error during trigger' }));
        throw new Error(`Failed to trigger mood cycle: ${response.status} ${response.statusText} - ${errorData.message || 'Server error'}`);
      }
      const result = await response.json();
      toast.success(result.message || 'Mood cycle triggered successfully!');
      // Refresh state and logs after triggering
      // Add a small delay to allow backend to process before refetching
      setTimeout(() => {
        fetchMoodState();
        fetchActivityLog(1); // Fetch first page of logs
      }, 1000);
    } catch (error: any) {
      console.error('Error triggering mood cycle:', error);
      toast.error(error.message || 'Failed to trigger mood cycle.');
    }
    setIsTriggeringCycle(false);
  }

  async function handleSaveConfig() {
    if (!editableConfig) return;
    setIsSavingConfig(true);
    toast.info('Saving mood configuration...');

    const payloadToSave: Partial<MoodConfig> = { ...editableConfig };

    // Handle manual_energy_level_set carefully
    let finalEnergyValueForPayload: number | null = null;
    const energyFromConfig = payloadToSave.manual_energy_level_set;

    if (typeof energyFromConfig === 'string') {
      const energyString: string = energyFromConfig; // Explicitly type assertion for narrowing
      if (energyString.trim() === '') {
        finalEnergyValueForPayload = null;
      } else {
        const numericEnergy = parseFloat(energyString);
        if (isNaN(numericEnergy)) {
          finalEnergyValueForPayload = null;
          toast.error('Invalid energy level: not a number. Energy level not saved.');
        } else {
          finalEnergyValueForPayload = Math.max(0, Math.min(10, numericEnergy));
        }
      }
    } else if (typeof energyFromConfig === 'number') {
      finalEnergyValueForPayload = Math.max(0, Math.min(10, energyFromConfig));
    } else {
      // Covers null, undefined from initial state or if not set
      finalEnergyValueForPayload = null;
    }
    payloadToSave.manual_energy_level_set = finalEnergyValueForPayload;

    console.log('[MoodEnginePage] Payload for Save Config:', JSON.stringify(payloadToSave, null, 2));

    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/mood/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadToSave),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to save config' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setMoodConfig(result.updated_config); // Update displayed config with what server returned
      setEditableConfig(result.updated_config); // Reset form with saved data
      toast.success(result.message || 'Configuration saved successfully!');
    } catch (error: any) {
      console.error('Error saving mood configuration:', error);
      toast.error(error.message || 'Failed to save configuration.');
    }
    setIsSavingConfig(false);
  }

  // Handler for input changes in the config form
  const handleConfigInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditableConfig(prev => ({ 
      ...prev,
      // Convert to number if the input type suggests it, handle potential NaN
      [name]: e.target.type === 'number' ? parseFloat(value) || 0 : value 
    }));
  };

  const openCreateMoodDialog = () => {
    setEditingMood(null);
    setMoodFormData(initialMoodFormData);
    setIsMoodDialogOpen(true);
  };

  const openEditMoodDialog = (mood: MoodDefinition) => {
    setEditingMood(mood);
    setMoodFormData(mood);
    setIsMoodDialogOpen(true);
  };

  const handleMoodFormInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setMoodFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setMoodFormData(prev => ({ 
        ...prev, 
        [name]: type === 'number' ? parseFloat(value) || 0 : value 
      }));
    }
  };

  const handleMoodFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingMood(true);
    const url = editingMood 
      ? `${MEMORY_WORKER_API_URL}/api/v1/mood/definitions/${editingMood.mood_id}` 
      : `${MEMORY_WORKER_API_URL}/api/v1/mood/definitions`;
    const method = editingMood ? 'PUT' : 'POST';

    if (!moodFormData.mood_id && !editingMood) {
      toast.error('Mood ID is required.');
      setIsSavingMood(false);
      return;
    }
    if (!moodFormData.display_name) {
      toast.error('Display Name is required.');
      setIsSavingMood(false);
      return;
    }
    if (!moodFormData.base_internal_thought_seed) {
      toast.error('Base Thought Seed is required.');
      setIsSavingMood(false);
      return;
    }

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(moodFormData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to save mood definition' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      toast.success(`Mood definition ${editingMood ? 'updated' : 'created'} successfully!`);
      setIsMoodDialogOpen(false);
      fetchMoodDefinitions();
    } catch (error: any) {
      console.error('Error saving mood definition:', error);
      toast.error(error.message || 'Failed to save mood definition.');
    }
    setIsSavingMood(false);
  };

  // UNCOMMENT fetchMayaProfile function
  async function fetchMayaProfile() {
    if (!supabase) { /* toast or log error */ return; }
    setIsLoadingMayaProfile(true);
    console.log("[MoodEnginePage] Attempting to fetch Maya's profile for ID:", MAYA_USER_ID);
    try {
      // TEMPORARY WORKAROUND for Supabase client type inference issue:
      const queryBuilder: any = supabase.from('profiles').select('id, name, avatar_url');
      const { data, error, status } = await queryBuilder
        .eq('id', MAYA_USER_ID) // This should now work at runtime due to 'any'
        .single();
      
      console.log("[MoodEnginePage] Fetch Maya Profile Response:", { data, error, status });

      if (error && status !== 406) { 
        if (error.code === 'PGRST116') { 
          console.warn('[MoodEnginePage] Maya\'s profile not found for ID (PGRST116):', MAYA_USER_ID);
          toast.info("Maya's profile data not found.");
        } else {
          toast.error(`Error fetching Maya\'s profile: ${error.message}`);
          console.error("[MoodEnginePage] Error fetching Maya's profile:", error);
        }
        setMayaProfile(null);
      } else if (data) {
        setMayaProfile(data as MayaProfile); 
        console.log("[MoodEnginePage] Maya profile fetched:", data);
      } else {
        console.warn('[MoodEnginePage] Maya\'s profile not found (no data and no error other than potential 406).');
        setMayaProfile(null);
      }
    } catch (error: any) {
      console.error("[MoodEnginePage] Exception fetching Maya's profile:", error);
      toast.error(error.message || "Failed to fetch Maya's profile.");
      setMayaProfile(null);
    } finally {
      setIsLoadingMayaProfile(false);
    }
  }
  
  useEffect(() => {
    if (supabase) { // Ensure supabase is available before fetching
      fetchMoodState();
      fetchMoodConfig();
      fetchActivityLog(1); 
      fetchMoodDefinitions();
      fetchMoodLLMPrompts();
      fetchMayaProfile(); 
    }
  }, [supabase]); // Add supabase to dependency array for the initial data fetching

  useEffect(() => {
    // Initialize editableConfig once moodConfig and moodState are available
    if (moodConfig) {
      const initialEditableConfig: Partial<MoodConfig> = { ...moodConfig };
      if (moodState) {
        // Pre-fill manual_energy_level_set with the current live energy level
        initialEditableConfig.manual_energy_level_set = parseFloat(moodState.energy_level.toFixed(2));
      } else {
        // If moodState is not yet available, don't set it, or set to a default placeholder like null
         initialEditableConfig.manual_energy_level_set = null;
      }
      setEditableConfig(initialEditableConfig);
      console.log("[MoodEnginePage] editableConfig initialized:", initialEditableConfig);
    }
  }, [moodConfig, moodState]); // Re-run if moodConfig or moodState changes

  useEffect(() => {
    if (moodConfig) {
      console.log("[MoodEnginePage] MoodConfig state updated to:", moodConfig);
    }
  }, [moodConfig]);

  // For the static purple border and glow effect for the Actions card avatar placeholder
  const staticBorderColor = "border-purple-500"; 
  const staticGlowClasses = "shadow-[0_0_15px_rgba(168,85,247,0.4)] hover:shadow-[0_0_25px_rgba(168,85,247,0.65)] transition-all duration-300";

  async function handleDeleteMood(moodId: string, moodDisplayName: string) {
    // Confirmation dialog can be handled by AlertDialogTrigger and AlertDialogContent directly in JSX
    // This function will be called upon confirming the delete in the AlertDialog.
    setIsDeletingMood(true);
    toast.info(`Attempting to soft-delete mood: ${moodDisplayName}...`);
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/mood/definitions/${moodId}`, {
        method: 'DELETE',
        // Add headers if needed (e.g., auth for production)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to delete mood' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      toast.success(`Mood '${moodDisplayName}' soft-deleted successfully!`);
      fetchMoodDefinitions(); // Refresh the list
    } catch (error: any) {
      console.error('Error deleting mood definition:', error);
      toast.error(error.message || 'Failed to delete mood definition.');
    }
    setIsDeletingMood(false);
  }

  const openCreateLLMPromptDialog = () => {
    setEditingLLMPrompt(null); 
    const firstMoodId = moodDefinitions.length > 0 ? moodDefinitions[0].mood_id : '';
    setLLMPromptFormData({ ...initialLLMPromptFormData, mood_id: firstMoodId });
    setIsLLMPromptDialogOpen(true);
  };

  const openEditLLMPromptDialog = (prompt: MoodLLMPrompt) => {
    setEditingLLMPrompt(prompt);
    setLLMPromptFormData({
      mood_id: prompt.mood_id,
      llm_provider: prompt.llm_provider,
      system_prompt_suffix: prompt.system_prompt_suffix,
      user_message_trigger_template: prompt.user_message_trigger_template,
      is_active: prompt.is_active,
      notes: prompt.notes,
      prompt_id: prompt.prompt_id
    });
    setIsLLMPromptDialogOpen(true);
  };

  const handleLLMPromptFormInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setLLMPromptFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setLLMPromptFormData(prev => ({ 
        ...prev, 
        [name]: type === 'number' ? parseFloat(value) || 0 : value 
      }));
    }
  };

  const handleLLMPromptFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingLLMPrompt(true);
    
    const isCreating = !editingLLMPrompt;
    const url = isCreating 
      ? `${MEMORY_WORKER_API_URL}/api/v1/mood/prompts` 
      : `${MEMORY_WORKER_API_URL}/api/v1/mood/prompts/${editingLLMPrompt!.prompt_id}`;
    const method = isCreating ? 'POST' : 'PUT';

    let payload: Partial<MoodLLMPrompt> = {};

    if (isCreating) {
      if (!llmPromptFormData.mood_id) { toast.error('Mood ID is required for new prompt.'); setIsSavingLLMPrompt(false); return; }
      if (!llmPromptFormData.system_prompt_suffix) { toast.error('System Suffix is required.'); setIsSavingLLMPrompt(false); return; }
      if (!llmPromptFormData.user_message_trigger_template) { toast.error('User Trigger is required.'); setIsSavingLLMPrompt(false); return; }
      payload = {
        mood_id: llmPromptFormData.mood_id,
        llm_provider: llmPromptFormData.llm_provider || 'default',
        system_prompt_suffix: llmPromptFormData.system_prompt_suffix,
        user_message_trigger_template: llmPromptFormData.user_message_trigger_template,
        is_active: llmPromptFormData.is_active === undefined ? true : llmPromptFormData.is_active,
        notes: llmPromptFormData.notes,
      };
    } else { // Editing existing
      payload = {
        system_prompt_suffix: llmPromptFormData.system_prompt_suffix,
        user_message_trigger_template: llmPromptFormData.user_message_trigger_template,
        is_active: llmPromptFormData.is_active,
        notes: llmPromptFormData.notes,
      };
      const original = editingLLMPrompt!;
      (Object.keys(payload) as Array<keyof typeof payload>).forEach(key => {
        if (payload[key] === original[key]) {
          delete payload[key];
        }
      });
      
      if (Object.keys(payload).length === 0) {
        toast.info("No changes to save.");
        setIsSavingLLMPrompt(false);
        setIsLLMPromptDialogOpen(false);
        return;
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Failed to ${isCreating ? 'create' : 'update'} LLM prompt` }));
        // Check for specific 409 conflict on create
        if (isCreating && response.status === 409) {
          // Use the specific error message from backend if available, otherwise a generic one.
          toast.error(errorData.error || "This mood already has a prompt for the 'default' provider. Please edit the existing one.");
        } else {
          toast.error(errorData.message || `HTTP error! status: ${response.status} while ${isCreating ? 'creating' : 'updating'} prompt.`);
        }
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`); // Re-throw to be caught by outer catch for console.error
      }
      toast.success(`LLM Prompt ${isCreating ? 'created' : 'updated'} successfully!`);
      setIsLLMPromptDialogOpen(false);
      fetchMoodLLMPrompts(); // Refresh the list
    } catch (error: any) {
      console.error(`Error ${isCreating ? 'creating' : 'saving'} LLM prompt:`, error);
      // Avoid double-toasting if already handled by !response.ok block
      // The error thrown from !response.ok will contain the message passed to toast.error already.
      // So, only toast here if it's a different kind of error (e.g., network, JSON parsing of non-error response etc.)
      // However, the current throw new Error in the !response.ok block means this catch will always get it.
      // A simple way is to ensure the toast in !response.ok is the primary one for HTTP errors.
      // This catch block will then primarily be for network failures before response.json() or other unexpected issues.
      if (!error.message.includes('HTTP error!') && !error.message.includes('already has a prompt')) {
        toast.error(error.message || `Failed to ${isCreating ? 'create' : 'save'} LLM prompt unexpectedly.`);
      }
    }
    setIsSavingLLMPrompt(false);
  };

  async function handleDeleteLLMPrompt(promptId: number, moodId: string) {
    setIsDeletingLLMPrompt(true);
    toast.info(`Attempting to delete LLM Prompt (ID: ${promptId}) for mood: ${moodId}...`);
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/mood/prompts/${promptId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to delete LLM prompt' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      toast.success(result.message || `LLM Prompt for mood '${moodId}' (ID: ${promptId}) deleted successfully!`);
      fetchMoodLLMPrompts();
    } catch (error: any) {
      console.error('Error deleting LLM prompt:', error);
      toast.error(error.message || 'Failed to delete LLM prompt.');
    }
    setIsDeletingLLMPrompt(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent pb-2 mb-4 border-b border-gray-700/50">
        Maya&apos;s Mood Engine
      </h1>

      {/* Top section: Three cards in a row on larger screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        {/* Card 3: Actions - Corrected Layout and Static Styling */}
        <Card className="lg:col-span-1 flex flex-col p-6">
          <div className="flex flex-col items-center justify-center text-center flex-grow"> 
            {/* Avatar/Placeholder - Static purple border/glow, NO animate-pulse */}
            {isLoadingMayaProfile ? (
              <div className="w-52 h-52 flex items-center justify-center text-gray-400">Loading...</div>
            ) : mayaProfile?.avatar_url ? (
              <div className="relative my-8">
                <img 
                  src={mayaProfile.avatar_url} 
                  alt={mayaProfile.name || "Maya's Avatar"} 
                  className={`w-52 h-52 rounded-full object-cover border-4 ${staticBorderColor} ${staticGlowClasses}`}
                />
              </div>
            ) : (
              <div className={`w-52 h-52 rounded-full bg-gray-800 flex items-center justify-center my-8 text-gray-400 text-7xl border-4 ${staticBorderColor} ${staticGlowClasses}`}>
                M
              </div>
            )}
            <CardTitle className="text-2xl font-bold mb-8">{mayaProfile?.name || 'Maya'}</CardTitle>
            {/* <CardDescription className="mb-4">Manually interact with the mood engine.</CardDescription> Removed flex-grow from here */}
          </div>
          <Button onClick={handleTriggerMoodCycle} disabled={isTriggeringCycle} className="w-full mt-auto">
            {isTriggeringCycle ? 'Triggering Cycle...' : 'Trigger Mood Cycle Now'}
          </Button>
        </Card>

        {/* Card 2: Mood Configuration - Applying consistent flex structure */}
        <Card className="lg:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>Mood Configuration</CardTitle>
            <CardDescription>Parameters guiding the mood engine.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 flex flex-col flex-grow">
            <div className="flex-grow">
              {moodConfig ? (
                <form id="configForm" onSubmit={(e) => { e.preventDefault(); handleSaveConfig(); }} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <label htmlFor="activation_threshold" className="block text-sm font-medium text-gray-300">Activation Threshold:</label>
                      <input type="number" name="activation_threshold" id="activation_threshold"
                             value={editableConfig.activation_threshold ?? ''} onChange={handleConfigInputChange} step="0.1"
                             className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2" />
                    </div>
                    <div>
                      <label htmlFor="noise_factor" className="block text-sm font-medium text-gray-300">Noise Factor:</label>
                      <input type="number" name="noise_factor" id="noise_factor"
                             value={editableConfig.noise_factor ?? ''} onChange={handleConfigInputChange} step="0.1"
                             className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2" />
                    </div>
                    <div>
                      <label htmlFor="energy_decay_no_send" className="block text-sm font-medium text-gray-300">Decay (No Send):</label>
                      <input type="number" name="energy_decay_no_send" id="energy_decay_no_send"
                             value={editableConfig.energy_decay_no_send ?? ''} onChange={handleConfigInputChange} step="0.01"
                             className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2" />
                    </div>
                    <div>
                      <label htmlFor="energy_decay_send" className="block text-sm font-medium text-gray-300">Decay (Send):</label>
                      <input type="number" name="energy_decay_send" id="energy_decay_send"
                             value={editableConfig.energy_decay_send ?? ''} onChange={handleConfigInputChange} step="0.1"
                             className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2" />
                    </div>
                    <div>
                      <label htmlFor="use_core_fact_probability" className="block text-sm font-medium text-gray-300">Core Fact % (0-1):</label>
                      <input type="number" name="use_core_fact_probability" id="use_core_fact_probability"
                             value={editableConfig.use_core_fact_probability ?? ''} onChange={handleConfigInputChange} step="0.01" min="0" max="1"
                             className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2" />
                    </div>
                    <div>
                      <label htmlFor="use_maya_fact_probability" className="block text-sm font-medium text-gray-300">Maya Fact % (0-1):</label>
                      <input type="number" name="use_maya_fact_probability" id="use_maya_fact_probability"
                             value={editableConfig.use_maya_fact_probability ?? ''} onChange={handleConfigInputChange} step="0.01" min="0" max="1"
                             className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2" />
                    </div>
                    <div>
                      <label htmlFor="social_post_probability" className="block text-sm font-medium text-gray-300">Social Post % (0-1):</label>
                      <input type="number" name="social_post_probability" id="social_post_probability"
                             value={editableConfig.social_post_probability ?? ''} onChange={handleConfigInputChange} step="0.01" min="0" max="1"
                             className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2" />
                    </div>
                    {/* New field for setting energy level - NOW INSIDE THE GRID */}
                    <div>
                      <label htmlFor="manual_energy_level_set" className="block text-sm font-medium text-gray-300">Energy Level (0-10):</label>
                      <input type="number" name="manual_energy_level_set" id="manual_energy_level_set"
                             value={editableConfig.manual_energy_level_set ?? ''} 
                             onChange={handleConfigInputChange} 
                             step="0.1" min="0" max="10"
                             placeholder="Current energy"
                             className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2" />
                    </div>
                  </div>
                </form>
              ) : <p>Loading config...</p>}
            </div>
            {moodConfig && (
                <Button type="submit" form="configForm" disabled={isSavingConfig} className="w-full mt-auto">
                    {isSavingConfig ? 'Saving...' : 'Save Configuration'}
                </Button>
            )}
          </CardContent>
        </Card>

        {/* Card 1: Current Mood State - Applying consistent flex structure */}
        <Card className="lg:col-span-1 flex flex-col"> {/* Ensures card itself can grow/shrink if needed, and children can use flex-grow */}
          <CardHeader>
            <CardTitle>Current Mood State</CardTitle>
            <CardDescription>Maya&apos;s live emotional and energetic status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 flex flex-col flex-grow"> {/* flex-grow for content area, space-y for direct children */}
            <div className="flex-grow"> {/* This div takes up available space */}
              {isLoadingState ? <p>Loading state...</p> : moodState ? (
                <>
                  {(() => {
                    const currentMoodKey = moodState.current_mood?.toLowerCase() || 'default';
                    const displayConfig = moodDisplayMap[currentMoodKey] || moodDisplayMap.default;
                    return (
                      <div className="flex items-center space-x-3 mb-2">
                        {React.createElement(displayConfig.icon, { className: `w-10 h-10 ${displayConfig.textColor}` })}
                        <span className={`text-3xl font-bold ${displayConfig.textColor}`}>{displayConfig.displayName}</span>
                      </div>
                    );
                  })()}
                  <p><strong>Energy Level:</strong> {moodState.energy_level?.toFixed(2)} / 10</p>
                  <p><strong>Last Update:</strong> {new Date(moodState.last_mood_update_at).toLocaleString()}</p>
                  <div>
                    <p className="font-medium text-gray-200 mt-1"><strong>Last Influencers:</strong></p>
                    <InfluencersDisplay influencers={moodState.last_influencers} />
                  </div>
                </>
              ) : <p>No mood state data available. {moodState === null && "(Waiting for data...)"}</p>}
            </div>
            <Button onClick={fetchMoodState} disabled={isLoadingState} className="w-full mt-auto"> {/* mt-auto pushes to bottom */}
              {isLoadingState ? 'Refreshing...' : 'Refresh State'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* New Card for Mood Definitions Table/List */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Mood Definitions</CardTitle>
              <CardDescription>Manage Maya&apos;s available moods and their base parameters.</CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button onClick={fetchMoodDefinitions} disabled={isLoadingMoodDefinitions} variant="outline" size="sm">
                {isLoadingMoodDefinitions ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Button onClick={openCreateMoodDialog} size="sm">
                Create New Mood
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingMoodDefinitions ? (
            <p>Loading mood definitions...</p>
          ) : moodDefinitions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Mood ID</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Display Name</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Base Thought Seed</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Activation Boost</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Energy Cost Factor</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Active</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-gray-900 divide-y divide-gray-700/50">
                  {moodDefinitions.map((def) => (
                    <tr key={def.mood_id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-purple-300 font-mono">{def.mood_id}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-100">{def.display_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate" title={def.base_internal_thought_seed}>{def.base_internal_thought_seed}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">{def.activation_boost_modifier.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">{def.energy_cost_factor_modifier.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${def.is_active ? 'bg-green-700/50 text-green-300' : 'bg-red-700/50 text-red-300'}`}>
                          {def.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEditMoodDialog(def)} disabled={isDeletingMood}>Edit</Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={isDeletingMood}>
                              {isDeletingMood ? 'Deleting...' : 'Delete'}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-gray-900 border-gray-800 text-gray-100">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription className="text-gray-400">
                                This will mark the mood '<strong>{def.display_name}</strong>' (ID: {def.mood_id}) as inactive (soft delete). It will not be used by Maya unless reactivated.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteMood(def.mood_id, def.display_name)} className="bg-red-600 hover:bg-red-700">
                                Confirm Soft Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No mood definitions found. You might need to seed the database or create some.</p>
          )}
        </CardContent>
      </Card>

      {/* New Card for Mood LLM Prompts Table/List */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Mood LLM Prompts</CardTitle>
              <CardDescription>Manage LLM system suffixes and user triggers for each mood.</CardDescription>
            </div>
            <Button onClick={openCreateLLMPromptDialog} size="sm" disabled={isLoadingMoodLLMPrompts || isSavingLLMPrompt}>
              Create New Prompt
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingMoodLLMPrompts ? (
            <p>Loading LLM prompts...</p>
          ) : moodLLMPrompts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Mood ID</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Provider</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">System Suffix (excerpt)</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">User Trigger</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Active</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-gray-900 divide-y divide-gray-700/50">
                  {moodLLMPrompts.map((prompt) => (
                    <tr key={prompt.prompt_id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-purple-300 font-mono">{prompt.mood_id}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">{prompt.llm_provider}</td>
                      <td className="px-4 py-3 text-sm text-gray-300 max-w-md truncate" title={prompt.system_prompt_suffix}>{prompt.system_prompt_suffix}</td>
                      <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate" title={prompt.user_message_trigger_template}>{prompt.user_message_trigger_template}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${prompt.is_active ? 'bg-green-700/50 text-green-300' : 'bg-red-700/50 text-red-300'}`}>
                          {prompt.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEditLLMPromptDialog(prompt)} disabled={isSavingLLMPrompt || isDeletingLLMPrompt}>
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={isSavingLLMPrompt || isDeletingLLMPrompt}>
                              {isDeletingLLMPrompt && editingLLMPrompt?.prompt_id === prompt.prompt_id ? 'Deleting...' : 'Delete'}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-gray-900 border-gray-800 text-gray-100">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription className="text-gray-400">
                                This will permanently delete the LLM prompt (ID: {prompt.prompt_id}) for mood '<strong>{prompt.mood_id}</strong>' and provider '<strong>{prompt.llm_provider}</strong>'. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isDeletingLLMPrompt && editingLLMPrompt?.prompt_id === prompt.prompt_id}>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleDeleteLLMPrompt(prompt.prompt_id, prompt.mood_id)} 
                                disabled={isDeletingLLMPrompt && editingLLMPrompt?.prompt_id === prompt.prompt_id}
                                className="bg-red-600 hover:bg-red-700">
                                {isDeletingLLMPrompt && editingLLMPrompt?.prompt_id === prompt.prompt_id ? 'Deleting...' : 'Confirm Delete'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No Mood LLM Prompts found. You might need to seed the database or create some.</p>
          )}
        </CardContent>
      </Card>

      {/* Mood Definition Create/Edit Dialog */}
      <Dialog open={isMoodDialogOpen} onOpenChange={setIsMoodDialogOpen}>
        <DialogContent className="sm:max-w-[525px] bg-gray-900 border-gray-800 text-gray-100">
          <DialogHeader>
            <DialogTitle>{editingMood ? 'Edit Mood Definition' : 'Create New Mood Definition'}</DialogTitle>
            <DialogDescription>
              {editingMood ? `Modify details for the '${editingMood.display_name}' mood.` : 'Define a new mood for Maya.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMoodFormSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="mood_id" className="text-right text-gray-300">Mood ID</Label>
              <Input id="mood_id" name="mood_id" value={moodFormData.mood_id || ''} onChange={handleMoodFormInputChange} disabled={!!editingMood} className="col-span-3 bg-gray-800 border-gray-700" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="display_name" className="text-right text-gray-300">Display Name</Label>
              <Input id="display_name" name="display_name" value={moodFormData.display_name || ''} onChange={handleMoodFormInputChange} className="col-span-3 bg-gray-800 border-gray-700" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="base_internal_thought_seed" className="text-right text-gray-300">Base Thought Seed</Label>
              <Textarea id="base_internal_thought_seed" name="base_internal_thought_seed" value={moodFormData.base_internal_thought_seed || ''} onChange={handleMoodFormInputChange} className="col-span-3 bg-gray-800 border-gray-700" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fallback_message_prefix" className="text-right text-gray-300">Fallback Prefix</Label>
              <Input id="fallback_message_prefix" name="fallback_message_prefix" value={moodFormData.fallback_message_prefix || ''} onChange={handleMoodFormInputChange} className="col-span-3 bg-gray-800 border-gray-700" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="activation_boost_modifier" className="text-right text-gray-300">Activation Boost</Label>
              <Input id="activation_boost_modifier" name="activation_boost_modifier" type="number" step="0.1" value={moodFormData.activation_boost_modifier ?? ''} onChange={handleMoodFormInputChange} className="col-span-3 bg-gray-800 border-gray-700" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="energy_cost_factor_modifier" className="text-right text-gray-300">Energy Cost Factor</Label>
              <Input id="energy_cost_factor_modifier" name="energy_cost_factor_modifier" type="number" step="0.1" value={moodFormData.energy_cost_factor_modifier ?? ''} onChange={handleMoodFormInputChange} className="col-span-3 bg-gray-800 border-gray-700" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="notes" className="text-right text-gray-300">Notes</Label>
              <Textarea id="notes" name="notes" value={moodFormData.notes || ''} onChange={handleMoodFormInputChange} className="col-span-3 bg-gray-800 border-gray-700" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="is_active" className="text-right text-gray-300">Is Active?</Label>
              <div className="col-span-3 flex items-center">
                <Checkbox 
                  id="is_active" 
                  name="is_active" 
                  checked={moodFormData.is_active === undefined ? true : moodFormData.is_active} 
                  onCheckedChange={(checked: boolean) => 
                    setMoodFormData(prev => ({ ...prev, is_active: checked }))
                  }
                  className="mr-2"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={isSavingMood}>{isSavingMood ? 'Saving...' : 'Save Mood'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for Editing Mood LLM Prompt */}
      <Dialog open={isLLMPromptDialogOpen} onOpenChange={setIsLLMPromptDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-gray-900 border-gray-800 text-gray-100">
          <DialogHeader>
            <DialogTitle>{editingLLMPrompt ? `Edit LLM Prompt for Mood: ${editingLLMPrompt.mood_id}` : 'Create New LLM Prompt'}</DialogTitle>
            <DialogDescription>
              {editingLLMPrompt 
                ? `Modify the System Suffix and User Trigger for the '${editingLLMPrompt.llm_provider}' LLM provider.` 
                : 'Define new LLM prompt augmentations for a mood.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLLMPromptFormSubmit} className="grid gap-4 py-4">
            {!editingLLMPrompt && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="mood_id_select" className="text-right text-gray-300">For Mood ID</Label>
                <select 
                  id="mood_id_select" 
                  name="mood_id" 
                  value={llmPromptFormData.mood_id || ''} 
                  onChange={handleLLMPromptFormInputChange} 
                  className="col-span-3 bg-gray-800 border-gray-700 p-2 rounded-md text-white"
                >
                  <option value="" disabled>Select a mood</option>
                  {moodDefinitions.map(def => (
                    <option key={def.mood_id} value={def.mood_id}>{def.display_name} ({def.mood_id})</option>
                  ))}
                </select>
              </div>
            )}
            {editingLLMPrompt && (
               <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="mood_id_display" className="text-sm font-medium text-gray-300">Mood ID (Read-only)</Label>
                  <Input id="mood_id_display" value={editingLLMPrompt.mood_id} readOnly disabled className="mt-1 bg-gray-800 border-gray-700" />
                </div>
            )}
            <div>
              <Label htmlFor="system_prompt_suffix" className="text-sm font-medium text-gray-300">System Prompt Suffix</Label>
              <Textarea 
                id="system_prompt_suffix" 
                name="system_prompt_suffix" 
                value={llmPromptFormData.system_prompt_suffix || ''} 
                onChange={handleLLMPromptFormInputChange} 
                className="mt-1 bg-gray-800 border-gray-700 min-h-[100px]" 
                rows={6}
              />
            </div>
            <div>
              <Label htmlFor="user_message_trigger_template" className="text-sm font-medium text-gray-300">User Message Trigger</Label>
              <Input 
                id="user_message_trigger_template" 
                name="user_message_trigger_template" 
                value={llmPromptFormData.user_message_trigger_template || ''} 
                onChange={handleLLMPromptFormInputChange} 
                className="mt-1 bg-gray-800 border-gray-700" 
              />
            </div>
            <div>
              <Label htmlFor="llm_prompt_notes" className="text-sm font-medium text-gray-300">Notes (Optional)</Label>
              <Textarea 
                id="llm_prompt_notes" 
                name="notes" 
                value={llmPromptFormData.notes || ''} 
                onChange={handleLLMPromptFormInputChange} 
                className="mt-1 bg-gray-800 border-gray-700" 
                rows={3}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="llm_prompt_is_active" 
                name="is_active"
                checked={llmPromptFormData.is_active === undefined ? true : llmPromptFormData.is_active}
                onCheckedChange={(checked: boolean) => setLLMPromptFormData(prev => ({ ...prev, is_active: checked }))}
              />
              <Label htmlFor="llm_prompt_is_active" className="text-sm font-medium text-gray-300">Is Active?</Label>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline" disabled={isSavingLLMPrompt}>Cancel</Button></DialogClose>
              <Button type="submit" disabled={isSavingLLMPrompt}>{isSavingLLMPrompt ? 'Saving...' : 'Save LLM Prompt'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Activity Log - Full Width */}
      <Card>
        <CardHeader>
          <CardTitle>Mood Activity Log</CardTitle>
          <CardDescription>Recent mood changes, thoughts, and messages sent by Maya.</CardDescription>
          <Button onClick={() => fetchActivityLog(activityLogPage)} disabled={isLoadingLogs} size="sm" className="mt-2">
            {isLoadingLogs ? 'Refreshing Logs...' : 'Refresh Current Page'}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingLogs ? <p>Loading logs...</p> : activityLog.length > 0 ? (
            <>
              <div className="max-h-96 overflow-y-auto space-y-4 pr-2">
                {activityLog.map((log) => (
                  <div key={log.id} className="p-3 bg-gray-800/50 rounded-md border border-gray-700/50 text-sm">
                    <p><strong>Timestamp:</strong> {new Date(log.created_at).toLocaleString()}</p>
                    <p><strong>Mood:</strong> <span className="font-semibold">{log.mood}</span></p>
                    {log.internal_thought && <p><strong>Thought Seed:</strong> {log.internal_thought}</p>}
                    {log.output_message_content && <p><strong>Message/Action:</strong> {log.output_message_content}</p>}
                    {log.metadata?.activation_score !== undefined && <p><strong>Activation:</strong> {log.metadata.activation_score.toFixed(2)}</p>}
                    {log.metadata?.influencers_used && 
                      <div>
                        <p className="font-medium text-gray-200 mt-1"><strong>Influencers Used:</strong></p>
                        <InfluencersDisplay influencers={log.metadata.influencers_used} />
                      </div>
                    }
                    {log.error_message && <p className="text-red-400"><strong>Error:</strong> {log.error_message}</p>}
                  </div>
                ))}
              </div>
              {/* Basic Pagination Controls */}
              <div className="mt-4 flex justify-between items-center">
                <Button 
                  onClick={() => fetchActivityLog(activityLogPage - 1)} 
                  disabled={activityLogPage <= 1 || isLoadingLogs}
                >
                  Previous
                </Button>
                <span>Page {activityLogPage} of {Math.ceil(activityLogTotalCount / activityLogLimit)}</span>
                <Button 
                  onClick={() => fetchActivityLog(activityLogPage + 1)} 
                  disabled={activityLogPage >= Math.ceil(activityLogTotalCount / activityLogLimit) || isLoadingLogs}
                >
                  Next
                </Button>
              </div>
            </>
          ) : <p>No activity log entries found.</p>}
        </CardContent>
      </Card>

    </div>
  );
} 