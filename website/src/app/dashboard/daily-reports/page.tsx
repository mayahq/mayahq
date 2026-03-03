'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getLatestDailyReport, getDailyReports, DailyReport } from '@/lib/daily-reports'
import { formatDistanceToNow } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import { type Database } from '@/lib/database.types'

export default function DailyReportsPage() {
  const { user: authUser, supabase } = useAuth()
  const [latestReport, setLatestReport] = useState<DailyReport | null>(null)
  const [previousReports, setPreviousReports] = useState<DailyReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadReports() {
      if (!authUser?.id || !supabase) return

      setLoading(true)
      
      try {
        // Fetch latest report
        const latest = await getLatestDailyReport(supabase, authUser.id)
        setLatestReport(latest)
        
        // Fetch previous reports
        const reports = await getDailyReports(supabase, authUser.id, 10)
        if (Array.isArray(reports)) {
          setPreviousReports(reports.slice(1)) // Skip the first one (latest)
        } else {
          setPreviousReports([])
        }
      } catch (error) {
        console.error('Error loading daily reports:', error)
      } finally {
        setLoading(false)
      }
    }
    
    if (supabase && authUser?.id) {
      loadReports()
    }
  }, [authUser?.id, supabase])

  if (loading) {
    return (
      <div className="container mx-auto max-w-3xl py-8 px-4">
        <h1 className="text-3xl font-bold mb-8">Daily Reports</h1>
        <p>Loading your daily reports...</p>
      </div>
    )
  }

  if (!latestReport && previousReports.length === 0) {
    return (
      <div className="container mx-auto max-w-3xl py-8 px-4">
        <h1 className="text-3xl font-bold mb-8">Daily Reports</h1>
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6">
          <p className="text-lg mb-4">No daily reports available yet.</p>
          <p>Maya will prepare personalized daily reports to help you stay on top of your tasks and memories.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-3xl py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Daily Reports</h1>
      
      {latestReport && (
        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-2">Latest Report</h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">
                Generated {formatDistanceToNow(new Date(latestReport.created_at), { addSuffix: true })}
              </p>
              {latestReport.delivered && (
                <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                  Delivered via {latestReport.delivery_method || 'app'}
                </span>
              )}
            </div>
            <div className="prose dark:prose-invert max-w-none">
              <ReactMarkdown>{latestReport.report_text}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
      
      {previousReports.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">Previous Reports</h2>
          <div className="space-y-6">
            {previousReports.map((report) => (
              <div 
                key={report.id} 
                id={`report-${report.id}`}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6"
              >
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-gray-500">
                    Generated {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                  </p>
                  {report.delivered && (
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                      Delivered via {report.delivery_method || 'app'}
                    </span>
                  )}
                </div>
                <div className="prose dark:prose-invert max-w-none line-clamp-3">
                  <ReactMarkdown>{report.report_text}</ReactMarkdown>
                </div>
                <button 
                  className="mt-4 text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline"
                  onClick={() => {
                    const el = document.getElementById(`report-${report.id}`)
                    if (el) {
                      el.classList.toggle('line-clamp-3')
                    }
                  }}
                >
                  Show more
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 