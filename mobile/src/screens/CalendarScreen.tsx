import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase/client'
import { Ionicons } from '@expo/vector-icons'
import { format, isToday, addDays, subDays, startOfDay, endOfDay, parseISO } from 'date-fns'
import { useNavigation } from '@react-navigation/native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  withTiming,
} from 'react-native-reanimated'

const { width: screenWidth } = Dimensions.get('window')

// Calendar event interface
interface CalendarEvent {
  id: string
  title: string
  description?: string | null
  start_time: string
  end_time: string
  all_day?: boolean | null
  location?: string | null
  mood?: string | null
  priority?: number | null
  energy_level?: string | null
  tags?: string[] | null
  ai_generated?: boolean | null
  ai_source_system?: string | null
  created_at: string
  updated_at?: string | null
  created_by: string
}

const CalendarScreen: React.FC = () => {
  const { user } = useAuthContext()
  const navigation = useNavigation()
  
  // State management
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit modal state
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editMood, setEditMood] = useState<string>('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')

  // Fetch calendar events for selected date
  const fetchCalendarEvents = useCallback(async () => {
    if (!user || !supabase) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      const startDate = startOfDay(selectedDate).toISOString()
      const endDate = endOfDay(selectedDate).toISOString()
      
      const { data, error: fetchError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('created_by', user.id)
        .gte('start_time', startDate)
        .lte('start_time', endDate)
        .order('start_time', { ascending: true })

      if (fetchError) {
        throw fetchError
      }

      setCalendarEvents(data || [])
    } catch (err: any) {
      console.error('Error fetching calendar events:', err)
      setError('Failed to load calendar events')
    } finally {
      setIsLoading(false)
    }
  }, [user, supabase, selectedDate])

  // Update calendar event
  const updateCalendarEvent = useCallback(async (eventId: string, updates: Partial<CalendarEvent>) => {
    if (!user || !supabase) return false
    
    try {
      const { data, error: updateError } = await supabase
        .from('calendar_events')
        .update(updates)
        .eq('id', eventId)
        .eq('created_by', user.id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      // Update local state
      setCalendarEvents(prev => 
        prev.map(event => 
          event.id === eventId ? { ...event, ...updates } : event
        )
      )

      return true
    } catch (err: any) {
      console.error('Error updating calendar event:', err)
      Alert.alert('Error', 'Failed to update event')
      return false
    }
  }, [user, supabase])

  // Delete calendar event
  const deleteCalendarEvent = useCallback(async (eventId: string) => {
    if (!user || !supabase) return false
    
    try {
      const { error: deleteError } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId)
        .eq('created_by', user.id)

      if (deleteError) {
        throw deleteError
      }

      // Update local state
      setCalendarEvents(prev => prev.filter(event => event.id !== eventId))
      return true
    } catch (err: any) {
      console.error('Error deleting calendar event:', err)
      Alert.alert('Error', 'Failed to delete event')
      return false
    }
  }, [user, supabase])

  // Navigate to previous day
  const goToPreviousDay = () => {
    setSelectedDate(prevDate => subDays(prevDate, 1))
  }

  // Navigate to next day
  const goToNextDay = () => {
    setSelectedDate(prevDate => addDays(prevDate, 1))
  }

  // Go to today
  const goToToday = () => {
    setSelectedDate(new Date())
  }

  // Refresh control
  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchCalendarEvents().finally(() => setRefreshing(false))
  }, [fetchCalendarEvents])

  // Load events when component mounts or date changes
  useEffect(() => {
    if (user) {
      fetchCalendarEvents()
    }
  }, [user, fetchCalendarEvents])

  // Format event time
  const formatEventTime = (event: CalendarEvent) => {
    try {
      const start = new Date(event.start_time)
      const end = new Date(event.end_time)
      
      if (event.all_day) {
        return 'All day'
      }
      
      return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`
    } catch {
      return 'Invalid time'
    }
  }

  // Get event mood color
  const getEventMoodColor = (mood?: string) => {
    switch (mood) {
      case 'work': return '#3B82F6'
      case 'personal': return '#8B5CF6'
      case 'family': return '#F59E0B'
      case 'health': return '#10B981'
      case 'creative': return '#F97316'
      case 'social': return '#EC4899'
      default: return '#6B7280'
    }
  }

  // Swipeable Event Item Component
  const SwipeableEventItem: React.FC<{ item: CalendarEvent }> = ({ item }) => {
    const translateX = useSharedValue(0)
    const opacity = useSharedValue(1)
    const deleteButtonWidth = 80

    const panGesture = Gesture.Pan()
      .onUpdate((event) => {
        // Only allow left swipe (negative translation)
        translateX.value = Math.min(0, event.translationX)
      })
      .onEnd((event) => {
        const shouldDelete = event.translationX < -deleteButtonWidth
        
        if (shouldDelete) {
          // Animate to delete position
          translateX.value = withTiming(-screenWidth, { duration: 300 })
          opacity.value = withTiming(0, { duration: 300 }, () => {
            runOnJS(handleDeleteEvent)(item.id)
          })
        } else if (event.translationX < -deleteButtonWidth / 2) {
          // Show delete button
          translateX.value = withSpring(-deleteButtonWidth)
        } else {
          // Snap back to original position
          translateX.value = withSpring(0)
        }
      })

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
      opacity: opacity.value,
    }))

    const deleteButtonStyle = useAnimatedStyle(() => ({
      opacity: translateX.value < -10 ? 1 : 0,
      transform: [{ scale: translateX.value < -10 ? 1 : 0.8 }],
    }))

    return (
      <View style={styles.swipeContainer}>
        {/* Delete Button (behind the item) */}
        <Animated.View style={[styles.deleteButton, deleteButtonStyle]}>
          <TouchableOpacity
            style={styles.deleteButtonTouchable}
            onPress={() => {
              translateX.value = withSpring(0)
              handleDeleteEvent(item.id)
            }}
          >
            <Ionicons name="trash" size={24} color="white" />
          </TouchableOpacity>
        </Animated.View>

        {/* Event Item */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[animatedStyle]}>
            <TouchableOpacity 
              style={styles.eventItem} 
              activeOpacity={0.7}
              onPress={() => openEditModal(item)}
            >
              <View style={styles.eventHeader}>
                <View style={[styles.eventMoodIndicator, { backgroundColor: getEventMoodColor(item.mood || undefined) }]} />
                <View style={styles.eventContent}>
                  <Text style={styles.eventTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.description && (
                    <Text style={styles.eventDescription} numberOfLines={2}>
                      {item.description}
                    </Text>
                  )}
                  <View style={styles.eventMeta}>
                    <Text style={styles.eventTime}>
                      {formatEventTime(item)}
                    </Text>
                    {item.location && (
                      <Text style={styles.eventLocation} numberOfLines={1}>
                        📍 {item.location}
                      </Text>
                    )}
                  </View>
                  {item.tags && item.tags.length > 0 && (
                    <View style={styles.eventTags}>
                      {item.tags.slice(0, 3).map((tag: string, index: number) => (
                        <View key={index} style={styles.eventTag}>
                          <Text style={styles.eventTagText}>{tag}</Text>
                        </View>
                      ))}
                      {item.tags.length > 3 && (
                        <Text style={styles.moreTagsText}>+{item.tags.length - 3}</Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </GestureDetector>
      </View>
    )
  }

  // Render calendar event item (now uses SwipeableEventItem)
  const renderCalendarEvent = ({ item }: { item: CalendarEvent }) => (
    <SwipeableEventItem item={item} />
  )

  // Open edit modal
  const openEditModal = (event: CalendarEvent) => {
    console.log('Opening edit modal for event:', JSON.stringify(event, null, 2));
    setEditingEvent(event);
    setEditTitle(event.title || '');
    setEditDescription(event.description || '');
    setEditLocation(event.location || '');
    setEditMood(event.mood || '');
    setEditTags(event.tags || []);
    setNewTagInput('');
    setIsEditModalVisible(true);
  };

  // Save edited event
  const saveEditedEvent = async () => {
    if (!editingEvent) return
    
    const updates = {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      location: editLocation.trim() || null,
      mood: editMood || null,
      tags: editTags.length > 0 ? editTags : null,
      updated_at: new Date().toISOString(),
    }

    const success = await updateCalendarEvent(editingEvent.id, updates)
    if (success) {
      setIsEditModalVisible(false)
      setEditingEvent(null)
    }
  }

  // Add tag to event
  const addTagToEvent = () => {
    if (newTagInput.trim() && !editTags.includes(newTagInput.trim())) {
      setEditTags([...editTags, newTagInput.trim()])
      setNewTagInput('')
    }
  }

  // Remove tag from event
  const removeTagFromEvent = (tagToRemove: string) => {
    setEditTags(editTags.filter(tag => tag !== tagToRemove))
  }

  // Handle event deletion with confirmation
  const handleDeleteEvent = (eventId: string) => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteCalendarEvent(eventId),
        },
      ]
    )
  }

  // Loading state
  if (isLoading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.title}>Calendar</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#A855F7" />
          <Text style={styles.loadingText}>Loading calendar...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.title}>Calendar</Text>
        <TouchableOpacity style={styles.todayButton} onPress={goToToday}>
          <Text style={styles.todayButtonText}>Today</Text>
        </TouchableOpacity>
      </View>

      {/* Date Navigation */}
      <View style={styles.dateNavigation}>
        <TouchableOpacity style={styles.navButton} onPress={goToPreviousDay}>
          <Ionicons name="chevron-back" size={24} color="#A855F7" />
        </TouchableOpacity>
        
        <View style={styles.dateContainer}>
          <Text style={styles.dateText}>
            {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE')}
          </Text>
          <Text style={styles.dateSubtext}>
            {format(selectedDate, 'MMMM d, yyyy')}
          </Text>
        </View>
        
        <TouchableOpacity style={styles.navButton} onPress={goToNextDay}>
          <Ionicons name="chevron-forward" size={24} color="#A855F7" />
        </TouchableOpacity>
      </View>

      {/* Events List */}
      <View style={styles.eventsContainer}>
        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchCalendarEvents}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : calendarEvents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color="#6B7280" />
            <Text style={styles.emptyText}>No events</Text>
            <Text style={styles.emptySubtext}>
              {isToday(selectedDate) 
                ? 'Your calendar is clear for today' 
                : `No events for ${format(selectedDate, 'MMM d')}`}
            </Text>
          </View>
        ) : (
          <FlatList
            data={calendarEvents}
            renderItem={renderCalendarEvent}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={styles.eventsList}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Floating Action Button */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => Alert.alert('Coming Soon', 'Event creation will be added soon!')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={24} color="white" />
      </TouchableOpacity>

      {/* Edit Event Modal */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.taskModalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.keyboardAvoidingContainer}
              keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
            >
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={styles.taskModalContent}>
                  <View style={styles.taskModalHeader}>
                    <Text style={styles.taskModalTitle}>Edit Event</Text>
                    <TouchableOpacity 
                      style={styles.taskModalCloseButtonTouchable}
                      onPress={() => {
                        console.log('Close button pressed (CalendarScreen)');
                        setIsEditModalVisible(false);
                      }}
                      hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    >
                      <Ionicons name="close" size={26} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                  
                  <ScrollView 
                    style={styles.calendarEditFormScrollView} 
                    contentContainerStyle={styles.calendarEditFormContentContainer}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.calendarEditField}>
                      <Text style={styles.calendarEditLabel}>Title</Text>
                      <TextInput
                        style={styles.calendarEditInput}
                        value={editTitle}
                        onChangeText={setEditTitle}
                        placeholder="Event title"
                        placeholderTextColor="#6B7280"
                      />
                    </View>
                    
                    <View style={styles.calendarEditField}>
                      <Text style={styles.calendarEditLabel}>Description</Text>
                      <TextInput
                        style={[styles.calendarEditInput, styles.calendarEditTextArea]}
                        value={editDescription}
                        onChangeText={setEditDescription}
                        placeholder="Event description (optional)"
                        placeholderTextColor="#6B7280"
                        multiline
                        numberOfLines={3}
                      />
                    </View>
                    
                    <View style={styles.calendarEditField}>
                      <Text style={styles.calendarEditLabel}>Location</Text>
                      <TextInput
                        style={styles.calendarEditInput}
                        value={editLocation}
                        onChangeText={setEditLocation}
                        placeholder="Location (optional)"
                        placeholderTextColor="#6B7280"
                      />
                    </View>
                    
                    <View style={styles.calendarEditField}>
                      <Text style={styles.calendarEditLabel}>Mood/Category</Text>
                      <View style={styles.calendarMoodSelector}>
                        {['work', 'personal', 'family', 'health', 'creative', 'social', 'other'].map((mood) => (
                          <TouchableOpacity
                            key={mood}
                            style={[
                              styles.calendarMoodOption,
                              { 
                                backgroundColor: editMood === mood ? getEventMoodColor(mood) : 'transparent',
                                borderColor: editMood === mood ? getEventMoodColor(mood) : '#4B5563',
                              }
                            ]}
                            onPress={() => setEditMood(editMood === mood ? '' : mood)}
                          >
                            <Text style={[
                              styles.calendarMoodOptionText,
                              { color: editMood === mood ? 'white' : '#AEB2BA' }
                            ]}>
                              {mood.charAt(0).toUpperCase() + mood.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    
                    <View style={styles.calendarEditField}>
                      <Text style={styles.calendarEditLabel}>Tags</Text>
                      {editTags.length > 0 && (
                        <View style={styles.calendarEditTagsContainer}>
                          {editTags.map((tag, index) => (
                            <View key={index} style={styles.calendarEditTagChip}>
                              <Text style={styles.calendarEditTagText}>{tag}</Text>
                              <TouchableOpacity
                                style={styles.calendarRemoveTagButton}
                                onPress={() => removeTagFromEvent(tag)}
                              >
                                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}
                      <View style={styles.calendarAddTagContainer}>
                        <TextInput
                          style={styles.calendarTagInput}
                          value={newTagInput}
                          onChangeText={setNewTagInput}
                          placeholder="Add a tag..."
                          placeholderTextColor="#6B7280"
                          onSubmitEditing={addTagToEvent}
                          returnKeyType="done"
                        />
                        <TouchableOpacity
                          style={[styles.calendarAddTagButton, !newTagInput.trim() && styles.calendarAddTagButtonDisabled]}
                          onPress={addTagToEvent}
                          disabled={!newTagInput.trim()}
                        >
                          <Ionicons name="add" size={24} color="white" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    
                    <TouchableOpacity
                      style={styles.taskSaveButton}
                      onPress={saveEditedEvent}
                    >
                      <Text style={styles.taskSaveButtonText}>Save Changes</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  )
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  todayButton: {
    backgroundColor: '#A855F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  todayButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  placeholder: {
    width: 24,
  },
  dateNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#1F2937',
  },
  navButton: {
    padding: 12,
  },
  dateContainer: {
    alignItems: 'center',
    flex: 1,
  },
  dateText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  dateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  eventsContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  retryButton: {
    backgroundColor: '#A855F7',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  eventsList: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  eventItem: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  eventMoodIndicator: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    marginRight: 12,
    minHeight: 60,
  },
  eventContent: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  eventDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventTime: {
    fontSize: 12,
    color: '#6B7280',
    marginRight: 12,
  },
  eventLocation: {
    fontSize: 12,
    color: '#9CA3AF',
    flex: 1,
  },
  eventTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  eventTag: {
    backgroundColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  eventTagText: {
    fontSize: 11,
    color: '#D1D5DB',
  },
  moreTagsText: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
    alignSelf: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#A855F7',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  swipeContainer: {
    marginBottom: 12,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    overflow: 'hidden',
  },
  deleteButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  deleteButtonTouchable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  taskModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardAvoidingContainer: {
    width: '90%',
    maxHeight: '85%',
  },
  taskModalContent: {
    backgroundColor: '#1F2937',
    borderRadius: 16,        
    padding: 20,             
    width: '100%',
    maxHeight: '100%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  taskModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  taskModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  taskModalCloseButtonTouchable: {
    padding: 8,
  },
  calendarEditFormScrollView: {
  },
  calendarEditFormContentContainer: {
    paddingBottom: 20,
  },
  calendarEditField: {
    marginBottom: 16,
  },
  calendarEditLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  calendarEditInput: {
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: 'white',
    fontSize: 16,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  calendarEditTextArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  calendarMoodSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  calendarMoodOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  calendarMoodOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  calendarEditTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  calendarEditTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  calendarEditTagText: {
    fontSize: 14,
    color: '#D1D5DB',
  },
  calendarRemoveTagButton: {
  },
  calendarAddTagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarTagInput: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: 'white',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  calendarAddTagButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#4B5563',
  },
  calendarAddTagButtonDisabled: {
    backgroundColor: '#2b313a',
  },
  taskSaveButton: {
    backgroundColor: '#A855F7',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  taskSaveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButtonTouchable: {
    padding: 8,
  },
})

export default CalendarScreen 