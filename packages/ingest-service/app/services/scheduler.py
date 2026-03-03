import asyncio
import schedule
import time
from datetime import datetime, timedelta
from typing import Dict, Any
from supabase import Client

from .data_source_manager import DataSourceManager
from .source_handlers import RSSHandler, HackerNewsHandler
from .event_processor import EventProcessor

class DataSourceScheduler:
    def __init__(self, supabase_client: Client):
        self.supabase = supabase_client
        self.dsm = DataSourceManager(supabase_client)
        self.rss_handler = RSSHandler(self.dsm)
        self.hn_handler = HackerNewsHandler(self.dsm)
        self.event_processor = EventProcessor(supabase_client)
        self.running = False
    
    def start(self):
        """Start the scheduler"""
        if self.running:
            return
        
        self.running = True
        print("Starting Maya data source scheduler...")
        
        # Schedule RSS feeds every hour
        schedule.every().hour.do(self.run_async_task, self.rss_handler.process_rss_feeds)

        # Schedule Hacker News every 30 minutes
        schedule.every(30).minutes.do(self.run_async_task, self.hn_handler.process_hacker_news)

        # Schedule event processing every 10 minutes to convert raw_events to feed_items
        schedule.every(10).minutes.do(self.run_async_task, self.process_events_task)
        
        # Run scheduler loop
        asyncio.create_task(self.scheduler_loop())
    
    def stop(self):
        """Stop the scheduler"""
        self.running = False
        schedule.clear()
        print("Maya data source scheduler stopped")
    
    async def scheduler_loop(self):
        """Main scheduler loop"""
        while self.running:
            schedule.run_pending()
            await asyncio.sleep(60)  # Check every minute
    
    def run_async_task(self, coro):
        """Run async tasks from sync scheduler"""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If loop is already running, create a task
                loop.create_task(coro())
            else:
                # If no loop, run the coroutine
                asyncio.run(coro())
        except Exception as e:
            print(f"Error running scheduled task: {e}")
    
    async def process_events_task(self):
        """Process pending raw_events into feed_items"""
        try:
            result = await self.event_processor.process_pending_events(limit=100)
            if result['processed'] > 0:
                print(f"✓ Processed {result['processed']} raw_events into feed_items")
        except Exception as e:
            print(f"Error processing events: {e}")

    async def process_all_sources(self):
        """Manually trigger processing of all active sources"""
        print("Processing all active data sources...")

        try:
            # Process RSS feeds
            await self.rss_handler.process_rss_feeds()
            print("RSS feeds processed")

            # Process Hacker News
            await self.hn_handler.process_hacker_news()
            print("Hacker News processed")

            # Process raw events into feed items
            await self.process_events_task()

        except Exception as e:
            print(f"Error during batch processing: {e}")
    
    async def check_source_health(self):
        """Check health of all data sources"""
        sources = await self.dsm.get_active_sources_by_type("rss")
        sources.extend(await self.dsm.get_active_sources_by_type("api_poll"))
        
        health_report = []
        
        for source in sources:
            config = source.get('config', {})
            last_run = config.get('last_run')
            
            if last_run:
                last_run_time = datetime.fromisoformat(last_run)
                time_since_run = datetime.utcnow() - last_run_time
                
                # Check if source hasn't run in expected interval
                expected_interval = config.get('check_interval', 3600)  # Default 1 hour
                is_healthy = time_since_run.total_seconds() < (expected_interval * 2)
            else:
                is_healthy = False
                time_since_run = None
            
            health_report.append({
                'source_name': source['name'],
                'source_type': source['type'],
                'is_healthy': is_healthy,
                'last_run': last_run,
                'time_since_run_hours': time_since_run.total_seconds() / 3600 if time_since_run else None
            })
        
        return health_report 