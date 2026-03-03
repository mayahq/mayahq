// Follow this setup guide to integrate the Deno standard library:
// https://docs.deno.com/runtime/manual/node/how_to_with_npm/
// @deno-types="npm:@types/express@4.17.15"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0'
import { cors } from 'https://deno.land/x/cors@v1.2.2/mod.ts'

// Set up Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const memoryWorkerUrl = Deno.env.get('MEMORY_WORKER_URL') || 'http://localhost:3000'

const supabase = createClient(supabaseUrl, serviceRoleKey)

/**
 * Schedule daily reports by calling the memory worker
 */
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors() })
  }
  
  try {
    console.log('Calling memory worker to generate daily reports')
    
    // Call the memory worker's /summarise-day endpoint
    const response = await fetch(`${memoryWorkerUrl}/summarise-day`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString()
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`Failed to trigger daily reports: ${JSON.stringify(errorData)}`)
    }
    
    const result = await response.json()
    
    // Log the event
    await supabase
      .from('system_logs')
      .insert({
        event_type: 'daily_report_scheduled',
        message: 'Successfully triggered daily reports generation',
        metadata: {
          timestamp: new Date().toISOString(),
          result
        }
      })
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Daily reports scheduled successfully',
        result
      }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          ...cors()
        } 
      }
    )
  } catch (error) {
    console.error('Error scheduling daily reports:', error)
    
    // Log the error
    await supabase
      .from('system_logs')
      .insert({
        event_type: 'daily_report_error',
        message: `Error scheduling daily reports: ${error.message}`,
        metadata: {
          timestamp: new Date().toISOString(),
          error: error.message
        }
      })
      .catch(logError => {
        console.error('Failed to log error:', logError)
      })
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...cors()
        } 
      }
    )
  }
}) 