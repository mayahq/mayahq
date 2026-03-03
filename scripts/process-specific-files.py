#!/usr/bin/env python3
"""
Direct processing of specific ComfyUI images
This bypasses the Edge Function and processes images directly
"""

import requests
import json
import hashlib
from datetime import datetime
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# S3 configuration
AWS_BUCKET = "mayascott"
AWS_REGION = "us-east-1"

def fetch_json_metadata(s3_key):
    """Fetch JSON metadata for a ComfyUI image"""
    try:
        # Convert image key to JSON key
        json_key = s3_key.replace('.png', '.json').replace('.jpg', '.json').replace('.jpeg', '.json')
        json_url = f"https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{json_key}"
        
        print(f"  📄 Fetching metadata: {json_key}")
        
        response = requests.get(json_url, timeout=10)
        
        if response.status_code == 200:
            metadata = response.json()
            print(f"  ✅ Found metadata with {len(metadata)} fields")
            return metadata
        else:
            print(f"  ❌ No metadata found (HTTP {response.status_code})")
            return None
            
    except Exception as e:
        print(f"  ⚠️  Error fetching metadata: {e}")
        return None

def extract_metadata_from_json(json_metadata):
    """Extract structured data from ComfyUI JSON"""
    if not json_metadata:
        return {
            'style': 'unknown',
            'model_used': 'unknown',
            'nsfw_safe': True,
            'comfyui_prompt': None,
            'image_filename': None
        }
    
    # Extract style
    style = json_metadata.get('style', 'unknown')
    
    # Extract model from checkpoint field (prioritize checkpoint over model_name)
    model_used = 'unknown'
    if 'checkpoint' in json_metadata:
        model_used = json_metadata['checkpoint']
    elif 'model' in json_metadata:
        model_used = json_metadata['model']
    elif 'model_name' in json_metadata:
        model_name = json_metadata['model_name']
        if 'juggernaut' in model_name.lower() or 'xl' in model_name.lower():
            model_used = "SDXL"
        else:
            model_used = model_name.split('.')[0]
    
    # Extract NSFW safety
    nsfw_safe = True
    if 'content_type' in json_metadata:
        content_type = json_metadata['content_type'].lower()
        nsfw_safe = content_type in ['sfw', 'safe']
    
    # Extract prompt (prioritize full_prompt over prompt)
    comfyui_prompt = None
    for prompt_field in ['full_prompt', 'prompt', 'positive_prompt', 'text']:
        if prompt_field in json_metadata and json_metadata[prompt_field]:
            comfyui_prompt = json_metadata[prompt_field]
            break
    
    # Extract image filename
    image_filename = json_metadata.get('image_filename')
    
    return {
        'style': style,
        'model_used': model_used,
        'nsfw_safe': nsfw_safe,
        'comfyui_prompt': comfyui_prompt,
        'image_filename': image_filename
    }

def get_image_dimensions(json_metadata):
    """Get image dimensions from JSON metadata"""
    if json_metadata and 'width' in json_metadata and 'height' in json_metadata:
        return {
            "width": json_metadata['width'],
            "height": json_metadata['height']
        }
    return {"width": 1024, "height": 1024}  # Default

def generate_content_hash(image_url):
    """Generate content hash for deduplication"""
    return hashlib.md5(image_url.encode()).hexdigest()

def process_single_file(s3_key):
    """Process a single ComfyUI file"""
    print(f"\n🔄 Processing: {s3_key}")
    
    # Build image URL
    image_url = f"https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
    filename = s3_key.split('/')[-1]
    
    # Fetch JSON metadata
    json_metadata = fetch_json_metadata(s3_key)
    
    if not json_metadata:
        print(f"  ⏭️  Skipping - no JSON metadata found")
        return False
    
    # Extract metadata
    extracted = extract_metadata_from_json(json_metadata)
    dimensions = get_image_dimensions(json_metadata)
    content_hash = generate_content_hash(image_url)
    
    print(f"  📋 Extracted:")
    print(f"     Style: {extracted['style']}")
    print(f"     Model: {extracted['model_used']}")
    print(f"     NSFW Safe: {extracted['nsfw_safe']}")
    print(f"     Prompt: {extracted['comfyui_prompt'][:50] if extracted['comfyui_prompt'] else 'None'}...")
    
    # Check for duplicates
    try:
        existing = supabase.table("comfyui_generated").select("id").eq("content_hash", content_hash).execute()
        if existing.data:
            print(f"  ⏭️  Skipping - already exists (ID: {existing.data[0]['id']})")
            return True  # Return True because it's not an error
    except Exception as e:
        print(f"  ⚠️  Error checking duplicates: {e}")
    
    # Insert into database
    try:
        record = {
            "image_url": image_url,
            "image_s3_key": s3_key,
            "style": extracted['style'],
            "model_used": extracted['model_used'],
            "nsfw_safe": extracted['nsfw_safe'],
            "comfyui_prompt": extracted['comfyui_prompt'],
            "metadata": json_metadata,
            "dimensions": dimensions,
            "content_hash": content_hash,
            "status": "pending_review",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "image_filename": extracted['image_filename'] or filename
        }
        
        result = supabase.table("comfyui_generated").insert(record).execute()
        
        if result.data:
            new_id = result.data[0]['id']
            print(f"  ✅ Successfully inserted: ID {new_id}")
            return True
        else:
            print(f"  ❌ Failed to insert")
            return False
            
    except Exception as e:
        print(f"  ❌ Error inserting: {e}")
        return False

