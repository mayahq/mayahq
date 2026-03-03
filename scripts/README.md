# ComfyUI Image Processing for Maya Scott

This directory contains scripts and instructions for populating the `comfyui_generated` table with images and metadata from your S3 bucket (`mayascott`).

## Your Configuration

- **S3 Bucket:** `mayascott`
- **Region:** `us-east-1`
- **Folder:** `comfy-generations/`
- **File Format:** `{uuid}_0_ComfyUI_{timestamp}_.png` and matching `.json` files
- **Edge Function:** `https://rqtlzitgxpccjlyqewad.supabase.co/functions/v1/comfyui-s3-processor`

## Quick Start (Recommended)

### 1. Process Existing Images

```bash
cd scripts

# Set your environment variables
export SUPABASE_URL="https://rqtlzitgxpccjlyqewad.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-key"
export AWS_ACCESS_KEY_ID="your-aws-access-key-id"
export AWS_SECRET_ACCESS_KEY="your-aws-secret-access-key"
export AWS_S3_BUCKET_NAME="mayascott"
export AWS_S3_REGION="us-east-1"

# Install dependencies
pip install -r requirements.txt

# Process all existing images
python process-existing-s3-images.py
```

### 2. Set Up Automatic Processing (Optional)

For automatic processing of new uploads:

```bash
# Make the setup script executable
chmod +x setup-s3-notifications.sh

# Run the setup (requires AWS CLI configured with admin permissions)
./setup-s3-notifications.sh
```

## What the Script Does

The `process-existing-s3-images.py` script is specifically designed for your ComfyUI format:

### ✅ File Detection
- Scans `comfy-generations/` folder in your `mayascott` bucket
- Finds images: `04c56e88-4041-49c7-9f2a-803208ef416e_0_ComfyUI_1749284604_.png`
- Finds metadata: `04c56e88-4041-49c7-9f2a-803208ef416e_0_ComfyUI_1749284604_.json`

### ✅ Metadata Extraction
From your JSON files, it extracts:
- **Style:** `"Mark Rothko"` → stored as style
- **Model:** `"juggernautXL_juggXIByRundiffusion.safetensors"` → detected as "SDXL"
- **Safety:** `"content_type": "sfw"` → sets `nsfw_safe = true`
- **Prompt:** `"prompt"` or `"full_prompt"` → stored as ComfyUI prompt
- **Dimensions:** `"width": 1024, "height": 1024` → stored as dimensions
- **Full metadata:** Entire JSON preserved for reference

### ✅ Smart Processing
- **Deduplication:** Uses content hashing to skip duplicates
- **Error handling:** Continues processing even if some files fail
- **Progress tracking:** Shows detailed progress with emojis
- **Connection testing:** Verifies S3 and Supabase before starting

## Your JSON Format Support

The script handles your specific JSON structure:

```json
{
  "style": "Mark Rothko",
  "prompt": "23 year old redhead skinny TOK, freckles, choker...",
  "full_prompt": "Mark Rothko style 23 year old redhead skinny TOK...",
  "negative_prompt": "Abstract Expressionist, deformed faced...",
  "checkpoint": "Photorealistic",
  "content_type": "sfw",
  "model_name": "juggernautXL_juggXIByRundiffusion.safetensors",
  "cfg": 3.0,
  "steps": 35,
  "sampler": "dpmpp_2m_sde",
  "scheduler": "karras",
  "seed": 3201557834,
  "dimensions": "1024x1024",
  "width": 1024,
  "height": 1024,
  "lora_name": "maya-replicate-lora.safetensors",
  "facedetailer_enabled": true,
  "image_filename": "04c56e88-4041-49c7-9f2a-803208ef416e_0_ComfyUI_1749284604_.png"
}
```

## Expected Output

After running the script, you should see:

```
🚀 Starting ComfyUI S3 image processing...
📁 Bucket: mayascott
🌍 Region: us-east-1
📂 Looking for images in: comfy-generations/

🔍 Testing connections...
   ✅ S3 connection successful
   ✅ Supabase connection successful

📋 Scanning S3 bucket for images...

🔄 Processing: comfy-generations/04c56e88-4041-49c7-9f2a-803208ef416e_0_ComfyUI_1749284604_.png
Looking for JSON metadata: comfy-generations/04c56e88-4041-49c7-9f2a-803208ef416e_0_ComfyUI_1749284604_.json
✅ Found JSON metadata: comfy-generations/04c56e88-4041-49c7-9f2a-803208ef416e_0_ComfyUI_1749284604_.json
   📋 Extracted metadata:
      Style: Mark Rothko
      Model: SDXL
      NSFW Safe: True
      Prompt: 23 year old redhead skinny TOK, freckles, choker...
      Dimensions: 1024x1024
   ✅ Successfully inserted: comfy-generations/04c56e88-4041-49c7-9f2a-803208ef416e_0_ComfyUI_1749284604_.png

📊 Processing complete!
   🔍 Total images found: 15
   ✅ Successfully processed: 15
   ⏭️  Skipped (duplicates): 0
   ❌ Errors: 0

🎉 15 images are now ready for review in the ComfyUI swipe interface!
   Open your mobile app → Feed → ComfyUI icon (orange) to start reviewing.
```

## Automatic Processing Setup

The `setup-s3-notifications.sh` script configures:

1. **SNS Topic:** `comfyui-s3-notifications` 
2. **S3 Events:** Triggers on new `.png` and `.jpg` files in `comfy-generations/`
3. **Edge Function:** Automatically processes new uploads
4. **Filtering:** Only processes files in your specific folder

**Requirements:**
- AWS CLI configured with admin permissions
- SNS and S3 permissions in your AWS account

## Testing the Mobile App

After processing:

1. **Open your mobile app**
2. **Go to Feed screen**
3. **Tap the ComfyUI icon** (orange/yellow images icon in header)
4. **Swipe interface appears** with your processed images
5. **Swipe right** to approve (adds to main feed)
6. **Swipe left** to delete (removes from review queue)

## Troubleshooting

### Common Issues

1. **"No images found"**
   ```bash
   # Check your S3 bucket
   aws s3 ls s3://mayascott/comfy-generations/ --recursive
   ```

2. **"Connection failed"**
   - Verify AWS credentials are correct
   - Check Supabase URL and service key
   - Ensure your IP isn't blocked by AWS

3. **"No JSON metadata found"**
   - Ensure `.json` files exist alongside `.png` files
   - Check file naming matches exactly

4. **"Mobile app shows no images"**
   - Verify images were inserted: Check Supabase dashboard
   - Check app environment variable: `EXPO_PUBLIC_SERIES_GENERATOR_URL`

### Manual Verification

Check the database directly:
```sql
SELECT COUNT(*) FROM comfyui_generated WHERE status = 'pending_review';
SELECT style, model_used, nsfw_safe FROM comfyui_generated LIMIT 5;
```

### Debug Mode

Enable verbose logging:
```python
# Add to top of process-existing-s3-images.py
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Next Steps

1. **Run the processing script** to populate your database
2. **Test the mobile swipe interface** 
3. **Set up automatic processing** for new uploads (optional)
4. **Customize the Edge Function** if needed for your workflow

The system is specifically designed for your ComfyUI output format and will preserve all your metadata while making the images available for review in the beautiful Bumble-style swipe interface! 