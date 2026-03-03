'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MissionTask, Project, KANBAN_COLUMNS } from './types'

interface TaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: MissionTask | null // null = create mode
  projects: Project[]
  onSaved: () => void
}

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

const ASSIGNEE_OPTIONS = [
  { value: 'none', label: 'Unassigned' },
  { value: 'maya', label: 'Maya' },
  { value: 'blake', label: 'Blake' },
  { value: 'shared', label: 'Shared' },
  { value: 'va', label: 'VA' },
]

const SOURCE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'discord', label: 'Discord' },
  { value: 'cron', label: 'Cron' },
  { value: 'heartbeat', label: 'Heartbeat' },
  { value: 'manual', label: 'Manual' },
  { value: 'va_request', label: 'VA Request' },
]

const PRIORITY_OPTIONS = [
  { value: '1', label: 'P1 - Critical' },
  { value: '2', label: 'P2 - High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
]

export function TaskModal({ open, onOpenChange, task, projects, onSaved }: TaskModalProps) {
  const { user, supabase } = useAuth()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Form state
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('todo')
  const [assignee, setAssignee] = useState('none')
  const [projectId, setProjectId] = useState('none')
  const [source, setSource] = useState('none')
  const [priority, setPriority] = useState('normal')
  const [note, setNote] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [estimatedMinutes, setEstimatedMinutes] = useState('')

  // Populate form when task changes
  useEffect(() => {
    if (task) {
      setContent(task.content || '')
      setStatus(task.status || 'todo')
      setAssignee(task.assignee || 'none')
      setProjectId(task.project_id || 'none')
      setSource(task.source || 'none')
      setPriority(task.priority || 'normal')
      setNote(task.note || '')
      setDueAt(task.due_at ? task.due_at.split('T')[0] : '')
      setEstimatedMinutes(task.estimated_minutes?.toString() || '')
    } else {
      // Create mode defaults
      setContent('')
      setStatus('todo')
      setAssignee('none')
      setProjectId('none')
      setSource('manual')
      setPriority('normal')
      setNote('')
      setDueAt('')
      setEstimatedMinutes('')
    }
    setConfirmDelete(false)
  }, [task, open])

  const handleSave = async () => {
    if (!supabase || !user) return
    if (!content.trim()) {
      toast.error('Task content is required')
      return
    }

    setSaving(true)
    try {
      const taskData: Record<string, unknown> = {
        content: content.trim(),
        status,
        assignee: assignee === 'none' ? null : assignee,
        project_id: projectId === 'none' ? null : projectId,
        source: source === 'none' ? null : source,
        priority,
        note: note.trim() || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
      }

      if (status === 'done' && task?.status !== 'done') {
        taskData.completed_at = new Date().toISOString()
      }
      if (status === 'in_progress' && !task?.started_at) {
        taskData.started_at = new Date().toISOString()
      }

      if (task) {
        // Update
        const { error } = await supabase
          .from('tasks')
          .update(taskData)
          .eq('id', task.id)
          .eq('user_id', user.id)

        if (error) throw error
        toast.success('Task updated')
      } else {
        // Create
        taskData.user_id = user.id
        const { error } = await supabase
          .from('tasks')
          .insert(taskData)

        if (error) throw error
        toast.success('Task created')
      }

      onSaved()
      onOpenChange(false)
    } catch (err) {
      console.error('Error saving task:', err)
      toast.error('Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!supabase || !user || !task) return

    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    setDeleting(true)
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', task.id)
        .eq('user_id', user.id)

      if (error) throw error
      toast.success('Task deleted')
      onSaved()
      onOpenChange(false)
    } catch (err) {
      console.error('Error deleting task:', err)
      toast.error('Failed to delete task')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
          <DialogDescription>
            {task ? `Task #${task.id}` : 'Create a new task for the board'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content" className="text-gray-300">Content</Label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              placeholder="What needs to be done?"
              autoFocus
            />
          </div>

          {/* Status + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-gray-300">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assignee + Project row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-gray-300">Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNEE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Source + Due date row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-gray-300">Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_at" className="text-gray-300">Due Date</Label>
              <Input
                id="due_at"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="border-gray-800 bg-gray-900 text-gray-200"
              />
            </div>
          </div>

          {/* Estimated minutes */}
          <div className="space-y-2">
            <Label htmlFor="est_minutes" className="text-gray-300">Estimated Minutes</Label>
            <Input
              id="est_minutes"
              type="number"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="e.g. 30"
              className="border-gray-800 bg-gray-900 text-gray-200"
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note" className="text-gray-300">Notes</Label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              placeholder="Additional notes..."
            />
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {/* Delete button - only for existing tasks */}
          <div>
            {task && (
              <Button
                variant="ghost"
                onClick={handleDelete}
                disabled={deleting}
                className={cn(
                  'text-gray-500 hover:text-red-400 hover:bg-red-500/10',
                  confirmDelete && 'text-red-400 bg-red-500/10'
                )}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {confirmDelete ? 'Confirm Delete?' : 'Delete'}
              </Button>
            )}
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-gray-400 hover:text-gray-200"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !content.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {saving ? 'Saving...' : task ? 'Save Changes' : 'Create Task'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
