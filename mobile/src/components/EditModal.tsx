import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

interface FeedItem {
  id: string;
  status: string;
  item_type: string;
  source_system: string;
  content_data: any;
  creator_profile_name?: string | null;
}

interface EditModalProps {
  visible: boolean
  onClose: () => void
  onSave: (itemId: string, updatedData: any) => Promise<void>
  item: FeedItem | null
  isProcessing: boolean
}

export default function EditModal({ 
  visible, 
  onClose, 
  onSave, 
  item,
  isProcessing 
}: EditModalProps) {
  const [editedContent, setEditedContent] = useState<any>({})
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (item) {
      setEditedContent(item.content_data || {})
      setHasChanges(false)
    }
  }, [item])

  const handleSave = async () => {
    if (!item || !hasChanges) {
      onClose()
      return
    }

    try {
      await onSave(item.id, editedContent)
      onClose()
    } catch (error) {
      // Error handling is done in the parent component
    }
  }

  const handleClose = () => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Are you sure you want to close?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onClose }
        ]
      )
    } else {
      onClose()
    }
  }

  const updateField = (field: string, value: string) => {
    setEditedContent((prev: any) => ({
      ...prev,
      [field]: value
    }))
    setHasChanges(true)
  }

  const renderEditField = (
    label: string,
    field: string,
    placeholder: string,
    multiline: boolean = false,
    maxLength?: number
  ) => (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.multilineInput]}
        value={editedContent[field] || ''}
        onChangeText={(value) => updateField(field, value)}
        placeholder={placeholder}
        placeholderTextColor="#6B7280"
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        maxLength={maxLength}
        editable={!isProcessing}
      />
      {maxLength && (
        <Text style={styles.characterCount}>
          {(editedContent[field] || '').length}/{maxLength} characters
        </Text>
      )}
    </View>
  )

  if (!item) return null

  const isImageType = item.item_type.includes('image')
  const isTextType = item.item_type.includes('text')

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Content</Text>
          <TouchableOpacity 
            onPress={handleSave} 
            style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}
            disabled={!hasChanges || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#6B46C1" />
            ) : (
              <Text style={[styles.saveText, !hasChanges && styles.saveTextDisabled]}>
                Save
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Item Info */}
        <View style={styles.itemInfoBar}>
          <View style={styles.itemIcon}>
            <Ionicons 
              name={isImageType ? "image" : "document-text"} 
              size={16} 
              color="#6B46C1" 
            />
          </View>
          <Text style={styles.itemInfoText}>
            {item.item_type.replace('_', ' ')} • {item.source_system}
          </Text>
          {hasChanges && (
            <View style={styles.changesBadge}>
              <Text style={styles.changesBadgeText}>Unsaved</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Text Content for text-based items */}
          {isTextType && (
            <>
              {renderEditField(
                'Content Text',
                'text',
                'Enter the main content text...',
                true,
                2000
              )}
              {renderEditField(
                'Processed Content',
                'processed_content',
                'Maya\'s processed version of the content...',
                true,
                2000
              )}
            </>
          )}

          {/* Image Prompt for image-based items */}
          {isImageType && (
            <>
              {renderEditField(
                'Generated Image Prompt',
                'generated_image_prompt',
                'Enter the image generation prompt...',
                true,
                1000
              )}
              {renderEditField(
                'Original Prompt',
                'prompt',
                'Original prompt text...',
                true,
                1000
              )}
            </>
          )}

          {/* Mood ID (if available) */}
          {editedContent.mood_id !== undefined && renderEditField(
            'Mood/Context ID',
            'mood_id',
            'Enter mood or context identifier...'
          )}

          {/* Source URL (if available) */}
          {editedContent.source_url !== undefined && renderEditField(
            'Source URL',
            'source_url',
            'Enter source URL...'
          )}

          {/* Original Title (if available) */}
          {editedContent.original_title !== undefined && renderEditField(
            'Original Title',
            'original_title',
            'Enter original title...',
            false,
            200
          )}

          {/* Advanced Settings */}
          <View style={styles.advancedSection}>
            <Text style={styles.advancedTitle}>Advanced</Text>
            <Text style={styles.advancedNote}>
              ⚠️ Only edit these if you know what you're doing
            </Text>
            
            {/* Raw components preview (read-only) */}
            {editedContent.raw_image_prompt_components && (
              <View style={styles.readOnlyField}>
                <Text style={styles.fieldLabel}>Raw Prompt Components (Read-only)</Text>
                <View style={styles.jsonPreview}>
                  <Text style={styles.jsonText}>
                    {JSON.stringify(editedContent.raw_image_prompt_components, null, 2)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerNote}>
            Changes will be saved and the item status may update.
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  saveButton: {
    padding: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    color: '#6B46C1',
    fontSize: 16,
    fontWeight: '600',
  },
  saveTextDisabled: {
    color: '#6B7280',
  },
  itemInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1F2937',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  itemIcon: {
    marginRight: 8,
  },
  itemInfoText: {
    flex: 1,
    fontSize: 14,
    color: '#D1D5DB',
    textTransform: 'capitalize',
  },
  changesBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  changesBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  fieldInput: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 12,
    color: '#F9FAFB',
    fontSize: 14,
    minHeight: 44,
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
    marginTop: 4,
  },
  advancedSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  advancedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  advancedNote: {
    fontSize: 12,
    color: '#F59E0B',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  readOnlyField: {
    marginBottom: 16,
  },
  jsonPreview: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    maxHeight: 150,
  },
  jsonText: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  footerNote: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    fontStyle: 'italic',
  },
}) 