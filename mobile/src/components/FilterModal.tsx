import React, { useState } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

interface FilterOptions {
  status: string
  itemType: string
  sourceSystem: string
  dateFrom: Date | null
  dateTo: Date | null
}

interface FilterModalProps {
  visible: boolean
  onClose: () => void
  onApplyFilters: (filters: FilterOptions) => void
  currentFilters: FilterOptions
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'approved_for_posting', label: 'Approved for Posting' },
  { value: 'posted_social', label: 'Posted to Social' },
  { value: 'error_posting', label: 'Error Posting' },
  { value: 'prompt_generated', label: 'Prompt Generated' },
  { value: 'image_generated_pending_review', label: 'Image Generated' },
  { value: 'series_generated', label: 'Series Generated' },
]

const ITEM_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'text_mood_engine', label: 'Text (Mood Engine)' },
  { value: 'image_comfyui', label: 'Image (ComfyUI)' },
  { value: 'image_mood_engine', label: 'Image (Mood Engine)' },
  { value: 'image_studio_manual', label: 'Image (Studio Manual)' },
  { value: 'image_studio_series_master', label: 'Image (Series Master)' },
  { value: 'image_series_variation', label: 'Image (Series Variation)' },
]

const SOURCE_SYSTEMS = [
  { value: '', label: 'All Sources' },
  { value: 'MoodEngine', label: 'Mood Engine' },
  { value: 'ComfyUI', label: 'ComfyUI' },
  { value: 'SeriesGenerator', label: 'Series Generator' },
  { value: 'ImageStudio', label: 'Image Studio' },
  { value: 'ImageStudioSeries', label: 'Image Studio Series' },
  { value: 'n8n_maya_processor', label: 'Maya Processor' },
]

export default function FilterModal({ 
  visible, 
  onClose, 
  onApplyFilters, 
  currentFilters 
}: FilterModalProps) {
  const [localFilters, setLocalFilters] = useState<FilterOptions>(currentFilters)

  const handleApply = () => {
    onApplyFilters(localFilters)
    onClose()
  }

  const handleReset = () => {
    const resetFilters: FilterOptions = {
      status: '',
      itemType: '',
      sourceSystem: '',
      dateFrom: null,
      dateTo: null,
    }
    setLocalFilters(resetFilters)
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (localFilters.status) count++
    if (localFilters.itemType) count++
    if (localFilters.sourceSystem) count++
    if (localFilters.dateFrom) count++
    if (localFilters.dateTo) count++
    return count
  }

  const renderFilterSection = (
    title: string,
    options: Array<{ value: string; label: string }>,
    selectedValue: string,
    onSelect: (value: string) => void
  ) => (
    <View style={styles.filterSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.optionsContainer}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.optionButton,
              selectedValue === option.value && styles.selectedOption
            ]}
            onPress={() => onSelect(option.value)}
          >
            <Text style={[
              styles.optionText,
              selectedValue === option.value && styles.selectedOptionText
            ]}>
              {option.label}
            </Text>
            {selectedValue === option.value && (
              <Ionicons name="checkmark" size={16} color="#fff" />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )

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
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Filters</Text>
          <TouchableOpacity onPress={handleReset} style={styles.resetButton}>
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Active Filters Count */}
        {getActiveFilterCount() > 0 && (
          <View style={styles.activeFiltersContainer}>
            <Text style={styles.activeFiltersText}>
              {getActiveFilterCount()} filter{getActiveFilterCount() > 1 ? 's' : ''} active
            </Text>
          </View>
        )}

        {/* Filter Options */}
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Status Filter */}
          {renderFilterSection(
            'Status',
            STATUS_OPTIONS,
            localFilters.status,
            (value) => setLocalFilters(prev => ({ ...prev, status: value }))
          )}

          {/* Item Type Filter */}
          {renderFilterSection(
            'Content Type',
            ITEM_TYPES,
            localFilters.itemType,
            (value) => setLocalFilters(prev => ({ ...prev, itemType: value }))
          )}

          {/* Source System Filter */}
          {renderFilterSection(
            'Source System',
            SOURCE_SYSTEMS,
            localFilters.sourceSystem,
            (value) => setLocalFilters(prev => ({ ...prev, sourceSystem: value }))
          )}

          {/* Date Filters - Simplified for mobile */}
          <View style={styles.filterSection}>
            <Text style={styles.sectionTitle}>Date Range</Text>
            <Text style={styles.dateNote}>
              📅 Advanced date filtering coming soon
            </Text>
            <View style={styles.dateButtonsContainer}>
              <TouchableOpacity 
                style={styles.dateButton}
                onPress={() => {
                  // Quick filter: Last 24 hours
                  const oneDayAgo = new Date()
                  oneDayAgo.setDate(oneDayAgo.getDate() - 1)
                  setLocalFilters(prev => ({ ...prev, dateFrom: oneDayAgo, dateTo: new Date() }))
                }}
              >
                <Text style={styles.dateButtonText}>Last 24h</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.dateButton}
                onPress={() => {
                  // Quick filter: Last week
                  const oneWeekAgo = new Date()
                  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
                  setLocalFilters(prev => ({ ...prev, dateFrom: oneWeekAgo, dateTo: new Date() }))
                }}
              >
                <Text style={styles.dateButtonText}>Last Week</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.dateButton}
                onPress={() => {
                  setLocalFilters(prev => ({ ...prev, dateFrom: null, dateTo: null }))
                }}
              >
                <Text style={styles.dateButtonText}>All Time</Text>
              </TouchableOpacity>
            </View>
            {(localFilters.dateFrom || localFilters.dateTo) && (
              <Text style={styles.dateRange}>
                {localFilters.dateFrom ? localFilters.dateFrom.toLocaleDateString() : 'All'} - {localFilters.dateTo ? localFilters.dateTo.toLocaleDateString() : 'All'}
              </Text>
            )}
          </View>
        </ScrollView>

        {/* Apply Button */}
        <View style={styles.footer}>
          <TouchableOpacity 
            style={styles.applyButton}
            onPress={handleApply}
          >
            <Text style={styles.applyButtonText}>
              Apply Filters {getActiveFilterCount() > 0 && `(${getActiveFilterCount()})`}
            </Text>
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
  resetButton: {
    padding: 8,
  },
  resetText: {
    color: '#A855F7',
    fontSize: 16,
    fontWeight: '500',
  },
  activeFiltersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1F2937',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  activeFiltersText: {
    color: '#A855F7',
    fontSize: 14,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 12,
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  selectedOption: {
    backgroundColor: '#6B46C1',
    borderColor: '#7C3AED',
  },
  optionText: {
    fontSize: 14,
    color: '#D1D5DB',
    flex: 1,
  },
  selectedOptionText: {
    color: '#fff',
    fontWeight: '500',
  },
  dateNote: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  dateButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  dateButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#1F2937',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  dateButtonText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '500',
  },
  dateRange: {
    fontSize: 12,
    color: '#A855F7',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  applyButton: {
    backgroundColor: '#6B46C1',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}) 