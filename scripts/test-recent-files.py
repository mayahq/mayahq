#!/usr/bin/env python3
"""
Quick test script for processing known recent files
Replace the sample_files list with actual S3 keys from your recent generations
"""

import requests

EDGE_FUNCTION_URL = "https://dlaczmexhnoxfggpzxkl.supabase.co/functions/v1/comfyui-s3-processor"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYWN6bWV4aG5veGZnZ3B6eGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ5MTgyMzMsImV4cCI6MjA2MDQ5NDIzM30.WrhFows7rDBWN9wOTtqFVSRmoNUlR_CN6BcXgbb0IDo"

# Add your actual recent S3 keys here
# You can find these in your Mac Studio logs or AWS S3 console
sample_files = [
    # "comfy-generations/12345678_0_ComfyUI_1749123456_.png",
    # "comfy-generations/abcdefgh_0_ComfyUI_1749234567_.png",
    # Add more files here...
]

def process_file(s3_key):
    payload = {
        "s3_key": s3_key,
        "bucket_name": "mayascott",
        "file_size": 0,
        "image_url": f"https://mayascott.s3.us-east-1.amazonaws.com/{s3_key}"
    }
    
    try:
        response = requests.post(
            EDGE_FUNCTION_URL,
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {SUPABASE_ANON_KEY}'
            },
            timeout=30
        )
        
        print(f"Processing: {s3_key}")
        print(f"  Status: {response.status_code}")
        print(f"  Response: {response.text}")
        return response.status_code == 200
        
    except Exception as e:
        print(f"  Error: {e}")
        return False

def main():
    if not sample_files:
        print("📝 No files to process.")
        print("Add S3 keys to the sample_files list and run again.")
        print("Example: 'comfy-generations/12345678_0_ComfyUI_1749123456_.png'")
        return
    
    print(f"🚀 Processing {len(sample_files)} files...")
    
    for s3_key in sample_files:
        process_file(s3_key)
        print()

if __name__ == "__main__":
    main() 