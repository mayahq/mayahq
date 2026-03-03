import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Modal,
  Switch,
  FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase/client'
import { Ionicons } from '@expo/vector-icons'
import { format, isToday, isPast, parseISO, startOfDay, endOfDay } from 'date-fns'
import { 
  Task, 
  TaskStatus, 
  TaskPriority, 
  listTasks, 
  createQuickTask, 
  updateTask, 
  deleteTask as deleteTaskUtil, 
  toggleTaskStatus 
} from '../lib/tasks'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../navigation'

// Use the centralized calendar event type from @supabase-client
import type { Tables } from '@mayahq/supabase-client'

// Simple calendar event interface - just what we need
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

type TasksScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Main'>

const TasksScreen: React.FC = () => {
  const { user } = useAuthContext()
  const navigation = useNavigation<TasksScreenNavigationProp>()
  
  // State management
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Task input state
  const [newTaskContent, setNewTaskContent] = useState('')
  const [isSubmittingTask, setIsSubmittingTask] = useState(false)
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('open')
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false)
  
  // Edit state
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [editTaskContent, setEditTaskContent] = useState('')
  const [editTaskNote, setEditTaskNote] = useState('')

  // Detailed view state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false)
  const [detailTaskContent, setDetailTaskContent] = useState('')
  const [detailTaskNote, setDetailTaskNote] = useState('')
  const [detailTaskPriority, setDetailTaskPriority] = useState<TaskPriority>('medium')
  const [detailTaskTags, setDetailTaskTags] = useState<string[]>([])
  const [detailTaskDueDate, setDetailTaskDueDate] = useState<Date | null>(null)
  const [newTagInput, setNewTagInput] = useState('')

  // Fetch tasks function
  const fetchTasks = useCallback(async () => {
    if (!user || !supabase) return
    
    setIsLoading(true)
    try {
      const fetchedTasks = await listTasks(supabase, user.id, statusFilter)
      setTasks(fetchedTasks)
      setError(null)
    } catch (err) {
      console.error('Error in fetchTasks:', err)
      setError('Failed to load tasks')
    } finally {
      setIsLoading(false)
    }
  }, [user, supabase, statusFilter])

  // Add new task
  const addTask = async () => {
    if (!user || !supabase || !newTaskContent.trim()) return
    
    setIsSubmittingTask(true)
    try {
      const newTask = await createQuickTask(supabase, user.id, newTaskContent.trim())
      
      if (newTask) {
        setNewTaskContent('')
        fetchTasks()
      } else {
        Alert.alert('Error', 'Failed to add task')
      }
    } catch (err) {
      console.error('Error in addTask:', err)
      Alert.alert('Error', 'Failed to add task')
    } finally {
      setIsSubmittingTask(false)
    }
  }

  // Update task status
  const updateTaskStatus = async (taskId: number, newStatus: TaskStatus) => {
    if (!user || !supabase) return
    
    try {
      const updatedTask = await updateTask(supabase, taskId, { status: newStatus }, user.id)
      
      if (updatedTask) {
        fetchTasks()
      } else {
        Alert.alert('Error', 'Failed to update task')
      }
    } catch (err) {
      console.error('Error in updateTaskStatus:', err)
      Alert.alert('Error', 'Failed to update task')
    }
  }

  // Toggle task status
  const handleToggleTaskStatus = async (task: Task) => {
    if (!user || !supabase) return
    
    try {
      const updatedTask = await toggleTaskStatus(supabase, task.id, task.status, user.id)
      
      if (updatedTask) {
        fetchTasks()
      } else {
        Alert.alert('Error', 'Failed to update task')
      }
    } catch (err) {
      console.error('Error in handleToggleTaskStatus:', err)
      Alert.alert('Error', 'Failed to update task')
    }
  }

  // Edit task
  const saveEditedTask = async () => {
    if (!user || !supabase || editingTaskId === null) return
    
    try {
      const updatedTask = await updateTask(
        supabase, 
        editingTaskId, 
        {
          content: editTaskContent.trim(),
          note: editTaskNote.trim() || null,
        }, 
        user.id
      )
      
      if (updatedTask) {
        setEditingTaskId(null)
        setEditTaskContent('')
        setEditTaskNote('')
        fetchTasks()
      } else {
        Alert.alert('Error', 'Failed to update task')
      }
    } catch (err) {
      console.error('Error in saveEditedTask:', err)
      Alert.alert('Error', 'Failed to update task')
    }
  }

  // Open detailed task view
  const openTaskDetail = (task: Task) => {
    setSelectedTask(task)
    setDetailTaskContent(task.content)
    setDetailTaskNote(task.note || '')
    setDetailTaskPriority((task.priority as TaskPriority) || 'medium')
    setDetailTaskTags(task.tags || [])
    setDetailTaskDueDate(task.due_at ? parseISO(task.due_at) : null)
    setIsDetailModalVisible(true)
  }

  // Save detailed task changes
  const saveDetailedTask = async () => {
    if (!user || !supabase || !selectedTask) return
    
    try {
      const updatedTask = await updateTask(
        supabase,
        selectedTask.id,
        {
          content: detailTaskContent.trim(),
          note: detailTaskNote.trim() || null,
          priority: detailTaskPriority,
          tags: detailTaskTags.length > 0 ? detailTaskTags : null,
          due_at: detailTaskDueDate?.toISOString() || null,
        },
        user.id
      )
      
      if (updatedTask) {
        setIsDetailModalVisible(false)
        setSelectedTask(null)
        fetchTasks()
      } else {
        Alert.alert('Error', 'Failed to update task')
      }
    } catch (err) {
      console.error('Error in saveDetailedTask:', err)
      Alert.alert('Error', 'Failed to update task')
    }
  }

  // Add tag to detail task
  const addTagToDetailTask = () => {
    if (newTagInput.trim() && !detailTaskTags.includes(newTagInput.trim())) {
      setDetailTaskTags([...detailTaskTags, newTagInput.trim()])
      setNewTagInput('')
    }
  }

  // Remove tag from detail task
  const removeTagFromDetailTask = (tagToRemove: string) => {
    setDetailTaskTags(detailTaskTags.filter(tag => tag !== tagToRemove))
  }

  // Delete task
  const deleteTask = async (taskId: number) => {
    if (!user || !supabase) return
    
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteTaskUtil(supabase, taskId, user.id)
              
              if (success) {
                fetchTasks()
              } else {
                Alert.alert('Error', 'Failed to delete task')
              }
            } catch (err) {
              console.error('Error in deleteTask:', err)
              Alert.alert('Error', 'Failed to delete task')
            }
          },
        },
      ]
    )
  }

  // Refresh control
  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchTasks().finally(() => setRefreshing(false))
  }, [fetchTasks])

  // Initial load
  useEffect(() => {
    if (user) {
      fetchTasks()
    }
  }, [user, fetchTasks])

  // Format time ago
  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return ''
    try {
      return format(new Date(dateString), 'MMM d, yyyy')
    } catch {
      return ''
    }
  }

  // Format due date
  const formatDueDate = (dueDateString: string | null) => {
    if (!dueDateString) return null
    try {
      const dueDate = parseISO(dueDateString)
      if (isToday(dueDate)) return 'Due today'
      if (isPast(dueDate)) return 'Overdue'
      return `Due ${format(dueDate, 'MMM d')}`
    } catch {
      return null
    }
  }

  // Get due date color
  const getDueDateColor = (dueDateString: string | null) => {
    if (!dueDateString) return '#6B7280'
    try {
      const dueDate = parseISO(dueDateString)
      if (isPast(dueDate) && !isToday(dueDate)) return '#EF4444' // Overdue - red
      if (isToday(dueDate)) return '#F59E0B' // Due today - amber
      return '#3B82F6' // Future - blue
    } catch {
      return '#6B7280'
    }
  }

  // Get status color
  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'done': return '#10B981'
      case 'canceled': return '#EF4444'
      default: return '#3B82F6'
    }
  }

  // Get status icon
  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'done': return 'checkmark-circle'
      case 'canceled': return 'close-circle'
      default: return 'ellipse-outline'
    }
  }

  // Get priority background color
  const getPriorityBackgroundColor = (priority: string | null, status: string | null) => {
    // Don't show priority colors for completed/canceled tasks
    if (status === 'done' || status === 'canceled') {
      return '#1F2937' // Default background
    }
    
    switch (priority) {
      case 'high': return '#1F1B2E' // Very subtle red tint
      case 'low': return '#1A2B20'  // Very subtle green tint
      default: return '#1F2937'     // Default background (medium priority)
    }
  }

  // Render task item
  const renderTaskItem = ({ item }: { item: Task }) => (
    <TouchableOpacity
      style={[
        styles.taskItem,
        { backgroundColor: getPriorityBackgroundColor(item.priority, item.status) }
      ]}
      onPress={() => openTaskDetail(item)}
      activeOpacity={0.7}
    >
      <View style={styles.taskHeader}>
        <TouchableOpacity
          style={styles.statusButton}
          onPress={() => handleToggleTaskStatus(item)}
        >
          <Ionicons
            name={getStatusIcon(item.status)}
            size={24}
            color={getStatusColor(item.status)}
          />
        </TouchableOpacity>
        
        <View style={styles.taskContent}>
          <View style={styles.taskMainContent}>
            <View style={styles.taskMainRow}>
              <Text 
                style={[
                  styles.taskText,
                  item.status === 'done' && styles.completedTaskText
                ]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {item.content}
              </Text>
            </View>
            
            {/* Tags row */}
            {item.tags && item.tags.length > 0 && (
              <View style={styles.tagsRow}>
                {item.tags.slice(0, 3).map((tag, index) => (
                  <View key={index} style={styles.tagChip}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
                {item.tags.length > 3 && (
                  <Text style={styles.moreTagsText}>+{item.tags.length - 3}</Text>
                )}
              </View>
            )}
          </View>
          
          <View style={styles.taskMeta}>
            <Text style={styles.taskDate}>
              {formatTimeAgo(item.created_at)}
            </Text>
            
            {/* Due date */}
            {item.due_at && (
              <Text style={[styles.dueDateText, { color: getDueDateColor(item.due_at) }]}>
                {formatDueDate(item.due_at)}
              </Text>
            )}
            
            {item.status === 'done' && item.completed_at && (
              <Text style={styles.completedDate}>
                Completed {formatTimeAgo(item.completed_at)}
              </Text>
            )}
          </View>
        </View>
        
        <View style={styles.taskActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => deleteTask(item.id)}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  )

  // Loading state
  if (isLoading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Tasks</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#A855F7" />
          <Text style={styles.loadingText}>Loading tasks...</Text>
        </View>
      </SafeAreaView>
    )
  }

  // Not authenticated
  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Tasks</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Please log in to view your tasks.</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.calendarButton}
            onPress={() => navigation.navigate('Calendar')}
          >
            <Ionicons name="calendar" size={24} color="#A855F7" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setIsFilterModalVisible(true)}
          >
            <Ionicons name="filter" size={24} color="#A855F7" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Task Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.taskInput}
          placeholder="Add a new task..."
          placeholderTextColor="#6B7280"
          value={newTaskContent}
          onChangeText={setNewTaskContent}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.addButton, !newTaskContent.trim() && styles.addButtonDisabled]}
          onPress={addTask}
          disabled={!newTaskContent.trim() || isSubmittingTask}
        >
          {isSubmittingTask ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="add" size={24} color="white" />
          )}
        </TouchableOpacity>
      </View>

      {/* Error message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Task List */}
      <FlatList
        data={tasks}
        renderItem={renderTaskItem}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={tasks.length === 0 ? styles.emptyListContainer : styles.listContainer}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkbox-outline" size={64} color="#6B7280" />
            <Text style={styles.emptyText}>No tasks found</Text>
            <Text style={styles.emptySubtext}>
              {statusFilter === 'all' ? 'Start by adding a new task!' : `No ${statusFilter} tasks found.`}
            </Text>
          </View>
        )}
      />

      {/* Filter Modal */}
      <Modal
        visible={isFilterModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Tasks</Text>
              <TouchableOpacity onPress={() => setIsFilterModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.filterOptions}>
              {(['all', 'open', 'done', 'canceled'] as const).map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.filterOption,
                    statusFilter === status && styles.filterOptionActive
                  ]}
                  onPress={() => {
                    setStatusFilter(status)
                    setIsFilterModalVisible(false)
                  }}
                >
                  <Text style={[
                    styles.filterOptionText,
                    statusFilter === status && styles.filterOptionTextActive
                  ]}>
                    {status.charAt(0).toUpperCase() + status.slice(1)} Tasks
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        visible={editingTaskId !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingTaskId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Task</Text>
              <TouchableOpacity onPress={() => setEditingTaskId(null)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.editForm}>
              <Text style={styles.editLabel}>Task Content</Text>
              <TextInput
                style={styles.editInput}
                value={editTaskContent}
                onChangeText={setEditTaskContent}
                multiline
                maxLength={500}
              />
              
              <Text style={styles.editLabel}>Note (Optional)</Text>
              <TextInput
                style={styles.editInput}
                value={editTaskNote}
                onChangeText={setEditTaskNote}
                multiline
                placeholder="Add a note..."
                placeholderTextColor="#6B7280"
                maxLength={1000}
              />
              
              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveEditedTask}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal
        visible={isDetailModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Task Details</Text>
              <TouchableOpacity onPress={() => setIsDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.detailForm}>
              <Text style={styles.detailLabel}>Task Content</Text>
              <TextInput
                style={styles.detailInput}
                value={detailTaskContent}
                onChangeText={setDetailTaskContent}
                multiline
                maxLength={500}
              />
              
              <Text style={styles.detailLabel}>Note (Optional)</Text>
              <TextInput
                style={styles.detailInput}
                value={detailTaskNote}
                onChangeText={setDetailTaskNote}
                multiline
                placeholder="Add a note..."
                placeholderTextColor="#6B7280"
                maxLength={1000}
              />
              
              <Text style={styles.detailLabel}>Priority</Text>
              <View style={styles.prioritySelector}>
                {(['high', 'medium', 'low'] as const).map((priority) => (
                  <TouchableOpacity
                    key={priority}
                    style={[
                      styles.priorityOption,
                      detailTaskPriority === priority && styles.priorityOptionActive
                    ]}
                    onPress={() => setDetailTaskPriority(priority as TaskPriority)}
                  >
                    <Text style={[
                      styles.priorityOptionText,
                      detailTaskPriority === priority && styles.priorityOptionTextActive
                    ]}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <Text style={styles.detailLabel}>Tags</Text>
              <View style={styles.tagInputContainer}>
                {detailTaskTags.map((tag, index) => (
                  <View key={index} style={styles.tagChip}>
                    <Text style={styles.tagText}>{tag}</Text>
                    <TouchableOpacity
                      style={styles.removeTagButton}
                      onPress={() => removeTagFromDetailTask(tag)}
                    >
                      <Ionicons name="close" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
              
              <View style={styles.addTagContainer}>
                <TextInput
                  style={styles.tagInput}
                  value={newTagInput}
                  onChangeText={setNewTagInput}
                  placeholder="Add a tag..."
                  placeholderTextColor="#6B7280"
                  onSubmitEditing={addTagToDetailTask}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.addTagButton, !newTagInput.trim() && styles.addTagButtonDisabled]}
                  onPress={addTagToDetailTask}
                  disabled={!newTagInput.trim()}
                >
                  <Ionicons name="add" size={20} color="white" />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.detailLabel}>Due Date</Text>
              <View style={styles.dueDateContainer}>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => {
                    // For now, we'll use a simple prompt - later can be enhanced with date picker
                    Alert.prompt(
                      'Set Due Date',
                      'Enter date (YYYY-MM-DD):',
                      (text) => {
                        if (text) {
                          try {
                            const date = parseISO(text)
                            setDetailTaskDueDate(date)
                          } catch {
                            Alert.alert('Invalid Date', 'Please enter a valid date in YYYY-MM-DD format')
                          }
                        }
                      },
                      'plain-text',
                      detailTaskDueDate ? format(detailTaskDueDate, 'yyyy-MM-dd') : ''
                    )
                  }}
                >
                  <Text style={styles.datePickerText}>
                    {detailTaskDueDate ? format(detailTaskDueDate, 'MMM d, yyyy') : 'Set due date'}
                  </Text>
                  <Ionicons name="calendar" size={20} color="#6B7280" />
                </TouchableOpacity>
                
                {detailTaskDueDate && (
                  <TouchableOpacity
                    style={styles.clearDateButton}
                    onPress={() => setDetailTaskDueDate(null)}
                  >
                    <Ionicons name="close" size={20} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
              
              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveDetailedTask}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  filterButton: {
    padding: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'flex-end',
  },
  taskInput: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: 'white',
    fontSize: 16,
    maxHeight: 100,
    marginRight: 12,
  },
  addButton: {
    backgroundColor: '#A855F7',
    borderRadius: 12,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#6B7280',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  listContainer: {
    paddingHorizontal: 20,
  },
  emptyListContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
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
  taskItem: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    marginVertical: 6,
    padding: 16,
    minHeight: 120,
    maxHeight: 120,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    height: '100%',
  },
  statusButton: {
    marginRight: 12,
    marginTop: 2,
  },
  taskContent: {
    flex: 1,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  taskMainContent: {
    flex: 1,
  },
  taskMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  taskText: {
    fontSize: 16,
    color: 'white',
    lineHeight: 20,
    flex: 1,
  },
  completedTaskText: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 4,
  },
  tagText: {
    fontSize: 11,
    color: '#D1D5DB',
  },
  moreTagsText: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  taskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'flex-end',
  },
  taskDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  dueDateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  completedDate: {
    fontSize: 12,
    color: '#10B981',
  },
  taskActions: {
    flexDirection: 'row',
    marginLeft: 12,
    alignSelf: 'flex-start',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  filterOptions: {
    gap: 8,
  },
  filterOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#374151',
  },
  filterOptionActive: {
    backgroundColor: '#A855F7',
  },
  filterOptionText: {
    fontSize: 16,
    color: 'white',
  },
  filterOptionTextActive: {
    fontWeight: '600',
  },
  editForm: {
    gap: 16,
  },
  editLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  editInput: {
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: 'white',
    fontSize: 16,
    minHeight: 44,
  },
  saveButton: {
    backgroundColor: '#A855F7',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  detailForm: {
    gap: 16,
  },
  detailLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  detailInput: {
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: 'white',
    fontSize: 16,
    minHeight: 44,
  },
  prioritySelector: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityOption: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#374151',
  },
  priorityOptionActive: {
    backgroundColor: '#A855F7',
  },
  priorityOptionText: {
    fontSize: 16,
    color: 'white',
  },
  priorityOptionTextActive: {
    fontWeight: '600',
  },
  tagInputContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagInput: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: 'white',
    fontSize: 16,
  },
  addTagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addTagButton: {
    backgroundColor: '#A855F7',
    borderRadius: 8,
    padding: 8,
  },
  addTagButtonDisabled: {
    backgroundColor: '#6B7280',
  },
  dueDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  datePickerText: {
    fontSize: 16,
    color: 'white',
  },
  removeTagButton: {
    padding: 4,
  },
  clearDateButton: {
    padding: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarButton: {
    padding: 8,
  },
})

export default TasksScreen 