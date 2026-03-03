# Cron Logging Examples

## Setup (One-Time)

### 1. Run the SQL schema in Supabase

1. Open Maya HQ Supabase dashboard
2. Go to SQL Editor
3. Copy contents of `scripts/supabase-cron-schema.sql`
4. Execute

This creates:
- `cron_jobs` table (job metadata)
- `cron_executions` table (execution logs)
- `cron_activity` view (for dashboard)

### 2. Sync existing cron jobs

```bash
cd ~/clawd
./scripts/sync-cron-jobs.sh
```

This reads `~/.openclaw/cron/jobs.json` and populates the `cron_jobs` table.

**Run this whenever you:**
- Create new cron jobs
- Rename/update existing jobs
- Want to refresh metadata

---

## Using Cron Logging in Cron Payloads

### Pattern 1: Simple Logging (Bash-based crons)

For crons that call shell scripts (like LVN Instagram, Facebook posts):

**Before:**
```bash
#!/bin/bash
# Post to Instagram...
curl -X POST ...
```

**After:**
```bash
#!/bin/bash
CRON_ID="58c8a752-9db6-4d7b-b1c6-382191263cbd"  # Your cron's OpenClaw ID
LOG="/Users/mayascott/clawd/scripts/cron-log.sh"

# Start logging
$LOG start "$CRON_ID" "LVN Instagram post starting"

# Do the work
if curl -X POST ...; then
    $LOG end "$CRON_ID" "success" "Posted to Instagram" '{"post_url": "https://..."}'
else
    $LOG error "$CRON_ID" "Failed to post to Instagram"
fi
```

### Pattern 2: Inline Logging (OpenClaw message payloads)

For crons that use OpenClaw's `message` tool:

**Before (jobs.json):**
```json
{
  "id": "66643301-6146-45c7-9b8a-4bacf1d8b656",
  "name": "LVN LinkedIn Weekly",
  "payload": {
    "kind": "agentTurn",
    "message": "Post LVN content to LinkedIn...",
    "tools": [
      {
        "name": "message",
        "args": {
          "channel": "discord",
          "to": "1471256047950893056",
          "text": "Preview: ..."
        }
      }
    ]
  }
}
```

**After:**
```json
{
  "id": "66643301-6146-45c7-9b8a-4bacf1d8b656",
  "name": "LVN LinkedIn Weekly",
  "payload": {
    "kind": "agentTurn",
    "message": "Log cron start, post LVN content to LinkedIn, log completion",
    "tools": [
      {
        "name": "bash",
        "args": {
          "command": "/Users/mayascott/clawd/scripts/cron-log.sh start '66643301-6146-45c7-9b8a-4bacf1d8b656' 'LVN LinkedIn post starting'"
        }
      },
      {
        "name": "message",
        "args": {
          "channel": "discord",
          "to": "1471256047950893056",
          "text": "Preview: ..."
        }
      },
      {
        "name": "bash",
        "args": {
          "command": "/Users/mayascott/clawd/scripts/cron-log.sh end '66643301-6146-45c7-9b8a-4bacf1d8b656' 'success' 'Posted to LinkedIn'"
        }
      }
    ]
  }
}
```

### Pattern 3: Script Wrapper (Recommended for Complex Crons)

Create a wrapper script that handles logging:

**File: `scripts/lvn-instagram-logged.sh`**
```bash
#!/bin/bash
set -e

CRON_ID="58c8a752-9db6-4d7b-b1c6-382191263cbd"
LOG="/Users/mayascott/clawd/scripts/cron-log.sh"
SCRIPT="/Users/mayascott/clawd/scripts/lvn-instagram-daily-cron.sh"

$LOG start "$CRON_ID" "LVN Instagram daily post"

if OUTPUT=$($SCRIPT 2>&1); then
    # Extract post URL from script output if available
    POST_URL=$(echo "$OUTPUT" | grep -o 'https://www.instagram.com/p/[^"]*' || echo "")

    if [ -n "$POST_URL" ]; then
        $LOG end "$CRON_ID" "success" "Posted to Instagram" "{\"post_url\": \"$POST_URL\"}"
    else
        $LOG end "$CRON_ID" "success" "Completed Instagram workflow"
    fi
else
    ERROR_MSG=$(echo "$OUTPUT" | tail -5)
    $LOG error "$CRON_ID" "$ERROR_MSG"
    exit 1
fi
```

Then update `jobs.json` to call the wrapper:
```json
{
  "payload": {
    "kind": "agentTurn",
    "message": "Run LVN Instagram post with logging",
    "tools": [{"name": "bash", "args": {"command": "/Users/mayascott/clawd/scripts/lvn-instagram-logged.sh"}}]
  }
}
```

---

## Viewing Logs

### CLI (Quick Check)

```bash
# All executions today
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_executions?started_at=gte.$(date -u +%Y-%m-%d)T00:00:00Z&order=started_at.desc" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool

# Recent activity with job names (using the view)
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_activity?limit=20" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
```

### Supabase Dashboard

1. Go to Table Editor → `cron_activity` view
2. Filter by `status = 'error'` to see failures
3. Order by `started_at DESC` to see most recent

### Maya HQ Frontend (Coming Soon)

You can build a dashboard page in the Next.js app:
- `/app/crons/page.tsx` - List all cron jobs with latest status
- `/app/crons/[id]/page.tsx` - Execution history for specific job
- Use the `cron_activity` view for easy queries

---

## Migration Checklist

**For each active cron job:**

- [ ] Add logging wrapper or update payload to call `cron-log.sh`
- [ ] Test manually: `openclaw cron trigger <job-id>`
- [ ] Verify logs appear in `cron_executions` table
- [ ] Verify Discord messages still work (logging is additive)

**Priority order (most valuable first):**

1. LVN social crons (Instagram, Facebook, LinkedIn, X) - high visibility
2. X crab posts - daily content
3. Content/trend scouts - lower priority but useful

---

## Troubleshooting

**"Cron job not found in database"**
- Run `./scripts/sync-cron-jobs.sh` to populate `cron_jobs` table
- Logging will still work without the link, but won't be associated with job metadata

**"No execution ID found"**
- Means `cron-log.sh start` wasn't called before `end`/`error`
- The script will auto-create a record, but timestamps may be off

**Execution logs not appearing**
- Check Supabase RLS policies (service role should have full access)
- Verify `config/mayahq-supabase.env` has correct credentials
- Check for errors: `tail -f /tmp/openclaw-cron-logs/*.log`

---

## Next Steps

1. **Run setup scripts** (see "Setup" section above)
2. **Pick one cron to migrate** (suggest LVN Instagram as test case)
3. **Verify it works** (trigger manually, check Supabase)
4. **Migrate remaining crons** (use pattern 3 for complex ones)
5. **Build frontend dashboard** (optional but high value)
