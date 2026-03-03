'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft,
  CalendarCheck,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  DollarSign,
  RotateCw,
  Plus,
} from 'lucide-react'
import type { DailySweep, ActionItem } from '../types'

const healthConfig = {
  healthy: { label: 'Healthy', color: 'text-green-400', bg: 'bg-green-500/20', icon: CheckCircle2 },
  warning: { label: 'Warning', color: 'text-yellow-400', bg: 'bg-yellow-500/20', icon: AlertTriangle },
  critical: { label: 'Critical', color: 'text-red-400', bg: 'bg-red-500/20', icon: XCircle },
  unknown: { label: 'Unknown', color: 'text-gray-400', bg: 'bg-gray-500/20', icon: HelpCircle },
}

const priorityConfig = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30' },
  high: { color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/30' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30' },
  low: { color: 'text-gray-400', bg: 'bg-gray-500/20', border: 'border-gray-500/30' },
}

export default function DailySweepDetailPage() {
  const { supabase, user } = useAuth()
  const params = useParams()
  const router = useRouter()
  const [sweep, setSweep] = useState<DailySweep | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [creatingTask, setCreatingTask] = useState<string | null>(null)

  const fetchSweep = useCallback(async () => {
    if (!supabase || !params.id) return

    try {
      const { data, error } = await supabase
        .from('daily_sweeps')
        .select('*')
        .eq('id', params.id as string)
        .single()

      if (error) throw error
      setSweep(data as DailySweep)
    } catch (err) {
      console.error('Error fetching sweep:', err)
      toast.error('Failed to load sweep')
    } finally {
      setIsLoading(false)
    }
  }, [supabase, params.id])

  useEffect(() => {
    fetchSweep()
  }, [fetchSweep])

  const createTask = async (item: ActionItem) => {
    if (!supabase || !user) return

    setCreatingTask(item.title)
    try {
      const { error } = await supabase.from('tasks').insert({
        user_id: user.id,
        content: item.title + ' — ' + item.description,
        status: 'todo',
        priority: item.priority === 'critical' ? '1' : item.priority === 'high' ? '2' : 'normal',
        tags: ['daily-sweep', item.category],
        source: 'daily-sweep',
      })

      if (error) throw error
      toast.success('Task created — view on Task Board')
    } catch (err) {
      console.error('Error creating task:', err)
      toast.error('Failed to create task')
    } finally {
      setCreatingTask(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          <span className="text-sm text-gray-400">Loading sweep...</span>
        </div>
      </div>
    )
  }

  if (!sweep) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CalendarCheck className="h-12 w-12 text-gray-700 mb-3" />
        <h3 className="text-sm font-medium text-gray-400 mb-1">Sweep not found</h3>
        <button
          onClick={() => router.push('/admin/mission-control/dailys')}
          className="mt-3 text-xs text-purple-400 hover:text-purple-300"
        >
          Back to Dailys
        </button>
      </div>
    )
  }

  const health = healthConfig[sweep.health_score] || healthConfig.unknown
  const HealthIcon = health.icon
  const date = new Date(sweep.sweep_date + 'T00:00:00')
  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const actionItems = sweep.action_items || []

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <button
          onClick={() => router.push('/admin/mission-control/dailys')}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Dailys
        </button>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarCheck className="h-6 w-6 text-purple-400" />
            <h1 className="text-lg font-bold text-gray-100">{dateLabel}</h1>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', health.bg, health.color)}>
              <HealthIcon className="h-3.5 w-3.5" />
              {health.label}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Cost', value: sweep.cost != null ? `$${Number(sweep.cost).toFixed(2)}` : '—', icon: DollarSign },
          { label: 'Turns', value: sweep.turns ?? '—', icon: RotateCw },
          { label: 'Duration', value: sweep.duration_seconds != null ? `${Math.round(sweep.duration_seconds / 60)}m` : '—', icon: Clock },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-gray-800 bg-gray-900/50 p-3"
            >
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-gray-800 p-1.5">
                  <Icon className="h-4 w-4 text-gray-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-100">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Report */}
      {sweep.report && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-gray-800 bg-gray-900/50 p-6"
        >
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Full Report</h2>
          <div className="prose prose-invert prose-sm max-w-none prose-headings:text-gray-200 prose-p:text-gray-400 prose-li:text-gray-400 prose-strong:text-gray-200 prose-a:text-purple-400">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {sweep.report}
            </ReactMarkdown>
          </div>
        </motion.div>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <h2 className="text-sm font-semibold text-gray-300">
            Action Items ({actionItems.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {actionItems.map((item, idx) => {
              const pConfig = priorityConfig[item.priority] || priorityConfig.low
              return (
                <div
                  key={idx}
                  className={cn(
                    'rounded-lg border bg-gray-900/50 p-4',
                    pConfig.border
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', pConfig.bg, pConfig.color)}>
                        {item.priority}
                      </span>
                      <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-500">
                        {item.category}
                      </span>
                    </div>
                    <button
                      onClick={() => createTask(item)}
                      disabled={creatingTask === item.title}
                      className="inline-flex items-center gap-1 rounded-md bg-purple-500/20 px-2 py-1 text-xs font-medium text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                    >
                      {creatingTask === item.title ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      Create Task
                    </button>
                  </div>
                  <h3 className="text-sm font-medium text-gray-200 mb-1">{item.title}</h3>
                  <p className="text-xs text-gray-500">{item.description}</p>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}
