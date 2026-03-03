'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'
import {
  FolderKanban,
  Activity,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Clock,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import type { MissionTask, Project, CronJob, CronExecution } from './components/types'
import { CATEGORY_COLORS } from './components/types'

const PROJECT_STATUS_COLORS: Record<string, string> = {
  planning: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  complete: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  archived: 'bg-gray-700/20 text-gray-500 border-gray-700/30',
}

const CRON_STATUS_DOT: Record<string, string> = {
  ok: 'bg-green-500',
  success: 'bg-green-500',
  failed: 'bg-red-500',
  running: 'bg-blue-500',
  skipped: 'bg-yellow-500',
  timeout: 'bg-orange-500',
}

export default function MissionControlPage() {
  const { user, supabase } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<MissionTask[]>([])
  const [cronJobs, setCronJobs] = useState<CronJob[]>([])
  const [cronExecutions, setCronExecutions] = useState<CronExecution[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!supabase || !user) return

    setIsLoading(true)
    try {
      const [projectsRes, tasksRes, cronJobsRes, cronExecsRes] = await Promise.all([
        supabase
          .from('projects')
          .select('*')
          .order('priority', { ascending: true }),
        supabase
          .from('tasks')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('cron_jobs')
          .select('*')
          .eq('enabled', true)
          .order('name', { ascending: true }),
        supabase
          .from('cron_executions')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(100),
      ])

      if (projectsRes.error) throw projectsRes.error
      if (tasksRes.error) throw tasksRes.error
      if (cronJobsRes.error) throw cronJobsRes.error
      if (cronExecsRes.error) throw cronExecsRes.error

      setProjects((projectsRes.data || []) as unknown as Project[])
      setTasks((tasksRes.data || []) as unknown as MissionTask[])
      setCronJobs((cronJobsRes.data || []) as unknown as CronJob[])
      setCronExecutions((cronExecsRes.data || []) as unknown as CronExecution[])
    } catch (err) {
      console.error('Error fetching mission control data:', err)
      toast.error('Failed to load dashboard data')
    } finally {
      setIsLoading(false)
    }
  }, [supabase, user])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Compute stats
  const todoTasks = tasks.filter((t) => t.status === 'todo' || t.status === 'open')
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress')
  const doneTasks = tasks.filter((t) => t.status === 'done' || t.status === 'completed')
  const blockedTasks = tasks.filter((t) => t.status === 'blocked')

  const mayaTasks = todoTasks.filter((t) => t.assignee === 'maya')
  const blakeTasks = todoTasks.filter((t) => t.assignee === 'blake')

  const getProjectTaskCounts = (projectId: string) => {
    const projectTasks = tasks.filter((t) => t.project_id === projectId)
    const done = projectTasks.filter(
      (t) => t.status === 'done' || t.status === 'completed'
    ).length
    const total = projectTasks.length
    return { done, total }
  }

  // Build openclaw_id -> job lookup for fallback matching
  const jobByOpenclawId: Record<string, CronJob> = {}
  for (const job of cronJobs) {
    if (job.openclaw_id) jobByOpenclawId[job.openclaw_id] = job
  }

  // Build latest execution per cron job (match by FK or openclaw_id fallback)
  const latestExecByJob: Record<string, CronExecution> = {}
  for (const exec of cronExecutions) {
    const jobId =
      exec.cron_job_id ||
      (exec.openclaw_id && jobByOpenclawId[exec.openclaw_id]?.id) ||
      null
    if (jobId && !latestExecByJob[jobId]) {
      latestExecByJob[jobId] = exec
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-400" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Mission Control</h1>
          <p className="text-sm text-gray-400 mt-1">
            {format(new Date(), 'EEEE, MMMM d yyyy')}
          </p>
        </div>
        <Link
          href="/admin/mission-control/board"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/50 hover:bg-purple-500/30 transition-colors text-sm"
        >
          <FolderKanban className="h-4 w-4" />
          Open Board
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
        >
          <Card className="bg-gray-900/50 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">To Do</p>
                  <p className="text-2xl font-bold text-white mt-1">{todoTasks.length}</p>
                </div>
                <Circle className="h-8 w-8 text-gray-600" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="bg-gray-900/50 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    In Progress
                  </p>
                  <p className="text-2xl font-bold text-blue-400 mt-1">
                    {inProgressTasks.length}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-500/40" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-gray-900/50 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Blocked</p>
                  <p className="text-2xl font-bold text-red-400 mt-1">
                    {blockedTasks.length}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500/40" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="bg-gray-900/50 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Done</p>
                  <p className="text-2xl font-bold text-green-400 mt-1">
                    {doneTasks.length}
                  </p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500/40" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Two-column layout: Projects + Task Queues */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projects - Takes 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-gray-200">Projects</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {projects.map((project, i) => {
              const { done, total } = getProjectTaskCounts(project.id)
              const progress = total > 0 ? Math.round((done / total) * 100) : 0
              const daysUntilTarget = project.target_date
                ? differenceInDays(new Date(project.target_date), new Date())
                : null

              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                >
                  <Card className="bg-gray-900/50 border-gray-800 hover:border-gray-700 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-medium text-gray-200 leading-tight">
                          {project.name}
                        </h3>
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border',
                            PROJECT_STATUS_COLORS[project.status] ||
                              PROJECT_STATUS_COLORS.planning
                          )}
                        >
                          {project.status}
                        </span>
                      </div>

                      {project.description && (
                        <p className="text-xs text-gray-500 mb-3 line-clamp-2">
                          {project.description}
                        </p>
                      )}

                      {/* Progress bar */}
                      <div className="mb-2">
                        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                          <span>
                            {done}/{total} tasks
                          </span>
                          <span>{progress}%</span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-1.5">
                          <div
                            className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Target date countdown */}
                      {daysUntilTarget !== null && (
                        <div className="flex items-center gap-1 text-[10px] mt-2">
                          <Clock className="h-3 w-3 text-gray-500" />
                          <span
                            className={cn(
                              daysUntilTarget <= 30
                                ? 'text-orange-400'
                                : daysUntilTarget <= 90
                                  ? 'text-yellow-400'
                                  : 'text-gray-500'
                            )}
                          >
                            {daysUntilTarget > 0
                              ? `${daysUntilTarget} days until target`
                              : daysUntilTarget === 0
                                ? 'Target date is today'
                                : `${Math.abs(daysUntilTarget)} days overdue`}
                          </span>
                        </div>
                      )}

                      {/* Priority */}
                      <div className="flex items-center gap-1 mt-2">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              idx < project.priority ? 'bg-purple-500' : 'bg-gray-700'
                            )}
                          />
                        ))}
                        <span className="text-[10px] text-gray-600 ml-1">
                          P{project.priority}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Right sidebar: Task Queues + Cron Health */}
        <div className="space-y-6">
          {/* Maya's Queue */}
          <div>
            <h2 className="text-lg font-semibold text-gray-200 mb-3 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/20">
                <User className="h-3.5 w-3.5 text-purple-400" />
              </span>
              Maya&apos;s Queue
              <span className="text-xs text-gray-500 font-normal">
                {mayaTasks.length} tasks
              </span>
            </h2>
            <div className="space-y-2">
              {mayaTasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 text-sm text-gray-300"
                >
                  <p className="leading-snug">{task.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {task.project_id && (
                      <span className="text-[10px] text-gray-500">
                        {projects.find((p) => p.id === task.project_id)?.name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {mayaTasks.length === 0 && (
                <p className="text-xs text-gray-600 py-4 text-center">Queue empty</p>
              )}
            </div>
          </div>

          {/* Blake's Queue */}
          <div>
            <h2 className="text-lg font-semibold text-gray-200 mb-3 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20">
                <User className="h-3.5 w-3.5 text-blue-400" />
              </span>
              Blake&apos;s Queue
              <span className="text-xs text-gray-500 font-normal">
                {blakeTasks.length} tasks
              </span>
            </h2>
            <div className="space-y-2">
              {blakeTasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 text-sm text-gray-300"
                >
                  <p className="leading-snug">{task.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {task.project_id && (
                      <span className="text-[10px] text-gray-500">
                        {projects.find((p) => p.id === task.project_id)?.name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {blakeTasks.length === 0 && (
                <p className="text-xs text-gray-600 py-4 text-center">Queue empty</p>
              )}
            </div>
          </div>

          {/* Cron Health */}
          <div>
            <h2 className="text-lg font-semibold text-gray-200 mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-400" />
              Cron Health
              <Link
                href="/admin/mission-control/cron-log"
                className="text-xs text-purple-400 hover:text-purple-300 font-normal ml-auto"
              >
                View all
              </Link>
            </h2>
            <div className="space-y-2">
              {cronJobs.length > 0 ? (
                cronJobs.map((job) => {
                  const latestExec = latestExecByJob[job.id]
                  const statusDot = latestExec
                    ? CRON_STATUS_DOT[latestExec.status] || 'bg-gray-500'
                    : 'bg-gray-600'
                  const categoryColor = CATEGORY_COLORS[job.category || ''] || CATEGORY_COLORS.other

                  return (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-gray-300 truncate">{job.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {job.category && (
                            <span
                              className={cn(
                                'inline-flex items-center px-1.5 py-0 rounded text-[9px] font-medium border',
                                categoryColor
                              )}
                            >
                              {job.category}
                            </span>
                          )}
                          {latestExec && (
                            <span className="text-[10px] text-gray-500">
                              {formatDistanceToNow(new Date(latestExec.started_at), {
                                addSuffix: true,
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', statusDot)}
                      />
                    </div>
                  )
                })
              ) : (
                <p className="text-xs text-gray-600 py-4 text-center">
                  No cron jobs configured
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
