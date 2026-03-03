# Maya Daily Reports

This feature enables personalized daily reports that provide insights into tasks, offer prioritization recommendations, and create a meaningful check-in experience. Unlike simple task statistics, these reports leverage Maya's memory and LLM capabilities to deliver thoughtful, contextually relevant content.

## How It Works

1. An n8n workflow runs on a schedule (e.g., daily at 8am)
2. The workflow calls the API endpoint `/api/reports/generate-daily`
3. The endpoint:
   - Fetches active tasks from the database
   - Retrieves relevant memories and conversation history
   - Processes this information through an LLM (Claude) to generate a personalized report
   - Stores the report in the database
   - Returns the report content
4. The workflow sends the report via email

## Setup Instructions

### 1. Test Locally

Before setting up the n8n workflow, you can test the report generation:

```
# Visit in your browser:
http://localhost:3000/api/reports/test-report?userId=YOUR_USER_ID
```

This will generate a report and return it as JSON.

### 2. Set Up n8n

1. Install n8n if you haven't already:
   ```
   npm install n8n -g
   ```

2. Start n8n:
   ```
   n8n start
   ```

3. Open n8n in your browser (typically http://localhost:5678)

4. Import the workflow template:
   - Go to "Workflows" → "Import From File"
   - Select the `website/scripts/n8n-daily-report-workflow.json` file

5. Configure the workflow:
   - Update the API URL in the "Generate Daily Report" node
   - Configure the "Send Email" node with your SMTP settings
   - Set the schedule in the "Schedule Trigger" node

6. Activate the workflow

### 3. Customize the Report

You can customize the report generation by editing:

- The prompts in `/api/reports/generate-daily.ts`
- The email template in the n8n workflow
- The types of memories and data fetched for the report

## Report Content

Each daily report includes:

1. A personal greeting referencing recent interactions
2. A summary of current tasks with prioritization advice
3. Specific insights for approaching key tasks
4. Reflection on patterns from recent interactions
5. A helpful suggestion or observation
6. An encouraging note

## Technical Notes

- The reports are stored in the `daily_reports` table
- The system uses Anthropic's Claude 3 Sonnet for report generation
- Memory retrieval focuses on recent interactions and emotionally relevant content
- Token usage is optimized by pre-filtering and truncating content

## Extending the Functionality

You can enhance this system by:

1. Adding more data sources (calendar, weather, etc.)
2. Creating a UI to view past reports
3. Adding user preferences for report scheduling and content
4. Implementing more delivery channels (SMS, push notifications, etc.) 