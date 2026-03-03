'use client';

import { useState, useEffect } from 'react';
import { Task, TaskStatus, TaskPriority, listTasks, updateTask } from '@/lib/db/tasks';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { CheckSquare, Square, Filter, Clock, Tag, Edit3, Save, X, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface TaskListProps {
  initialStatus?: TaskStatus | 'all';
  initialTag?: string;
  darkMode?: boolean;
}

export default function TaskList({ initialStatus = 'open', initialTag, darkMode = false }: TaskListProps) {
  const { user, supabase } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<TaskStatus | 'all'>(initialStatus);
  const [tag, setTag] = useState<string | undefined>(initialTag);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // State for editing
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editedTaskData, setEditedTaskData] = useState<Partial<Task>>({});
  
  // State for highlighting new/completed/deleted tasks
  const [highlightedTask, setHighlightedTask] = useState<{ id: number, type: 'new' | 'completed' | 'deleted' } | null>(null);

  const fetchTasks = async () => {
    if (!user || !supabase) return;
    
    setIsLoading(true);
    try {
      const fetchedTasks = await listTasks(supabase, user.id, status, tag);
      setTasks(fetchedTasks);
      setError(null);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError('Failed to load tasks. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !supabase || typeof supabase.channel !== 'function') {
      return;
    }
    if (editingTaskId) {
      setEditingTaskId(null);
      setEditedTaskData({});
    }
    fetchTasks();
  }, [user, status, tag, supabase]);

  // Realtime subscription effect
  useEffect(() => {
    if (!user || !supabase || typeof supabase.channel !== 'function') {
      return;
    }

    let taskChannel: RealtimeChannel | null = null;

    try {
      taskChannel = supabase
        .channel('tasks-realtime-feed')
        .on(
          'postgres_changes',
          { 
            event: '*', 
            schema: 'public', 
            table: 'tasks',
            filter: `user_id=eq.${user.id}`
          },
          (payload: RealtimePostgresChangesPayload<Task>) => {
            console.log('Realtime Task Change received!', payload);
            const { eventType, new: newRecord, old: oldRecord } = payload;

            setTasks(currentTasks => {
              let updatedTasks = [...currentTasks];
              if (eventType === 'INSERT') {
                const typedNewRecord = newRecord as Task;
                if (!currentTasks.find(task => task.id === typedNewRecord.id)) {
                  const matchesStatus = status === 'all' || typedNewRecord.status === status;
                  const matchesTag = !tag || (typedNewRecord.tags && typedNewRecord.tags.includes(tag));
                  if (matchesStatus && matchesTag) {
                    updatedTasks = [typedNewRecord, ...currentTasks];
                    setHighlightedTask({ id: typedNewRecord.id, type: 'new' });
                  }
                } else { // Task might already exist due to optimistic update or rapid events, update it
                  updatedTasks = currentTasks.map(task => task.id === typedNewRecord.id ? typedNewRecord : task);
                }
              } else if (eventType === 'UPDATE') {
                const typedNewRecord = newRecord as Task;
                const taskIndex = currentTasks.findIndex(task => task.id === typedNewRecord.id);
                const matchesFilters = (status === 'all' || typedNewRecord.status === status) && 
                                       (!tag || (typedNewRecord.tags && typedNewRecord.tags.includes(tag)));

                if (matchesFilters) {
                  if (taskIndex !== -1) {
                    updatedTasks[taskIndex] = typedNewRecord;
                     // Highlight if status changed to 'done'
                    if (typedNewRecord.status === 'done' && currentTasks[taskIndex]?.status !== 'done') {
                        setHighlightedTask({ id: typedNewRecord.id, type: 'completed' });
                    }
                  } else {
                    updatedTasks = [typedNewRecord, ...currentTasks]; // Add if it now matches filters
                  }
                } else {
                  if (taskIndex !== -1) { // Remove if it no longer matches filters
                    updatedTasks = currentTasks.filter(task => task.id !== typedNewRecord.id);
                  }
                }
              } else if (eventType === 'DELETE') {
                const typedOldRecord = oldRecord as { id?: number }; 
                if (typedOldRecord && typeof typedOldRecord.id === 'number') {
                  // No need to setHighlightedTask for delete here, exit animation handles visual
                  updatedTasks = currentTasks.filter(task => task.id !== typedOldRecord.id);
                }
              }
              return updatedTasks.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            });
          }
        );

      if (taskChannel) {
        taskChannel.subscribe((subscribeStatus, err) => {
          if (subscribeStatus === 'SUBSCRIBED') {
            console.log('Successfully subscribed to tasks realtime channel!');
          } else if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT' || err) {
            console.error('Realtime subscription error:', err || subscribeStatus);
          }
        });
      } else {
        console.error("Failed to create realtime channel, cannot subscribe.");
      }
    } catch (e) {
        console.error("Error setting up realtime subscription:", e); 
    }
    
    return () => {
      if (taskChannel) {
        supabase.removeChannel(taskChannel).catch(e => console.error("Error removing channel:", e));
      }
    };
  }, [user, supabase, status, tag]); // status, tag dependencies for re-evaluating filter logic in callback

  const handleStatusChange = async (taskId: number, newStatus: TaskStatus) => {
    if (!user || !supabase) return;
    const oldTask = tasks.find(t => t.id === taskId);
    try {
      const updatedTask = await updateTask(supabase, taskId, { status: newStatus }, user.id);
      if (updatedTask) {
        // Optimistically update UI and then fetch or rely on realtime
        setTasks(prevTasks => prevTasks.map(t => t.id === taskId ? updatedTask : t));
        if (newStatus === 'done' && oldTask?.status !== 'done') {
          setHighlightedTask({ id: taskId, type: 'completed' });
        }
        // fetchTasks(); // Realtime should handle this, but can keep for robustness
      }
    } catch (err) {
      console.error('Error updating task:', err);
      setError('Failed to update task. Please try again.');
    }
  };

  // Edit functions
  const handleEdit = (task: Task) => {
    setEditingTaskId(task.id);
    setEditedTaskData({ 
      content: task.content,
      note: task.note,
      priority: task.priority,
      due_at: task.due_at, // Keep as string initially, convert on save if needed
      tags: task.tags
    });
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditedTaskData({});
  };

  const handleEditInputChange = (field: keyof Task, value: any) => {
    setEditedTaskData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async (taskId: number) => {
    if (!user || !supabase) return;
    // setIsLoading(true); // Handled by main isLoading or could be task-specific
    const originalTask = tasks.find(t => t.id === taskId);
    try {
      const updatesToApply: Partial<Task> = { ...editedTaskData };
      // Ensure due_at is Date or null if provided as string
      if (updatesToApply.due_at && typeof updatesToApply.due_at === 'string') {
        updatesToApply.due_at = updatesToApply.due_at ? new Date(updatesToApply.due_at).toISOString() : null;
      }
      // Ensure tags are an array of strings
      if (updatesToApply.tags && typeof updatesToApply.tags === 'string') {
        updatesToApply.tags = (updatesToApply.tags as string).split(',').map(t => t.trim()).filter(t => t);
      }

      const updatedTask = await updateTask(supabase, taskId, updatesToApply, user.id);
      if (updatedTask) {
        setEditingTaskId(null);
        setEditedTaskData({});
        // Highlight if status changed to 'done' during edit
        if (updatedTask.status === 'done' && originalTask?.status !== 'done' && editedTaskData.status === 'done') {
            setHighlightedTask({ id: updatedTask.id, type: 'completed' });
        }
        // fetchTasks(); // Realtime should handle this
      } else {
        setError('Failed to save task. Please try again.');
      }
    } catch (err) {
      console.error('Error saving task:', err);
      setError('Failed to save task. Please try again.');
    }
  };

  const statusOptions: { value: TaskStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'done', label: 'Done' },
    { value: 'canceled', label: 'Canceled' }
  ];

  // Function to get priority badge style
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return darkMode 
          ? 'bg-red-900/40 text-red-300 border border-red-700/50' 
          : 'bg-red-100 text-red-800 border border-red-200';
      case 'normal':
        return darkMode 
          ? 'bg-blue-900/40 text-blue-300 border border-blue-700/50' 
          : 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'low':
        return darkMode 
          ? 'bg-gray-800 text-gray-300 border border-gray-700' 
          : 'bg-gray-100 text-gray-800 border border-gray-200';
      default:
        return darkMode 
          ? 'bg-gray-800 text-gray-300 border border-gray-700' 
          : 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  // Function to format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No date set';
    return format(new Date(dateString), 'MMM d, yyyy');
  };

  const getTagStyle = (darkMode: boolean) => 
    darkMode 
      ? 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-gray-200 cursor-pointer' 
      : 'bg-gray-100 text-gray-800 border border-gray-200 hover:bg-gray-200 cursor-pointer';

  // Animation variants
  const taskItemVariants = {
    initial: { opacity: 0, y: 20, scale: 0.98 },
    animate: ({ type }: { type?: 'new' | 'completed' | 'deleted' }) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      boxShadow: 
        type === 'new' ? '0 0 10px 3px rgba(74, 222, 128, 0.4)' : // Green glow for new
        type === 'completed' ? '0 0 10px 3px rgba(74, 222, 128, 0.4)' : // Green glow for completed
        'none',
      transition: { 
        duration: 0.4, 
        ease: "easeOut",
        boxShadow: { duration: 0.2, delay: 0.3, ease: "linear", onComplete: () => setHighlightedTask(null) } // Fade out glow
      }
    }),
    exit: {
      opacity: 0,
      x: 50,
      scale:0.95,
      boxShadow: '0 0 10px 3px rgba(239, 68, 68, 0.4)', // Red glow for deleted
      transition: { duration: 0.3, ease: "easeIn" }
    }
  };
  
  const checkmarkVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: { 
      pathLength: 1, 
      opacity: 1, 
      transition: { duration: 0.3, ease: "easeInOut" } 
    }
  };

  return (
    <div className={`w-full ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold flex items-center">
          Tasks
          {tasks.length > 0 && (
            <span className={`ml-3 text-sm font-medium px-2 py-1 rounded-full ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>
              {tasks.length}
            </span>
          )}
        </h2>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-md flex items-center gap-1.5 text-sm ${
              darkMode 
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            } transition-colors`}
          >
            <Filter className="h-4 w-4" />
            <span>Filters {tag || status !== 'all' ? '(Active)' : ''}</span>
          </button>
          
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus | 'all')}
            className={`px-3 py-2 rounded-md text-sm ${
              darkMode 
                ? 'bg-gray-800 border border-gray-700 text-gray-300' 
                : 'bg-white border border-gray-300 text-gray-800'
            }`}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {showFilters && (
        <div className={`mb-4 p-4 rounded-lg ${darkMode ? 'bg-gray-800/50 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Filter by:</span>
            
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => setStatus(option.value)}
                  className={`px-3 py-1 text-xs rounded-full ${
                    status === option.value
                      ? darkMode 
                          ? 'bg-purple-900/50 text-purple-300 border border-purple-700' 
                          : 'bg-purple-100 text-purple-800 border border-purple-200'
                      : darkMode 
                          ? 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700' 
                          : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            
            {tag && (
              <div className="flex items-center gap-1 ml-2">
                <Tag className="h-3 w-3" />
                <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Tag:</span>
                <div className="flex items-center gap-1">
                  <span className={`px-2 py-1 rounded-md text-xs ${
                    darkMode 
                      ? 'bg-blue-900/40 text-blue-300 border border-blue-700/50' 
                      : 'bg-blue-100 text-blue-800 border border-blue-200'
                  }`}>
                    {tag}
                  </span>
                  <button 
                    onClick={() => setTag(undefined)}
                    className={`text-xs px-1.5 rounded-full ${
                      darkMode 
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className={`animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 ${darkMode ? 'border-gray-300' : 'border-gray-900'}`}></div>
        </div>
      ) : error ? (
        <div className={`p-4 rounded-md ${darkMode ? 'bg-red-900/20 text-red-300 border border-red-900/30' : 'bg-red-100 text-red-700 border border-red-200'}`}>
          {error}
        </div>
      ) : tasks.length === 0 ? (
        <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <div className="mx-auto w-16 h-16 mb-4 flex items-center justify-center rounded-full bg-opacity-10 bg-gray-400">
            <Clock className={`h-8 w-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          </div>
          <p className="text-lg font-medium mb-1">No tasks found</p>
          <p className="text-sm">Start by adding a new task!</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {tasks.map((task) => (
              <motion.div 
                key={task.id} 
                layout // Smoothly animates position changes
                variants={taskItemVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                custom={{ // Pass custom props to variants
                  type: highlightedTask?.id === task.id ? highlightedTask.type : undefined 
                }}
                className={`rounded-lg p-4 ${
                  darkMode 
                    ? 'bg-gray-900/70 border border-gray-800' 
                    : 'bg-white border border-gray-200'
                } transition-all ${editingTaskId === task.id ? (darkMode ? 'ring-2 ring-purple-500' : 'ring-2 ring-purple-500') : ''}`}
                // Removed hover styles here to let boxShadow animation be more prominent
              >
                {editingTaskId === task.id ? (
                  // Edit Mode
                  <div className="space-y-3">
                    <div>
                      <label htmlFor={`edit-content-${task.id}`} className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Content</label>
                      <textarea
                        id={`edit-content-${task.id}`}
                        value={editedTaskData.content || ''}
                        onChange={(e) => handleEditInputChange('content', e.target.value)}
                        rows={3}
                        className={`w-full p-2 border rounded-md ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300'}`}
                      />
                    </div>
                    <div>
                      <label htmlFor={`edit-note-${task.id}`} className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Note</label>
                      <textarea
                        id={`edit-note-${task.id}`}
                        value={editedTaskData.note || ''}
                        onChange={(e) => handleEditInputChange('note', e.target.value)}
                        rows={2}
                        className={`w-full p-2 border rounded-md ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300'}`}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={`edit-priority-${task.id}`} className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Priority</label>
                        <select 
                          id={`edit-priority-${task.id}`}
                          value={editedTaskData.priority || 'normal'} 
                          onChange={(e) => handleEditInputChange('priority', e.target.value as TaskPriority)}
                          className={`w-full p-2 border rounded-md ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300'}`}
                        >
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`edit-due_at-${task.id}`} className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Due Date</label>
                        <input 
                          type="date" 
                          id={`edit-due_at-${task.id}`}
                          value={editedTaskData.due_at ? format(new Date(editedTaskData.due_at), 'yyyy-MM-dd') : ''} 
                          onChange={(e) => handleEditInputChange('due_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
                          className={`w-full p-2 border rounded-md ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300'}`}
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor={`edit-tags-${task.id}`} className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Tags (comma-separated)</label>
                      <input 
                        type="text" 
                        id={`edit-tags-${task.id}`}
                        value={Array.isArray(editedTaskData.tags) ? editedTaskData.tags.join(', ') : ''} 
                        onChange={(e) => handleEditInputChange('tags', e.target.value)}
                        className={`w-full p-2 border rounded-md ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300'}`}
                      />
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <button 
                        onClick={handleCancelEdit} 
                        className={`px-3 py-1.5 rounded-md flex items-center gap-1 text-sm ${
                          darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                      >
                        <X className="h-4 w-4" /> Cancel
                      </button>
                      <button 
                        onClick={() => handleSaveEdit(task.id)} 
                        disabled={isLoading} // Disable save button while any loading is happening (fetch or save itself)
                        className={`px-3 py-1.5 rounded-md flex items-center gap-1 text-sm ${
                          darkMode 
                            ? 'bg-purple-600 hover:bg-purple-700 text-white disabled:bg-purple-800' 
                            : 'bg-purple-600 hover:bg-purple-700 text-white disabled:bg-purple-300'
                        }`}
                      >
                        <Save className="h-4 w-4" /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <>
                    <div className="flex items-start gap-3">
                      <motion.button
                        onClick={() => handleStatusChange(task.id, task.status === 'done' ? 'open' : 'done')}
                        className={`mt-1 transition-colors ${
                          darkMode 
                            ? 'text-gray-400 hover:text-purple-400' 
                            : 'text-gray-700 hover:text-purple-600'
                        }`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        {task.status === 'done' ? (
                          <motion.svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            width="20" height="20" viewBox="0 0 24 24" 
                            fill="none" stroke="currentColor" strokeWidth="2" 
                            strokeLinecap="round" strokeLinejoin="round"
                            className="text-green-500" // Make checkmark green
                          >
                            <motion.rect 
                              x="3" y="3" width="18" height="18" rx="2" ry="2"
                              variants={checkmarkVariants} // Animate box part of checkmark if desired
                            />
                            <motion.path 
                              d="M9 12l2 2 4-4"
                              variants={checkmarkVariants}
                              initial="hidden"
                              animate={highlightedTask?.id === task.id && highlightedTask?.type === 'completed' ? "visible" : (task.status === 'done' ? "visible" : "hidden")}
                            />
                          </motion.svg>
                        ) : (
                          <Square className="h-5 w-5" /> // Non-animated square for open tasks
                        )}
                      </motion.button>
                      
                      <div className="flex-grow">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                          <p className={`text-lg ${task.status === 'done' ? 'line-through opacity-70' : ''}`}>
                            {task.content}
                          </p>
                          
                          {/* Edit Button */}
                          <button 
                            onClick={() => handleEdit(task)}
                            className={`p-1 rounded-md ml-auto flex-shrink-0 ${
                              darkMode ? 'text-gray-400 hover:text-purple-400' : 'text-gray-500 hover:text-purple-600'
                            }`}
                            title="Edit task"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>

                          <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1 sm:mt-0 sm:text-right flex-shrink-0`}>
                            {task.due_at && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>Due: {formatDate(task.due_at)}</span>
                              </div>
                            )}
                            {task.status === 'done' && task.completed_at && (
                              <div className="mt-1">
                                Completed: {formatDate(task.completed_at)}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className={`px-2 py-1 rounded-md text-xs ${getPriorityBadge(task.priority)}`}>
                            {task.priority}
                          </span>
                          {task.tags.map((tag) => (
                            <span 
                              key={tag} 
                              className={`px-2 py-1 rounded-md text-xs ${getTagStyle(!!darkMode)}`}
                              onClick={() => setTag(tag)}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    {task.note && (
                      <div className={`mt-3 text-sm pt-3 ${
                        darkMode 
                          ? 'border-t border-gray-800 text-gray-400' 
                          : 'border-t border-gray-200 text-gray-600'
                      }`}>
                        {task.note}
                      </div>
                    )}

                    {/* Linked Items Section */}
                    <div className={`mt-3 pt-3 ${
                      darkMode 
                        ? 'border-t border-gray-800' 
                        : 'border-t border-gray-200'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Linked Items
                        </h4>
                      </div>
                      
                      {/* TODO: Add real linked items functionality here once entity linking is fully deployed */}
                      <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        🔗 Linked items will appear here once the linking system is deployed.
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
} 