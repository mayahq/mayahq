'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Clock, MessageSquare, Zap, User, Filter, Plus, ChevronDown } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  MissionTask,
  Project,
  KANBAN_COLUMNS,
  KanbanColumn,
  COLUMN_LABELS,
  COLUMN_COLORS,
  ASSIGNEE_COLORS,
} from './types'
import { TaskModal } from './task-modal'

export function KanbanBoard() {
  const { user, supabase } = useAuth()
  const [tasks, setTasks] = useState<MissionTask[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<MissionTask | null>(null)
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const [filterProject, setFilterProject] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [expandedColumns, setExpandedColumns] = useState<Set<KanbanColumn>>(new Set())

  const COLUMN_LIMIT = 20

  const fetchData = useCallback(async () => {
    if (!supabase || !user) return

    try {
      const [tasksRes, projectsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('projects')
          .select('*')
          .order('priority', { ascending: true }),
      ])

      if (tasksRes.error) throw tasksRes.error
      if (projectsRes.error) throw projectsRes.error

      setTasks((tasksRes.data || []) as unknown as MissionTask[])
      setProjects((projectsRes.data || []) as unknown as Project[])
    } catch (err) {
      console.error('Error fetching kanban data:', err)
      toast.error('Failed to load board data')
    } finally {
      setIsLoading(false)
    }
  }, [supabase, user])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Realtime subscription — incremental updates instead of full refetch
  useEffect(() => {
    if (!supabase || !user || typeof supabase.channel !== 'function') return

    let channel: RealtimeChannel | null = null

    try {
      channel = supabase
        .channel('kanban-tasks-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'tasks',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const newTask = payload.new as MissionTask
            setTasks((prev) => {
              if (prev.some((t) => t.id === newTask.id)) return prev
              return [newTask, ...prev]
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'tasks',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const updated = payload.new as MissionTask
            setTasks((prev) =>
              prev.map((t) => (t.id === updated.id ? updated : t))
            )
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'tasks',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const deletedId = (payload.old as { id: number }).id
            setTasks((prev) => prev.filter((t) => t.id !== deletedId))
          }
        )

      channel.subscribe()
    } catch (e) {
      console.error('Error setting up realtime:', e)
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel).catch(console.error)
      }
    }
  }, [supabase, user])

  const handleDragEnd = async (result: DropResult) => {
    if (!supabase || !user) return
    if (!result.destination) return

    const taskId = parseInt(result.draggableId)
    const newStatus = result.destination.droppableId as KanbanColumn
    const oldStatus = result.source.droppableId as KanbanColumn

    // Don't do anything if dropped in same column at same index
    if (
      oldStatus === newStatus &&
      result.source.index === result.destination.index
    ) {
      return
    }

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: newStatus,
              started_at:
                newStatus === 'in_progress' && !t.started_at
                  ? new Date().toISOString()
                  : t.started_at,
              completed_at:
                newStatus === 'done' ? new Date().toISOString() : t.completed_at,
            }
          : t
      )
    )

    try {
      const updateData: Record<string, unknown> = { status: newStatus }

      if (newStatus === 'in_progress') {
        const task = tasks.find((t) => t.id === taskId)
        if (!task?.started_at) {
          updateData.started_at = new Date().toISOString()
        }
      }
      if (newStatus === 'done') {
        updateData.completed_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId)
        .eq('user_id', user.id)

      if (error) throw error
      toast.success(`Task moved to ${COLUMN_LABELS[newStatus]}`)
    } catch (err) {
      console.error('Error updating task status:', err)
      toast.error('Failed to update task')
      fetchData()
    }
  }

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return null
    const project = projects.find((p) => p.id === projectId)
    return project?.name || null
  }

  const getProjectShortName = (name: string) => {
    const words = name.split(' ')
    if (words.length <= 2) return name
    return words
      .map((w) => w[0])
      .join('')
      .toUpperCase()
  }

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    if (filterAssignee !== 'all' && task.assignee !== filterAssignee) return false
    if (filterProject !== 'all' && task.project_id !== filterProject) return false
    return true
  })

  const getColumnTasks = (column: KanbanColumn) => {
    return filteredTasks.filter((task) => {
      if (column === 'done') return task.status === 'done' || task.status === 'completed'
      if (column === 'todo') return task.status === 'todo' || task.status === 'open' || task.status === 'pending'
      return task.status === column
    })
  }

  const sourceIcon = (source: string | null) => {
    switch (source) {
      case 'discord':
        return <MessageSquare className="h-3 w-3" />
      case 'cron':
        return <Zap className="h-3 w-3" />
      default:
        return null
    }
  }

  const handleCardClick = (task: MissionTask) => {
    setEditingTask(task)
    setModalOpen(true)
  }

  const handleNewTask = () => {
    setEditingTask(null)
    setModalOpen(true)
  }

  const handleModalSaved = () => {
    // Realtime subscription handles the state update — no full refetch needed
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-400" />
      </div>
    )
  }

  const toggleColumnExpanded = (column: KanbanColumn) => {
    setExpandedColumns((prev) => {
      const next = new Set(prev)
      if (next.has(column)) {
        next.delete(column)
      } else {
        next.add(column)
      }
      return next
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap flex-shrink-0 mb-4">
        <button
          onClick={handleNewTask}
          className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New Task
        </button>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors',
            'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700',
            (filterAssignee !== 'all' || filterProject !== 'all') &&
              'border-purple-500/50 text-purple-400'
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {(filterAssignee !== 'all' || filterProject !== 'all') && (
            <span className="bg-purple-500/30 text-purple-300 px-1.5 rounded text-xs">
              Active
            </span>
          )}
        </button>

        {showFilters && (
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 border border-gray-700 text-gray-300"
            >
              <option value="all">All Assignees</option>
              <option value="maya">Maya</option>
              <option value="blake">Blake</option>
              <option value="shared">Shared</option>
              <option value="va">VA</option>
            </select>

            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 border border-gray-700 text-gray-300"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {(filterAssignee !== 'all' || filterProject !== 'all') && (
              <button
                onClick={() => {
                  setFilterAssignee('all')
                  setFilterProject('all')
                }}
                className="text-xs text-gray-400 hover:text-gray-200 underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="ml-auto text-sm text-gray-500">
          {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Kanban Columns */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 min-h-0">
          {KANBAN_COLUMNS.map((column) => {
            const columnTasks = getColumnTasks(column)
            const isExpanded = expandedColumns.has(column)
            const visibleTasks = isExpanded ? columnTasks : columnTasks.slice(0, COLUMN_LIMIT)
            const hiddenCount = columnTasks.length - COLUMN_LIMIT

            return (
              <div key={column} className="flex flex-col min-h-0">
                {/* Column Header */}
                <div
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-t-lg border-t-2 bg-gray-900/50 flex-shrink-0',
                    COLUMN_COLORS[column]
                  )}
                >
                  <h3 className="text-sm font-semibold text-gray-200">
                    {COLUMN_LABELS[column]}
                  </h3>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Droppable Area - independently scrollable */}
                <Droppable droppableId={column}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        'flex-1 min-h-0 overflow-y-auto p-2 space-y-2 rounded-b-lg transition-colors',
                        'bg-gray-900/30 border border-gray-800 border-t-0',
                        snapshot.isDraggingOver && 'bg-purple-500/5 border-purple-500/30'
                      )}
                    >
                      {visibleTasks.map((task, index) => (
                        <Draggable
                          key={task.id}
                          draggableId={String(task.id)}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => {
                                if (!snapshot.isDragging) {
                                  handleCardClick(task)
                                }
                              }}
                              className={cn(
                                'rounded-lg p-3 bg-gray-800/80 border border-gray-700/50 cursor-grab active:cursor-grabbing select-none',
                                'transition-shadow duration-150 hover:border-purple-500/30',
                                snapshot.isDragging &&
                                  'shadow-lg shadow-purple-500/20 border-purple-500/50 rotate-1'
                              )}
                            >
                              <p
                                className={cn(
                                  'text-sm text-gray-200 leading-snug',
                                  column === 'done' && 'line-through opacity-60'
                                )}
                              >
                                {task.content}
                              </p>

                              {/* Meta row */}
                              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                {/* Assignee */}
                                {task.assignee && (
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border',
                                      ASSIGNEE_COLORS[task.assignee] ||
                                        'bg-gray-700 text-gray-300 border-gray-600'
                                    )}
                                  >
                                    <User className="h-2.5 w-2.5" />
                                    {task.assignee}
                                  </span>
                                )}

                                {/* Project */}
                                {task.project_id && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-700/50 text-gray-400 border border-gray-600/50">
                                    {getProjectShortName(
                                      getProjectName(task.project_id) || ''
                                    )}
                                  </span>
                                )}

                                {/* Source */}
                                {task.source && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                                    {sourceIcon(task.source)}
                                  </span>
                                )}

                                {/* Priority */}
                                {(task.priority === 'high' || task.priority === '1') && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                                    P1
                                  </span>
                                )}
                                {task.priority === '2' && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                    P2
                                  </span>
                                )}

                                {/* Due date */}
                                {task.due_at && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                                    <Clock className="h-2.5 w-2.5" />
                                    {format(new Date(task.due_at), 'MMM d')}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      {/* Show more / Show less button */}
                      {hiddenCount > 0 && (
                        <button
                          onClick={() => toggleColumnExpanded(column)}
                          className="w-full py-2 text-xs text-gray-500 hover:text-purple-400 flex items-center justify-center gap-1 transition-colors"
                        >
                          {isExpanded ? (
                            <>Show less</>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" />
                              Show {hiddenCount} more
                            </>
                          )}
                        </button>
                      )}

                      {columnTasks.length === 0 && !snapshot.isDraggingOver && (
                        <div className="flex items-center justify-center h-20 text-xs text-gray-600">
                          Drop tasks here
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>

      <TaskModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        task={editingTask}
        projects={projects}
        onSaved={handleModalSaved}
      />
    </div>
  )
}
