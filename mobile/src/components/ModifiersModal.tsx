import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const MEMORY_WORKER_API_URL = process.env.EXPO_PUBLIC_MAYA_API_ENDPOINT || 'https://mayahq-production.up.railway.app';

export interface VisualElement {
  id: string;
  name: string;
  description: string | null;
  category: string;
  storage_path: string;
  thumbnail_url: string | null;
  tags: string[];
}

export interface Modifiers {
  instructions: string;
  visualElementIds: string[];
}

interface ModifiersModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (modifiers: Modifiers) => void;
  initialModifiers?: Modifiers;
}

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'person', label: 'People' },
  { key: 'pet', label: 'Pets' },
  { key: 'object', label: 'Objects' },
  { key: 'style', label: 'Styles' },
  { key: 'location', label: 'Locations' },
];

export default function ModifiersModal({
  visible,
  onClose,
  onApply,
  initialModifiers,
}: ModifiersModalProps) {
  const [instructions, setInstructions] = useState(initialModifiers?.instructions || '');
  const [selectedIds, setSelectedIds] = useState<string[]>(initialModifiers?.visualElementIds || []);
  const [elements, setElements] = useState<VisualElement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    if (visible) {
      fetchVisualElements();
    }
  }, [visible]);

  useEffect(() => {
    if (initialModifiers) {
      setInstructions(initialModifiers.instructions || '');
      setSelectedIds(initialModifiers.visualElementIds || []);
    }
  }, [initialModifiers]);

  const fetchVisualElements = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/visual-elements`);
      if (response.ok) {
        const data = await response.json();
        setElements(data.elements || []);
      }
    } catch (error) {
      console.error('[ModifiersModal] Error fetching visual elements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleElement = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    );
  };

  const handleApply = () => {
    onApply({
      instructions: instructions.trim(),
      visualElementIds: selectedIds,
    });
    onClose();
  };

  const handleClear = () => {
    setInstructions('');
    setSelectedIds([]);
  };

  const filteredElements = selectedCategory === 'all'
    ? elements
    : elements.filter(e => e.category === selectedCategory);

  const selectedElements = elements.filter(e => selectedIds.includes(e.id));

  const hasModifiers = instructions.trim().length > 0 || selectedIds.length > 0;

  const renderElement = ({ item }: { item: VisualElement }) => {
    const isSelected = selectedIds.includes(item.id);
    return (
      <TouchableOpacity
        style={[styles.elementItem, isSelected && styles.elementItemSelected]}
        onPress={() => toggleElement(item.id)}
      >
        <Image
          source={{ uri: item.thumbnail_url || `${MEMORY_WORKER_API_URL}/api/v1/visual-elements/${item.id}/image` }}
          style={styles.elementThumbnail}
          resizeMode="cover"
        />
        {isSelected && (
          <View style={styles.selectedBadge}>
            <Ionicons name="checkmark" size={16} color="#fff" />
          </View>
        )}
        <Text style={styles.elementName} numberOfLines={1}>{item.name}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modifiers</Text>
          <TouchableOpacity onPress={handleApply} style={styles.headerButton}>
            <Text style={styles.applyText}>Apply</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Instructions Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Additional Instructions</Text>
            <TextInput
              style={styles.instructionsInput}
              placeholder="e.g., golden hour lighting, cozy vibes, looking at camera..."
              placeholderTextColor="#6B7280"
              value={instructions}
              onChangeText={setInstructions}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Selected Elements Preview */}
          {selectedElements.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Selected Elements ({selectedElements.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectedPreview}>
                {selectedElements.map(element => (
                  <TouchableOpacity
                    key={element.id}
                    style={styles.selectedChip}
                    onPress={() => toggleElement(element.id)}
                  >
                    <Image
                      source={{ uri: element.thumbnail_url || `${MEMORY_WORKER_API_URL}/api/v1/visual-elements/${element.id}/image` }}
                      style={styles.chipThumbnail}
                    />
                    <Text style={styles.chipText} numberOfLines={1}>{element.name}</Text>
                    <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Visual Elements Library */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Visual Elements Library</Text>

            {/* Category Filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryFilter}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.categoryChip,
                    selectedCategory === cat.key && styles.categoryChipSelected
                  ]}
                  onPress={() => setSelectedCategory(cat.key)}
                >
                  <Text style={[
                    styles.categoryText,
                    selectedCategory === cat.key && styles.categoryTextSelected
                  ]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Elements Grid */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#A855F7" />
              </View>
            ) : filteredElements.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="images-outline" size={48} color="#4B5563" />
                <Text style={styles.emptyText}>No visual elements yet</Text>
                <Text style={styles.emptySubtext}>Add reference images via the web dashboard</Text>
              </View>
            ) : (
              <View style={styles.elementsGrid}>
                {filteredElements.map(element => (
                  <View key={element.id} style={styles.gridItem}>
                    {renderElement({ item: element })}
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Bottom Actions */}
        {hasModifiers && (
          <View style={styles.bottomActions}>
            <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={styles.clearText}>Clear All</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  cancelText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  applyText: {
    color: '#A855F7',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  instructionsInput: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#374151',
  },
  selectedPreview: {
    marginBottom: 8,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 20,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 10,
    marginRight: 8,
    gap: 6,
  },
  chipThumbnail: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  chipText: {
    color: '#fff',
    fontSize: 13,
    maxWidth: 80,
  },
  categoryFilter: {
    marginBottom: 12,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1F2937',
    marginRight: 8,
  },
  categoryChipSelected: {
    backgroundColor: '#A855F7',
  },
  categoryText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  categoryTextSelected: {
    color: '#fff',
    fontWeight: '500',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 12,
  },
  emptySubtext: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 4,
  },
  elementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  gridItem: {
    width: '33.33%',
    padding: 4,
  },
  elementItem: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1F2937',
  },
  elementItemSelected: {
    borderWidth: 2,
    borderColor: '#A855F7',
  },
  elementThumbnail: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#374151',
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#A855F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  elementName: {
    color: '#fff',
    fontSize: 12,
    padding: 8,
    textAlign: 'center',
  },
  bottomActions: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  clearText: {
    color: '#EF4444',
    fontSize: 15,
  },
});
