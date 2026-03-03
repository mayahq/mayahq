"""
Quick script to process pending raw_events into feed_items
"""
import asyncio
from supabase import create_client
from app.services.event_processor import EventProcessor
from app.core.config import SUPABASE_URL, SUPABASE_KEY

async def main():
    # Initialize Supabase client
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Initialize processor
    processor = EventProcessor(supabase_client)

    # Process pending events (limit 100 at a time)
    print("Processing pending raw_events...")
    result = await processor.process_pending_events(limit=100)

    print(f"\n✅ Processing complete!")
    print(f"   Processed: {result['processed']}")
    print(f"   Skipped: {result['skipped']}")
    print(f"   Failed: {result['failed']}")

    if result['errors']:
        print("\nErrors:")
        for error in result['errors']:
            print(f"   - {error}")

if __name__ == "__main__":
    asyncio.run(main())
