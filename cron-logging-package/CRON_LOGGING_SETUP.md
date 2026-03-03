# OpenClaw → Maya HQ Supabase Cron Logging Setup

**Date:** 2026-02-14
**Purpose:** Add execution logging for all OpenClaw cron jobs to Maya HQ Supabase for visibility and debugging

---

## What This System Does

**Problem:** OpenClaw cron jobs run in isolation. No easy way to see execution history, errors, or metrics without digging through logs.

**Solution:** Log every cron execution to Maya HQ Supabase:
- Start time, end time, duration
- Status (running, success, error)
- Error messages and structured output
- Links to cron job metadata

**Benefits:**
- Query execution history from anywhere (CLI, frontend, API)
- Build dashboards in Maya HQ Next.js app
- Debug failures without SSH'ing into the machine
- Track metrics (success rate, average duration, error patterns)

---

## Files Created

All files are in `/Users/mayascott/clawd/scripts/`:

1. **`supabase-cron-schema.sql`** - Database schema (run in Supabase SQL Editor)
2. **`cron-log.sh`** - Logging helper script (called from cron payloads)
3. **`sync-cron-jobs.sh`** - Syncs jobs.json → Supabase (run after creating/updating crons)
4. **`cron-logging-example.md`** - Integration patterns and examples
5. **`CRON_LOGGING_SETUP.md`** - This file (complete setup guide)

---

## Setup Instructions

### Step 1: Create Database Tables

**Location:** Maya HQ Supabase SQL Editor
**File:** `scripts/supabase-cron-schema.sql`

1. Open https://supabase.com/dashboard/project/dlaczmexhnoxfggpzxkl/sql/new
2. Copy the ENTIRE contents of `scripts/supabase-cron-schema.sql`
3. Click "Run" or press Cmd+Enter
4. Verify success: Go to Table Editor → you should see `cron_jobs` and `cron_executions` tables

**What this creates:**
- `cron_jobs` table (metadata: name, schedule, category, platform, Discord channels)
- `cron_executions` table (logs: start/end times, status, errors, output JSON)
- `cron_activity` view (joins jobs + executions for dashboard queries)
- Indexes for performance
- RLS policies (service_role = full access, authenticated = read-only)

---

### Step 2: Sync Existing Cron Jobs

**From:** MacBook terminal
**Script:** `scripts/sync-cron-jobs.sh`

```bash
cd /Users/mayascott/clawd
./scripts/sync-cron-jobs.sh
```

**What this does:**
- Reads `~/.openclaw/cron/jobs.json`
- Extracts metadata (name, schedule, enabled status)
- Auto-detects category (maya-personal, lvn-social, lvn-sdr, content)
- Auto-detects platform (instagram, facebook, linkedin, x)
- Extracts Discord channel IDs from payloads
- Upserts to `cron_jobs` table

**Expected output:**
```
Syncing cron jobs from /Users/mayascott/.openclaw/cron/jobs.json to Supabase...

Found 15 cron jobs in jobs.json
✓ LVN Content Mode - Weekly Post (lvn-social/linkedin)
✓ LVN Daily Instagram (lvn-social/instagram)
✓ X Crab Post (maya-personal/x)
○ Instagram Inspo - Morning (maya-personal/instagram) [disabled]
...

Upserting 15 records to Supabase...
✓ Successfully synced 15 cron jobs
```

**Troubleshooting:**
- If you get Python errors, make sure `requests` is installed: `pip3 install requests`
- If sync fails, check `config/mayahq-supabase.env` has correct credentials

**When to re-run this:**
- After creating new cron jobs
- After renaming/updating cron jobs
- After changing schedules or Discord channels
- Anytime you want to refresh metadata

---

### Step 3: Test Logging with One Cron

**Recommended test:** LVN Instagram (already has a standalone script)

#### Option A: Manual Test (Quick)

```bash
cd /Users/mayascott/clawd

# Get the cron ID from jobs.json
CRON_ID="58c8a752-9db6-4d7b-b1c6-382191263cbd"  # LVN Daily Instagram

# Test start
./scripts/cron-log.sh start "$CRON_ID" "Manual test run"

# Simulate some work
sleep 2

# Test success
./scripts/cron-log.sh end "$CRON_ID" "success" "Test completed successfully" '{"test": true}'
```

