import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// These should be set as environment variables in your Supabase Edge Function settings
const MEMORY_WORKER_URL = Deno.env.get("MEMORY_WORKER_URL"); // Your Railway app URL, e.g., https://YOUR_RAILWAY_APP_URL.up.railway.app
const DAILY_REPORT_API_KEY = Deno.env.get("DAILY_REPORT_API_KEY"); // The secret key

serve(async (_req) => {
  if (!MEMORY_WORKER_URL || !DAILY_REPORT_API_KEY) {
    console.error("Missing MEMORY_WORKER_URL or DAILY_REPORT_API_KEY environment variables in Edge Function settings.");
    return new Response(
      JSON.stringify({ error: "Edge Function is not configured correctly." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const targetUrl = `${MEMORY_WORKER_URL}/api/v1/trigger-daily-report`;
  console.log(`Triggering daily report by calling: POST ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DAILY_REPORT_API_KEY}`,
        "Content-Type": "application/json", // Good practice, even if body is empty for "all users"
      },
      // If you want to trigger for a specific user via the cron job:
      // body: JSON.stringify({ userId: "YOUR_SPECIFIC_USER_ID_HERE" }), 
      // Otherwise, for "all users" (if your endpoint supports it), an empty body or {} is fine.
      // For now, let's assume your memory-worker endpoint defaults to your test user if no body is sent.
      body: JSON.stringify({}) // Send empty JSON object
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Error calling memory worker: ${response.status} ${response.statusText}`,
        errorBody
      );
      return new Response(
        JSON.stringify({
          error: "Failed to trigger daily report in memory worker.",
          status: response.status,
          details: errorBody,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log("Successfully triggered daily report. Response from memory worker:", result);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in daily-report-trigger Edge Function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});