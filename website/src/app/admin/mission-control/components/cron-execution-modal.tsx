'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { X, CheckCircle2, XCircle, Clock, AlertTriangle, Hash } from 'lucide-react'
import { format } from 'date-fns'
import type { CronExecution, CronJob, CATEGORY_COLORS } from './types'

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ok: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'OK' },
  success: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Success' },
  failed: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Failed' },
  running: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Running' },
  skipped: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Skipped' },
  timeout: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Timeout' },
}

interface CronExecutionModalProps {
  execution: CronExecution
  job: CronJob | null
  open: boolean
  onClose: () => void
}

export function CronExecutionModal({ execution, job, open, onClose }: CronExecutionModalProps) {
  const status = STATUS_STYLES[execution.status] || STATUS_STYLES.ok

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-gray-800 bg-gray-950 shadow-2xl mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 rounded-full p-1.5 bg-gray-900/80 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Scrollable content */}
        <div className="overflow-y-auto p-5 space-y-5">
          {/* Header: Job Name + Status */}
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <h2 className="text-lg font-semibold text-gray-100">
                {job?.name || execution.openclaw_id || 'Unknown Job'}
              </h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                {job?.category && (
                  <span className="text-gray-400">{job.category}</span>
                )}
                {job?.platform && (
                  <>
                    <span>·</span>
                    <span className="text-gray-400">{job.platform}</span>
                  </>
                )}
                {job?.schedule && (
                  <>
                    <span>·</span>
                    <span className="text-gray-400 font-mono">{job.schedule}</span>
                  </>
                )}
              </div>
            </div>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium flex-shrink-0',
                status.bg,
                status.text
              )}
            >
              {status.label}
            </span>
          </div>

          {/* Timing Section */}
          <div className="rounded-lg bg-gray-900/50 border border-gray-800 p-4 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-gray-500" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Timing</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 text-xs">Started</span>
                <p className="text-gray-200">{format(new Date(execution.started_at), 'MMM d, HH:mm:ss')}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Completed</span>
                <p className="text-gray-200">
                  {execution.completed_at
                    ? format(new Date(execution.completed_at), 'MMM d, HH:mm:ss')
                    : 'In progress...'}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Duration</span>
                <p className="text-gray-200">
                  {execution.duration_ms != null ? `${execution.duration_ms.toLocaleString()}ms` : '-'}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Triggered by</span>
                <p className="text-gray-200">{execution.triggered_by || 'unknown'}</p>
              </div>
            </div>
          </div>

          {/* Summary */}
          {execution.summary && (
            <div className="rounded-lg bg-gray-900/50 border border-gray-800 p-4">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Summary</span>
              <p className="text-sm text-gray-200 mt-2 whitespace-pre-wrap leading-relaxed">
                {execution.summary}
              </p>
            </div>
          )}

          {/* Error */}
          {execution.error_message && (
            <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-4">
              <span className="text-xs font-medium text-red-400 uppercase tracking-wide">Error</span>
              <p className="text-sm text-red-300 mt-2 whitespace-pre-wrap font-mono leading-relaxed">
                {execution.error_message}
              </p>
            </div>
          )}

          {/* Output JSON */}
          {execution.output && Object.keys(execution.output).length > 0 && (
            <div className="rounded-lg bg-gray-900/50 border border-gray-800 p-4">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Output</span>
              <pre className="text-xs text-gray-300 mt-2 overflow-x-auto whitespace-pre-wrap font-mono bg-gray-900 rounded p-3 max-h-64 overflow-y-auto">
                {JSON.stringify(execution.output, null, 2)}
              </pre>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-4 text-[11px] text-gray-600 pt-2 border-t border-gray-800 flex-wrap">
            {job?.discord_channel_name && (
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {job.discord_channel_name}
              </span>
            )}
            {execution.session_id && (
              <span>Session: <span className="font-mono">{execution.session_id.slice(0, 8)}</span></span>
            )}
            <span>ID: <span className="font-mono">{execution.id.slice(0, 8)}</span></span>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 flex items-center justify-end p-4 border-t border-gray-800 bg-gray-950/95 backdrop-blur-sm rounded-b-xl">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
