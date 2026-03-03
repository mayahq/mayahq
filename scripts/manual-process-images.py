#!/usr/bin/env python3
"""
Manually process specific S3 images using the Edge Function
Use this when you know specific files that need processing
"""

import requests
import json

# Edge Function URL and auth
EDGE_FUNCTION_URL = "https://dlaczmexhnoxfggpzxkl.supabase.co/functions/v1/comfyui-s3-processor"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYWN6bWV4aG5veGZnZ3B6eGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ5MTgyMzMsImV4cCI6MjA2MDQ5NDIzM30.WrhFows7rDBWN9wOTtqFVSRmoNUlR_CN6BcXgbb0IDo"

# Your S3 configuration
AWS_BUCKET = "mayascott"
AWS_REGION = "us-east-1"

def process_single_image(s3_key, file_size=None):
    """Process a single image by calling the Edge Function"""
    try:
        # Create payload
        payload = {
            "s3_key": s3_key,
            "bucket_name": AWS_BUCKET,
            "file_size": file_size or 0,
            "image_url": f"https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
        }
        
        print(f"Processing: {s3_key}")
        
        # Call the Edge Function
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
            print(f"  ✅ Success: {result.get('message', 'Processed')}")
            return True
        else:
            print(f"  ❌ Failed: HTTP {response.status_code}")
            print(f"     Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False

def process_files_by_pattern():
    """Process files based on common patterns"""
    # Example recent file patterns - adjust these based on your actual files
    # You can get these from your Mac Studio generator logs or S3 console
    
    sample_files = [
        # Add actual S3 keys here from your recent generations
        # Example format: "comfy-generations/12345678_0_ComfyUI_1749123456_.png"
    ]
    
    if not sample_files:
        print("📝 No files specified. Add S3 keys to the sample_files list.")
        print("   Example: 'comfy-generations/12345678_0_ComfyUI_1749123456_.png'")
        return
    
    processed = 0
    failed = 0
    
    for s3_key in sample_files:
        success = process_single_image(s3_key)
        if success:
            processed += 1
        else:
            failed += 1
    
    print(f"\n📊 Processing complete!")
    print(f"   ✅ Processed: {processed}")
    print(f"   ❌ Failed: {failed}")

def process_date_range():
    """Process files from a specific date range (you provide the file names)"""
    print("📋 To process recent files, you need to:")
    print("   1. Check your Mac Studio generator logs for recent file names")
    print("   2. Or use the S3 console to see recent files in comfy-generations/")
    print("   3. Add the S3 keys to this script and run it")
    print()
    print("   File format: comfy-generations/{uuid}_0_ComfyUI_{timestamp}_.png")
    
def test_edge_function():
    """Test if the Edge Function is working"""
    print("🧪 Testing Edge Function...")
    
    # Test with a dummy payload
    test_payload = {
        "s3_key": "comfy-generations/test.png",
        "bucket_name": AWS_BUCKET,
        "file_size": 1000,
        "image_url": f"https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/comfy-generations/test.png"
    }
    
    try:
        response = requests.post(
            EDGE_FUNCTION_URL,
            json=test_payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {SUPABASE_ANON_KEY}'
            },
            timeout=10
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            print("✅ Edge Function is working!")
        else:
            print("⚠️ Edge Function responded but may have issues")
            
    except Exception as e:
        print(f"❌ Edge Function test failed: {e}")

def main():
    print("🔧 Manual ComfyUI Image Processor")
    print("=" * 50)
    print()
    print("Choose an option:")
    print("1. Test Edge Function")
    print("2. Process specific files (edit script first)")
    print("3. Show instructions for finding recent files")
    
    choice = input("\nEnter choice (1-3): ").strip()
    
    if choice == "1":
        test_edge_function()
    elif choice == "2":
        process_files_by_pattern()
    elif choice == "3":
        process_date_range()
    else:
        print("Invalid choice")

if __name__ == "__main__":
    main() 