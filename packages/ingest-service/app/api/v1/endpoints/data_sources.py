from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Any, Optional
from supabase import Client
from datetime import datetime

from app.services.data_source_manager import DataSourceManager
from app.services.source_handlers import RSSHandler, HackerNewsHandler, ManualHandler
from app.services.event_processor import EventProcessor

router = APIRouter()

class ManualEventRequest(BaseModel):
    source_name: str
    title: str
    content: str
    metadata: Optional[Dict[str, Any]] = None

@router.post("/manual")
async def create_manual_event(
    request: ManualEventRequest,
    req: Request
):
    """Create a manual event for Maya's content"""
    supabase: Client = req.app.state.supabase_client
    dsm = DataSourceManager(supabase)
    manual_handler = ManualHandler(dsm)
    
    try:
        event_id = await manual_handler.create_manual_event(
            source_name=request.source_name,
            title=request.title,
            content=request.content,
            metadata=request.metadata
        )
        
        return {
            "message": "Manual event created successfully",
            "event_id": event_id
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating manual event: {str(e)}")

@router.post("/rss/process")
async def process_rss_feeds(
    background_tasks: BackgroundTasks,
    req: Request
):
    """Trigger RSS feed processing"""
    supabase: Client = req.app.state.supabase_client
    dsm = DataSourceManager(supabase)
    rss_handler = RSSHandler(dsm)
    
    # Run RSS processing in background
    background_tasks.add_task(rss_handler.process_rss_feeds)
    
    return {"message": "RSS feed processing started"}

@router.post("/hackernews/process")
async def process_hacker_news(
    background_tasks: BackgroundTasks,
    req: Request
):
    """Trigger Hacker News processing"""
    supabase: Client = req.app.state.supabase_client
    dsm = DataSourceManager(supabase)
    hn_handler = HackerNewsHandler(dsm)
    
    # Run HN processing in background
    background_tasks.add_task(hn_handler.process_hacker_news)
    
    return {"message": "Hacker News processing started"}

@router.get("/sources")
async def list_data_sources(req: Request):
    """List all data sources"""
    supabase: Client = req.app.state.supabase_client
    
    try:
        response = supabase.table("data_sources").select("*").execute()
        return {"data_sources": response.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching data sources: {str(e)}")

@router.get("/sources/{source_id}/events")
async def get_source_events(
    source_id: str,
    req: Request,
    limit: int = 50
):
    """Get recent events for a specific data source"""
    supabase: Client = req.app.state.supabase_client
    
    try:
        response = (
            supabase.table("raw_events")
            .select("*")
            .eq("source_id", source_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"events": response.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching events: {str(e)}")

@router.get("/activity")
async def get_activity(
    req: Request,
    limit: int = 50,
    source_id: str = None,
    status: str = None
):
    """Get recent activity from all data sources"""
    supabase: Client = req.app.state.supabase_client
    
    try:
        # First get the events
        query = supabase.table("raw_events").select("""
            id,
            source_identifier,
            source_type,
            source_id,
            status,
            payload,
            metadata,
            error_message,
            created_at
        """).order("created_at", desc=True).limit(limit)
        
        # Apply filters if provided
        if source_id:
            query = query.eq("source_id", source_id)
        if status:
            query = query.eq("status", status)
            
        events_response = query.execute()
        
        # Get data sources separately to avoid join issues
        sources_response = supabase.table("data_sources").select("id, name, type, config").execute()
        sources_map = {source["id"]: source for source in sources_response.data}
        
        # Transform the data for frontend consumption
        activity = []
        for event in events_response.data:
            source = sources_map.get(event["source_id"])
            
            # Enhanced source name logic
            source_name = "Unknown Source"
            if source:
                source_name = source["name"]
            elif event["source_type"] == "api_poll":
                source_name = "Hacker News AI"
            elif event["source_type"] == "rss":
                source_name = "RSS Feed"
            elif event["source_type"] == "webhook":
                source_name = "GitHub Commits"
            elif event["source_type"] == "manual":
                source_name = "Manual Content"
            
            activity.append({
                "id": event["id"],
                "source_identifier": event["source_identifier"],
                "source_type": event["source_type"],
                "source_id": event["source_id"],
                "source_name": source_name,
                "source_config": source["config"] if source else {},
                "status": event["status"],
                "payload": event["payload"],
                "metadata": event["metadata"],
                "error_message": event.get("error_message"),
                "created_at": event["created_at"]
            })
        
        return {"activity": activity}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching activity: {str(e)}")

@router.get("/stats")
async def get_data_source_stats(req: Request):
    """Get statistics for data source dashboard"""
    supabase: Client = req.app.state.supabase_client
    
    try:
        # Get event counts by source and status
        events_response = supabase.table("raw_events").select("""
            source_id,
            source_type,
            status,
            created_at,
            data_sources!inner(name, type)
        """).gte("created_at", "now() - interval '24 hours'").execute()
        
        # Process statistics
        stats = {
            "total_events_24h": len(events_response.data),
            "events_by_source": {},
            "events_by_status": {"pending": 0, "processed": 0, "error": 0},
            "latest_activity": None
        }
        
        if events_response.data:
            stats["latest_activity"] = events_response.data[0]["created_at"]
            
            for event in events_response.data:
                source_name = event["data_sources"]["name"]
                status = event["status"]
                
                if source_name not in stats["events_by_source"]:
                    stats["events_by_source"][source_name] = {"total": 0, "pending": 0, "processed": 0, "error": 0}
                
                stats["events_by_source"][source_name]["total"] += 1
                stats["events_by_source"][source_name][status] = stats["events_by_source"][source_name].get(status, 0) + 1
                stats["events_by_status"][status] = stats["events_by_status"].get(status, 0) + 1
        
        return {"stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stats: {str(e)}")

@router.patch("/sources/{source_id}")
async def update_data_source(
    source_id: str,
    updates: Dict[str, Any],
    req: Request
):
    """Update a data source configuration"""
    supabase: Client = req.app.state.supabase_client

    try:
        # Add updated_at timestamp
        updates["updated_at"] = datetime.utcnow().isoformat()

        response = (
            supabase.table("data_sources")
            .update(updates)
            .eq("id", source_id)
            .execute()
        )

        if response.data:
            return {"message": "Data source updated successfully", "data": response.data[0]}
        else:
            raise HTTPException(status_code=404, detail="Data source not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating data source: {str(e)}")

@router.post("/process-events")
async def process_raw_events(
    background_tasks: BackgroundTasks,
    req: Request,
    limit: int = 50
):
    """
    Process pending raw_events and convert them to feed_items.

    This is the critical endpoint that transforms ingested data (raw_events)
    into displayable feed items (feed_items).
    """
    supabase: Client = req.app.state.supabase_client
    processor = EventProcessor(supabase)

    try:
        # Process synchronously so we can return results
        result = await processor.process_pending_events(limit=limit)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing events: {str(e)}") 