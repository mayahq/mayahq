#!/usr/bin/env python3
"""
Find and process new ComfyUI images that have JSON metadata
This script tries different strategies to find unprocessed images
"""

import requests
import json
import time
from datetime import datetime
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY

# Edge Function configuration
EDGE_FUNCTION_URL = "https://dlaczmexhnoxfggpzxkl.supabase.co/functions/v1/comfyui-s3-processor"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYWN6bWV4aG5veGZnZ3B6eGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ5MTgyMzMsImV4cCI6MjA2MDQ5NDIzM30.WrhFows7rDBWN9wOTtqFVSRmoNUlR_CN6BcXgbb0IDo"

# S3 configuration
AWS_BUCKET = "mayascott"
AWS_REGION = "us-east-1"

def check_if_file_exists_in_s3(s3_key):
    """Check if a file exists in S3 by trying to fetch its metadata"""
    try:
        # Try to fetch the JSON metadata file to confirm it exists
        json_key = s3_key.replace('.png', '.json').replace('.jpg', '.json').replace('.jpeg', '.json')
        json_url = f"https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{json_key}"
        
        response = requests.head(json_url, timeout=10)
        exists = response.status_code == 200
        
        if exists:
            print(f"  ✅ Found JSON metadata: {json_key}")
        else:
            print(f"  ❌ No JSON metadata: {json_key}")
            
        return exists
        
    except Exception as e:
        print(f"  ⚠️  Error checking {s3_key}: {e}")
        return False

def process_image_via_edge_function(s3_key):
    """Process an image using the Edge Function"""
    try:
        image_url = f"https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
        
        payload = {
            "s3_key": s3_key,
            "bucket_name": AWS_BUCKET,
            "file_size": 0,
            "image_url": image_url
        }
        
        print(f"🔄 Processing: {s3_key}")
        
        response = requests.post(
            EDGE_FUNCTION_URL,
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {SUPABASE_ANON_KEY}'
            },
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('skipped'):
                print(f"  ⏭️  Skipped: {result.get('message')}")
                return 'skipped'
            else:
                print(f"  ✅ Success: {result.get('message')} (ID: {result.get('id')})")
                return 'success'
        else:
            print(f"  ❌ Failed: HTTP {response.status_code}")
            print(f"     Response: {response.text}")
            return 'failed'
            
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return 'error'

def generate_recent_timestamp_patterns():
    """Generate possible timestamp patterns for recent files"""
    # ComfyUI files use format: {uuid}_0_ComfyUI_{timestamp}_.png
    # Timestamp appears to be Unix timestamp
    
    # Get current timestamp and work backwards
    current_time = int(time.time())
    
    # Generate timestamps for the last 30 days
    patterns = []
    for days_back in range(0, 30):
        # 86400 seconds = 1 day
        timestamp = current_time - (days_back * 86400)
        patterns.append(str(timestamp)[:7])  # First 7 digits of timestamp
    
    return patterns

def try_recent_file_patterns():
    """Try to find recent files using timestamp patterns"""
    print("🔍 Trying recent file patterns based on timestamps...")
    
    timestamp_patterns = generate_recent_timestamp_patterns()
    
    # Common UUID patterns (first few characters that might repeat)
    common_prefixes = [
        'a', 'b', 'c', 'd', 'e', 'f',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
    ]
    
    successful = 0
    skipped = 0
    failed = 0
    
    print(f"📊 Testing {len(timestamp_patterns)} timestamp patterns...")
    
    for i, timestamp_prefix in enumerate(timestamp_patterns[:10]):  # Limit to first 10 patterns
        print(f"\n🔍 Pattern {i+1}: Timestamp starting with {timestamp_prefix}")
        
        # Try a few common UUID prefixes with this timestamp
        for prefix in common_prefixes[:6]:  # Try first 6 prefixes
            # Generate a plausible filename pattern
            test_filename = f"{prefix}*_0_ComfyUI_{timestamp_prefix}*_.png"
            
            # Since we can't wildcard search, try a few specific variations
            for suffix in ['0', '1', '2', '3', '4', '5']:
                for uuid_suffix in ['0000', '1111', '2222', 'aaaa', 'bbbb']:
                    test_s3_key = f"comfy-generations/{prefix}{uuid_suffix}-0000-0000-0000-000000000000_0_ComfyUI_{timestamp_prefix}{suffix}_.png"
                    
                    # Check if this file has JSON metadata
                    if check_if_file_exists_in_s3(test_s3_key):
                        result = process_image_via_edge_function(test_s3_key)
                        
                        if result == 'success':
                            successful += 1
                        elif result == 'skipped':
                            skipped += 1
                        else:
                            failed += 1
                        
                        time.sleep(0.5)  # Rate limiting
    
    return successful, skipped, failed

