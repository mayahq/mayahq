# Cron Logging Migration Checklist

**Status Legend:** ⬜ Not Started | 🔄 In Progress | ✅ Complete

---

## Setup Phase

- [ ] **Step 1:** Run SQL schema in Supabase (`supabase-cron-schema.sql`)
- [ ] **Step 2:** Run `./scripts/sync-cron-jobs.sh` to populate cron_jobs table
- [ ] **Step 3:** Test logging manually with `cron-log.sh start/end`
- [ ] **Step 4:** Verify logs appear in Supabase `cron_executions` table

---

## Cron Migration

### LVN Social (Priority 1)

- [ ] **LVN Daily Instagram** (`58c8a752-9db6-4d7b-b1c6-382191263cbd`)
  - Script: `scripts/lvn-instagram-daily-cron.sh`
  - Pattern: Direct edit (add log calls at start/end)
  - Test: `./scripts/lvn-instagram-daily-cron.sh`
  - Verify: Check Supabase for execution log

- [ ] **LVN Facebook Content** (`33220e2f-dbe8-4d08-81df-d5ce17991e24`)
  - Script: TBD (check jobs.json payload)
  - Pattern: TBD
  - Test: Manual trigger
  - Verify: Supabase

- [ ] **LVN Daily Facebook Post** (`720fcb0d-5a48-4d9e-9c8d-dac07f88664b`)
  - Script: TBD
  - Pattern: TBD
  - Test: Manual trigger
  - Verify: Supabase

- [ ] **LVN Daily X Post** (`63221625-7998-48ff-bbfc-ca328a25e70a`)
  - Script: `scripts/x-post-lvn-auto.js` or similar
  - Pattern: TBD
  - Test: Manual trigger
  - Verify: Supabase

- [ ] **LVN LinkedIn Weekly** (`66643301-6146-45c7-9b8a-4bacf1d8b656`)
  - Script: `scripts/linkedin-post.js` (called from payload)
  - Pattern: Inline logging in jobs.json payload
  - Test: Manual trigger (Mondays only, or force)
  - Verify: Supabase

### Maya Personal (Priority 2)

- [ ] **X Crab Post** (`69691b0a-373d-424e-9d3b-179431a56e62`)
  - Script: Calls mayahq endpoint for crab content
  - Pattern: TBD (check payload)
  - Test: Manual trigger
  - Verify: Supabase

- [ ] **X Daily Reflection** (`f80b0e31-68ad-4ebe-a533-32d82d05a8ca`)
  - Script: TBD
  - Pattern: TBD
  - Test: Manual trigger
  - Verify: Supabase

### City Announcements (Priority 3)

- [ ] **LVN City Announcement Facebook** (`a98184d6-06f9-43b2-8a37-72dd7a4baa50`)
  - Script: TBD
  - Pattern: TBD
  - Test: Manual trigger
  - Verify: Supabase

- [ ] **LVN City Announcement X** (`7c04154d-0d86-4a89-972c-b35b92e8ec8f`)
  - Script: TBD
  - Pattern: TBD
  - Test: Manual trigger
  - Verify: Supabase

### Content/Monitoring (Priority 4)

- [ ] **Content Trend Scout** (`6fbc7759-492e-46ab-87ef-68a2d95ebaca`)
  - Pattern: Inline logging (systemEvent payload)
  - Test: Manual trigger
  - Verify: Supabase

- [ ] **Content Weekly Curation** (`dbf1e942-7a08-40b3-b261-3fcef5a4bda5`)
  - Pattern: Inline logging
  - Test: Manual trigger (Fridays)
  - Verify: Supabase

- [ ] **Content Engagement Monitor** (`56db5c79-3b3c-4068-b8e4-7f6d3fa6d429`)
  - Pattern: Inline logging
  - Test: Manual trigger
  - Verify: Supabase

---

## Documentation Updates

- [ ] Update `TOOLS.md` with cron logging patterns
- [ ] Add example to `TOOLS.md` → "Cron Job Best Practices" section
- [ ] Document common errors/fixes in `TOOLS.md`

---

## Optional Enhancements

- [ ] Build Maya HQ frontend dashboard (`/app/crons/page.tsx`)
- [ ] Add Discord webhook alerting for repeated failures
- [ ] Create success rate metrics query
- [ ] Set up Supabase cron for auto-cleanup (90+ day old logs)

---

## Testing Checklist (Per Cron)

For each migrated cron, verify:

- [ ] Execution log appears in `cron_executions` table
- [ ] `started_at` timestamp is correct
- [ ] `completed_at` timestamp is set after completion
- [ ] `status` reflects actual outcome (success/error)
- [ ] `duration_ms` is calculated correctly
- [ ] Error messages are captured in `error_message` field
- [ ] Discord announcements still work (logging is non-breaking)
- [ ] `cron_job_id` links to correct job in `cron_jobs` table

---

## Rollback Plan (If Needed)

If logging breaks a cron:

1. Check logs: `cat /tmp/openclaw-cron-logs/*.log`
2. Check script syntax: `bash -n scripts/SCRIPT.sh`
3. Remove logging calls temporarily
4. Verify cron works without logging
5. Debug logging issue separately
6. Re-add logging once fixed

**Key principle:** Logging is ADDITIVE. If it breaks something, you can remove it without losing cron functionality.

---

## Success Metrics

After migration, you should be able to:

✅ Query last 24h execution history in <5 seconds
✅ Identify failing crons instantly (status=error filter)
✅ See average execution time per cron
✅ Track success rate over time
✅ Debug failures without SSH/log hunting

---

**Last Updated:** 2026-02-14
**Owner:** Blake + Maya
**Status:** Setup phase (pre-migration)
