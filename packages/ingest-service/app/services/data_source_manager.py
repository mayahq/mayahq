from typing import Dict, Any, Optional
from supabase import Client
from datetime import datetime
import uuid

class DataSourceManager:
    def __init__(self, supabase_client: Client):
        self.supabase = supabase_client
    
    async def get_data_source_by_id(self, source_id: str) -> Optional[Dict[str, Any]]:
        """Get data source configuration by ID"""
        try:
            response = self.supabase.table("data_sources").select("*").eq("id", source_id).single().execute()
            return response.data if response.data else None
        except Exception as e:
            print(f"Error fetching data source {source_id}: {e}")
            return None
    
    async def get_data_source_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Get data source configuration by name"""
        try:
            response = self.supabase.table("data_sources").select("*").eq("name", name).single().execute()
            return response.data if response.data else None
        except Exception as e:
            print(f"Error fetching data source {name}: {e}")
            return None
    
    async def event_exists(self, source_id: str, source_identifier: str) -> bool:
        """Check if an event with the given source_identifier already exists for this source"""
        try:
            response = self.supabase.table("raw_events").select("id").eq("source_id", source_id).eq("source_identifier", source_identifier).limit(1).execute()
            return len(response.data) > 0
        except Exception as e:
            print(f"Error checking for existing event: {e}")
            return False

    async def ingest_event(self, source_id: str, source_type: str, source_identifier: str, payload: Dict[str, Any], metadata: Dict[str, Any] = None, status: str = "pending", error_message: str = None) -> Optional[str]:
        """Generic method to ingest events from any data source"""
        # Check if event already exists
        if await self.event_exists(source_id, source_identifier):
            print(f"Event with identifier {source_identifier} already exists for source {source_id}, skipping")
            return None
            
        try:
            event_data = {
                "id": str(uuid.uuid4()),
                "source_id": source_id,
                "source_type": source_type,
                "source_identifier": source_identifier,
                "payload": payload,
                "metadata": metadata or {},
                "status": status,
                "error_message": error_message,
                "created_at": datetime.utcnow().isoformat()
            }
            
            response = self.supabase.table("raw_events").insert(event_data).execute()
            
            if response.data:
                event_id = response.data[0].get('id')
                print(f"Successfully ingested event from {source_type}: {event_id}")
                return event_id
            else:
                print(f"Failed to ingest event from {source_type}")
                return None
                
        except Exception as e:
            print(f"Error ingesting event from {source_type}: {e}")
            return None
    
    async def get_active_sources_by_type(self, source_type: str) -> list:
        """Get all active data sources of a specific type"""
        try:
            response = self.supabase.table("data_sources").select("*").eq("type", source_type).eq("active", True).execute()
            return response.data or []
        except Exception as e:
            print(f"Error fetching active sources of type {source_type}: {e}")
            return []
    
    async def update_source_last_run(self, source_id: str):
        """Update the last run timestamp for a data source"""
        try:
            # Get current config first
            source = await self.get_data_source_by_id(source_id)
            if source:
                current_config = source.get('config', {})
                current_config['last_run'] = datetime.utcnow().isoformat()
                self.supabase.table("data_sources").update({"config": current_config}).eq("id", source_id).execute()
        except Exception as e:
            print(f"Error updating last run for source {source_id}: {e}") 