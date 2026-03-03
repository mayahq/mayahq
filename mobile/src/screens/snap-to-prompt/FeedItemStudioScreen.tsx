import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text as RNText,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput as RNTextInput,
  Button as RNButton,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Canvas,
  Image as SkiaImage,
  useImage,
  Group,
  Skia,
  Paint,
  SkPaint,
  Text as SkiaText,
  useFont,
  Path,
  Paragraph,
} from '@shopify/react-native-skia';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface OverlayTextData {
  id: string;
  text: string;
  initialX: number;
  initialY: number;
  width: number;
  height: number;
}

const TextOverlayDisplay = ({ overlayData, font, textPaint, isSelected }: {
  overlayData: OverlayTextData;
  font: ReturnType<typeof useFont>;
  textPaint: SkPaint;
  isSelected: boolean;
}) => {
  if (!font) return null;

  const padding = 10;
  const textXOffset = padding;
  const textYOffset = (overlayData.height / 2) + (font.getSize() / 3);

  const backgroundPath = Skia.Path.Make();
  backgroundPath.addRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, overlayData.width, overlayData.height), 10, 10));
  
  const bgPaint = useMemo(() => {
    const paint = Skia.Paint();
    paint.setColor(Skia.Color(isSelected ? 'rgba(139, 92, 246, 0.7)' : 'rgba(50, 50, 50, 0.7)'));
    return paint;
  }, [isSelected]);

  return (
    <Group transform={[{ translateX: overlayData.initialX }, { translateY: overlayData.initialY }]}>
      <Path path={backgroundPath} paint={bgPaint} />
      <SkiaText 
        x={textXOffset} 
        y={textYOffset} 
        text={overlayData.text}
        font={font} 
        paint={textPaint} 
      />
    </Group>
  );
};

const MOCK_FEED_TEXTS = [
  "Just gave our TypeScript project the gift of DOM awareness by updating tsconfig.json...",
  "Synthwave neon grid, sitting cross-legged, meditating, piloting a small spacecraft...",
  "Exploring the limits of Skia and Reanimated for dynamic overlays! #ReactNative",
  "Coffee: the most important meal of the day for a coder. ☕",
];
let mockFeedTextIndex = 0;

