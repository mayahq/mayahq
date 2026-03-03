import hashlib
import hmac
import json
from fastapi import APIRouter, Request, HTTPException, Header
from supabase import Client

from app.core.config import GITHUB_WEBHOOK_SECRET
from app.services.data_source_manager import DataSourceManager

router = APIRouter()

async def verify_github_signature(request: Request, secret: str):
    signature = request.headers.get("X-Hub-Signature-256")
    if not signature:
        raise HTTPException(status_code=401, detail="X-Hub-Signature-256 header is missing")

    body = await request.body()
    expected_signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")
    return body # Return raw body for parsing after verification


@router.post("/github/commit")
async def ingest_github_commit(
    request: Request,
    x_github_event: str = Header(None) # To check event type if needed
):
    if not GITHUB_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await verify_github_signature(request, GITHUB_WEBHOOK_SECRET)

    try:
        payload = json.loads(raw_body.decode())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    supabase: Client = request.app.state.supabase_client
    dsm = DataSourceManager(supabase)
    
    # Get the GitHub data source
    github_source = await dsm.get_data_source_by_name("GitHub Commits")
    if not github_source:
        raise HTTPException(status_code=500, detail="GitHub data source not configured")

    try:
        # Extract metadata from headers
        metadata = {
            "github_event": x_github_event,
            "delivery_id": request.headers.get("X-GitHub-Delivery"),
            "webhook_endpoint": "/github/commit"
        }
        
        # Create a unique identifier for this event
        delivery_id = request.headers.get("X-GitHub-Delivery")
        commit_sha = payload.get("head_commit", {}).get("id", "")
        source_identifier = delivery_id or commit_sha or f"github_{hash(str(payload))}"
        
        # Use the new DataSourceManager to ingest the event
        event_id = await dsm.ingest_event(
            source_id=github_source['id'],
            source_type="webhook",
            source_identifier=source_identifier,
            payload=payload,
            metadata=metadata
        )

        if event_id:
            print(f"Successfully ingested GitHub event: {event_id}")
            return {"message": "GitHub event received and stored", "event_id": event_id}
        else:
            raise HTTPException(status_code=500, detail="Failed to store GitHub event")

    except Exception as e:
        error_msg = str(e)
        print(f"Error processing GitHub webhook: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {error_msg}") 