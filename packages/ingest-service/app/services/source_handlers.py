import feedparser
import requests
import asyncio
from typing import Dict, Any, List
from datetime import datetime, timedelta
from .data_source_manager import DataSourceManager

class RSSHandler:
    def __init__(self, data_source_manager: DataSourceManager):
        self.dsm = data_source_manager
    
    async def process_rss_feeds(self):
        """Process all active RSS data sources"""
        sources = await self.dsm.get_active_sources_by_type("rss")
        
        for source in sources:
            try:
                await self.process_single_feed(source)
            except Exception as e:
                print(f"Error processing RSS feed {source['name']}: {e}")
    
    async def process_single_feed(self, source: Dict[str, Any]):
        """Process a single RSS feed"""
        config = source['config']
        feed_url = config.get('url')
        
        if not feed_url:
            error_msg = f"No URL configured for RSS source {source['name']}. Please add 'url' to the source configuration."
            print(error_msg)
            await self.dsm.ingest_event(
                source_id=source['id'],
                source_type="rss",
                source_identifier=f"config_error_{int(datetime.utcnow().timestamp())}",
                payload={"error": "Configuration error", "source": source['name']},
                metadata={"feed_url": feed_url, "error_type": "config_missing"},
                status="error",
                error_message=error_msg
            )
            return
        
        try:
            print(f"Processing RSS feed: {source['name']} - {feed_url}")
            
            # Parse the RSS feed
            feed = feedparser.parse(feed_url)
            
            if feed.bozo:
                error_msg = f"RSS parsing error for {source['name']}: {feed.bozo_exception}. URL: {feed_url}"
                print(error_msg)
                await self.dsm.ingest_event(
                    source_id=source['id'],
                    source_type="rss", 
                    source_identifier=f"parse_error_{int(datetime.utcnow().timestamp())}",
                    payload={"error": "RSS parse error", "url": feed_url},
                    metadata={"feed_url": feed_url, "bozo_exception": str(feed.bozo_exception), "error_type": "parse_error"},
                    status="error",
                    error_message=error_msg
                )
                return
            
            if not feed.entries:
                info_msg = f"RSS feed {source['name']} has no new entries. URL: {feed_url}"
                print(info_msg)
                await self.dsm.ingest_event(
                    source_id=source['id'],
                    source_type="rss",
                    source_identifier=f"no_entries_{int(datetime.utcnow().timestamp())}",
                    payload={"info": "No new entries", "url": feed_url, "feed_title": feed.feed.get('title', '')},
                    metadata={"feed_url": feed_url, "entry_count": 0, "feed_title": feed.feed.get('title', ''), "error_type": "no_content"},
                    status="processed"
                )
                return
                
            print(f"Found {len(feed.entries)} entries in {source['name']}")
            
            # Process each entry
            processed_count = 0
            for entry in feed.entries[:10]:  # Limit to 10 most recent
                try:
                    # Check if we've already processed this entry
                    entry_id = getattr(entry, 'id', entry.link)
                    
                    metadata = {
                        "entry_id": entry_id,
                        "published": getattr(entry, 'published', None),
                        "feed_title": feed.feed.get('title', ''),
                        "feed_url": feed_url,
                        "entry_url": entry.link
                    }
                    
                    payload = {
                        "title": entry.title,
                        "link": entry.link,
                        "description": getattr(entry, 'description', ''),
                        "content": getattr(entry, 'content', [{}])[0].get('value', '') if hasattr(entry, 'content') else '',
                        "published": getattr(entry, 'published', None),
                        "tags": [tag.term for tag in getattr(entry, 'tags', [])],
                        "source_url": feed_url
                    }
                    
                    result = await self.dsm.ingest_event(
                        source_id=source['id'],
                        source_type="rss",
                        source_identifier=entry_id,
                        payload=payload,
                        metadata=metadata,
                        status="pending"
                    )
                    
                    if result:
                        processed_count += 1
                        
                except Exception as entry_error:
                    error_msg = f"Error processing RSS entry from {source['name']}: {str(entry_error)}"
                    print(error_msg)
                    await self.dsm.ingest_event(
                        source_id=source['id'],
                        source_type="rss",
                        source_identifier=f"entry_error_{int(datetime.utcnow().timestamp())}",
                        payload={"error": "Entry processing error", "url": feed_url},
                        metadata={"feed_url": feed_url, "error_type": "entry_processing", "entry_title": getattr(entry, 'title', 'Unknown')},
                        status="error",
                        error_message=error_msg
                    )
            
            print(f"Successfully processed {processed_count} entries from {source['name']}")
            
        except Exception as e:
            error_msg = f"Critical error processing RSS feed {source['name']} ({feed_url}): {str(e)}"
            print(error_msg)
            await self.dsm.ingest_event(
                source_id=source['id'],
                source_type="rss",
                source_identifier=f"critical_error_{int(datetime.utcnow().timestamp())}",
                payload={"error": "Critical RSS error", "url": feed_url},
                metadata={"feed_url": feed_url, "error_type": "critical", "exception_type": type(e).__name__},
                status="error",
                error_message=error_msg
            )
            
        await self.dsm.update_source_last_run(source['id'])

