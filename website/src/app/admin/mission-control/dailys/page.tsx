'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  CalendarCheck,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react'
import type { DailySweep } from './types'

const healthConfig = {
  healthy: { label: 'Healthy', color: 'text-green-400', bg: 'bg-green-500/20', icon: CheckCircle2 },
  warning: { label: 'Warning', color: 'text-yellow-400', bg: 'bg-yellow-500/20', icon: AlertTriangle },
  critical: { label: 'Critical', color: 'text-red-400', bg: 'bg-red-500/20', icon: XCircle },
  unknown: { label: 'Unknown', color: 'text-gray-400', bg: 'bg-gray-500/20', icon: HelpCircle },
}

export default function DailysPage() {
  const { supabase } = useAuth()
  const router = useRouter()
  const [sweeps, setSweeps] = useState<DailySweep[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!supabase) return

    try {
      const { data, error } = await supabase
        .from('daily_sweeps')
        .select('*')
        .order('sweep_date', { ascending: false })
        .limit(30)

      if (error) throw error
      setSweeps((data || []) as DailySweep[])
    } catch (err) {
      console.error('Error fetching sweeps:', err)
      toast.error('Failed to load daily sweeps')
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          <span className="text-sm text-gray-400">Loading sweeps...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarCheck className="h-6 w-6 text-purple-400" />
          <h1 className="text-lg font-bold text-gray-100">Daily Sweeps</h1>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-gray-400 hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Sweep Cards */}
      {sweeps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarCheck className="h-12 w-12 text-gray-700 mb-3" />
          <h3 className="text-sm font-medium text-gray-400 mb-1">
            No daily sweeps yet
          </h3>
          <p className="text-xs text-gray-600 max-w-xs">
            Sweeps are generated automatically by the daily-sweep cron job each morning.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sweeps.map((sweep) => {
            const health = healthConfig[sweep.health_score] || healthConfig.unknown
            const HealthIcon = health.icon
            const metrics = sweep.metrics || {}
            const actionItems = sweep.action_items || []
            const criticalCount = actionItems.filter((a) => a.priority === 'critical').length
            const date = new Date(sweep.sweep_date + 'T00:00:00')
            const dateLabel = date.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })

            return (
              <motion.div
                key={sweep.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => router.push(`/admin/mission-control/dailys/${sweep.id}`)}
                className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 cursor-pointer hover:border-purple-500/40 hover:bg-gray-900/80 transition-all"
              >
                {/* Date + Health Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-100">{dateLabel}</span>
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', health.bg, health.color)}>
                    <HealthIcon className="h-3 w-3" />
                    {health.label}
                  </span>
                </div>

                {/* Metric Pills */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {metrics.projects_ingested_24h !== undefined && (
                    <span className="rounded-md bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                      {metrics.projects_ingested_24h} projects
                    </span>
                  )}
                  {metrics.scrapers_active !== undefined && (
                    <span className="rounded-md bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                      {metrics.scrapers_active} scrapers
                    </span>
                  )}
                  {metrics.posts_pending !== undefined && (
                    <span className="rounded-md bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                      {metrics.posts_pending} pending
                    </span>
                  )}
                </div>

                {/* Critical Issues + Cost */}
                <div className="flex items-center justify-between text-xs">
                  {criticalCount > 0 ? (
                    <span className="text-red-400 font-medium">
                      {criticalCount} critical issue{criticalCount > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-gray-600">No critical issues</span>
                  )}
                  {sweep.cost != null && (
                    <span className="text-gray-600">${Number(sweep.cost).toFixed(2)}</span>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
