# Maya Daily Report Deployment Guide

This guide explains how to deploy the Maya Daily Report feature using Supabase and n8n.

## Components

The Maya Daily Report system consists of:

1. **Database Table**: `daily_reports` for storing generated reports
2. **Edge Function**: `daily_report` for generating personalized reports
3. **n8n Workflow**: Scheduled automation to trigger daily reports and deliver them
4. **Client API**: Utilities to retrieve and display reports in the web app

## Deployment Steps

### 1. Using the Deployment Script

The simplest way to deploy is using the Node.js script:

```bash
# Set your Supabase access token 
export SUPABASE_ACCESS_TOKEN=your_access_token_here

# Set API keys for production (optional)
export OPENAI_API_KEY=your_openai_api_key
export ANTHROPIC_API_KEY=your_anthropic_api_key

# Run the deployment script
node scripts/deploy-daily-report-mcp.js
```

This script will:
- Deploy the daily_report Edge Function
- Set up the necessary secrets (API keys)

### 2. Manual Deployment using Supabase MCP

If you prefer to deploy manually or the script isn't working, you can use:

```javascript
// Check out existing organizations and projects
const { organizations } = await mcp_Supabase_MCP_list_organizations("get_orgs");
const { projects } = await mcp_Supabase_MCP_list_projects("get_projects");

// Apply database migration
await mcp_Supabase_MCP_apply_migration({
  project_id: "your_project_id",
  name: "create_daily_reports_table",
  query: "-- SQL for creating the daily_reports table (see migrations folder)"
});

// Deploy Edge Function
await mcp_Supabase_MCP_deploy_edge_function({
  project_id: "your_project_id",
  name: "daily_report",
  files: [
    { name: "index.ts", content: "// Your function code" }
  ]
});
```

### 3. Setting Up the n8n Workflow

1. Import the workflow template from `scripts/n8n-daily-report-workflow.json`
2. Configure the webhook URL for Discord notifications (if using Discord)
3. Set the Supabase Anon Key as an environment variable in n8n
4. Adjust the schedule as needed (default is once per day)
5. Activate the workflow

## Testing the Deployment

Test the function with:

```bash
curl -X POST "https://your-project-ref.supabase.co/functions/v1/daily_report" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_anon_key" \
  -d '{"userId":"your_user_id"}'
```

## Troubleshooting

### Common Issues

1. **API Key Issues**: If you see authentication errors in the logs, check that your API keys are correctly set in the Edge Function secrets.

2. **Database Access**: If the function fails to store reports, verify that the function has proper access to the `daily_reports` table.

3. **Vector Search**: If vector search isn't working, check that your database has the `match_documents` function and that the OpenAI API key is correctly set.

### Logs

View Edge Function logs in the Supabase Dashboard:
1. Go to Edge Functions
2. Select the `daily_report` function
3. Click on "Logs"

Or use the CLI:
```bash
supabase functions logs daily_report --project-ref your-project-ref
```

## Monitoring and Maintenance

- Set up alerts in n8n to notify you if the workflow fails
- Periodically review logs to ensure the function is working correctly
- Consider setting up a monitoring dashboard to track report generation and delivery

---

For more information, refer to the comprehensive README in the Edge Function directory. 