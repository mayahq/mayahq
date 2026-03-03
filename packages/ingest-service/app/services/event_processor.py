from typing import Dict, Any, List, Optional
from supabase import Client
from datetime import datetime
import uuid

class EventProcessor:
    """
    Processes raw_events and converts them into feed_items for display.

    This is the missing link between data ingestion (raw_events) and
    the feed display system (feed_items).
    """

    # Maya's profile ID - used for all feed items
    MAYA_PROFILE_ID = "61770892-9e5b-46a5-b622-568be7066664"

    def __init__(self, supabase_client: Client):
        self.supabase = supabase_client

    async def process_pending_events(self, limit: int = 50) -> Dict[str, Any]:
        """
        Process pending raw_events and convert them to feed_items.

        Args:
            limit: Maximum number of events to process in one batch

        Returns:
            Dictionary with processing statistics
        """
        try:
            # Fetch pending raw events
            response = (
                self.supabase.table("raw_events")
                .select("*")
                .eq("status", "pending")
                .order("created_at", desc=False)  # Process oldest first
                .limit(limit)
                .execute()
            )

            events = response.data or []

            if not events:
                return {
                    "message": "No pending events to process",
                    "processed": 0,
                    "failed": 0,
                    "skipped": 0
                }

            stats = {
                "processed": 0,
                "failed": 0,
                "skipped": 0,
                "errors": []
            }

            for event in events:
                try:
                    result = await self._process_single_event(event)
                    if result == "processed":
                        stats["processed"] += 1
                    elif result == "skipped":
                        stats["skipped"] += 1
                except Exception as e:
                    stats["failed"] += 1
                    stats["errors"].append({
                        "event_id": event["id"],
                        "error": str(e)
                    })
                    print(f"Error processing event {event['id']}: {e}")

            return {
                "message": f"Processed {stats['processed']} events",
                "total_events": len(events),
                **stats
            }

        except Exception as e:
            print(f"Critical error in process_pending_events: {e}")
            raise

    async def _process_single_event(self, event: Dict[str, Any]) -> str:
        """
        Process a single raw_event and create a corresponding feed_item.

        Returns:
            "processed", "skipped", or raises exception on error
        """
        source_type = event.get("source_type")
        payload = event.get("payload", {})
        metadata = event.get("metadata", {})

        # Determine item_type and source_system based on source_type
        item_type, source_system = self._determine_feed_item_type(source_type, payload, metadata)

        if not item_type:
            # Skip events that don't map to feed items (like summaries, errors)
            await self._mark_event_processed(event["id"])
            return "skipped"

        # Build content_data based on source type
        content_data = self._build_content_data(source_type, payload, metadata)

        if not content_data:
            await self._mark_event_processed(event["id"])
            return "skipped"

        # Create feed item
        feed_item = {
            "id": str(uuid.uuid4()),
            "created_at": event.get("created_at", datetime.utcnow().isoformat()),
            "updated_at": datetime.utcnow().isoformat(),
            "created_by_maya_profile_id": self.MAYA_PROFILE_ID,
            "item_type": item_type,
            "source_system": source_system,
            "content_data": content_data,
            "status": "pending_review",
            "raw_event_id": event["id"],
            "original_context": {
                "source_type": source_type,
                "source_id": event.get("source_id"),
                "source_identifier": event.get("source_identifier"),
                "ingested_at": event.get("created_at")
            }
        }

        # Insert feed item
        self.supabase.table("feed_items").insert(feed_item).execute()

        # Mark raw event as processed
        await self._mark_event_processed(event["id"])

        print(f"Created feed_item from {source_type} event: {event['id']}")
        return "processed"

    def _determine_feed_item_type(self, source_type: str, payload: Dict, metadata: Dict) -> tuple:
        """
        Determine the item_type and source_system for a feed_item.

        Returns:
            (item_type, source_system) or (None, None) to skip
        """
        # Skip meta-events (summaries, errors, no-content events)
        if payload.get("summary") or payload.get("error") or payload.get("info"):
            return (None, None)

        if source_type == "api_poll":
            # HackerNews stories
            if metadata.get("hn_id") or metadata.get("hn_url"):
                return ("text_from_hackernews", "HackerNews")

        elif source_type == "rss":
            # RSS feeds (likely arXiv)
            feed_title = metadata.get("feed_title", "")
            if "arxiv" in feed_title.lower() or "arxiv.org" in metadata.get("feed_url", "").lower():
                return ("text_from_arxiv", "arXiv")
            else:
                return ("text_from_rss", "RSS")

        elif source_type == "webhook":
            # GitHub commits
            if payload.get("commits") or payload.get("repository"):
                return ("text_from_github_commit", "GitHub")

        elif source_type == "manual":
            return ("text_manual", "Manual")

        # Unknown source type
        return (None, None)

    def _build_content_data(self, source_type: str, payload: Dict, metadata: Dict) -> Optional[Dict]:
        """
        Build the content_data JSONB field for feed_items.
        """
        if source_type == "api_poll":
            # HackerNews
            title = payload.get("title", "")
            if not title:
                return None

            return {
                "title": title,
                "url": payload.get("url"),
                "hn_url": payload.get("hn_url"),
                "text": payload.get("text", ""),
                "author": payload.get("author"),
                "score": payload.get("score", 0),
                "time": payload.get("time"),
                "comment_count": metadata.get("comment_count", 0)
            }

        elif source_type == "rss":
            # RSS/arXiv
            title = payload.get("title", "")
            if not title:
                return None

            return {
                "title": title,
                "link": payload.get("link"),
                "description": payload.get("description", ""),
                "content": payload.get("content", ""),
                "published": payload.get("published"),
                "tags": payload.get("tags", []),
                "source_url": payload.get("source_url"),
                "feed_title": metadata.get("feed_title", "")
            }

        elif source_type == "webhook":
            # GitHub commits
            commits = payload.get("commits", [])
            if not commits:
                return None

            return {
                "repository": payload.get("repository", {}).get("full_name", ""),
                "commits": commits,
                "pusher": payload.get("pusher", {}),
                "ref": payload.get("ref", ""),
                "compare": payload.get("compare")
            }

        elif source_type == "manual":
            return {
                "title": payload.get("title", ""),
                "content": payload.get("content", ""),
                "created_manually": True
            }

        return None

    async def _mark_event_processed(self, event_id: str):
        """Mark a raw_event as processed."""
        try:
            self.supabase.table("raw_events").update({
                "status": "processed",
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", event_id).execute()
        except Exception as e:
            print(f"Error marking event {event_id} as processed: {e}")
            # Don't raise - we don't want to fail the whole batch