**Verify in Supabase:**
```bash
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_executions?order=started_at.desc&limit=5" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
```

You should see your test execution with status "success".

#### Option B: Update Actual Script (Better)

**File to edit:** `scripts/lvn-instagram-daily-cron.sh`

Add logging at the start and end:

```bash
#!/usr/bin/env bash
set -e

# ADD THIS AT THE TOP (after set -e)
CRON_ID="58c8a752-9db6-4d7b-b1c6-382191263cbd"
LOG_SCRIPT="/Users/mayascott/clawd/scripts/cron-log.sh"

$LOG_SCRIPT start "$CRON_ID" "LVN Instagram daily post starting"

# ... existing script content ...

# ADD THIS AT THE END (after successful post)
$LOG_SCRIPT end "$CRON_ID" "success" "Posted to Instagram" "{\"post_url\": \"$POST_URL\"}"
```

**For error handling:**
```bash
# Wrap the main work in a function
do_work() {
    # ... your existing code ...
}

# Call it with error handling
if do_work; then
    $LOG_SCRIPT end "$CRON_ID" "success" "Posted to Instagram"
else
    $LOG_SCRIPT error "$CRON_ID" "Failed to post to Instagram"
    exit 1
fi
```

**Test the updated script:**
```bash
./scripts/lvn-instagram-daily-cron.sh
```

Then check Supabase for the execution log.

---

### Step 4: Migrate Remaining Crons

**Priority order:**

1. **LVN Social Crons** (high visibility, daily runs)
   - `58c8a752-9db6-4d7b-b1c6-382191263cbd` - LVN Daily Instagram ✅ (test case)
   - `33220e2f-dbe8-4d08-81df-d5ce17991e24` - LVN Facebook Content
   - `720fcb0d-5a48-4d9e-9c8d-dac07f88664b` - LVN Daily Facebook Post
   - `63221625-7998-48ff-bbfc-ca328a25e70a` - LVN Daily X Post
   - `66643301-6146-45c7-9b8a-4bacf1d8b656` - LVN LinkedIn Weekly

2. **Maya Personal Crons** (X crab posts, reflections)
   - `69691b0a-373d-424e-9d3b-179431a56e62` - X Crab Post
   - `f80b0e31-68ad-4ebe-a533-32d82d05a8ca` - X Daily Reflection

3. **City Announcements**
   - `a98184d6-06f9-43b2-8a37-72dd7a4baa50` - LVN City Announcement (Facebook)
   - `7c04154d-0d86-4a89-972c-b35b92e8ec8f` - LVN City Announcement X

4. **Content/Monitoring** (lower priority)
   - Content Trend Scout
   - Content Weekly Curation
   - Content Engagement Monitor

**For each cron, choose a pattern:**

### Pattern 1: Bash Script Wrapper (Recommended)

Best for crons that call shell scripts.

**Create:** `scripts/CRONNAME-logged.sh`
```bash
#!/bin/bash
set -e

CRON_ID="<openclaw-id-here>"
LOG="/Users/mayascott/clawd/scripts/cron-log.sh"
SCRIPT="/Users/mayascott/clawd/scripts/ORIGINAL-SCRIPT.sh"

$LOG start "$CRON_ID" "CRON NAME starting"

if OUTPUT=$($SCRIPT 2>&1); then
    $LOG end "$CRON_ID" "success" "Completed successfully"
else
    ERROR_MSG=$(echo "$OUTPUT" | tail -5)
    $LOG error "$CRON_ID" "$ERROR_MSG"
    exit 1
fi
```

Then update `jobs.json` payload to call the wrapper instead of the original script.

### Pattern 2: Inline Logging (For OpenClaw Tool Payloads)

Best for crons that use OpenClaw's `message` tool directly.

**Before:**
```json
{
  "payload": {
    "kind": "agentTurn",
    "message": "Post to LinkedIn...",
    "tools": [...]
  }
}
```

