import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Image,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { useAuthContext } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase/client';
import { useNavigation } from '@react-navigation/native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

// Maya's system user ID
const MAYA_SYSTEM_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';

// Memory worker URL
const MEMORY_WORKER_URL = process.env.EXPO_PUBLIC_MEMORY_WORKER_URL || 'https://mayahq-production.up.railway.app';

// Color scheme matching the chat screen
const COLORS = {
  background: '#0A0A0A',
  cardBackground: '#1E1E22',
  primary: '#9333EA',
  text: '#FFFFFF',
  textSecondary: '#71717A',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  border: 'rgba(255,255,255,0.1)',
  headerBackground: '#171717',
};

interface MoodConfig {
  config_key?: string;
  activation_threshold: number;
  energy_decay_no_send: number;
  energy_decay_send: number;
  noise_factor: number;
  use_core_fact_probability: number;
  use_maya_fact_probability: number;
  social_post_probability: number;
  image_generation_probability?: number;
  updated_at?: string;
}

interface MoodState {
  current_mood: string;
  energy_level: number;
  last_mood_update_at: string;
  last_influencers?: any;
}

interface MayaProfile {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

const MoodEngineScreen = () => {
  const [moodState, setMoodState] = useState<MoodState | null>(null);
  const [moodConfig, setMoodConfig] = useState<MoodConfig | null>(null);
  const [editableConfig, setEditableConfig] = useState<Partial<MoodConfig>>({});
  const [mayaProfile, setMayaProfile] = useState<MayaProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [isTriggeringCycle, setIsTriggeringCycle] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [energyModalVisible, setEnergyModalVisible] = useState(false);
  const [manualEnergyValue, setManualEnergyValue] = useState('');

  const { user } = useAuthContext();
  const navigation = useNavigation();

  // Fetch mood state
  const fetchMoodState = useCallback(async () => {
    try {
      const response = await fetch(`${MEMORY_WORKER_URL}/api/v1/mood/current-state`);
      if (!response.ok) throw new Error('Failed to fetch mood state');
      const data = await response.json();
      setMoodState(data);
    } catch (error) {
      console.error('Error fetching mood state:', error);
      Alert.alert('Error', 'Failed to fetch mood state');
    }
  }, []);

  // Fetch mood config
  const fetchMoodConfig = useCallback(async () => {
    try {
      const response = await fetch(`${MEMORY_WORKER_URL}/api/v1/mood/config`);
      if (!response.ok) throw new Error('Failed to fetch mood config');
      const data = await response.json();
      setMoodConfig(data);
      setEditableConfig(data);
    } catch (error) {
      console.error('Error fetching mood config:', error);
      Alert.alert('Error', 'Failed to fetch mood configuration');
    }
  }, []);

  // Fetch Maya's profile
  const fetchMayaProfile = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', MAYA_SYSTEM_USER_ID)
        .single();
        
      if (data) {
        setMayaProfile(data);
      } else if (error) {
        console.error('Error fetching Maya profile:', error);
      }
    } catch (error) {
      console.error('Exception fetching Maya profile:', error);
    }
  }, []);

  // Trigger mood cycle
  const handleTriggerMoodCycle = async () => {
    setIsTriggeringCycle(true);
    try {
      // Use the production URL directly if MEMORY_WORKER_URL is not available or looks incorrect
      const baseURL = MEMORY_WORKER_URL && MEMORY_WORKER_URL.includes('railway.app') 
        ? MEMORY_WORKER_URL 
        : 'https://mayahq-production.up.railway.app';
      
      // Use the new user-authenticated endpoint instead of the server API key endpoint
      const apiURL = `${baseURL}/api/v1/mood/trigger-cycle`;
      
      console.log('Triggering mood cycle with user authentication:', {
        url: apiURL,
        userId: user?.id
      });
      
      if (!user) {
        throw new Error('User not authenticated - please log in again');
      }

      // Get the user's session token from Supabase
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        throw new Error('Unable to get authentication token - please log in again');
      }
      
      const response = await fetch(apiURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });
      
      console.log('Mood cycle response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Mood cycle API error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`API Error ${response.status}: ${errorText || response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Mood cycle triggered successfully:', result);
      
      Alert.alert('Success', result.message || 'Mood cycle triggered successfully!');
      
      // Refresh data after a delay
      setTimeout(() => {
        fetchMoodState();
      }, 2000);
    } catch (error) {
      console.error('Error triggering mood cycle:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      Alert.alert(
        'Mood Cycle Error', 
        `Failed to trigger mood cycle:\n\n${errorMessage}`,
        [
          { text: 'OK', style: 'default' },
          { 
            text: 'Retry', 
            style: 'default',
            onPress: () => handleTriggerMoodCycle()
          }
        ]
      );
    } finally {
      setIsTriggeringCycle(false);
    }
  };

  // Save configuration
  const handleSaveConfig = async () => {
    if (!editableConfig) return;
    
    setSaving(true);
    try {
      let finalEnergyValue: number | null = null;
      if (manualEnergyValue.trim() !== '') {
        const numericEnergy = parseFloat(manualEnergyValue);
        if (!isNaN(numericEnergy)) {
          finalEnergyValue = Math.max(0, Math.min(10, numericEnergy));
        }
      }

      const payload = {
        ...editableConfig,
        manual_energy_level_set: finalEnergyValue,
      };

      const response = await fetch(`${MEMORY_WORKER_URL}/api/v1/mood/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) throw new Error('Failed to save configuration');
      
      const result = await response.json();
      setMoodConfig(result.updated_config);
      setEditableConfig(result.updated_config);
      Alert.alert('Success', 'Configuration saved successfully!');
    } catch (error) {
      console.error('Error saving config:', error);
      Alert.alert('Error', 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Set manual energy level
  const handleSetEnergyLevel = () => {
    setManualEnergyValue(moodState?.energy_level?.toFixed(1) || '5.0');
    setEnergyModalVisible(true);
  };

  // Refresh all data
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchMoodState(),
      fetchMoodConfig(),
      fetchMayaProfile(),
    ]);
    setIsRefreshing(false);
  }, [fetchMoodState, fetchMoodConfig, fetchMayaProfile]);

  // Initial data fetch
  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetchMoodState(),
      fetchMoodConfig(),
      fetchMayaProfile(),
    ]).finally(() => setIsLoading(false));
  }, [fetchMoodState, fetchMoodConfig, fetchMayaProfile]);

  // Get mood icon and color
  const getMoodDisplay = (mood: string) => {
    const moodDisplayMap: Record<string, {icon: string, color: string}> = {
      playful: { icon: '✨', color: '#f59e0b' },
      reflective: { icon: '🧠', color: '#3b82f6' },
      curious: { icon: '❓', color: '#14b8a6' },
      supportive: { icon: '❤️', color: '#10b981' },
      energetic: { icon: '⚡', color: '#f97316' },
      sassy: { icon: '💅', color: '#ec4899' },
      chill_genz: { icon: '☕', color: '#6366f1' },
      peeved: { icon: '😤', color: '#ef4444' },
      flirty_nsfw_tease: { icon: '💋', color: '#f43f5e' },
      neutral: { icon: '😐', color: '#6b7280' },
    };
    return moodDisplayMap[mood.toLowerCase()] || { icon: '🤖', color: '#6b7280' };
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mood Engine</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading mood engine...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mood Engine</Text>
        <TouchableOpacity onPress={onRefresh} disabled={isRefreshing}>
          <Feather name="refresh-cw" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Maya Avatar & Trigger Section */}
        <View style={styles.card}>
          <View style={styles.avatarSection}>
            {mayaProfile?.avatar_url ? (
              <Image
                source={{ uri: mayaProfile.avatar_url }}
                style={styles.mayaAvatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>M</Text>
              </View>
            )}
            <Text style={styles.mayaName}>{mayaProfile?.name || 'Maya'}</Text>
          </View>
          
          <TouchableOpacity
            style={[styles.triggerButton, isTriggeringCycle && styles.buttonDisabled]}
            onPress={handleTriggerMoodCycle}
            disabled={isTriggeringCycle}
          >
            {isTriggeringCycle ? (
              <ActivityIndicator size="small" color={COLORS.text} />
            ) : (
              <>
                <MaterialCommunityIcons name="auto-fix" size={20} color={COLORS.text} />
                <Text style={styles.triggerButtonText}>Trigger Mood Cycle</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Current Mood State */}
        {moodState && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Current Mood State</Text>
            <View style={styles.moodStateContent}>
              <View style={styles.moodRow}>
                <Text style={styles.moodEmoji}>
                  {getMoodDisplay(moodState.current_mood).icon}
                </Text>
                <View style={styles.moodInfo}>
                  <Text style={styles.moodName}>{moodState.current_mood}</Text>
                  <Text style={styles.moodEnergy}>
                    Energy: {moodState.energy_level?.toFixed(1)}/10
                  </Text>
                </View>
                <TouchableOpacity 
                  style={styles.energyButton}
                  onPress={handleSetEnergyLevel}
                >
                  <Feather name="edit-2" size={16} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.energyBarContainer}>
                <View style={styles.energyBar}>
                  <View 
                    style={[
                      styles.energyBarFill, 
                      { 
                        width: `${(moodState.energy_level / 10) * 100}%`,
                        backgroundColor: getMoodDisplay(moodState.current_mood).color,
                      }
                    ]} 
                  />
                </View>
              </View>
              
              <Text style={styles.lastUpdate}>
                Last updated: {new Date(moodState.last_mood_update_at).toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        {/* Core Probabilities */}
        {moodConfig && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Core Probabilities</Text>
            
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>
                Text vs Image vs Social ({(editableConfig.use_core_fact_probability || 0).toFixed(2)})
              </Text>
              <Text style={styles.sliderDescription}>
                Core fact usage probability (0.0 - 1.0)
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                value={editableConfig.use_core_fact_probability || 0}
                onValueChange={(value: number) => 
                  setEditableConfig(prev => ({ ...prev, use_core_fact_probability: value }))
                }
                minimumTrackTintColor={COLORS.primary}
                maximumTrackTintColor={COLORS.textSecondary}
                thumbTintColor={COLORS.primary}
              />
            </View>

            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>
                Maya Fact Probability ({(editableConfig.use_maya_fact_probability || 0).toFixed(2)})
              </Text>
              <Text style={styles.sliderDescription}>
                Maya personal fact usage (0.0 - 1.0)
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                value={editableConfig.use_maya_fact_probability || 0}
                onValueChange={(value: number) => 
                  setEditableConfig(prev => ({ ...prev, use_maya_fact_probability: value }))
                }
                minimumTrackTintColor={COLORS.primary}
                maximumTrackTintColor={COLORS.textSecondary}
                thumbTintColor={COLORS.primary}
              />
            </View>

            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>
                Social Post Probability ({(editableConfig.social_post_probability || 0).toFixed(2)})
              </Text>
              <Text style={styles.sliderDescription}>
                Chance of social media post vs DM (0.0 - 1.0)
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                value={editableConfig.social_post_probability || 0}
                onValueChange={(value: number) => 
                  setEditableConfig(prev => ({ ...prev, social_post_probability: value }))
                }
                minimumTrackTintColor={COLORS.primary}
                maximumTrackTintColor={COLORS.textSecondary}
                thumbTintColor={COLORS.primary}
              />
            </View>

            {editableConfig.image_generation_probability !== undefined && (
              <View style={styles.sliderContainer}>
                <Text style={styles.sliderLabel}>
                  Image Generation ({(editableConfig.image_generation_probability || 0).toFixed(2)})
                </Text>
                <Text style={styles.sliderDescription}>
                  Probability of generating images (0.0 - 1.0)
                </Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={1}
                  value={editableConfig.image_generation_probability || 0}
                  onValueChange={(value: number) => 
                    setEditableConfig(prev => ({ ...prev, image_generation_probability: value }))
                  }
                  minimumTrackTintColor={COLORS.primary}
                  maximumTrackTintColor={COLORS.textSecondary}
                  thumbTintColor={COLORS.primary}
                />
              </View>
            )}
          </View>
        )}

        {/* Advanced Settings Toggle */}
        <TouchableOpacity 
          style={styles.advancedToggle}
          onPress={() => setShowAdvanced(!showAdvanced)}
        >
          <Text style={styles.advancedToggleText}>Advanced Settings</Text>
          <Feather 
            name={showAdvanced ? "chevron-up" : "chevron-down"} 
            size={20} 
            color={COLORS.primary} 
          />
        </TouchableOpacity>

        {/* Advanced Settings */}
        {showAdvanced && moodConfig && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Advanced Thresholds</Text>
            
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>
                Activation Threshold ({(editableConfig.activation_threshold || 0).toFixed(1)})
              </Text>
              <Text style={styles.sliderDescription}>
                Energy threshold for triggering actions (0.0 - 10.0)
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={10}
                value={editableConfig.activation_threshold || 0}
                onValueChange={(value: number) => 
                  setEditableConfig(prev => ({ ...prev, activation_threshold: value }))
                }
                minimumTrackTintColor={COLORS.primary}
                maximumTrackTintColor={COLORS.textSecondary}
                thumbTintColor={COLORS.primary}
              />
            </View>

            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>
                Energy Decay (No Send) ({(editableConfig.energy_decay_no_send || 0).toFixed(2)})
              </Text>
              <Text style={styles.sliderDescription}>
                Energy lost when no message is sent (0.0 - 2.0)
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={2}
                value={editableConfig.energy_decay_no_send || 0}
                onValueChange={(value: number) => 
                  setEditableConfig(prev => ({ ...prev, energy_decay_no_send: value }))
                }
                minimumTrackTintColor={COLORS.primary}
                maximumTrackTintColor={COLORS.textSecondary}
                thumbTintColor={COLORS.primary}
              />
            </View>

            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>
                Energy Decay (Send) ({(editableConfig.energy_decay_send || 0).toFixed(2)})
              </Text>
              <Text style={styles.sliderDescription}>
                Energy lost when message is sent (0.0 - 2.0)
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={2}
                value={editableConfig.energy_decay_send || 0}
                onValueChange={(value: number) => 
                  setEditableConfig(prev => ({ ...prev, energy_decay_send: value }))
                }
                minimumTrackTintColor={COLORS.primary}
                maximumTrackTintColor={COLORS.textSecondary}
                thumbTintColor={COLORS.primary}
              />
            </View>

            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>
                Noise Factor ({(editableConfig.noise_factor || 0).toFixed(2)})
              </Text>
              <Text style={styles.sliderDescription}>
                Random variation in activation (0.0 - 5.0)
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={5}
                value={editableConfig.noise_factor || 0}
                onValueChange={(value: number) => 
                  setEditableConfig(prev => ({ ...prev, noise_factor: value }))
                }
                minimumTrackTintColor={COLORS.primary}
                maximumTrackTintColor={COLORS.textSecondary}
                thumbTintColor={COLORS.primary}
              />
            </View>
          </View>
        )}

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.buttonDisabled]}
          onPress={handleSaveConfig}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <>
              <Feather name="save" size={20} color={COLORS.text} />
              <Text style={styles.saveButtonText}>Save Configuration</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Energy Level Modal */}
      <Modal
        visible={energyModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Energy Level</Text>
            <Text style={styles.modalDescription}>
              Enter energy level (0.0 - 10.0) or leave empty to remove override
            </Text>
            <TextInput
              style={styles.energyInput}
              value={manualEnergyValue}
              onChangeText={setManualEnergyValue}
              placeholder="5.0"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="decimal-pad"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setEnergyModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton]}
                onPress={() => {
                  setEnergyModalVisible(false);
                  handleSaveConfig();
                }}
              >
                <Text style={styles.modalSaveText}>Set Energy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.text,
    fontSize: 16,
  },
  card: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  mayaAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 8,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  mayaName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  triggerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  triggerButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  moodStateContent: {
    flex: 1,
  },
  moodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  moodEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  moodInfo: {
    flex: 1,
  },
  moodName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    textTransform: 'capitalize',
  },
  moodEnergy: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  energyButton: {
    padding: 8,
  },
  energyBarContainer: {
    marginBottom: 12,
  },
  energyBar: {
    height: 8,
    backgroundColor: COLORS.textSecondary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  energyBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  lastUpdate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  sliderContainer: {
    marginBottom: 20,
  },
  sliderLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  sliderDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  advancedToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  advancedToggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.success,
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  saveButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  energyInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  modalCancelButton: {
    backgroundColor: COLORS.textSecondary,
  },
  modalSaveButton: {
    backgroundColor: COLORS.primary,
  },
  modalCancelText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalSaveText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default MoodEngineScreen; 