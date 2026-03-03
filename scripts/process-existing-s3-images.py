#!/usr/bin/env python3
"""
Script to process existing S3 images and JSON files into comfyui_generated table
Specifically designed for ComfyUI files in the comfy-generations folder
"""

import boto3
import json
import hashlib
import re
import os
from datetime import datetime
from supabase import create_client, Client
from PIL import Image
import requests
from io import BytesIO

# Import configuration
from config import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_BUCKET, AWS_PREFIX
)

# Initialize clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
)

def extract_metadata_from_json(json_metadata):
    """Extract metadata from ComfyUI JSON format"""
    # Default values
    style = "unknown"
    model_used = "unknown"
    nsfw_safe = True
    comfyui_prompt = None
    image_filename = None
    
    if not json_metadata:
        return style, model_used, nsfw_safe, comfyui_prompt, image_filename
    
    # Extract image filename
    if 'image_filename' in json_metadata:
        image_filename = json_metadata['image_filename']
    
    # Extract style (could be in 'style' field)
    if 'style' in json_metadata:
        style = json_metadata['style']
    
    # Extract model from checkpoint field (this is what you want for model_used)
    if 'checkpoint' in json_metadata:
        model_used = json_metadata['checkpoint']
    elif 'model_name' in json_metadata:
        # Fallback: Extract model type from model_name if no checkpoint
        model_name = json_metadata['model_name']
        if 'juggernaut' in model_name.lower() or 'xl' in model_name.lower():
            model_used = "SDXL"
        elif 'sd15' in model_name.lower() or '1.5' in model_name.lower():
            model_used = "SD15"
        elif 'flux' in model_name.lower():
            model_used = "FLUX"
        else:
            model_used = model_name.split('.')[0]  # Use filename without extension
    
    # Extract NSFW safety from content_type
    if 'content_type' in json_metadata:
        content_type = json_metadata['content_type'].lower()
        nsfw_safe = content_type in ['sfw', 'safe']
    
    # Extract prompt (try multiple fields, prioritize full_prompt)
    for prompt_field in ['full_prompt', 'prompt', 'positive_prompt', 'text']:
        if prompt_field in json_metadata and json_metadata[prompt_field]:
            comfyui_prompt = json_metadata[prompt_field]
            break
    
    return style, model_used, nsfw_safe, comfyui_prompt, image_filename

def get_image_dimensions_from_json(json_metadata):
    """Get image dimensions from JSON metadata"""
    if json_metadata and 'width' in json_metadata and 'height' in json_metadata:
        return {
            "width": json_metadata['width'],
            "height": json_metadata['height']
        }
    return {"width": 1024, "height": 1024}  # Default for ComfyUI

def get_image_dimensions(image_url):
    """Get image dimensions from S3 (fallback)"""
    try:
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()
        
        with Image.open(BytesIO(response.content)) as img:
            return {"width": img.width, "height": img.height}
    except Exception as e:
        print(f"Error getting dimensions for {image_url}: {e}")
        return {"width": 1024, "height": 1024}  # Default

def get_file_size(bucket, key):
    """Get file size from S3"""
    try:
        response = s3_client.head_object(Bucket=bucket, Key=key)
        return response['ContentLength']
    except Exception as e:
        print(f"Error getting file size for {key}: {e}")
        return None

def generate_content_hash(image_url):
    """Generate content hash for deduplication"""
    try:
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()
        
        # Use first 1KB for hash to be fast but unique enough
        content_sample = response.content[:1024]
        return hashlib.md5(content_sample).hexdigest()
    except Exception as e:
        print(f"Error generating hash for {image_url}: {e}")
        return None

def fetch_json_metadata(bucket, image_key):
    """Fetch corresponding JSON metadata file for ComfyUI format"""
    # For files like: 04c56e88-4041-49c7-9f2a-803208ef416e_0_ComfyUI_1749284604_.png
    # Look for:       04c56e88-4041-49c7-9f2a-803208ef416e_0_ComfyUI_1749284604_.json
    
    # Replace .png/.jpg/.jpeg/.webp with .json
    base_name = os.path.splitext(image_key)[0]
    json_key = f"{base_name}.json"
    
    try:
        print(f"Looking for JSON metadata: {json_key}")
        response = s3_client.get_object(Bucket=bucket, Key=json_key)
        metadata = json.loads(response['Body'].read().decode('utf-8'))
        print(f"✅ Found JSON metadata: {json_key}")
        return metadata
    except s3_client.exceptions.NoSuchKey:
        print(f"❌ No JSON metadata found for {image_key}")
        return {}
    except Exception as e:
        print(f"❌ Error reading JSON {json_key}: {e}")
        return {}

