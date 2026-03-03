import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TextInput, TouchableOpacity, Dimensions, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { ImageAnalysisType } from '@mayahq/supabase-client';
import { imageToBase64DataUrl } from '../../utils/imageUtils';

const { width: screenWidth } = Dimensions.get('window');

export default function PromptAnalyzerScreen({ route, navigation }: any) {
  const uri = route.params?.uri; // Optional chaining for safety
  
  console.log('[PromptAnalyzerScreen] Received URI:', uri, '(type:', typeof uri, ')');

  // Debug environment variables from expo-constants
  console.log('[DEBUG ENV] Constants.expoConfig?.extra:', Constants.expoConfig?.extra);
  console.log('[DEBUG ENV] supabaseUrl:', Constants.expoConfig?.extra?.supabaseUrl);
  console.log('[DEBUG ENV] supabaseAnonKey:', Constants.expoConfig?.extra?.supabaseAnonKey ? 'SET' : 'NOT_SET');

  const [promptText, setPromptText] = useState('Analyzing image to generate prompt...');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(true);
  const [analysisType, setAnalysisType] = useState<ImageAnalysisType>('prompt-generation');
  const [isSendingToComfyUI, setIsSendingToComfyUI] = useState(false);

  // Create Supabase client directly using expo-constants
  const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl;
  const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[PromptAnalyzerScreen] Missing Supabase credentials in expo config');
  }
  
  const supabaseClient = createClient(supabaseUrl!, supabaseAnonKey!);

  // Image analysis function
  const analyzeImageWithAI = async (imageUri: string, type: ImageAnalysisType = 'prompt-generation') => {
    try {
      setIsLoadingPrompt(true);
      setPromptText('Analyzing image with AI...');
      console.log('[PROMPT ANALYZER] Starting analysis for:', imageUri);
      console.log('[PROMPT ANALYZER] Analysis type:', type);

      // Convert image to base64
      console.log('[PROMPT ANALYZER] Converting image to base64...');
      const base64DataUrl = await imageToBase64DataUrl(imageUri);
      console.log('[PROMPT ANALYZER] Base64 conversion successful, length:', base64DataUrl.length);
      
      // TODO: Get actual user ID from authentication
      const userId = 'user-id-placeholder'; // This should come from your auth system
      console.log('[PROMPT ANALYZER] Using user ID:', userId);

      // Call the image analysis API directly
      const response = await supabaseClient.functions.invoke('analyze-image', {
        body: {
          imageData: base64DataUrl,
          analysisType: type,
          userId: userId,
        },
      });

      console.log('[PROMPT ANALYZER] API Response:', response);

      if (response.error) {
        throw new Error(response.error.message || 'Failed to analyze image');
      }

      if (response.data && response.data.success) {
        setPromptText(response.data.analysis);
        console.log('[PROMPT ANALYZER] Analysis successful:', response.data.analysis.substring(0, 100) + '...');
      } else {
        setPromptText('Failed to analyze image. Please try again.');
        Alert.alert('Analysis Failed', response.data?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('[PROMPT ANALYZER] Error:', error);
      setPromptText('Failed to analyze image. Please try again.');
      Alert.alert('Analysis Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  // Send to ComfyUI function
  const sendToComfyUI = async () => {
    try {
      setIsSendingToComfyUI(true);
      console.log('[PROMPT ANALYZER] Sending to ComfyUI:', promptText.substring(0, 100) + '...');

      // Parse the structured prompt
      const parsedPrompt = parseStructuredPrompt(promptText);
      console.log('[PROMPT ANALYZER] Parsed prompt data:', {
        positiveLength: parsedPrompt.positivePrompt.length,
        negativeLength: parsedPrompt.negativePrompt.length,
        technical: parsedPrompt.technical
      });

      // Get the series generator URL from environment or use default
      const seriesGeneratorUrl = Constants.expoConfig?.extra?.seriesGeneratorUrl || 'https://series-generator-production.up.railway.app';
      console.log('[PROMPT ANALYZER] Series Generator URL:', seriesGeneratorUrl);

      const requestBody = {
        prompt: parsedPrompt.positivePrompt,
        negative_prompt: parsedPrompt.negativePrompt,
        mood_id: 'snap_to_prompt_mobile',
        technical_settings: {
          sampler_name: parsedPrompt.technical.sampler,
          steps: parsedPrompt.technical.steps,
          cfg: parsedPrompt.technical.cfgScale,
          width: parsedPrompt.technical.width,
          height: parsedPrompt.technical.height,
        }
      };

      console.log('[PROMPT ANALYZER] Request body:', requestBody);

      const response = await fetch(`${seriesGeneratorUrl}/generate-single-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[PROMPT ANALYZER] ComfyUI API Response Status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send to ComfyUI: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('[PROMPT ANALYZER] ComfyUI API Result:', result);

      Alert.alert(
        'Success! 🎨', 
        'Your image has been sent to ComfyUI for generation! Check your feed for the result.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate back to feed or home
              navigation.navigate('Home');
            }
          }
        ]
      );

    } catch (error) {
      console.error('[PROMPT ANALYZER] ComfyUI Error:', error);
      Alert.alert(
        'ComfyUI Error', 
        error instanceof Error ? error.message : 'Failed to send to ComfyUI. Please try again.'
      );
    } finally {
      setIsSendingToComfyUI(false);
    }
  };

  // Re-analyze with different type
  const handleAnalysisTypeChange = (type: ImageAnalysisType) => {
    setAnalysisType(type);
    if (uri) {
      analyzeImageWithAI(uri, type);
    }
  };

  useEffect(() => {
    if (uri && typeof uri === 'string') { // Ensure URI is a string
      console.log('[PROMPT ANALYZER] Starting image analysis for:', uri);
      analyzeImageWithAI(uri, analysisType);
    } else {
      console.error('[PromptAnalyzerScreen] Invalid or missing URI for analysis.');
      setPromptText('No valid image provided to analyze.');
      setIsLoadingPrompt(false);
    }
  }, [uri]);

  const handleSendToComfyUI = () => {
    if (!uri || typeof uri !== 'string' || !promptText || promptText === 'Analyzing image to generate prompt...' || promptText === 'No valid image provided to analyze.') {
      Alert.alert('Error', 'Cannot send without a valid image and prompt.');
      return;
    }
    console.log('Sending to ComfyUI:', { imageUri: uri, prompt: promptText });
    Alert.alert('Sent to ComfyUI', `Image: ${uri}\nPrompt: ${promptText}`);
  };

  // Parse structured prompt function
  const parseStructuredPrompt = (structuredPrompt: string) => {
    try {
      // Extract main prompt
      const mainPromptMatch = structuredPrompt.match(/\*\*MAIN PROMPT:\*\*\s*\n(.*?)(?=\n\*\*|$)/s);
      const mainPrompt = mainPromptMatch ? mainPromptMatch[1].trim() : '';

      // Extract positive enhancers
      const positiveMatch = structuredPrompt.match(/\*\*POSITIVE ENHANCERS:\*\*\s*\n(.*?)(?=\n\*\*|$)/s);
      const positiveEnhancers = positiveMatch ? positiveMatch[1].trim() : '';

      // Extract negative prompt
      const negativeMatch = structuredPrompt.match(/\*\*NEGATIVE PROMPT:\*\*\s*\n(.*?)(?=\n\*\*|$)/s);
      const negativePrompt = negativeMatch ? negativeMatch[1].trim() : '';

      // Extract technical settings
      const technicalMatch = structuredPrompt.match(/\*\*TECHNICAL SETTINGS:\*\*\s*\n(.*?)(?=\n\*\*|$)/s);
      const technicalSettings = technicalMatch ? technicalMatch[1].trim() : '';

      // Parse technical settings into structured data
      const samplerMatch = technicalSettings.match(/- Sampler:\s*(.+)/);
      const stepsMatch = technicalSettings.match(/- Steps:\s*(\d+)-?(\d+)?/);
      const cfgMatch = technicalSettings.match(/- CFG Scale:\s*([\d.]+)-?([\d.]+)?/);
      const resolutionMatch = technicalSettings.match(/- Resolution:\s*(\d+)x(\d+)/);

      // Combine main prompt with enhancers and prepend CyberRealistic XL trigger
      const basePrompt = mainPrompt + (positiveEnhancers ? ', ' + positiveEnhancers : '');
      const fullPositivePrompt = `23 year old skinny blonde TOK, freckles, choker, ${basePrompt}`;

      return {
        positivePrompt: fullPositivePrompt,
        negativePrompt: negativePrompt,
        technical: {
          sampler: samplerMatch ? samplerMatch[1].trim() : 'dpmpp_2m',
          steps: stepsMatch ? parseInt(stepsMatch[1]) : 30,
          cfgScale: cfgMatch ? parseFloat(cfgMatch[1]) : 6,
          width: resolutionMatch ? parseInt(resolutionMatch[1]) : 1024,
          height: resolutionMatch ? parseInt(resolutionMatch[2]) : 1024,
        }
      };
    } catch (error) {
      console.error('[PROMPT ANALYZER] Error parsing structured prompt:', error);
      // Fallback to using the full prompt as positive with trigger
      return {
        positivePrompt: `23 year old skinny blonde TOK, freckles, choker, ${structuredPrompt}`,
        negativePrompt: 'plastic skin, CGI look, doll-like, waxy texture, missing fingers, extra limbs, deformed eyes, poorly drawn hands, cartoonish, anime, painting, stylized',
        technical: {
          sampler: 'dpmpp_2m',
          steps: 30,
          cfgScale: 6,
          width: 1024,
          height: 1024,
        }
      };
    }
  };

  if (!uri || typeof uri !== 'string') { // Stricter check here as well
    return (
      <SafeAreaView style={styles.containerCentered}>
        <Text style={styles.errorText}>No valid image found to analyze.</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // If we reach here, URI should be a valid string
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analyze & Prompt</Text>
        <View style={{width: 40}} />
      </View>

      <View style={styles.imagePreviewContainer}>
        <Image source={{ uri: uri }} style={styles.imagePreview} resizeMode="contain" />
      </View>

      <View style={styles.promptContainer}>
        <View style={styles.analysisTypeContainer}>
          <TouchableOpacity 
            style={[styles.analysisTypeButton, analysisType === 'prompt-generation' && styles.analysisTypeButtonActive]}
            onPress={() => handleAnalysisTypeChange('prompt-generation')}
            disabled={isLoadingPrompt}
          >
            <Text style={[styles.analysisTypeText, analysisType === 'prompt-generation' && styles.analysisTypeTextActive]}>
              Prompt
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.analysisTypeButton, analysisType === 'description' && styles.analysisTypeButtonActive]}
            onPress={() => handleAnalysisTypeChange('description')}
            disabled={isLoadingPrompt}
          >
            <Text style={[styles.analysisTypeText, analysisType === 'description' && styles.analysisTypeTextActive]}>
              Describe
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.analysisTypeButton, analysisType === 'creative-analysis' && styles.analysisTypeButtonActive]}
            onPress={() => handleAnalysisTypeChange('creative-analysis')}
            disabled={isLoadingPrompt}
          >
            <Text style={[styles.analysisTypeText, analysisType === 'creative-analysis' && styles.analysisTypeTextActive]}>
              Creative
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.promptLabel}>Generated Analysis:</Text>
        <View style={styles.promptInputContainer}>
          {isLoadingPrompt && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#A855F7" />
            </View>
          )}
          <TextInput
            style={styles.promptInput}
            value={promptText}
            onChangeText={setPromptText}
            placeholder="Analysis will appear here..."
            placeholderTextColor="#9CA3AF"
            multiline
            editable={!isLoadingPrompt}
          />
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.sendButton, isSendingToComfyUI && styles.sendButtonDisabled]} 
          onPress={sendToComfyUI}
          disabled={isSendingToComfyUI || isLoadingPrompt || !promptText || promptText.includes('Analyzing') || promptText.includes('Failed')}
        >
          {isSendingToComfyUI ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="send" size={24} color="#FFFFFF" />
          )}
          <Text style={styles.sendButtonText}>
            {isSendingToComfyUI ? 'Sending...' : 'Send to ComfyUI'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  containerCentered: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  backButton: {
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  imagePreviewContainer: {
    flex: 0.5, // Adjust flex as needed
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#000',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  promptContainer: {
    flex: 0.4, // Adjust flex as needed
    padding: 15,
  },
  promptLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#D1D5DB',
    marginBottom: 8,
  },
  promptInputContainer: {
    flex: 1,
    position: 'relative',
  },
  loadingContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
  },
  promptInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    textAlignVertical: 'top',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#4B5563',
    minHeight: 80,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
  },
  sendButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginLeft: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#4B5563',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  button: {
      backgroundColor: '#A855F7',
      paddingVertical: 12,
      paddingHorizontal: 25,
      borderRadius: 25,
      marginTop: 20,
    },
  buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: 'bold',
  },
  analysisTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  analysisTypeButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#4B5563',
    borderRadius: 8,
  },
  analysisTypeButtonActive: {
    backgroundColor: '#1F2937',
  },
  analysisTypeText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#D1D5DB',
  },
  analysisTypeTextActive: {
    color: '#FFFFFF',
  },
}); 