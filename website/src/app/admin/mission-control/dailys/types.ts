export interface ActionItem {
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  category: string
}

export interface SweepMetrics {
  projects_ingested_24h?: number
  scrapers_active?: number
  scrapers_failing?: number
  geocoding_rate?: number
  entity_extraction_rate?: number
  posts_published_24h?: number
  posts_pending?: number
  signups_7d?: number
  gold_subscribers?: number
  active_jobs?: number
  [key: string]: number | undefined
}

export interface DailySweep {
  id: string
  sweep_date: string
  summary: string | null
  report: string | null
  metrics: SweepMetrics
  action_items: ActionItem[]
  health_score: 'healthy' | 'warning' | 'critical' | 'unknown'
  cost: number | null
  turns: number | null
  duration_seconds: number | null
  created_at: string
}
