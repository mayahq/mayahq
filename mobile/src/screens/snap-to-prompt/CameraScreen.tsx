import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';

const MEMORY_WORKER_API_URL = process.env.EXPO_PUBLIC_MAYA_API_ENDPOINT || 'https://mayahq-production.up.railway.app';

type ScreenMode = 'camera' | 'preview' | 'generating' | 'result';

export default function CameraScreen({ navigation }: any) {
  const [mode, setMode] = useState<ScreenMode>('camera');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatedCaption, setGeneratedCaption] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Vision Camera permissions
  const { hasPermission: cameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const [galleryPermission, requestGalleryPermission] = ImagePicker.useMediaLibraryPermissions();
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);

  useEffect(() => {
    if (!cameraPermission) {
      requestCameraPermission();
    }
  }, [cameraPermission, requestCameraPermission]);

  const handleTakePhoto = async () => {
    if (cameraRef.current && isCameraReady) {
      try {
        const photo = await cameraRef.current.takePhoto({
          flash: 'auto',
          enableShutterSound: true,
        });
        console.log('[CameraScreen] Photo taken:', photo.path);
        const imageUri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
        setSelectedImage(imageUri);
        setMode('preview');
      } catch (e) {
        console.error('[CameraScreen] Failed to take photo', e);
        Alert.alert('Error', 'Failed to take photo.');
      }
    }
  };

  const handleSelectFromGallery = async () => {
    if (!galleryPermission?.granted) {
      const permissionResult = await requestGalleryPermission();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Photo library permission is needed.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5, // Lower quality to reduce size
      allowsEditing: false,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedImage(result.assets[0].uri);
      setMode('preview');
    }
  };

  const handleGenerateMaya = async () => {
    if (!selectedImage) return;

    setMode('generating');

    try {
      // Convert image to base64
      const base64 = await FileSystem.readAsStringAsync(selectedImage, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const dataUrl = `data:image/jpeg;base64,${base64}`;
      console.log('[CameraScreen] Image size:', (base64.length * 0.75 / 1024).toFixed(1), 'KB');

      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/image/generate-scene`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sceneImageBase64: dataUrl,
          prompt: 'Place Maya naturally in this scene, matching the pose and vibe',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed with status ${response.status}`);
      }

      const result = await response.json();
      console.log('[CameraScreen] Generation successful');

      setGeneratedImage(result.generatedImageUrl);
      setGeneratedCaption(result.caption || "Maya's version is ready!");
      setMode('result');

    } catch (error: any) {
      console.error('[CameraScreen] Generation failed:', error);
      Alert.alert(
        'Generation Failed',
        error.message || 'Failed to generate. Please try again.',
        [{ text: 'OK', onPress: () => setMode('preview') }]
      );
    }
  };

  const handleRetake = () => {
    setSelectedImage(null);
    setGeneratedImage(null);
    setGeneratedCaption(null);
    setMode('camera');
  };

  // Camera permission not granted
  if (!cameraPermission && mode === 'camera') {
    return (
      <SafeAreaView style={styles.containerCentered}>
        <Text style={styles.infoText}>Camera permission is required.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={() => Linking.openSettings()}>
          <Text style={styles.permissionButtonText}>Open Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.permissionButton, { marginTop: 12, backgroundColor: '#374151' }]} onPress={handleSelectFromGallery}>
          <Text style={styles.permissionButtonText}>Select from Gallery Instead</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // No camera device found
  if (device == null && cameraPermission && mode === 'camera') {
    return (
      <SafeAreaView style={styles.containerCentered}>
        <Text style={styles.infoText}>No camera found. You can still select an image.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={handleSelectFromGallery}>
          <Text style={styles.permissionButtonText}>Select from Gallery</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Camera mode - full screen live camera
  if (mode === 'camera') {
    return (
      <View style={styles.container}>
        {device && cameraPermission && (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            photo={true}
            photoQualityBalance="quality"
            onInitialized={() => setIsCameraReady(true)}
            onError={(error) => console.error('Camera Error:', error)}
          />
        )}

        {!isCameraReady && device && cameraPermission && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}

        {/* Close button */}
        <SafeAreaView style={styles.topControls}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
        </SafeAreaView>

        {/* Bottom controls */}
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.galleryButton} onPress={handleSelectFromGallery}>
            <Ionicons name="image-outline" size={30} color="#fff" />
          </TouchableOpacity>

          {isCameraReady && device && cameraPermission ? (
            <TouchableOpacity style={styles.shutterButton} onPress={handleTakePhoto}>
              <View style={styles.shutterButtonInner} />
            </TouchableOpacity>
          ) : (
            <View style={styles.shutterPlaceholder} />
          )}

          <TouchableOpacity style={styles.galleryButton} onPress={() => navigation.navigate('BatchUploadScreen')}>
            <Ionicons name="layers-outline" size={30} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Preview mode - show selected image with generate button
  if (mode === 'preview') {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.previewContainer}>
          <View style={styles.cameraHeader}>
            <TouchableOpacity onPress={handleRetake} style={styles.closeButton}>
              <Ionicons name="arrow-back" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Preview</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: selectedImage! }} style={styles.fullImage} resizeMode="contain" />
          </View>

          <View style={styles.previewActions}>
            <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
              <Ionicons name="refresh" size={24} color="#fff" />
              <Text style={styles.retakeButtonText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.generateButton} onPress={handleGenerateMaya}>
              <Ionicons name="sparkles" size={24} color="#fff" />
              <Text style={styles.generateButtonText}>Generate Maya</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Generating mode - loading state
  if (mode === 'generating') {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#A855F7" />
          <Text style={styles.loadingText}>Generating Maya in scene...</Text>
          <Text style={styles.loadingSubtext}>This may take a moment</Text>
        </View>
      </View>
    );
  }

  // Result mode - show generated image
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.previewContainer}>
        <View style={styles.cameraHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Maya's Version</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.imagePreviewContainer}>
          <Image source={{ uri: generatedImage! }} style={styles.fullImage} resizeMode="contain" />
          <View style={styles.generatedBadge}>
            <Ionicons name="sparkles" size={14} color="#fff" />
            <Text style={styles.badgeText}>AI Generated</Text>
          </View>
        </View>

        {generatedCaption && (
          <View style={styles.captionContainer}>
            <Text style={styles.captionText}>"{generatedCaption}"</Text>
          </View>
        )}

        <View style={styles.resultActions}>
          <TouchableOpacity style={styles.newButton} onPress={handleRetake}>
            <Ionicons name="add" size={24} color="#A855F7" />
            <Text style={styles.newButtonText}>New Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.feedButton} onPress={() => navigation.navigate('Home')}>
            <Ionicons name="grid" size={24} color="#fff" />
            <Text style={styles.feedButtonText}>View Feed</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  containerCentered: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  infoText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#A855F7',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    width: '80%',
    alignItems: 'center',
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#111827',
  },
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  closeButton: {
    padding: 8,
    width: 48,
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cameraControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  galleryButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  shutterButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  shutterPlaceholder: {
    width: 70,
    height: 70,
  },
  imagePreviewContainer: {
    flex: 1,
    margin: 12,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  fullImage: {
    flex: 1,
    width: '100%',
  },
  generatedBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#374151',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  retakeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  generateButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E1306C',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
  },
  loadingSubtext: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 8,
  },
  captionContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  captionText: {
    color: '#A855F7',
    fontSize: 16,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  resultActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
  },
  newButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#A855F7',
  },
  newButtonText: {
    color: '#A855F7',
    fontSize: 16,
    fontWeight: '600',
  },
  feedButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#A855F7',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  feedButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