**After:**
```json
{
  "payload": {
    "kind": "agentTurn",
    "message": "Log start, post to LinkedIn, log completion",
    "tools": [
      {
        "name": "bash",
        "args": {
          "command": "/Users/mayascott/clawd/scripts/cron-log.sh start 'CRON_ID' 'Description'"
        }
      },
      {
        "name": "message",
        "args": {...}
      },
      {
        "name": "bash",
        "args": {
          "command": "/Users/mayascott/clawd/scripts/cron-log.sh end 'CRON_ID' 'success' 'Completed'"
        }
      }
    ]
  }
}
```

### Pattern 3: Edit Script Directly

Best for simple scripts you control.

Add to top:
```bash
CRON_ID="..."
LOG="/Users/mayascott/clawd/scripts/cron-log.sh"
$LOG start "$CRON_ID" "Description"
```

Add to end (success path):
```bash
$LOG end "$CRON_ID" "success" "Completed"
```

Add to error handling:
```bash
$LOG error "$CRON_ID" "Error description"
```

---

## Getting Cron IDs

**From CLI:**
```bash
openclaw cron list
```

**From jobs.json:**
```bash
cat ~/.openclaw/cron/jobs.json | python3 -c "
import json, sys
jobs = json.load(sys.stdin)['jobs']
for j in jobs:
    enabled = '✓' if j.get('enabled') else '○'
    print(f\"{enabled} {j['id']} - {j['name']}\")
" | grep -i instagram
```

**From Supabase (after sync):**
```bash
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_jobs?select=openclaw_id,name,enabled&order=name" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
```

---

## Viewing Logs

### CLI Quick Queries

**Recent executions (all jobs):**
```bash
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_activity?limit=20&order=started_at.desc" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
```

**Today's executions:**
```bash
TODAY=$(date -u +%Y-%m-%d)
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_executions?started_at=gte.${TODAY}T00:00:00Z&order=started_at.desc" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
```

**Recent errors:**
```bash
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_activity?status=eq.error&limit=10&order=started_at.desc" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
```

**Specific job's history:**
```bash
CRON_ID="58c8a752-9db6-4d7b-b1c6-382191263cbd"
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_executions?openclaw_id=eq.${CRON_ID}&limit=10&order=started_at.desc" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
```

### Supabase Dashboard

1. Go to https://supabase.com/dashboard/project/dlaczmexhnoxfggpzxkl/editor
2. Open `cron_activity` view (Table Editor → Views)
3. Filter/sort as needed:
   - `status = 'error'` to see failures
   - `enabled = true` to see active jobs only
   - Order by `started_at DESC` for most recent

### Maya HQ Frontend (Optional, Future)

You can build a cron dashboard page:

