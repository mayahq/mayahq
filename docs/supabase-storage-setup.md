# Supabase Storage Setup for Product Images

This guide will help you set up Supabase storage for the product image upload functionality.

## Prerequisites

- Supabase project with admin access
- Supabase CLI installed (optional)

## 1. Create Storage Bucket

### Via Supabase Dashboard:

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the sidebar
3. Click **Create a new bucket**
4. Set bucket name: `product-images`
5. Make it **Public** (for easy access to product images)
6. Click **Create bucket**

### Via SQL (Alternative):

```sql
-- Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images', 
  'product-images', 
  true, 
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
);
```

## 2. Set Storage Policies

Navigate to **Storage** > **Policies** and create the following policies:

### Policy 1: Allow Public Read Access

```sql
CREATE POLICY "Public read access for product images" ON storage.objects
FOR SELECT USING (bucket_id = 'product-images');
```

### Policy 2: Allow Authenticated Upload

```sql
CREATE POLICY "Authenticated users can upload product images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'product-images' 
  AND auth.role() = 'authenticated'
);
```

### Policy 3: Allow Authenticated Update/Delete

```sql
CREATE POLICY "Authenticated users can update/delete product images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'product-images' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can update product images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'product-images' 
  AND auth.role() = 'authenticated'
);
```

## 3. Environment Variables

Make sure your `.env.local` has the Supabase configuration:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## 4. Test the Setup

### Via Admin Interface:
1. Go to `/admin/products`
2. Click "Add Product"
3. Try uploading an image in the Basic Info tab
4. Verify the image uploads and displays correctly

### Via API:
```bash
curl -X POST http://localhost:3001/api/products/upload-image \
  -F "file=@/path/to/test-image.jpg"
```

## 5. Folder Structure

The storage will organize images as:
```
product-images/
└── products/
    ├── 1704729600000-abc123.jpg
    ├── 1704729700000-def456.png
    └── ...
```

## 6. URL Format

Uploaded images will be accessible at:
```
https://your-project.supabase.co/storage/v1/object/public/product-images/products/filename.jpg
```

## 7. File Restrictions

- **Allowed types**: JPEG, PNG, WebP, GIF
- **Max size**: 5MB
- **Naming**: Auto-generated with timestamp and random string
- **Path**: `products/{timestamp}-{random}.{extension}`

## Troubleshooting

### Common Issues:

1. **Upload fails with 403**: Check RLS policies are set correctly
2. **Images not displaying**: Verify bucket is public
3. **Large file uploads fail**: Check file size is under 5MB
4. **CORS errors**: Ensure Supabase URL is correctly configured

### Verify Bucket Settings:
```sql
SELECT * FROM storage.buckets WHERE id = 'product-images';
```

### Check Policies:
```sql
SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
```

## Security Notes

- Images are publicly accessible once uploaded
- Only authenticated users can upload/modify
- File types and sizes are validated on both client and server
- Unique filenames prevent conflicts and overwriting 