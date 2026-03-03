import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MEMORY_WORKER_URL = Deno.env.get("MEMORY_WORKER_URL");
const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || Deno.env.get("DAILY_REPORT_API_KEY");

serve(async (_req) => {
  if (!MEMORY_WORKER_URL || !INTERNAL_API_KEY) {
    console.error("Missing MEMORY_WORKER_URL or INTERNAL_API_KEY environment variables.");
    return new Response(
      JSON.stringify({ error: "Edge Function is not configured correctly." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const targetUrl = `${MEMORY_WORKER_URL}/api/v1/digest/run`;
  console.log(`Triggering daily digest by calling: POST ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${INTERNAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Error calling memory worker: ${response.status} ${response.statusText}`,
        errorBody
      );
      return new Response(
        JSON.stringify({
          error: "Failed to trigger daily digest in memory worker.",
          status: response.status,
          details: errorBody,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log("Successfully triggered daily digest. Response:", result);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in daily-digest-trigger Edge Function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