def process_image(bucket, image_key):
    """Process a single image and insert into database"""
    print(f"\n🔄 Processing: {image_key}")
    
    # Build image URL
    image_url = f"https://{bucket}.s3.{AWS_REGION}.amazonaws.com/{image_key}"
    
    # Get JSON metadata
    json_metadata = fetch_json_metadata(bucket, image_key)
    
    # Skip images without JSON metadata
    if not json_metadata:
        print(f"   ⏭️  Skipping - no JSON metadata found")
        return False
    
    # Extract metadata from JSON
    style, model_used, nsfw_safe, comfyui_prompt, image_filename = extract_metadata_from_json(json_metadata)
    
    # Fallback for image_filename if not in JSON
    if not image_filename:
        image_filename = os.path.basename(image_key)
    
    # Get image properties (prefer JSON, fallback to direct measurement)
    dimensions = get_image_dimensions_from_json(json_metadata)
    if dimensions["width"] == 1024 and dimensions["height"] == 1024 and not json_metadata:
        # No JSON found, try to get dimensions directly
        dimensions = get_image_dimensions(image_url)
    
    file_size = get_file_size(bucket, image_key)
    content_hash = generate_content_hash(image_url)
    
    print(f"   📋 Extracted metadata:")
    print(f"      Style: {style}")
    print(f"      Model: {model_used}")
    print(f"      NSFW Safe: {nsfw_safe}")
    print(f"      Prompt: {comfyui_prompt[:50] if comfyui_prompt else 'None'}...")
    print(f"      Dimensions: {dimensions['width']}x{dimensions['height']}")
    print(f"      Image Filename: {image_filename}")
    
    # Check for duplicates
    if content_hash:
        try:
            existing = supabase.table("comfyui_generated").select("id").eq("content_hash", content_hash).execute()
            if existing.data:
                print(f"   ⏭️  Skipping duplicate: {image_key} (hash: {content_hash})")
                return False
        except Exception as e:
            print(f"   ⚠️  Error checking for duplicates: {e}")
    
    # Insert into database
    try:
        record = {
            "image_url": image_url,
            "image_s3_key": image_key,
            "style": style,
            "model_used": model_used,
            "nsfw_safe": nsfw_safe,
            "comfyui_prompt": comfyui_prompt,
            "metadata": json_metadata,
            "dimensions": dimensions,
            "file_size_bytes": file_size,
            "content_hash": content_hash,
            "status": "pending_review",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "image_filename": image_filename
        }
        
        result = supabase.table("comfyui_generated").insert(record).execute()
        
        if result.data:
            print(f"   ✅ Successfully inserted: {image_key}")
            return True
        else:
            print(f"   ❌ Failed to insert: {image_key}")
            return False
            
    except Exception as e:
        print(f"   ❌ Error inserting {image_key}: {e}")
        return False

def main():
    """Main processing function"""
    print("🚀 Starting ComfyUI S3 image processing...")
    print(f"📁 Bucket: {AWS_BUCKET}")
    print(f"🌍 Region: {AWS_REGION}")
    print(f"📂 Looking for images in: {AWS_PREFIX}")
    
    # Validate configuration
    config_vars = {
        "SUPABASE_URL": SUPABASE_URL, 
        "SUPABASE_SERVICE_KEY": SUPABASE_SERVICE_KEY,
        "AWS_ACCESS_KEY_ID": AWS_ACCESS_KEY_ID, 
        "AWS_SECRET_ACCESS_KEY": AWS_SECRET_ACCESS_KEY,
        "AWS_REGION": AWS_REGION, 
        "AWS_BUCKET": AWS_BUCKET, 
        "AWS_PREFIX": AWS_PREFIX
    }
    
    missing_vars = [name for name, value in config_vars.items() if not value]
    if missing_vars:
        print(f"❌ Missing required configuration: {', '.join(missing_vars)}")
        return
    
    print("🔍 Validating connections...")
    try:
        # Test S3
        s3_client.head_bucket(Bucket=AWS_BUCKET)
        print("   ✅ S3 connection successful")
        
        # Test Supabase
        result = supabase.table('comfyui_generated').select('id').limit(1).execute()
        print("   ✅ Supabase connection successful")
        
    except Exception as e:
        print(f"❌ Connection validation failed: {e}")
        return
    
    print("📊 Scanning S3 for ComfyUI images...")
    
    total_images = 0
    processed = 0
    skipped = 0
    errors = 0
    
    try:
        # Paginate through S3 objects
        paginator = s3_client.get_paginator('list_objects_v2')
        page_iterator = paginator.paginate(
            Bucket=AWS_BUCKET,
            Prefix=AWS_PREFIX  # Already includes 'comfy-generations/'
        )
        
        for page in page_iterator:
            if 'Contents' not in page:
                continue
                
            for obj in page['Contents']:
                key = obj['Key']
                
                # Only process image files
                if not key.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    continue
                
                total_images += 1
                
                try:
                    success = process_image(AWS_BUCKET, key)
                    if success:
                        processed += 1
                    else:
                        skipped += 1
                        
                except Exception as e:
                    print(f"   ❌ Error processing {key}: {e}")
                    errors += 1
        
        print(f"\n📊 Processing complete!")
        print(f"   🔍 Total images found: {total_images}")
        print(f"   ✅ Successfully processed: {processed}")
        print(f"   ⏭️  Skipped (no JSON or duplicates): {skipped}")
        print(f"   ❌ Errors: {errors}")
        
        if processed > 0:
            print(f"\n🎉 {processed} images are now ready for review in the ComfyUI swipe interface!")
            print("   Open your mobile app → Feed → ComfyUI icon (orange) to start reviewing.")
        
    except Exception as e:
        print(f"❌ Error listing S3 objects: {e}")

if __name__ == "__main__":
    main() 