**File:** `app/crons/page.tsx`
```typescript
import { createClient } from '@/utils/supabase/server'

export default async function CronsPage() {
  const supabase = createClient()
  const { data: activity } = await supabase
    .from('cron_activity')
    .select('*')
    .limit(50)
    .order('started_at', { ascending: false })

  return (
    <div>
      <h1>Cron Jobs</h1>
      <table>
        <thead>
          <tr>
            <th>Job Name</th>
            <th>Last Run</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Category</th>
          </tr>
        </thead>
        <tbody>
          {activity?.map(row => (
            <tr key={row.execution_id}>
              <td>{row.name}</td>
              <td>{new Date(row.started_at).toLocaleString()}</td>
              <td>{row.status}</td>
              <td>{row.duration_ms}ms</td>
              <td>{row.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## Troubleshooting

### "Cron job not found in database"

**Cause:** The cron's OpenClaw ID isn't in the `cron_jobs` table yet.

**Fix:** Run `./scripts/sync-cron-jobs.sh`

**Note:** Logging will still work (it creates orphaned execution records), but won't link to job metadata.

### "No execution ID found"

**Cause:** `cron-log.sh end` or `error` was called without calling `start` first.

**Fix:** The script auto-creates a record, but timestamps will be wrong. Always call `start` at the beginning of your cron.

### Execution logs not appearing in Supabase

**Check:**
1. RLS policies are correct (run schema again if unsure)
2. `config/mayahq-supabase.env` has valid credentials
3. Script has execute permissions: `chmod +x scripts/cron-log.sh`
4. Check for errors: `cat /tmp/openclaw-cron-logs/*.log`

### Python script fails with "No module named 'requests'"

```bash
pip3 install requests
```

### Sync script shows wrong categories/platforms

Edit detection rules in `sync-cron-jobs.sh`:
```python
def detect_category(name, payload):
    # Add custom rules here
    if "your-pattern" in name.lower():
        return "your-category"
    ...
```

Then re-run: `./scripts/sync-cron-jobs.sh`

---

## Maintenance

### After Creating New Cron Jobs

1. Run sync: `./scripts/sync-cron-jobs.sh`
2. Add logging to the new cron (use one of the 3 patterns)
3. Test manually: `openclaw cron trigger <job-id>`
4. Verify logs in Supabase

### After Updating Cron Schedules/Names

Run sync: `./scripts/sync-cron-jobs.sh`

### Weekly Health Check

```bash
# Check for recent errors
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_executions?status=eq.error&started_at=gte.$(date -u -v-7d +%Y-%m-%d)T00:00:00Z" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
```

### Database Cleanup (Optional)

Execution logs will grow over time. To auto-cleanup old records:

```sql
-- Add to Supabase SQL Editor (run monthly)
DELETE FROM cron_executions
WHERE started_at < NOW() - INTERVAL '90 days';
```

Or create a Supabase cron job (Database → Cron Jobs):
```sql
SELECT cron.schedule(
  'cleanup-old-cron-logs',
  '0 0 1 * *', -- First day of month at midnight
  $$DELETE FROM cron_executions WHERE started_at < NOW() - INTERVAL '90 days'$$
);
```

---

## Quick Reference

### File Locations
- Schema: `/Users/mayascott/clawd/scripts/supabase-cron-schema.sql`
- Logger: `/Users/mayascott/clawd/scripts/cron-log.sh`
- Sync: `/Users/mayascott/clawd/scripts/sync-cron-jobs.sh`
- Examples: `/Users/mayascott/clawd/scripts/cron-logging-example.md`
- Cron jobs: `~/.openclaw/cron/jobs.json`
- Config: `/Users/mayascott/clawd/config/mayahq-supabase.env`

### Key Commands
```bash
# Sync jobs to Supabase
./scripts/sync-cron-jobs.sh

# Log from cron
./scripts/cron-log.sh start "CRON_ID" "Description"
./scripts/cron-log.sh end "CRON_ID" "success" "Message" '{"key":"value"}'
./scripts/cron-log.sh error "CRON_ID" "Error message"

# View recent logs
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_activity?limit=20" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool

# List all cron IDs
openclaw cron list
```

### Important Cron IDs (for copy-paste)
```
58c8a752-9db6-4d7b-b1c6-382191263cbd  LVN Daily Instagram
33220e2f-dbe8-4d08-81df-d5ce17991e24  LVN Facebook Content
720fcb0d-5a48-4d9e-9c8d-dac07f88664b  LVN Daily Facebook Post
63221625-7998-48ff-bbfc-ca328a25e70a  LVN Daily X Post
66643301-6146-45c7-9b8a-4bacf1d8b656  LVN LinkedIn Weekly
69691b0a-373d-424e-9d3b-179431a56e62  X Crab Post
f80b0e31-68ad-4ebe-a533-32d82d05a8ca  X Daily Reflection
a98184d6-06f9-43b2-8a37-72dd7a4baa50  LVN City Announcement (Facebook)
7c04154d-0d86-4a89-972c-b35b92e8ec8f  LVN City Announcement X
```

---

## Success Criteria

You'll know the system is working when:

✅ `cron_jobs` table has all your active crons
✅ `cron_executions` table shows new records after cron runs
✅ Error logs capture failure details
✅ You can query execution history from CLI
✅ Discord announcements still work (logging is non-breaking)

---

## Next Steps After Setup

1. **Migrate high-priority crons** (LVN social → X crab → content)
2. **Build Maya HQ dashboard** (optional but high value)
3. **Add metrics queries** (success rate, avg duration by job)
4. **Set up alerting** (Discord webhook on repeated failures)
5. **Document patterns in TOOLS.md** (so Maya can self-serve)

---

**Questions?** Check `scripts/cron-logging-example.md` for detailed integration patterns.
