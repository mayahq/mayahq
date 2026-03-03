#!/usr/bin/env bash
#
# Cron Execution Logger
# Logs cron runs to Maya HQ Supabase
#
# Usage:
#   ./cron-log.sh start <openclaw_id> <summary>
#   ./cron-log.sh end <openclaw_id> <status> [summary] [output_json]
#   ./cron-log.sh error <openclaw_id> <error_message>
#
# Examples:
#   ./cron-log.sh start "66643301-6146-45c7-9b8a-4bacf1d8b656" "LVN LinkedIn post starting"
#   ./cron-log.sh end "66643301-6146-45c7-9b8a-4bacf1d8b656" "success" "Posted to LinkedIn" '{"post_url": "https://..."}'
#   ./cron-log.sh error "66643301-6146-45c7-9b8a-4bacf1d8b656" "Failed to upload image"
#

set -e

# Load Maya HQ Supabase credentials
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config/mayahq-supabase.env"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: Config file not found: $CONFIG_FILE" >&2
    exit 1
fi

source "$CONFIG_FILE"

API_URL="${NEXT_PUBLIC_SUPABASE_URL}/rest/v1"
API_KEY="$SUPABASE_SERVICE_ROLE_KEY"

# State file to track execution IDs
STATE_DIR="/tmp/openclaw-cron-logs"
mkdir -p "$STATE_DIR"

# Function to get cron_job_id from openclaw_id
get_cron_job_id() {
    local openclaw_id="$1"
    curl -s "${API_URL}/cron_jobs?openclaw_id=eq.${openclaw_id}&select=id" \
        -H "apikey: $API_KEY" \
        -H "Authorization: Bearer $API_KEY" \
        | python3 -c "import sys, json; data=json.load(sys.stdin); print(data[0]['id'] if data else '')"
}

# Function to create execution record
log_start() {
    local openclaw_id="$1"
    local summary="$2"

    local cron_job_id=$(get_cron_job_id "$openclaw_id")

    if [ -z "$cron_job_id" ]; then
        echo "WARNING: Cron job not found in database. Run sync-cron-jobs.sh first." >&2
        echo "Logging without cron_job_id link..." >&2
    fi

    local payload=$(cat <<EOF
{
    "cron_job_id": $([ -n "$cron_job_id" ] && echo "\"$cron_job_id\"" || echo "null"),
    "openclaw_id": "$openclaw_id",
    "started_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
    "status": "running",
    "summary": "$summary"
}
EOF
)

    local response=$(curl -s -X POST "${API_URL}/cron_executions" \
        -H "apikey: $API_KEY" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=representation" \
        -d "$payload")

    local execution_id=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data[0]['id'] if isinstance(data, list) and len(data) > 0 else '')" 2>/dev/null || echo "")

    if [ -n "$execution_id" ]; then
        echo "$execution_id" > "$STATE_DIR/${openclaw_id}.latest"
        echo "✓ Started execution log: $execution_id"
    else
        echo "ERROR: Failed to create execution log" >&2
        echo "Response: $response" >&2
        exit 1
    fi
}

# Function to update execution record
log_end() {
    local openclaw_id="$1"
    local status="$2"
    local summary="${3:-}"
    local output_json="${4:-}"

    local state_file="$STATE_DIR/${openclaw_id}.latest"

    if [ ! -f "$state_file" ]; then
        echo "WARNING: No execution ID found for $openclaw_id. Creating new record..." >&2
        log_start "$openclaw_id" "$summary"
        read execution_id < "$state_file"
    else
        read execution_id < "$state_file"
    fi

    local now=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)

    local payload=$(cat <<EOF
{
    "completed_at": "$now",
    "status": "$status"
EOF
)

    if [ -n "$summary" ]; then
        payload+=",\"summary\": \"$summary\""
    fi

    if [ -n "$output_json" ]; then
        payload+=",\"output\": $output_json"
    fi

    payload+="}"

    curl -s -X PATCH "${API_URL}/cron_executions?id=eq.${execution_id}" \
        -H "apikey: $API_KEY" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$payload" > /dev/null

    echo "✓ Completed execution log: $execution_id ($status)"

    # Cleanup state file
    rm -f "$state_file"
}

# Function to log error
log_error() {
    local openclaw_id="$1"
    local error_message="$2"

    local state_file="$STATE_DIR/${openclaw_id}.latest"

    if [ ! -f "$state_file" ]; then
        echo "WARNING: No execution ID found. Creating error record..." >&2
        log_start "$openclaw_id" "Error occurred"
        read execution_id < "$state_file"
    else
        read execution_id < "$state_file"
    fi

    local now=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)

    local payload=$(cat <<EOF
{
    "completed_at": "$now",
    "status": "error",
    "error_message": $(echo "$error_message" | python3 -c "import sys, json; print(json.dumps(sys.stdin.read()))")
}
EOF
)

    curl -s -X PATCH "${API_URL}/cron_executions?id=eq.${execution_id}" \
        -H "apikey: $API_KEY" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$payload" > /dev/null

    echo "✓ Logged error: $execution_id"

    # Cleanup state file
    rm -f "$state_file"
}

# Main command routing
case "${1:-}" in
    start)
        if [ $# -lt 3 ]; then
            echo "Usage: $0 start <openclaw_id> <summary>" >&2
            exit 1
        fi
        log_start "$2" "$3"
        ;;
    end)
        if [ $# -lt 3 ]; then
            echo "Usage: $0 end <openclaw_id> <status> [summary] [output_json]" >&2
            exit 1
        fi
        log_end "$2" "$3" "${4:-}" "${5:-}"
        ;;
    error)
        if [ $# -lt 3 ]; then
            echo "Usage: $0 error <openclaw_id> <error_message>" >&2
            exit 1
        fi
        log_error "$2" "$3"
        ;;
    *)
        echo "Usage: $0 {start|end|error} <args...>" >&2
        echo "" >&2
        echo "Commands:" >&2
        echo "  start <openclaw_id> <summary>                          - Start execution log" >&2
        echo "  end <openclaw_id> <status> [summary] [output_json]     - Complete execution log" >&2
        echo "  error <openclaw_id> <error_message>                    - Log error" >&2
        exit 1
        ;;
esac
