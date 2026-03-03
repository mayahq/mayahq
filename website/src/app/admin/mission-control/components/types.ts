export interface Project {
  id: string
  name: string
  description: string | null
  status: string
  priority: number
  target_date: string | null
  created_at: string
  updated_at: string
}

export interface MissionTask {
  id: number
  user_id: string
  content: string
  status: string
  tags: string[]
  created_at: string
  completed_at: string | null
  due_at: string | null
  note: string | null
  priority: string
  reminder_sent: boolean
  project_id: string | null
  assignee: string | null
  source: string | null
  discord_message_id: string | null
  cron_job_id: string | null
  lvnsupabase_task_id: number | null
  started_at: string | null
  estimated_minutes: number | null
  actual_minutes: number | null
}

export interface CronJob {
  id: string
  openclaw_id: string
  name: string
  schedule: string | null
  enabled: boolean
  category: string | null
  platform: string | null
  discord_channel_id: string | null
  discord_channel_name: string | null
  created_at: string
  updated_at: string
  last_synced_at: string | null
  notes: string | null
  payload: Record<string, any> | null
}

export interface CronExecution {
  id: string
  cron_job_id: string | null
  openclaw_id: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  status: string
  summary: string | null
  output: Record<string, any> | null
  error_message: string | null
  triggered_by: string | null
  session_id: string | null
  created_at: string
}

export interface CronActivity {
  cron_job_id: string
  name: string
  category: string | null
  platform: string | null
  enabled: boolean
  discord_channel_name: string | null
  execution_id: string | null
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  status: string | null
  summary: string | null
  error_message: string | null
}

export const CATEGORY_COLORS: Record<string, string> = {
  'lvn-social': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'lvn-sdr': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'maya-personal': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'content': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'other': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

export const PLATFORM_ICONS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
}

export interface ProjectUpdate {
  id: string
  project_id: string | null
  update_text: string
  update_type: string
  created_at: string
  created_by: string | null
}

export const KANBAN_COLUMNS = ['todo', 'in_progress', 'blocked', 'done'] as const
export type KanbanColumn = typeof KANBAN_COLUMNS[number]

export const COLUMN_LABELS: Record<KanbanColumn, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}

export const COLUMN_COLORS: Record<KanbanColumn, string> = {
  todo: 'border-gray-600',
  in_progress: 'border-blue-500',
  blocked: 'border-red-500',
  done: 'border-green-500',
}

export const ASSIGNEE_COLORS: Record<string, string> = {
  maya: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  blake: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  shared: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  va: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

export const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  complete: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  archived: 'bg-gray-700/20 text-gray-500 border-gray-700/30',
}
