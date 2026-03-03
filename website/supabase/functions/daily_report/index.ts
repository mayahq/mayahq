import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { makeReport } from '../_shared/report-builder.ts';
import { db } from '../_shared/db.ts';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    // Parse request body
    const { userId } = await req.json();
    
    if (!userId) {
      throw new Error('userId is required');
    }
    
    console.log(`Generating daily report for user ${userId}`);
    
    // Generate the report
    const report = await makeReport(userId);
    
    // Save the report
    const currentDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
    const { data } = await db.saveReport(userId, currentDate, report);
    const reportId = data?.id;
    
    console.log(`Successfully saved report with ID ${reportId}`);
    
    // Return the report
    return new Response(
      JSON.stringify({
        success: true,
        report_id: reportId,
        report
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('Error generating daily report:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
}); 