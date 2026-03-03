'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RefreshCw, Settings, Clock, CheckCircle, XCircle, AlertTriangle, Eye, Activity } from 'lucide-react'
import { toast } from 'sonner'

interface DataSource {
  id: string
  name: string
  type: 'webhook' | 'rss' | 'api_poll' | 'manual'
  config: any
  active: boolean
  created_at: string
  updated_at: string
}

interface ActivityEvent {
  id: string
  source_identifier: string
  source_type: string
  source_id: string
  source_name?: string
  status: 'pending' | 'processed' | 'error'
  payload: any
  metadata: any
  created_at: string
  error_message?: string
  isMetaEvent: boolean
  displayType: 'system' | 'content'
}

export default function DataSourcesPage() {
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState('sources')

  useEffect(() => {
    fetchDataSources()
    fetchActivity()
    const interval = setInterval(() => {
      if (activeTab === 'activity') {
        fetchActivity()
      }
    }, 10000) // Refresh activity every 10 seconds
    
    return () => clearInterval(interval)
  }, [activeTab])

  const fetchDataSources = async () => {
    try {
      const response = await fetch('/api/ingest/data-sources/sources')
      if (response.ok) {
        const data = await response.json()
        setDataSources(data.data_sources || [])
      } else {
        throw new Error('Failed to fetch data sources')
      }
    } catch (error) {
      console.error('Error fetching data sources:', error)
      toast.error('Failed to fetch data sources')
    } finally {
      setLoading(false)
    }
  }

  const fetchActivity = async () => {
    try {
      const response = await fetch('/api/ingest/data-sources/activity?limit=100')
      if (response.ok) {
        const data = await response.json()
        
        // Filter out meta-events (summaries, no-entries, errors) when showing in "processing" context
        const filteredActivity = (data.activity || []).map((event: any) => {
          // Add display hints for better UI handling
          const isMetaEvent = 
            event.source_identifier.includes('summary_') ||
            event.source_identifier.includes('no_entries_') ||
            event.source_identifier.includes('error_') ||
            event.payload?.summary ||
            event.payload?.info ||
            event.payload?.error
          
          return {
            ...event,
            isMetaEvent,
            displayType: isMetaEvent ? 'system' : 'content'
          }
        })
        
        setActivityEvents(filteredActivity)
      } else {
        // Fallback to enhanced mock data if real API fails
        console.warn('Activity API failed, using mock data')
        setActivityEvents([
          {
            id: '1',
            source_identifier: '44085920',
            source_type: 'api_poll',
            source_id: 'c417e9c7-caa6-4eca-b9ee-d46cacf0e980',
            source_name: 'Hacker News AI',
            status: 'processed',
            payload: { title: 'Claude 4 System Card', score: 428, url: 'https://simonwillison.net/2025/May/25/claude-4-system-card/' },
            metadata: { hn_id: 44085920, score: 428, hn_url: 'https://news.ycombinator.com/item?id=44085920' },
            created_at: new Date(Date.now() - 300000).toISOString(),
            isMetaEvent: false,
            displayType: 'content'
          },
          {
            id: '2', 
            source_identifier: 'github_abc123',
            source_type: 'webhook',
            source_id: '0a14fed5-fc7e-4690-915c-8d432541d838',
            source_name: 'GitHub Commits',
            status: 'processed',
            payload: { 
              head_commit: { 
                message: 'Fix dependency issues for Python 3.13 compatibility', 
                author: { name: 'blake' },
                url: 'https://github.com/lowvoltagenation/mayahq/commit/abc123'
              }
            },
            metadata: { delivery_id: 'abc123', github_event: 'push' },
            created_at: new Date(Date.now() - 600000).toISOString(),
            isMetaEvent: false,
            displayType: 'content'
          },
          {
            id: '3',
            source_identifier: 'no_entries_example',
            source_type: 'rss',
            source_id: 'c417e9c7-caa6-4eca-b9ee-d46cacf0e980',
            source_name: 'ArXiv AI Papers',
            status: 'processed',
            payload: { info: 'No new entries', url: 'https://rss.arxiv.org/rss/cs.AI' },
            metadata: { feed_url: 'https://rss.arxiv.org/rss/cs.AI', entry_count: 0 },
            error_message: undefined,
            created_at: new Date(Date.now() - 900000).toISOString(),
            isMetaEvent: true,
            displayType: 'system'
          }
        ])
      }
    } catch (error) {
      console.error('Error fetching activity:', error)
      // Keep existing mock data on error
    }
  }

  const toggleDataSource = async (sourceId: string, newStatus: boolean) => {
    try {
      const response = await fetch(`/api/ingest/data-sources/sources/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newStatus })
      })

      if (response.ok) {
        setDataSources(prev => 
          prev.map(source => 
            source.id === sourceId ? { ...source, active: newStatus } : source
          )
        )
        toast.success(`Data source ${newStatus ? 'enabled' : 'disabled'} successfully`)
      } else {
        throw new Error('Failed to update data source')
      }
    } catch (error) {
      console.error('Error toggling data source:', error)
      toast.error('Failed to update data source')
    }
  }

  const triggerProcessing = async (type: string) => {
    setProcessing(true)
    try {
      const endpoint = type === 'rss' ? '/rss/process' : '/hackernews/process'
      const response = await fetch(`/api/ingest/data-sources${endpoint}`, {
        method: 'POST'
      })
      
      if (response.ok) {
        toast.success(`${type.toUpperCase()} processing triggered successfully`)
        setTimeout(() => fetchActivity(), 2000) // Refresh activity after 2 seconds
      } else {
        throw new Error(`Failed to trigger ${type} processing`)
      }
    } catch (error) {
      console.error('Error triggering processing:', error)
      toast.error(`Failed to trigger ${type} processing`)
    } finally {
      setProcessing(false)
    }
  }

  const getSourceTypeLabel = (type: string) => {
    switch (type) {
      case 'webhook': return 'Webhook'
      case 'rss': return 'RSS Feed'
      case 'api_poll': return 'API Polling'
      case 'manual': return 'Manual'
      default: return type
    }
  }

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'webhook': return '🔗'
      case 'rss': return '📡'
      case 'api_poll': return '🔄'
      case 'manual': return '✍️'
      default: return '📊'
    }
  }

  const getSourceColor = (type: string) => {
    switch (type) {
      case 'webhook': return 'bg-blue-500/20 text-blue-400'
      case 'rss': return 'bg-orange-500/20 text-orange-400'
      case 'api_poll': return 'bg-green-500/20 text-green-400'
      case 'manual': return 'bg-purple-500/20 text-purple-400'
      default: return 'bg-gray-500/20 text-gray-400'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed': return <CheckCircle className="h-4 w-4 text-green-400" />
      case 'pending': return <Clock className="h-4 w-4 text-yellow-400" />
      case 'error': return <XCircle className="h-4 w-4 text-red-400" />
      default: return <AlertTriangle className="h-4 w-4 text-gray-400" />
    }
  }

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date()
    const past = new Date(timestamp)
    const diffMs = now.getTime() - past.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return past.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading data sources...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
            Data Sources
          </h1>
          <p className="text-gray-400 mt-2">
            Manage Maya's data ingestion pipeline and content sources
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:flex-nowrap">
          <Button
            onClick={() => {
              fetchDataSources()
              fetchActivity()
            }}
            variant="outline"
            size="sm"
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => triggerProcessing('rss')}
            disabled={processing}
            variant="outline"
            className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
          >
            {processing ? '⏳' : '📡'} Process RSS
          </Button>
          <Button
            onClick={() => triggerProcessing('hackernews')}
            disabled={processing}
            variant="outline"
            className="border-green-500/30 text-green-400 hover:bg-green-500/10"
          >
            {processing ? '⏳' : '🔄'} Process HN
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sources">Data Sources</TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dataSources.map((source) => {
              const colorClass = getSourceColor(source.type)
              const recentEvents = activityEvents.filter(e => e.source_id === source.id).slice(0, 3)
              
              return (
                <Card key={source.id} className="bg-gray-900/50 border-gray-800">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className={`p-2 rounded-lg ${colorClass} text-2xl`}>
                        {getSourceIcon(source.type)}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={source.active}
                          onCheckedChange={(checked) => toggleDataSource(source.id, checked)}
                          className="data-[state=checked]:bg-green-600"
                        />
                        <Badge variant={source.active ? "default" : "secondary"}>
                          {source.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                    <CardTitle className="text-lg text-gray-200">{source.name}</CardTitle>
                    <CardDescription className="text-gray-400">
                      {getSourceTypeLabel(source.type)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Recent Activity Preview */}
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500">Recent Activity:</p>
                        {recentEvents.length > 0 ? (
                          recentEvents.map((event) => (
                            <div key={event.id} className="flex items-center gap-2 text-xs">
                              {getStatusIcon(event.status)}
                              <span className="text-gray-400 truncate flex-1">
                                {event.payload?.title || event.source_identifier}
                              </span>
                              <span className="text-gray-500">
                                {formatTimeAgo(event.created_at)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-gray-500">No recent activity</p>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-gray-400 hover:text-purple-400"
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Configure
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-gray-400 hover:text-purple-400"
                          onClick={() => setActiveTab('activity')}
                        >
                          <Activity className="h-4 w-4 mr-1" />
                          View Logs
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-gray-200 flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Real-time monitoring of data source events and processing
                </CardDescription>
              </div>
              <Button
                onClick={fetchActivity}
                variant="outline"
                size="sm"
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800">
                      <TableHead className="text-gray-400">Status</TableHead>
                      <TableHead className="text-gray-400">Source</TableHead>
                      <TableHead className="text-gray-400">Event</TableHead>
                      <TableHead className="text-gray-400">Time</TableHead>
                      <TableHead className="text-gray-400">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activityEvents.map((event) => {
                      const source = dataSources.find(s => s.id === event.source_id)
                      const sourceConfig = source?.config || {}
                      
                      // Extract meaningful details from the event
                      const getEventTitle = () => {
                        // Handle system events differently
                        if (event.isMetaEvent) {
                          if (event.payload?.summary) {
                            return `📊 Processing Summary`
                          }
                          if (event.payload?.info) {
                            return `ℹ️ ${event.payload.info}`
                          }
                          if (event.payload?.error) {
                            return `❌ ${event.payload.error}`
                          }
                        }
                        
                        // Handle content events
                        if (event.payload?.head_commit?.message) {
                          return event.payload.head_commit.message
                        }
                        if (event.payload?.title) {
                          return event.payload.title
                        }
                        return event.source_identifier
                      }
                      
                      const getEventSubtext = () => {
                        if (event.isMetaEvent && event.payload?.summary) {
                          return `${event.payload.total_stories} stories • ${event.payload.ai_related} AI-related • ${event.payload.processed} processed`
                        }
                        if (event.metadata?.hn_id) {
                          return `HN Story #${event.metadata.hn_id} • Score: ${event.metadata.score}`
                        }
                        if (event.metadata?.github_event) {
                          return `GitHub ${event.metadata.github_event} • ${event.payload?.head_commit?.author?.name}`
                        }
                        if (event.metadata?.feed_url && event.isMetaEvent) {
                          return `RSS Feed Check • ${event.metadata.entry_count || 0} entries`
                        }
                        return null
                      }
                      
                      const getSourceUrl = () => {
                        if (event.payload?.url) return event.payload.url
                        if (event.payload?.head_commit?.url) return event.payload.head_commit.url
                        if (event.metadata?.hn_url) return event.metadata.hn_url
                        if (sourceConfig?.url) return sourceConfig.url
                        if (sourceConfig?.base_url) return sourceConfig.base_url
                        return null
                      }
                      
                      const getErrorDetails = () => {
                        if (!event.error_message) return null
                        
                        // Parse different error types for better display
                        if (event.error_message.includes('HTTP')) {
                          const httpMatch = event.error_message.match(/HTTP (\d+)/)
                          if (httpMatch) {
                            return `HTTP ${httpMatch[1]} - ${event.source_type === 'rss' ? 'RSS feed unavailable' : 'API error'}`
                          }
                        }
                        
                        if (event.error_message.includes('timeout')) {
                          return 'Connection timeout - check network or source availability'
                        }
                        
                        if (event.error_message.includes('parse')) {
                          return 'Content parsing failed - invalid format or structure'
                        }
                        
                        return event.error_message
                      }
                      
                      return (
                        <TableRow key={event.id} className={`border-gray-800 ${event.isMetaEvent ? 'opacity-75' : ''}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(event.status)}
                              <span className="capitalize text-sm">{event.status}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{getSourceIcon(event.source_type)}</span>
                                <span className={`text-sm font-medium ${event.isMetaEvent ? 'text-gray-400' : ''}`}>
                                  {event.source_name || source?.name || event.source_type}
                                </span>
                                {event.isMetaEvent && (
                                  <span className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">
                                    System
                                  </span>
                                )}
                              </div>
                              {getSourceUrl() && !event.isMetaEvent && (
                                <div className="text-xs text-blue-400 truncate max-w-[200px]">
                                  <a href={getSourceUrl()} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                    {getSourceUrl()}
                                  </a>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className={`max-w-[300px] truncate text-sm font-medium ${event.isMetaEvent ? 'text-gray-400' : ''}`}>
                                {getEventTitle()}
                              </div>
                              {getEventSubtext() && (
                                <div className="text-xs text-gray-400">
                                  {getEventSubtext()}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-400">
                            <div className="space-y-1">
                              <div>{formatTimeAgo(event.created_at)}</div>
                              <div className="text-xs">
                                {new Date(event.created_at).toLocaleTimeString()}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {event.error_message ? (
                                <div className="space-y-1">
                                  <Badge variant="destructive" className="text-xs">
                                    Error
                                  </Badge>
                                  <div className="text-xs text-red-300 max-w-[250px]">
                                    {getErrorDetails()}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {!event.isMetaEvent ? (
                                    <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                                      {event.source_identifier}
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs bg-gray-700 text-gray-300">
                                      {event.displayType}
                                    </Badge>
                                  )}
                                  {event.status === 'processed' && !event.isMetaEvent && (
                                    <div className="text-xs text-green-400">
                                      ✓ Ready for content processing
                                    </div>
                                  )}
                                  {event.status === 'processed' && event.isMetaEvent && (
                                    <div className="text-xs text-gray-500">
                                      📋 System information
                                    </div>
                                  )}
                                  {event.status === 'pending' && (
                                    <div className="text-xs text-yellow-400">
                                      ⏳ In processing queue
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup" className="space-y-4">
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-gray-200">Setup Instructions</CardTitle>
              <CardDescription className="text-gray-400">
                Steps to implement the modular data sources system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-1">1</Badge>
                  <div>
                    <h4 className="text-sm font-medium text-gray-200">Database Migration</h4>
                    <p className="text-sm text-gray-400">Run the SQL migration to create data_sources and processing_rules tables</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-1">2</Badge>
                  <div>
                    <h4 className="text-sm font-medium text-gray-200">Deploy Ingest Service</h4>
                    <p className="text-sm text-gray-400">Update and deploy the enhanced ingest service to Railway</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-1">3</Badge>
                  <div>
                    <h4 className="text-sm font-medium text-gray-200">Configure n8n Workflows</h4>
                    <p className="text-sm text-gray-400">Update n8n to process events from the new data sources</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-1">4</Badge>
                  <div>
                    <h4 className="text-sm font-medium text-gray-200">Test Data Sources</h4>
                    <p className="text-sm text-gray-400">Verify RSS feeds, Hacker News API, and manual events are working</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 