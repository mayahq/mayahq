import os

# Configuration for ComfyUI S3 processing script

# Supabase Configuration
SUPABASE_URL = "https://dlaczmexhnoxfggpzxkl.supabase.co"
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# AWS Configuration
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION = "us-east-1"
AWS_BUCKET = "mayascott"
AWS_PREFIX = "comfy-generations/" 