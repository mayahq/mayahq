from fastapi import FastAPI
from app.api.v1.endpoints import github, data_sources
from supabase import create_client, Client
from app.core.config import SUPABASE_URL, SUPABASE_KEY
from app.services.scheduler import DataSourceScheduler
import asyncio

app = FastAPI(title="Maya Ingest Service", description="Modular data ingestion service for Maya AI")

# Initialize Supabase client
# Ensure SUPABASE_URL and SUPABASE_KEY are loaded correctly, e.g., from environment variables
if not SUPABASE_URL or not SUPABASE_KEY:
    print("Warning: SUPABASE_URL or SUPABASE_KEY is not set. Supabase client might not work.")
    # Depending on your error handling strategy, you might raise an error here or allow it to fail later.

supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
app.state.supabase_client = supabase_client # Make client available in request state via request.app.state.supabase_client

# Initialize and start the scheduler
scheduler = DataSourceScheduler(supabase_client)

@app.on_event("startup")
async def startup_event():
    """Start the data source scheduler when the app starts"""
    print("🚀 Starting Maya Ingest Service...")
    # DISABLED - Feed sources turned off, only images in feed now
    # scheduler.start()
    # print("📅 Automated data source scheduler is now active")
    # print("   • RSS feeds: Every hour")
    # print("   • Hacker News: Every 30 minutes")
    # print("   • Event processing: Every 10 minutes (raw_events → feed_items)")
    print("📅 Automated data source scheduler is DISABLED (images only mode)")

@app.on_event("shutdown")
async def shutdown_event():
    """Stop the scheduler when the app shuts down"""
    print("🛑 Shutting down Maya Ingest Service...")
    scheduler.stop()

# Include routers
app.include_router(github.router, prefix="/api/v1/ingest", tags=["webhooks"])
app.include_router(data_sources.router, prefix="/api/v1/data-sources", tags=["data-sources"])

@app.get("/")
async def root():
    return {
        "message": "Maya Ingest Service is running",
        "version": "2.0.0",
        "features": ["GitHub webhooks", "RSS feeds", "API polling", "Manual events"],
        "scheduler": "disabled",
        "schedule": {
            "note": "Feed sources disabled - images only mode"
        }
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "maya-ingest-service"}

@app.get("/scheduler/status")
async def scheduler_status():
    """Get scheduler status and health report"""
    health_report = await scheduler.check_source_health()
    return {
        "running": scheduler.running,
        "sources_health": health_report
    } 