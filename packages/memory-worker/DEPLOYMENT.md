# Deploying the Memory Worker

This guide explains how to deploy the memory worker service to Railway and set up scheduling for daily reports.

## Prerequisites

- GitHub account
- Railway account (https://railway.app)
- Supabase project with service role key

## Deployment Steps

### 1. Prepare Your Code

Ensure your code is committed to GitHub and the memory-worker package builds successfully:

```bash
cd packages/memory-worker
pnpm build
```

### 2. Deploy to Railway

1. Log in to [Railway](https://railway.app) and create a new project
2. Select "Deploy from GitHub repo"
3. Choose your repository
4. Configure the deployment:
   - Root Directory: `packages/memory-worker`
   - Build Command: `pnpm build`
   - Start Command: `pnpm start`

### 3. Set Environment Variables

In the Railway project, go to the "Variables" tab and add the following:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
COHERE_API_KEY=your-cohere-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENAI_API_KEY=your-openai-api-key (optional)
```

### 4. Configure Daily Report Scheduling

You have two options for scheduling daily reports:

#### Option 1: Built-in Scheduler (Default)

The memory worker has a built-in scheduler that runs every 24 hours. This is configured in the `scheduleDailyTasks` function in `index.ts`. No additional setup is required.

#### Option 2: Supabase Edge Function (Recommended for Production)

For more reliable scheduling in production, use the Supabase Edge Function:

1. Configure the Edge Function environment variable:
   ```
   MEMORY_WORKER_URL=https://your-railway-app-url.railway.app
   ```

2. Deploy the Edge Function:
   ```bash
   cd supabase
   supabase functions deploy schedule-daily
   ```

3. Set up a CRON trigger using the Supabase dashboard:
   - Go to your Supabase project
   - Navigate to Database > Functions > Hooks
   - Create a new hook with the "CRON" event
   - Set the schedule to `0 6 * * *` (6:00 AM every day)
   - Set the function to `schedule-daily`

### 5. Verify Deployment

1. Check that the service is running by visiting the health endpoint:
   ```
   https://your-railway-app-url.railway.app/health
   ```

2. Manually trigger a daily report to test:
   ```bash
   curl -X POST https://your-railway-app-url.railway.app/summarise-day
   ```

3. Check the logs in Railway to ensure everything is working as expected.

## Monitoring and Maintenance

- **Railway Dashboard**: Monitor service health, resource usage, and logs
- **Supabase Dashboard**: Monitor database usage and check daily reports in the `daily_reports` table
- **Scaling**: If needed, adjust the resources allocated to your Railway service

## Troubleshooting

- **Connection Issues**: Ensure the service role key has the necessary permissions
- **Missing Daily Reports**: Check the logs for any errors during report generation
- **Embedding Errors**: Verify your Cohere API key is valid and has sufficient quota 