class HackerNewsHandler:
    def __init__(self, data_source_manager: DataSourceManager):
        self.dsm = data_source_manager
        self.base_url = "https://hacker-news.firebaseio.com/v0"
    
    async def process_hacker_news(self):
        """Process Hacker News for AI-related content"""
        sources = await self.dsm.get_active_sources_by_type("api_poll")
        
        for source in sources:
            if "hacker-news" in source['config'].get('base_url', ''):
                try:
                    await self.process_hn_stories(source)
                except Exception as e:
                    print(f"Error processing HN source {source['name']}: {e}")
    
    async def process_hn_stories(self, source: Dict[str, Any]):
        """Process top stories from Hacker News"""
        base_url = source['config'].get('base_url', self.base_url)
        
        try:
            print(f"Processing Hacker News from {source['name']} - {base_url}")
            
            # Get top story IDs
            response = requests.get(f"{base_url}/topstories.json", timeout=10)
            if response.status_code != 200:
                error_msg = f"Failed to fetch HN top stories: HTTP {response.status_code} from {base_url}/topstories.json"
                print(error_msg)
                await self.dsm.ingest_event(
                    source_id=source['id'],
                    source_type="api_poll",
                    source_identifier=f"api_error_{int(datetime.utcnow().timestamp())}",
                    payload={"error": "API fetch failed", "url": f"{base_url}/topstories.json", "status_code": response.status_code},
                    metadata={"base_url": base_url, "error_type": "api_fetch", "status_code": response.status_code},
                    status="error",
                    error_message=error_msg
                )
                return
            
            story_ids = response.json()[:30]  # Top 30 stories
            print(f"Found {len(story_ids)} top stories from Hacker News")
            
            processed_count = 0
            ai_related_count = 0
            
            for story_id in story_ids:
                try:
                    story_response = requests.get(f"{base_url}/item/{story_id}.json", timeout=10)
                    if story_response.status_code != 200:
                        print(f"Failed to fetch HN story {story_id}: HTTP {story_response.status_code}")
                        continue
                    
                    story = story_response.json()
                    
                    if not story:
                        print(f"Empty story data for HN story {story_id}")
                        continue
                    
                    # Filter for AI/ML related content
                    if self.is_ai_related(story):
                        ai_related_count += 1
                        
                        metadata = {
                            "hn_id": story_id,
                            "hn_url": f"https://news.ycombinator.com/item?id={story_id}",
                            "score": story.get('score', 0),
                            "comment_count": story.get('descendants', 0),
                            "base_url": base_url,
                            "story_type": story.get('type', 'story')
                        }
                        
                        payload = {
                            "title": story.get('title', ''),
                            "url": story.get('url', ''),
                            "text": story.get('text', ''),
                            "author": story.get('by', ''),
                            "time": story.get('time', 0),
                            "score": story.get('score', 0),
                            "type": story.get('type', 'story'),
                            "hn_url": f"https://news.ycombinator.com/item?id={story_id}",
                            "source_api": base_url
                        }
                        
                        result = await self.dsm.ingest_event(
                            source_id=source['id'],
                            source_type="api_poll",
                            source_identifier=str(story_id),
                            payload=payload,
                            metadata=metadata,
                            status="pending"
                        )
                        
                        if result:
                            processed_count += 1
                            print(f"Processed AI-related HN story: {story.get('title', story_id)}")
                            
                except Exception as story_error:
                    error_msg = f"Error processing HN story {story_id}: {str(story_error)}"
                    print(error_msg)
                    await self.dsm.ingest_event(
                        source_id=source['id'],
                        source_type="api_poll",
                        source_identifier=f"story_error_{story_id}_{int(datetime.utcnow().timestamp())}",
                        payload={"error": "Story processing error", "story_id": story_id, "base_url": base_url},
                        metadata={"base_url": base_url, "error_type": "story_processing", "story_id": story_id},
                        status="error",
                        error_message=error_msg
                    )
            
            print(f"HN processing complete: {ai_related_count} AI-related stories found, {processed_count} successfully processed")
            
            # Log summary event
            await self.dsm.ingest_event(
                source_id=source['id'],
                source_type="api_poll",
                source_identifier=f"summary_{int(datetime.utcnow().timestamp())}",
                payload={
                    "summary": "Processing complete",
                    "total_stories": len(story_ids),
                    "ai_related": ai_related_count,
                    "processed": processed_count,
                    "base_url": base_url
                },
                metadata={
                    "base_url": base_url,
                    "total_stories": len(story_ids),
                    "ai_related_count": ai_related_count,
                    "processed_count": processed_count,
                    "event_type": "summary"
                },
                status="processed"
            )
            
        except Exception as e:
            error_msg = f"Critical error processing Hacker News from {source['name']} ({base_url}): {str(e)}"
            print(error_msg)
            await self.dsm.ingest_event(
                source_id=source['id'],
                source_type="api_poll",
                source_identifier=f"critical_error_{int(datetime.utcnow().timestamp())}",
                payload={"error": "Critical HN error", "base_url": base_url},
                metadata={"base_url": base_url, "error_type": "critical", "exception_type": type(e).__name__},
                status="error",
                error_message=error_msg
            )
            
        await self.dsm.update_source_last_run(source['id'])
    
    def is_ai_related(self, story: Dict[str, Any]) -> bool:
        """Check if a story is AI/ML related"""
        ai_keywords = [
            'ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning',
            'neural network', 'llm', 'gpt', 'openai', 'anthropic', 'claude', 'chatgpt',
            'transformer', 'robotics', 'automation', 'computer vision', 'nlp'
        ]
        
        title = story.get('title', '').lower()
        text = story.get('text', '').lower()
        content = f"{title} {text}"
        
        return any(keyword in content for keyword in ai_keywords)

class ManualHandler:
    def __init__(self, data_source_manager: DataSourceManager):
        self.dsm = data_source_manager
    
    async def create_manual_event(self, source_name: str, title: str, content: str, metadata: Dict[str, Any] = None):
        """Create a manual event"""
        source = await self.dsm.get_data_source_by_name(source_name)
        if not source:
            raise ValueError(f"Manual data source '{source_name}' not found")
        
        payload = {
            "title": title,
            "content": content,
            "created_manually": True,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        return await self.dsm.ingest_event(
            source_id=source['id'],
            source_type="manual",
            source_identifier=f"manual_{datetime.utcnow().strftime('%Y%m%d_%H%M%S_%f')}",
            payload=payload,
            metadata=metadata or {}
        ) 