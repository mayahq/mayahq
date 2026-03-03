# Cron Logging Quick Start

**For Claude Code on the other machine**

---

## What This Is

System to log all OpenClaw cron executions to Maya HQ Supabase for visibility and debugging.

**4 files created:**
1. `scripts/supabase-cron-schema.sql` - Database schema
2. `scripts/cron-log.sh` - Logging helper
3. `scripts/sync-cron-jobs.sh` - Syncs jobs.json → Supabase
4. `CRON_LOGGING_SETUP.md` - Full setup guide (read this for details)

---

## 3-Step Setup

### 1. Run SQL in Supabase (2 min)

**What:** Creates `cron_jobs` and `cron_executions` tables

**How:**
1. Open: https://supabase.com/dashboard/project/dlaczmexhnoxfggpzxkl/sql/new
2. Copy entire contents of `scripts/supabase-cron-schema.sql`
3. Run it

**Verify:**
- Table Editor shows `cron_jobs` and `cron_executions` tables

---

### 2. Sync Existing Crons (30 sec)

**What:** Populates `cron_jobs` table from `~/.openclaw/cron/jobs.json`

**How:**
```bash
cd /Users/mayascott/clawd
./scripts/sync-cron-jobs.sh
```

**Expected output:**
```
Found 15 cron jobs in jobs.json
✓ LVN Content Mode - Weekly Post (lvn-social/linkedin)
✓ LVN Daily Instagram (lvn-social/instagram)
...
✓ Successfully synced 15 cron jobs
```

**Verify:**
```bash
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_jobs?select=name,enabled&limit=5" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
```

---

### 3. Test Logging (2 min)

**What:** Verify end-to-end logging works

**How:**
```bash
cd /Users/mayascott/clawd

# Pick any cron ID (using LVN Instagram as example)
CRON_ID="58c8a752-9db6-4d7b-b1c6-382191263cbd"

# Log start
./scripts/cron-log.sh start "$CRON_ID" "Test run"

# Simulate work
sleep 2

# Log success
./scripts/cron-log.sh end "$CRON_ID" "success" "Test completed" '{"test": true}'
```

**Verify:**
```bash
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_executions?order=started_at.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
```

Should show your test execution.

---

## Migration (Next Phase)

**Goal:** Update each cron to call `cron-log.sh` during execution

**Recommended starting point:** LVN Instagram (`58c8a752-9db6-4d7b-b1c6-382191263cbd`)

**Pattern (for bash scripts):**
```bash
#!/bin/bash
CRON_ID="58c8a752-9db6-4d7b-b1c6-382191263cbd"
LOG="/Users/mayascott/clawd/scripts/cron-log.sh"

$LOG start "$CRON_ID" "LVN Instagram post starting"

# ... do the work ...

if [ $? -eq 0 ]; then
    $LOG end "$CRON_ID" "success" "Posted to Instagram"
else
    $LOG error "$CRON_ID" "Failed to post"
fi
```

**See:** `CRON_LOGGING_SETUP.md` Step 4 for 3 integration patterns

---

## Quick Reference

### Get Cron IDs
```bash
openclaw cron list
```

### View Recent Logs
```bash
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_activity?limit=20" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
```

### View Errors Only
```bash
source config/mayahq-supabase.env
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cron_activity?status=eq.error&limit=10" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
```

---

## Files to Read

1. **Start here:** `CRON_LOGGING_QUICKSTART.md` (this file)
2. **Full guide:** `CRON_LOGGING_SETUP.md` (detailed instructions, troubleshooting)
3. **Migration tracking:** `CRON_MIGRATION_CHECKLIST.md` (checkboxes for each cron)
4. **Examples:** `scripts/cron-logging-example.md` (integration patterns)

---

## What You Need From User

**For Step 1 (SQL):**
- User needs to run the SQL in Supabase dashboard (can't be automated from here)
- Share the SQL file path: `/Users/mayascott/clawd/scripts/supabase-cron-schema.sql`

**For Steps 2-3:**
- You can do it (just run the scripts)

**For Migration:**
- User decides priority order (or follow `CRON_MIGRATION_CHECKLIST.md`)
- You update scripts/payloads
- User tests and verifies

---

## Success = Complete When

✅ Step 1 done (tables exist in Supabase)
✅ Step 2 done (cron_jobs table populated)
✅ Step 3 done (test log appears in cron_executions)
✅ At least 1 real cron migrated and logging successfully

After that, it's just migrating the remaining crons one by one.

---

**Questions?** Read `CRON_LOGGING_SETUP.md` for troubleshooting and detailed patterns.
