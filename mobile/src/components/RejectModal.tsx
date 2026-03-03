import React, { useState } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
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

interface RejectModalProps {
  visible: boolean
  onClose: () => void
  onReject: (itemId: string, reason: string) => Promise<void>
  item: FeedItem | null
  isProcessing: boolean
}

export default function RejectModal({ 
  visible, 
  onClose, 
  onReject, 
  item,
  isProcessing 
}: RejectModalProps) {
  const [rejectionReason, setRejectionReason] = useState('')

  const handleReject = async () => {
    if (!item || !rejectionReason.trim()) {
      Alert.alert('Missing Information', 'Please provide a reason for rejecting this item.')
      return
    }

    try {
      await onReject(item.id, rejectionReason.trim())
      setRejectionReason('')
      onClose()
    } catch (error) {
      // Error handling is done in the parent component
    }
  }

  const handleClose = () => {
    setRejectionReason('')
    onClose()
  }

  if (!item) return null

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
          <Text style={styles.headerTitle}>Reject Item</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Item Info */}
          <View style={styles.itemInfo}>
            <View style={styles.warningIcon}>
              <Ionicons name="warning" size={32} color="#EF4444" />
            </View>
            <Text style={styles.itemTitle}>
              Reject item from {item.source_system}?
            </Text>
            <Text style={styles.itemSubtitle}>
              Created by {item.creator_profile_name || 'Maya'} • {item.item_type.replace('_', ' ')}
            </Text>
          </View>

          {/* Reason Input */}
          <View style={styles.reasonSection}>
            <Text style={styles.reasonLabel}>
              Rejection Reason <Text style={styles.required}>*</Text>
            </Text>
            <Text style={styles.reasonHint}>
              Please provide a detailed reason to help improve future generations.
            </Text>
            <TextInput
              style={styles.reasonInput}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder="e.g., Tone not quite right, too generic, doesn't match brand voice..."
              placeholderTextColor="#6B7280"
              multiline
              numberOfLines={4}
              maxLength={500}
              editable={!isProcessing}
            />
            <Text style={styles.characterCount}>
              {rejectionReason.length}/500 characters
            </Text>
          </View>

          {/* Common Rejection Reasons */}
          <View style={styles.quickReasonsSection}>
            <Text style={styles.quickReasonsLabel}>Quick Reasons:</Text>
            <View style={styles.quickReasonsGrid}>
              {[
                'Content quality too low',
                'Doesn\'t match brand voice',
                'Too generic/bland',
                'Inappropriate content',
                'Technical issues',
                'Wrong target audience'
              ].map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={styles.quickReasonButton}
                  onPress={() => setRejectionReason(reason)}
                  disabled={isProcessing}
                >
                  <Text style={styles.quickReasonText}>{reason}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={handleClose}
            disabled={isProcessing}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.rejectButton,
              (!rejectionReason.trim() || isProcessing) && styles.rejectButtonDisabled
            ]}
            onPress={handleReject}
            disabled={!rejectionReason.trim() || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="close-circle" size={16} color="#fff" />
                <Text style={styles.rejectButtonText}>Reject Item</Text>
              </>
            )}
          </TouchableOpacity>
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
  placeholder: {
    width: 40, // Same as close button for centering
  },
  content: {
    flex: 1,
    padding: 16,
  },
  itemInfo: {
    alignItems: 'center',
    marginBottom: 32,
  },
  warningIcon: {
    marginBottom: 16,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FAFB',
    textAlign: 'center',
    marginBottom: 8,
  },
  itemSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  reasonSection: {
    marginBottom: 24,
  },
  reasonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  required: {
    color: '#EF4444',
  },
  reasonHint: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 12,
    lineHeight: 18,
  },
  reasonInput: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 12,
    color: '#F9FAFB',
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
    marginTop: 4,
  },
  quickReasonsSection: {
    marginBottom: 24,
  },
  quickReasonsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
  },
  quickReasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickReasonButton: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quickReasonText: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    paddingTop: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#D1D5DB',
    fontSize: 16,
    fontWeight: '600',
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    gap: 8,
  },
  rejectButtonDisabled: {
    backgroundColor: '#7F1D1D',
  },
  rejectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}) 