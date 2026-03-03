# Memory Worker Restart Instructions

## Current Issue
The provider switching is working in the database but the memory worker needs to restart to pick up the new settings.

## Quick Fix
1. Stop the current memory worker (Ctrl+C if running in terminal)
2. Restart it:
   ```bash
   cd packages/memory-worker
   pnpm dev
   ```

## What's Happening
1. ✅ Database settings are being updated correctly
2. ✅ Admin interface shows success
3. ❌ Memory worker needs restart to apply settings

## Long-term Solution
The memory worker should hot-reload settings, but for now restart is needed.

## Verification
After restart, the admin panel should show:
- Connection: ✅ Connected
- Current Provider: xai (if you switched to Grok)
- Current Model: grok-4-0709

## Test Provider Switch
1. Go to admin/llm-settings
2. Click "Test" next to Grok
3. Should get a response from Grok instead of Claude