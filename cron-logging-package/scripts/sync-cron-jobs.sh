#!/usr/bin/env bash
#
# Sync OpenClaw Cron Jobs to Maya HQ Supabase
# Reads ~/.openclaw/cron/jobs.json and upserts to cron_jobs table
#
# Usage: ./sync-cron-jobs.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config/mayahq-supabase.env"
JOBS_FILE="$HOME/.openclaw/cron/jobs.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: Config file not found: $CONFIG_FILE" >&2
    exit 1
fi

if [ ! -f "$JOBS_FILE" ]; then
    echo "ERROR: OpenClaw jobs.json not found: $JOBS_FILE" >&2
    exit 1
fi

source "$CONFIG_FILE"

API_URL="${NEXT_PUBLIC_SUPABASE_URL}/rest/v1"
API_KEY="$SUPABASE_SERVICE_ROLE_KEY"

echo "Syncing cron jobs from $JOBS_FILE to Supabase..."
echo ""

# Python script to parse jobs.json and upsert to Supabase
python3 <<'PYTHON_SCRIPT'
import json
import os
import sys
import requests
from datetime import datetime

jobs_file = os.path.expanduser("~/.openclaw/cron/jobs.json")
api_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1"
api_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

headers = {
    "apikey": api_key,
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

# Load jobs.json
with open(jobs_file, 'r') as f:
    data = json.load(f)

jobs = data.get("jobs", [])

print(f"Found {len(jobs)} cron jobs in jobs.json")

# Category detection rules
def detect_category(name, payload):
    name_lower = name.lower()
    payload_str = json.dumps(payload).lower() if payload else ""

    if "lvn" in name_lower:
        if "linkedin" in name_lower or "sdr" in payload_str or "outreach" in payload_str:
            return "lvn-sdr"
        return "lvn-social"

    if "x " in name_lower or "crab" in name_lower or "twitter" in name_lower:
        return "maya-personal"

    if "content" in name_lower or "trend" in name_lower:
        return "content"

    return "other"

def detect_platform(name, payload):
    name_lower = name.lower()

    if "instagram" in name_lower:
        return "instagram"
    if "facebook" in name_lower:
        return "facebook"
    if "linkedin" in name_lower:
        return "linkedin"
    if "x " in name_lower or "twitter" in name_lower:
        return "x"
    if "telegram" in name_lower:
        return "telegram"

    return None

def extract_discord_channel(payload):
    """Extract Discord channel ID from message tool calls in payload"""
    if not payload:
        return None, None

    payload_str = json.dumps(payload)

    # Known channel mappings
    channels = {
        "1471244888136749139": "lvn-facebook",
        "1471256020658688225": "lvn-instagram",
        "1471256047950893056": "lvn-linkedin",
        "1471256082512085077": "lvn-𝕏"
    }

    for channel_id, channel_name in channels.items():
        if channel_id in payload_str:
            return channel_id, channel_name

    return None, None

# Prepare records for upsert
records = []
for job in jobs:
    openclaw_id = job.get("id")
    name = job.get("name", "Unnamed Job")
    enabled = job.get("enabled", False)
    schedule_obj = job.get("schedule", {})
    payload = job.get("payload")

    # Build schedule string
    if schedule_obj.get("kind") == "cron":
        schedule = f"{schedule_obj.get('expr')} ({schedule_obj.get('tz', 'UTC')})"
    elif schedule_obj.get("kind") == "at":
        schedule = f"at {schedule_obj.get('at')}"
    else:
        schedule = None

    category = detect_category(name, payload)
    platform = detect_platform(name, payload)
    discord_channel_id, discord_channel_name = extract_discord_channel(payload)

    record = {
        "openclaw_id": openclaw_id,
        "name": name,
        "schedule": schedule,
        "enabled": enabled,
        "category": category,
        "platform": platform,
        "discord_channel_id": discord_channel_id,
        "discord_channel_name": discord_channel_name,
        "payload": payload,
        "last_synced_at": datetime.utcnow().isoformat() + "Z"
    }

    records.append(record)

    status = "✓" if enabled else "○"
    print(f"{status} {name} ({category}/{platform or 'N/A'})")

# Upsert to Supabase (on conflict update)
print(f"\nUpserting {len(records)} records to Supabase...")

response = requests.post(
    f"{api_url}/cron_jobs",
    headers=headers,
    json=records
)

if response.status_code in [200, 201]:
    print(f"✓ Successfully synced {len(records)} cron jobs")
else:
    print(f"ERROR: Failed to sync cron jobs")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    sys.exit(1)

PYTHON_SCRIPT

echo ""
echo "✓ Sync complete!"
echo ""
echo "Next steps:"
echo "1. View synced jobs: SELECT * FROM cron_jobs ORDER BY enabled DESC, name;"
echo "2. Test logging: ./cron-log.sh start <openclaw_id> 'Test run'"
echo "3. Update cron payloads to call cron-log.sh during execution"
