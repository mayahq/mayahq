import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Canvas,
  Image as SkiaImage,
  useImage,
  Group,
} from '@shopify/react-native-skia';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useDerivedValue,
} from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { createSupabaseClient, analyzeImage, ImageAnalysisType } from '@mayahq/supabase-client';
import { imageToBase64DataUrl } from '../../utils/imageUtils';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface OverlayImage {
  id: string;
  uri: string;
  skImage: ReturnType<typeof useImage>;
}

export default function EditorScreen({ route, navigation }: any) {
  const { uri: mainImageUri } = route.params;
  const mainSkiaImage = useImage(mainImageUri);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedRotation = useSharedValue(0);

  const [promptText, setPromptText] = useState('Analyzing image...');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisType, setAnalysisType] = useState<ImageAnalysisType>('prompt-generation');
  const [overlayImages, setOverlayImages] = useState<OverlayImage[]>([]);
  const [galleryPermission, requestGalleryPermission] = ImagePicker.useMediaLibraryPermissions();

  const supabaseClient = createSupabaseClient();

  const approxHeaderHeight = 60;
  const approxBottomInset = 34;
  const contentHeight = screenHeight - approxHeaderHeight - approxBottomInset;

  const initialMainImageDims = useMemo(() => {
    if (!mainSkiaImage) {
      return { width: screenWidth, height: contentHeight * 0.7, x: 0, y: 0 };
    }
    const containerHeight = contentHeight * 0.7;
    const containerWidth = screenWidth;
    const imgAspect = mainSkiaImage.width() / mainSkiaImage.height();
    let w = containerWidth;
    let h = containerWidth / imgAspect;
    if (h > containerHeight) {
      h = containerHeight;
      w = h * imgAspect;
    }
    const x = (containerWidth - w) / 2;
    const y = (containerHeight - h) / 2;
    return { width: w, height: h, x, y };
  }, [mainSkiaImage, contentHeight]);

  // Image analysis function
  const analyzeImageWithAI = async (imageUri: string, type: ImageAnalysisType = 'prompt-generation') => {
    try {
      setIsAnalyzing(true);
      setPromptText('Analyzing image with AI...');
      console.log('[IMAGE ANALYSIS] Starting analysis for:', imageUri);
      console.log('[IMAGE ANALYSIS] Analysis type:', type);

      // Convert image to base64
      console.log('[IMAGE ANALYSIS] Converting image to base64...');
      const base64DataUrl = await imageToBase64DataUrl(imageUri);
      console.log('[IMAGE ANALYSIS] Base64 conversion successful, length:', base64DataUrl.length);
      
      // TODO: Get actual user ID from authentication
      const userId = 'user-id-placeholder'; // This should come from your auth system
      console.log('[IMAGE ANALYSIS] Using userId:', userId);

      const requestBody = {
        imageData: base64DataUrl,
        analysisType: type,
        userId: userId,
      };
      console.log('[IMAGE ANALYSIS] Request body prepared, calling Edge Function...');

      // Call the image analysis API
      const result = await analyzeImage(supabaseClient, requestBody);
      console.log('[IMAGE ANALYSIS] API call completed, result:', result);

      if ('success' in result && result.success) {
        console.log('[IMAGE ANALYSIS] Analysis successful:', result.analysis);
        setPromptText(result.analysis);
      } else {
        console.error('[IMAGE ANALYSIS] Analysis failed:', result);
        setPromptText('Failed to analyze image. Please try again.');
        Alert.alert('Analysis Failed', 'error' in result ? result.error : 'Unknown error');
      }
    } catch (error) {
      console.error('[IMAGE ANALYSIS] Error in analyzeImageWithAI:', error);
      console.error('[IMAGE ANALYSIS] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      setPromptText('Error analyzing image. Please try again.');
      Alert.alert('Error', 'Failed to analyze image. Please check your connection and try again.');
    } finally {
      setIsAnalyzing(false);
      console.log('[IMAGE ANALYSIS] Analysis process completed');
    }
  };

  // Re-analyze with different type
  const handleAnalysisTypeChange = (type: ImageAnalysisType) => {
    setAnalysisType(type);
    if (mainImageUri) {
      analyzeImageWithAI(mainImageUri, type);
    }
  };

  const handleAddFromFeed = async () => {
    if (!galleryPermission?.granted) {
      const permissionResult = await requestGalleryPermission();
      if (!permissionResult.granted) {
        Alert.alert("Permission Denied", "Photo library permission is needed to add images.");
        return;
      }
    }
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const newUri = result.assets[0].uri;
      setOverlayImages(prev => [...prev, { id: Date.now().toString(), uri: newUri, skImage: null }]);
      Alert.alert("Image Added", "Image selected to be overlaid. Gestures for overlays not yet implemented.");
    }
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const rotationGesture = Gesture.Rotation()
    .onUpdate((event) => {
      rotation.value = savedRotation.value + event.rotation;
    })
    .onEnd(() => {
      savedRotation.value = rotation.value;
    });

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture, rotationGesture);

  const mainImageSkiaTransform = useDerivedValue(() => {
    return [
      { translateX: translateX.value + initialMainImageDims.x },
      { translateY: translateY.value + initialMainImageDims.y },
      { translateX: initialMainImageDims.width / 2 }, 
      { translateY: initialMainImageDims.height / 2 },
      { scale: scale.value },
      { rotate: rotation.value },
      { translateX: -initialMainImageDims.width / 2 },
      { translateY: -initialMainImageDims.height / 2 },
    ];
  }, [translateX, translateY, scale, rotation, initialMainImageDims]);

  if (!mainImageUri) {
    return (
      <SafeAreaView style={styles.containerCentered}>
        <Text style={styles.errorText}>No image URI provided.</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  React.useEffect(() => {
    console.log('[EDITOR SCREEN] useEffect triggered', { 
      mainImageUri: !!mainImageUri, 
      mainSkiaImage: !!mainSkiaImage,
      mainImageUriValue: mainImageUri 
    });
    
    if (mainImageUri) {
      console.log('[EDITOR SCREEN] Starting image analysis immediately with URI:', mainImageUri);
      analyzeImageWithAI(mainImageUri, analysisType);
    } else {
      console.log('[EDITOR SCREEN] No mainImageUri available');
    }
  }, [mainImageUri, analysisType]);

  // Add separate logging for Skia image loading
  React.useEffect(() => {
    console.log('[EDITOR SCREEN] Skia image status:', { 
      hasMainSkiaImage: !!mainSkiaImage,
      imageWidth: mainSkiaImage?.width?.(),
      imageHeight: mainSkiaImage?.height?.() 
    });
  }, [mainSkiaImage]);

  const OverlayImageComponent = ({ uri }: { uri: string }) => {
    const overlaySkImage = useImage(uri);
    if (!overlaySkImage) return null;
    return (
      <SkiaImage 
        image={overlaySkImage} 
        x={50} y={50} 
        width={initialMainImageDims.width / 2}
        height={initialMainImageDims.height / 2} 
        fit="contain"
      />
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Remix</Text> 
          <TouchableOpacity onPress={() => console.log('Send to ComfyUI pressed', { uri: mainImageUri, prompt: promptText })} style={styles.nextButton}>
            <Text style={styles.nextButtonText}>Send</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.imageCanvasContainer}>
          {!mainSkiaImage ? (
            <ActivityIndicator size="large" color="#A855F7" />
          ) : (
            <GestureDetector gesture={composedGesture}>
              <Canvas style={{ width: screenWidth, height: initialMainImageDims.height + initialMainImageDims.y * 2 }}>
                <Group transform={mainImageSkiaTransform}>
                  <SkiaImage
                    image={mainSkiaImage}
                    x={0}
                    y={0}
                    width={initialMainImageDims.width}
                    height={initialMainImageDims.height}
                    fit="contain" 
                  />
                </Group>
                {overlayImages.map(overlay => (
                  <OverlayImageComponent key={overlay.id} uri={overlay.uri} />
                ))}
              </Canvas>
            </GestureDetector>
          )}
        </View>

        <View style={styles.promptArea}>
          <View style={styles.analysisTypeContainer}>
            <TouchableOpacity 
              style={[styles.analysisTypeButton, analysisType === 'prompt-generation' && styles.analysisTypeButtonActive]}
              onPress={() => handleAnalysisTypeChange('prompt-generation')}
            >
              <Text style={[styles.analysisTypeText, analysisType === 'prompt-generation' && styles.analysisTypeTextActive]}>
                Prompt
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.analysisTypeButton, analysisType === 'description' && styles.analysisTypeButtonActive]}
              onPress={() => handleAnalysisTypeChange('description')}
            >
              <Text style={[styles.analysisTypeText, analysisType === 'description' && styles.analysisTypeTextActive]}>
                Describe
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.analysisTypeButton, analysisType === 'creative-analysis' && styles.analysisTypeButtonActive]}
              onPress={() => handleAnalysisTypeChange('creative-analysis')}
            >
              <Text style={[styles.analysisTypeText, analysisType === 'creative-analysis' && styles.analysisTypeTextActive]}>
                Creative
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.promptInputContainer}>
            {isAnalyzing && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#A855F7" />
              </View>
            )}
            <TextInput
              style={styles.promptInput}
              value={promptText}
              onChangeText={setPromptText}
              placeholder="Tap to edit prompt..."
              placeholderTextColor="#9CA3AF"
              multiline
              editable={!isAnalyzing}
            />
          </View>
        </View>

        <View style={styles.overlayToolsContainer}>
            <TouchableOpacity style={styles.toolButton} onPress={handleAddFromFeed}>
                <Ionicons name="image-outline" size={26} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolButton} onPress={() => console.log('Add Text Overlay')}>
                <Ionicons name="text-outline" size={26} color="#FFFFFF" />
            </TouchableOpacity>
        </View>

      </SafeAreaView>
    </GestureHandlerRootView>
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
    padding: 5,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  nextButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#A855F7',
    borderRadius: 20,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  imageCanvasContainer: {
    flex: 0.7,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  promptArea: {
    flex: 0.2,
    padding: 12,
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
    borderColor: '#A855F7',
  },
  analysisTypeText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  analysisTypeTextActive: {
    color: '#FFFFFF',
  },
  promptInputContainer: {
    flex: 1,
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
  overlayToolsContainer: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    alignItems: 'center',
  },
  toolButton: {
    backgroundColor: 'rgba(49, 46, 129, 0.8)',
    padding: 12,
    borderRadius: 30,
    marginBottom: 15,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  placeholderText: {
    color: '#9CA3AF',
    fontSize: 16,
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
}); 