'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Search,
  Sparkles,
  Clock,
} from 'lucide-react'

interface DigestRun {
  id: string
  run_date: string
  status: string
  sources_used: string[] | null
  post_count: number
  error: string | null
  created_at: string
  completed_at: string | null
}

interface DigestRunHeaderProps {
  run: DigestRun
}

const STATUS_CONFIG: Record<
  string,
  { icon: typeof CheckCircle2; color: string; bg: string; label: string }
> = {
  pending: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/10', label: 'Pending' },
  researching: { icon: Search, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Researching' },
  generating: { icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Generating' },
  completed: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Failed' },
}

const SOURCE_LABELS: Record<string, string> = {
  grok_x: 'X/Grok',
  rss: 'RSS Feeds',
  google_news: 'Google News',
}

export function DigestRunHeader({ run }: DigestRunHeaderProps) {
  const config = STATUS_CONFIG[run.status] || STATUS_CONFIG.pending
  const Icon = config.icon
  const isActive = run.status === 'researching' || run.status === 'generating'

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('rounded-lg p-2', config.bg)}>
            <Icon
              className={cn('h-5 w-5', config.color, isActive && 'animate-pulse')}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-200">
                {format(new Date(run.created_at), 'MMM d, yyyy')}
              </span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  config.bg,
                  config.color
                )}
              >
                {config.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(run.created_at), {
                  addSuffix: true,
                })}
              </span>
              {run.post_count > 0 && (
                <span className="text-xs text-gray-400">
                  {run.post_count} post{run.post_count !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sources used */}
        {run.sources_used && run.sources_used.length > 0 && (
          <div className="flex items-center gap-2">
            {run.sources_used.map((source) => (
              <span
                key={source}
                className="inline-flex items-center rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400"
              >
                {SOURCE_LABELS[source] || source}
              </span>
            ))}
          </div>
        )}
      </div>

      {run.error && (
        <div className="mt-3 rounded-md bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-xs text-red-400">{run.error}</p>
        </div>
      )}
    </div>
  )
}
