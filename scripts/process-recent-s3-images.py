#!/usr/bin/env python3
"""
Process recent S3 images using the Edge Function
This bypasses S3 permissions by calling the Edge Function directly
"""

import boto3
import json
import requests
from datetime import datetime, timezone, timedelta
from config import (
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_BUCKET, AWS_PREFIX
)

# Edge Function URL
EDGE_FUNCTION_URL = "https://dlaczmexhnoxfggpzxkl.supabase.co/functions/v1/comfyui-s3-processor"

# Initialize S3 client
s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
)

def get_recent_images(days_back=30):
    """Get list of images added in the last N days"""
    # Calculate cutoff date
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_back)
    
    recent_images = []
    
    try:
        # List objects with pagination
        paginator = s3_client.get_paginator('list_objects_v2')
        page_iterator = paginator.paginate(
            Bucket=AWS_BUCKET,
            Prefix=AWS_PREFIX
        )
        
        for page in page_iterator:
            if 'Contents' not in page:
                continue
                
            for obj in page['Contents']:
                # Only process image files
                if not obj['Key'].lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    continue
                
                # Check if file is newer than cutoff
                if obj['LastModified'] > cutoff_date:
                    recent_images.append({
                        'key': obj['Key'],
                        'size': obj['Size'],
                        'last_modified': obj['LastModified'].isoformat()
                    })
        
        return recent_images
        
    except Exception as e:
        print(f"Error listing S3 objects: {e}")
        return []

def process_image_via_edge_function(image_info):
    """Process a single image by calling the Edge Function"""
    try:
        # Create payload matching the Edge Function format
        payload = {
            "s3_key": image_info['key'],
            "bucket_name": AWS_BUCKET,
            "file_size": image_info['size'],
            "image_url": f"https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{image_info['key']}"
        }
        
        print(f"Processing: {image_info['key']}")
        
        # Call the Edge Function
        response = requests.post(
            EDGE_FUNCTION_URL,
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer anon_key_if_needed'  # May not be needed
            },
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"  ✅ Success: {result.get('message', 'Processed')}")
            return True
        else:
            print(f"  ❌ Failed: HTTP {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"  ❌ Error processing {image_info['key']}: {e}")
        return False

def main():
    print("🚀 Processing recent S3 images via Edge Function...")
    print(f"📁 Bucket: {AWS_BUCKET}")
    print(f"📂 Prefix: {AWS_PREFIX}")
    
    # Get images from last 60 days (adjust as needed)
    days_back = 60
    print(f"🔍 Looking for images from last {days_back} days...")
    
    recent_images = get_recent_images(days_back)
    
    if not recent_images:
        print("📭 No recent images found")
        return
    
    print(f"📊 Found {len(recent_images)} recent images")
    
    processed = 0
    failed = 0
    
    for image_info in recent_images:
        success = process_image_via_edge_function(image_info)
        if success:
            processed += 1
        else:
            failed += 1
    
    print(f"\n📊 Processing complete!")
    print(f"   ✅ Successfully processed: {processed}")
    print(f"   ❌ Failed: {failed}")
    print(f"   📱 Check your mobile app for new images!")

if __name__ == "__main__":
    main() 