export default function FeedItemStudioScreen({ route, navigation }: any) {
  const { uri: mainImageUri, initialPrompt } = route.params;
  const mainSkiaImage = useImage(mainImageUri);
  const defaultFont = useFont(require('../../../assets/fonts/Roboto-Regular.ttf'), 16);

  const mainImageTranslateX = useSharedValue(0);
  const mainImageTranslateY = useSharedValue(0);
  const mainImageScale = useSharedValue(1);
  const mainImageRotation = useSharedValue(0);
  const savedMainImageTranslateX = useSharedValue(0);
  const savedMainImageTranslateY = useSharedValue(0);
  const savedMainImageScale = useSharedValue(1);
  const savedMainImageRotation = useSharedValue(0);

  const [textOverlays, setTextOverlays] = useState<OverlayTextData[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [finalCompositePrompt, setFinalCompositePrompt] = useState(initialPrompt || 'Remixed image');
  
  const overlayDragInitialX = useSharedValue(0);
  const overlayDragInitialY = useSharedValue(0);

  const [isTextModalVisible, setIsTextModalVisible] = useState(false);
  const [currentTextInput, setCurrentTextInput] = useState('');
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);

  const approxHeaderHeight = 60;
  const approxBottomInset = 34;
  const contentHeight = screenHeight - approxHeaderHeight - approxBottomInset;

  const initialMainImageDims = useMemo(() => {
    if (!mainSkiaImage || mainSkiaImage.width() === 0) return { width: screenWidth, height: contentHeight, x: 0, y: 0 };
    const containerHeight = contentHeight;
    const containerWidth = screenWidth;
    const imgAspect = mainSkiaImage.width() / mainSkiaImage.height();
    let w = containerWidth; let h = containerWidth / imgAspect;
    if (h > containerHeight) { h = containerHeight; w = h * imgAspect; }
    const xPos = (containerWidth - w) / 2; const yPos = (containerHeight - h) / 2;
    return { width: w, height: h, x: xPos, y: yPos };
  }, [mainSkiaImage, contentHeight, screenWidth]);

  const addOrUpdateTextOverlay = (text: string, idToUpdate?: string | null) => {
    if (!defaultFont) { Alert.alert("Font not loaded"); return; }
    const newText = text.trim();
    if (!newText) return;

    const padding = 10;
    const textMetrics = defaultFont.measureText(newText);
    const textWidth = textMetrics.width;
    const textBlockHeightBasedOnFont = defaultFont.getSize() * 1.5;
    
    const backgroundWidth = Math.min(textWidth + padding * 2, screenWidth * 0.8);
    const backgroundHeight = textBlockHeightBasedOnFont + padding * 2;

    if (idToUpdate) {
      setTextOverlays(prev => prev.map(ov => 
        ov.id === idToUpdate ? { ...ov, text: newText, width: backgroundWidth, height: backgroundHeight } : ov
      ));
    } else {
      const initialX = screenWidth / 2 - backgroundWidth / 2;
      const initialY = (contentHeight / 2 - backgroundHeight / 2) + (textOverlays.length * (backgroundHeight + 10));
      setTextOverlays(prev => [...prev, {
        id: Date.now().toString(), 
        text: newText, 
        initialX: initialX,
        initialY: initialY, 
        width: backgroundWidth, 
        height: backgroundHeight,
      }]);
    }
  };

  const mainImagePanGesture = Gesture.Pan().onUpdate((e) => { mainImageTranslateX.value = savedMainImageTranslateX.value + e.translationX; mainImageTranslateY.value = savedMainImageTranslateY.value + e.translationY; }).onEnd(() => { savedMainImageTranslateX.value = mainImageTranslateX.value; savedMainImageTranslateY.value = mainImageTranslateY.value; });
  const mainImagePinchGesture = Gesture.Pinch().onUpdate((e) => { mainImageScale.value = savedMainImageScale.value * e.scale; }).onEnd(() => { savedMainImageScale.value = mainImageScale.value; });
  const mainImageRotationGesture = Gesture.Rotation().onUpdate((e) => { mainImageRotation.value = savedMainImageRotation.value + e.rotation; }).onEnd(() => { savedMainImageRotation.value = mainImageRotation.value; });

  const tapGesture = Gesture.Tap()
    .onEnd((event, success) => {
      if (success) {
        let tappedId: string | null = null;
        for (let i = textOverlays.length - 1; i >= 0; i--) {
          const overlay = textOverlays[i];
          if (
            event.x >= overlay.initialX && event.x <= overlay.initialX + overlay.width &&
            event.y >= overlay.initialY && event.y <= overlay.initialY + overlay.height
          ) {
            tappedId = overlay.id;
            break;
          }
        }
        runOnJS(setSelectedOverlayId)(tappedId);
        if (tappedId) {
          const selected = textOverlays.find(o => o.id === tappedId);
          if (selected) {
            overlayDragInitialX.value = selected.initialX;
            overlayDragInitialY.value = selected.initialY;
            console.log('Selected overlay:', tappedId, 'starting at', selected.initialX, selected.initialY);
          }
        } else {
          console.log('Tapped canvas background, deselecting.');
        }
      }
    });

  const panGestureController = Gesture.Pan()
    .onBegin((event) => {
        if (selectedOverlayId) {
            const overlay = textOverlays.find(o => o.id === selectedOverlayId);
            if (overlay) {
                overlayDragInitialX.value = overlay.initialX;
                overlayDragInitialY.value = overlay.initialY;
            }
        } else {
        }
    })
    .onUpdate((event) => {
      if (selectedOverlayId) {
        const newX = overlayDragInitialX.value + event.translationX;
        const newY = overlayDragInitialY.value + event.translationY;
        runOnJS(setTextOverlays)(currentOverlays =>
          currentOverlays.map(ov => 
            ov.id === selectedOverlayId ? { ...ov, initialX: newX, initialY: newY } : ov
          )
        );
      } else {
        mainImageTranslateX.value = savedMainImageTranslateX.value + event.translationX;
        mainImageTranslateY.value = savedMainImageTranslateY.value + event.translationY;
      }
    })
    .onEnd(() => {
      if (selectedOverlayId) {
        const overlay = textOverlays.find(o => o.id === selectedOverlayId);
        if (overlay) {
        }
      } else {
        savedMainImageTranslateX.value = mainImageTranslateX.value;
        savedMainImageTranslateY.value = mainImageTranslateY.value;
      }
    });

  const composedCanvasGestures = Gesture.Race(
    tapGesture,
    Gesture.Simultaneous(panGestureController, mainImagePinchGesture, mainImageRotationGesture)
  );

  const animatedCanvasWrapperStyle = useAnimatedStyle(() => ({}));

  const mainImageSkiaTransform = useDerivedValue(() => [
    { translateX: mainImageTranslateX.value + initialMainImageDims.x }, 
    { translateY: mainImageTranslateY.value + initialMainImageDims.y },
    { translateX: initialMainImageDims.width / 2 }, { translateY: initialMainImageDims.height / 2 },
    { scale: mainImageScale.value }, { rotate: mainImageRotation.value },
    { translateX: -initialMainImageDims.width / 2 }, { translateY: -initialMainImageDims.height / 2 },
  ], [mainImageTranslateX, mainImageTranslateY, mainImageScale, mainImageRotation, initialMainImageDims]);

  const openTextModalForAdd = () => {
    setEditingOverlayId(null);
    setCurrentTextInput('');
    setIsTextModalVisible(true);
  };

  const openTextModalForEdit = (overlayId: string) => {
    const overlay = textOverlays.find(ov => ov.id === overlayId);
    if (overlay) {
      setEditingOverlayId(overlayId);
      setCurrentTextInput(overlay.text);
      setIsTextModalVisible(true);
    }
  };

  const handleSaveTextFromModal = () => {
    const textToSave = currentTextInput.trim();
    if (!textToSave) { Alert.alert("Input Error", "Text cannot be empty."); return; }

    if (editingOverlayId) {
      addOrUpdateTextOverlay(textToSave, editingOverlayId);
    } else {
      addOrUpdateTextOverlay(textToSave);
    }
    setIsTextModalVisible(false);
    setCurrentTextInput('');
    setEditingOverlayId(null);
  };

  const sharedTextPaint = useMemo(() => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color('white'));
    return paint;
  }, []);

  if (!mainImageUri) {
    return (
      <SafeAreaView style={styles.containerCentered}>
        <RNText style={styles.errorText}>No image URI provided.</RNText>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <RNText style={styles.buttonText}>Go Back</RNText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!defaultFont || !mainSkiaImage) {
    return (
      <SafeAreaView style={styles.containerCentered}>
        <ActivityIndicator size="large" color="#A855F7" />
        <RNText style={styles.infoText}>{!defaultFont ? 'Loading font...' : 'Loading image...'}</RNText>
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <RNText style={styles.headerTitle}>Feed Remix Studio</RNText>
          <TouchableOpacity onPress={() => console.log('Send to ComfyUI pressed', { finalImageUri: mainImageUri, prompt: finalCompositePrompt })} style={styles.nextButton}>
            <RNText style={styles.nextButtonText}>Send</RNText>
          </TouchableOpacity>
        </View>

        <View style={styles.imageCanvasContainer}>
          <GestureDetector gesture={composedCanvasGestures}>
            <Animated.View style={[styles.imageCanvasContainer, animatedCanvasWrapperStyle]}>
              <Canvas style={{ width: screenWidth, height: contentHeight }}>
                {mainSkiaImage && initialMainImageDims.width > 0 && (
                  <Group transform={mainImageSkiaTransform}>
                    <SkiaImage image={mainSkiaImage} x={0} y={0} width={initialMainImageDims.width} height={initialMainImageDims.height} fit="contain" />
                  </Group>
                )}
                {textOverlays.map(overlay => (
                  <TextOverlayDisplay 
                    key={overlay.id} 
                    overlayData={overlay}
                    font={defaultFont}
                    textPaint={sharedTextPaint}
                    isSelected={overlay.id === selectedOverlayId}
                  />
                ))}
              </Canvas>
            </Animated.View>
          </GestureDetector>
        </View>
        
        <View style={styles.overlayToolsContainer}>
          <TouchableOpacity style={styles.toolButton} 
            onPress={() => {
              if (selectedOverlayId) openTextModalForEdit(selectedOverlayId);
              else openTextModalForAdd();
            }}
          >
            <Ionicons name={selectedOverlayId ? "pencil-outline" : "text-outline"} size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Modal
          animationType="slide"
          transparent={true}
          visible={isTextModalVisible}
          onRequestClose={() => {
            setIsTextModalVisible(!isTextModalVisible);
            setEditingOverlayId(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <RNText style={styles.modalTitle}>{editingOverlayId ? 'Edit Text' : 'Add Text Overlay'}</RNText>
              <RNTextInput
                style={styles.modalTextInput}
                onChangeText={setCurrentTextInput}
                value={currentTextInput}
                placeholder="Enter text from feed..."
                multiline={true}
              />
              <View style={styles.modalButtonContainer}>
                <RNButton title="Cancel" onPress={() => {setIsTextModalVisible(false); setEditingOverlayId(null);}} color="#EF4444"/>
                <RNButton title={editingOverlayId ? 'Save' : 'Add'} onPress={handleSaveTextFromModal} />
              </View>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  containerCentered: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', padding: 20 },
  infoText: { color: '#FFFFFF', fontSize: 16, textAlign: 'center', marginTop: 10 },
  errorText: { color: '#EF4444', fontSize: 18, textAlign: 'center', marginBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#374151' },
  backButton: { padding: 5 },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '600' },
  nextButton: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#A855F7', borderRadius: 20 },
  nextButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  imageCanvasContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', overflow: 'hidden' },
  overlayToolsContainer: { position: 'absolute', bottom: 20, right: 20 },
  toolButton: { backgroundColor: 'rgba(49, 46, 129, 0.8)', padding: 12, borderRadius: 30, marginBottom: 15, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  button: { backgroundColor: '#A855F7', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25, marginTop: 20 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#1F2937',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 15,
  },
  modalTextInput: {
    width: '100%',
    minHeight: 100,
    backgroundColor: '#374151',
    borderRadius: 8,
    padding: 10,
    color: '#FFFFFF',
    fontSize: 16,
    textAlignVertical: 'top',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
}); 