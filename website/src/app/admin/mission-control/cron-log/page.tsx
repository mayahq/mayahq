'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Zap,
  ChevronDown,
  ChevronUp,
  Hash,
  Power,
  PowerOff,
} from 'lucide-react'
import { motion } from 'framer-motion'
import type { CronJob, CronExecution } from '../components/types'
import { CATEGORY_COLORS } from '../components/types'
import { CronExecutionModal } from '../components/cron-execution-modal'

const STATUS_CONFIG: Record<
  string,
  { icon: typeof CheckCircle2; color: string; bg: string }
> = {
  ok: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10' },
  success: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  running: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  skipped: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  timeout: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10' },
}

export default function CronLogPage() {
  const { supabase } = useAuth()
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [executions, setExecutions] = useState<CronExecution[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterJob, setFilterJob] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [selectedExecution, setSelectedExecution] = useState<CronExecution | null>(null)
  const [showJobsPanel, setShowJobsPanel] = useState(false)

  const fetchData = useCallback(async () => {
    if (!supabase) return

    setIsLoading(true)
    try {
      const [jobsRes, execsRes] = await Promise.all([
        supabase
          .from('cron_jobs')
          .select('*')
          .order('name', { ascending: true }),
        supabase
          .from('cron_executions')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(200),
      ])

      if (jobsRes.error) throw jobsRes.error
      if (execsRes.error) throw execsRes.error

      setJobs((jobsRes.data || []) as unknown as CronJob[])
      setExecutions((execsRes.data || []) as unknown as CronExecution[])
    } catch (err) {
      console.error('Error fetching cron data:', err)
      toast.error('Failed to load cron log')
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Build lookup maps: job_id -> CronJob and openclaw_id -> CronJob
  const { jobMap, jobByOpenclawId } = useMemo(() => {
    const byId: Record<string, CronJob> = {}
    const byOc: Record<string, CronJob> = {}
    for (const job of jobs) {
      byId[job.id] = job
      if (job.openclaw_id) byOc[job.openclaw_id] = job
    }
    return { jobMap: byId, jobByOpenclawId: byOc }
  }, [jobs])

  // Resolve a job for an execution (by FK first, then openclaw_id fallback)
  const resolveJob = useCallback(
    (exec: CronExecution): CronJob | null => {
      if (exec.cron_job_id && jobMap[exec.cron_job_id]) return jobMap[exec.cron_job_id]
      if (exec.openclaw_id && jobByOpenclawId[exec.openclaw_id]) return jobByOpenclawId[exec.openclaw_id]
      return null
    },
    [jobMap, jobByOpenclawId]
  )

  // Latest execution per job (executions already sorted by started_at DESC)
  const latestExecByJob = useMemo(() => {
    const map: Record<string, CronExecution> = {}
    for (const exec of executions) {
      if (exec.cron_job_id && !map[exec.cron_job_id]) {
        map[exec.cron_job_id] = exec
      }
    }
    return map
  }, [executions])

  // Execution count per job
  const execCountByJob = useMemo(() => {
    const map: Record<string, number> = {}
    for (const exec of executions) {
      if (exec.cron_job_id) {
        map[exec.cron_job_id] = (map[exec.cron_job_id] || 0) + 1
      }
    }
    return map
  }, [executions])

  // Get unique categories from jobs
  const categories = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.category).filter(Boolean))).sort() as string[],
    [jobs]
  )

  // Filter executions
  const filteredExecutions = useMemo(() => {
    return executions.filter((exec) => {
      const job = resolveJob(exec)
      if (filterJob !== 'all') {
        // Match by job id or by openclaw_id → job id
        if (exec.cron_job_id !== filterJob && job?.id !== filterJob) return false
      }
      if (filterStatus !== 'all' && exec.status !== filterStatus) return false
      if (filterCategory !== 'all' && job?.category !== filterCategory) return false
      return true
    })
  }, [executions, filterJob, filterStatus, filterCategory, resolveJob])

  // Stats
  const totalExecutions = executions.length
  const errorCount = executions.filter(
    (e) => e.status === 'failed' || e.status === 'timeout'
  ).length
  const withDuration = executions.filter((e) => e.duration_ms != null)
  const avgDuration =
    withDuration.length > 0
      ? Math.round(
          withDuration.reduce((sum, e) => sum + (e.duration_ms || 0), 0) / withDuration.length
        )
      : 0
  const activeJobs = jobs.filter((j) => j.enabled).length

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
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="h-6 w-6 text-purple-400" />
            Cron Log
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
            <span>{totalExecutions} executions</span>
            {errorCount > 0 && (
              <span className="text-red-400">
                {errorCount} error{errorCount !== 1 ? 's' : ''}
              </span>
            )}
            {avgDuration > 0 && (
              <span className="text-gray-500">
                avg {avgDuration.toLocaleString()}ms
              </span>
            )}
            <span className="flex items-center gap-1 text-gray-500">
              <Zap className="h-3 w-3" />
              {activeJobs} active job{activeJobs !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowJobsPanel((v) => !v)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors',
              showJobsPanel
                ? 'bg-purple-500/20 text-purple-400 border-purple-500/50 hover:bg-purple-500/30'
                : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            Jobs
            {showJobsPanel ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 text-sm transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterJob}
          onChange={(e) => setFilterJob(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 border border-gray-700 text-gray-300"
        >
          <option value="all">All Jobs</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.name}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 border border-gray-700 text-gray-300"
        >
          <option value="all">All Statuses</option>
          <option value="ok">OK</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
          <option value="skipped">Skipped</option>
          <option value="timeout">Timeout</option>
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 border border-gray-700 text-gray-300"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <span className="text-sm text-gray-500 ml-auto">
          {filteredExecutions.length} execution{filteredExecutions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Jobs Panel */}
      {showJobsPanel && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="rounded-lg border border-gray-800 bg-gray-900/30 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-300">
              All Cron Jobs ({jobs.length})
            </h2>
            {filterJob !== 'all' && (
              <button
                onClick={() => setFilterJob('all')}
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {jobs.map((job) => {
              const latestExec = latestExecByJob[job.id]
              const execCount = execCountByJob[job.id] || 0
              const categoryColor = CATEGORY_COLORS[job.category || ''] || CATEGORY_COLORS.other
              const isFiltered = filterJob === job.id
              const statusDot = latestExec
                ? latestExec.status === 'failed' || latestExec.status === 'timeout'
                  ? 'bg-red-500'
                  : latestExec.status === 'running'
                    ? 'bg-blue-500'
                    : 'bg-green-500'
                : 'bg-gray-600'

              return (
                <div
                  key={job.id}
                  onClick={() => {
                    setFilterJob(isFiltered ? 'all' : job.id)
                  }}
                  className={cn(
                    'p-3 rounded-lg border cursor-pointer transition-all',
                    isFiltered
                      ? 'border-purple-500/50 bg-purple-500/10'
                      : 'border-gray-800 bg-gray-900/50 hover:border-gray-700 hover:bg-gray-800/50'
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {job.enabled ? (
                        <Power className="h-3 w-3 text-green-500 flex-shrink-0" />
                      ) : (
                        <PowerOff className="h-3 w-3 text-gray-600 flex-shrink-0" />
                      )}
                      <span className="text-sm text-gray-200 font-medium truncate">
                        {job.name}
                      </span>
                    </div>
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1.5', statusDot)} />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mb-2">
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
                    {job.platform && (
                      <span className="text-[10px] text-gray-500">{job.platform}</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <div className="flex items-center gap-2">
                      {job.schedule && (
                        <span className="font-mono">{job.schedule}</span>
                      )}
                      {job.discord_channel_name && (
                        <span className="flex items-center gap-0.5">
                          <Hash className="h-2.5 w-2.5" />
                          {job.discord_channel_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {execCount > 0 && (
                        <span>{execCount} run{execCount !== 1 ? 's' : ''}</span>
                      )}
                      {latestExec && (
                        <span>
                          {formatDistanceToNow(new Date(latestExec.started_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {jobs.length === 0 && (
            <p className="text-xs text-gray-600 py-4 text-center">No cron jobs configured</p>
          )}
        </motion.div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-900/80 border-b border-gray-800">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Status
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Job Name
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                Category
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                Platform
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Started
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                Duration
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 hidden xl:table-cell">
                Summary
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {filteredExecutions.map((exec, i) => {
              const job = resolveJob(exec)
              const statusConfig = STATUS_CONFIG[exec.status] || STATUS_CONFIG.ok
              const StatusIcon = statusConfig.icon
              const isError = exec.status === 'failed' || exec.status === 'timeout'
              const categoryColor = CATEGORY_COLORS[job?.category || ''] || CATEGORY_COLORS.other

              return (
                <motion.tr
                  key={exec.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.015 }}
                  onClick={() => setSelectedExecution(exec)}
                  className={cn(
                    'hover:bg-gray-800/30 cursor-pointer transition-colors',
                    isError && 'border-l-2 border-l-red-500/50'
                  )}
                >
                  <td className="px-4 py-3">
                    <div
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
                        statusConfig.bg,
                        statusConfig.color
                      )}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {exec.status}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-200 font-medium">
                      {job?.name || exec.openclaw_id || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {job?.category ? (
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border',
                          categoryColor
                        )}
                      >
                        {job.category}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-gray-400">
                      {job?.platform || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-300">
                      {format(new Date(exec.started_at), 'MMM d, HH:mm:ss')}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {formatDistanceToNow(new Date(exec.started_at), { addSuffix: true })}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm text-gray-400">
                      {exec.duration_ms != null ? `${exec.duration_ms.toLocaleString()}ms` : '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className="text-xs text-gray-500 truncate max-w-[200px] block">
                      {exec.summary || exec.error_message || '-'}
                    </span>
                  </td>
                </motion.tr>
              )
            })}
            {filteredExecutions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500 text-sm">
                  No cron executions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Details Modal */}
      {selectedExecution && (
        <CronExecutionModal
          execution={selectedExecution}
          job={resolveJob(selectedExecution)}
          open={!!selectedExecution}
          onClose={() => setSelectedExecution(null)}
        />
      )}
    </div>
  )
}