def try_known_recent_patterns():
    """Try patterns based on the existing database entries"""
    print("🔍 Analyzing existing database patterns...")
    
    # You can add patterns here based on your existing database entries
    # Look at the UUIDs and timestamps in your current comfyui_generated table
    
    # Some example patterns based on typical ComfyUI generation
    recent_patterns = [
        # Add patterns here if you know some recent file patterns
        # Example: "comfy-generations/12345678-1234-1234-1234-123456789abc_0_ComfyUI_1749*_.png"
    ]
    
    if not recent_patterns:
        print("📝 No known patterns defined.")
        print("   Add patterns to the recent_patterns list based on your recent generations.")
        return 0, 0, 0
    
    successful = 0
    skipped = 0
    failed = 0
    
    for pattern in recent_patterns:
        if check_if_file_exists_in_s3(pattern):
            result = process_image_via_edge_function(pattern)
            
            if result == 'success':
                successful += 1
            elif result == 'skipped':
                skipped += 1
            else:
                failed += 1
                
            time.sleep(0.5)
    
    return successful, skipped, failed

def scan_by_date_range():
    """Scan for files in a specific date range"""
    print("📅 Date-based scanning approach:")
    print()
    print("Since we can't list S3 directly, here's what you can do:")
    print()
    print("1. 📋 Check your Mac Studio generator logs for recent filenames")
    print("2. 🗂️  Use AWS S3 Console to browse comfy-generations/ folder")
    print("3. 📝 Copy recent filenames and add them to test-recent-files.py")
    print("4. 🚀 Run the processing script")
    print()
    print("Recent file format: comfy-generations/{uuid}_0_ComfyUI_{timestamp}_.png")
    print("Example: comfy-generations/12345678-1234-1234-1234-123456789abc_0_ComfyUI_1749123456_.png")

def main():
    print("🚀 ComfyUI New Image Finder")
    print("=" * 60)
    print()
    print("Choose a strategy:")
    print("1. Try recent timestamp patterns (automatic)")
    print("2. Try known recent patterns (manual)")
    print("3. Show date-range scanning instructions")
    print("4. Process specific files (edit script first)")
    
    choice = input("\nEnter choice (1-4): ").strip()
    
    if choice == "1":
        print("\n🎯 Strategy 1: Trying recent timestamp patterns...")
        successful, skipped, failed = try_recent_file_patterns()
        
        print(f"\n📊 Results:")
        print(f"   ✅ Successfully processed: {successful}")
        print(f"   ⏭️  Skipped (already exist): {skipped}")
        print(f"   ❌ Failed: {failed}")
        
    elif choice == "2":
        print("\n🎯 Strategy 2: Trying known patterns...")
        successful, skipped, failed = try_known_recent_patterns()
        
        print(f"\n📊 Results:")
        print(f"   ✅ Successfully processed: {successful}")
        print(f"   ⏭️  Skipped (already exist): {skipped}")
        print(f"   ❌ Failed: {failed}")
        
    elif choice == "3":
        scan_by_date_range()
        
    elif choice == "4":
        print("📝 Edit the script and add specific S3 keys to process.")
        print("   Look for the recent_patterns list in try_known_recent_patterns()")
        
    else:
        print("❌ Invalid choice")

if __name__ == "__main__":
    main() 