def process_file_list():
    """Process a list of specific files"""
    
    # ADD YOUR SPECIFIC S3 KEYS HERE
    # You can get these from:
    # 1. Your Mac Studio generator logs
    # 2. AWS S3 Console
    # 3. Your recent upload history
    
    files_to_process = [
        # Add actual S3 keys here from your recent generations
        # Example format:
        # "comfy-generations/12345678-1234-1234-1234-123456789abc_0_ComfyUI_1749123456_.png",
        # "comfy-generations/abcdefgh-5678-5678-5678-abcdefghijkl_0_ComfyUI_1749234567_.png",
        
        # You can add multiple files here...
    ]
    
    if not files_to_process:
        print("📝 No files specified!")
        print()
        print("To process files:")
        print("1. 📋 Find recent file names from your Mac Studio logs")
        print("2. 🗂️  Or browse AWS S3 Console: mayascott bucket > comfy-generations/")
        print("3. 📝 Add the S3 keys to the files_to_process list in this script")
        print("4. 🚀 Run the script again")
        print()
        print("File format: comfy-generations/{uuid}_0_ComfyUI_{timestamp}_.png")
        return
    
    print(f"🚀 Processing {len(files_to_process)} files...")
    
    successful = 0
    skipped = 0
    failed = 0
    
    for s3_key in files_to_process:
        try:
            success = process_single_file(s3_key)
            if success:
                if "already exists" in str(success):
                    skipped += 1
                else:
                    successful += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  ❌ Error processing {s3_key}: {e}")
            failed += 1
    
    print(f"\n📊 Processing complete!")
    print(f"   ✅ Successfully processed: {successful}")
    print(f"   ⏭️  Skipped (already exist): {skipped}")
    print(f"   ❌ Failed: {failed}")
    
    if successful > 0:
        print(f"\n🎉 {successful} new images added to your mobile app!")
        print("   Open mobile app → Feed → ComfyUI icon to see them")

def test_connection():
    """Test database connection"""
    try:
        result = supabase.table('comfyui_generated').select('id', count='exact').execute()
        print("✅ Database connection successful")
        total_count = result.count if hasattr(result, 'count') else len(result.data) if result.data else 0
        print(f"   Current images in database: {total_count}")
        return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

def main():
    print("🚀 Direct ComfyUI Image Processor")
    print("=" * 50)
    print()
    
    # Test connection first
    if not test_connection():
        return
    
    print()
    print("Choose an option:")
    print("1. Process specific files (edit script first)")
    print("2. Test with a single file")
    print("3. Show instructions for finding files")
    
    choice = input("\nEnter choice (1-3): ").strip()
    
    if choice == "1":
        process_file_list()
    elif choice == "2":
        test_file = input("Enter S3 key to test: ").strip()
        if test_file:
            process_single_file(test_file)
        else:
            print("No file specified")
    elif choice == "3":
        print("\n📋 How to find recent files:")
        print()
        print("Method 1 - Mac Studio Logs:")
        print("  • Check your Mac Studio terminal/logs for recent uploads")
        print("  • Look for messages like 'Uploaded to S3: s3://mayascott/comfy-generations/...'")
        print()
        print("Method 2 - AWS S3 Console:")
        print("  • Go to AWS S3 Console")
        print("  • Navigate to mayascott bucket > comfy-generations/")
        print("  • Sort by 'Last modified' to see recent files")
        print("  • Copy the full S3 key (comfy-generations/filename.png)")
        print()
        print("Method 3 - Pattern matching:")
        print("  • Recent files follow pattern: {uuid}_0_ComfyUI_{timestamp}_.png")
        print("  • Look for files with recent timestamps")
    else:
        print("❌ Invalid choice")

if __name__ == "__main__":
    main() 