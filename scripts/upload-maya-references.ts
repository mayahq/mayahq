#!/usr/bin/env npx ts-node

/**
 * Upload Maya Reference Images to Supabase Storage
 *
 * This script uploads the reference images from scripts/maya-generator/reference-images
 * to Supabase Storage so the image generation API can access them.
 *
 * Usage:
 *   npx ts-node scripts/upload-maya-references.ts
 *
 * Requires environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const REFERENCE_DIR = path.join(__dirname, 'maya-generator/reference-images');
const STORAGE_BUCKET = 'maya-media';
const STORAGE_PATH = 'maya-reference-images';

async function main() {
  // Load environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables:');
    console.error('  NEXT_PUBLIC_SUPABASE_URL');
    console.error('  SUPABASE_SERVICE_ROLE_KEY');
    console.error('\nTry running with: npx dotenv -e .env.local -- npx ts-node scripts/upload-maya-references.ts');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('Uploading Maya reference images to Supabase Storage...');
  console.log(`Source: ${REFERENCE_DIR}`);
  console.log(`Destination: ${STORAGE_BUCKET}/${STORAGE_PATH}`);
  console.log('');

  // Check if reference directory exists
  if (!fs.existsSync(REFERENCE_DIR)) {
    console.error(`Reference directory not found: ${REFERENCE_DIR}`);
    process.exit(1);
  }

  // Get all image files
  const files = fs.readdirSync(REFERENCE_DIR).filter(f =>
    /\.(png|jpg|jpeg|webp)$/i.test(f) && !f.startsWith('.')
  );

  if (files.length === 0) {
    console.error('No image files found in reference directory');
    process.exit(1);
  }

  console.log(`Found ${files.length} image files:`);
  files.forEach(f => console.log(`  - ${f}`));
  console.log('');

  // Upload each file
  let uploaded = 0;
  let errors = 0;

  for (const filename of files) {
    const filepath = path.join(REFERENCE_DIR, filename);
    const storagePath = `${STORAGE_PATH}/${filename}`;

    console.log(`Uploading ${filename}...`);

    try {
      const fileBuffer = fs.readFileSync(filepath);

      // Determine content type
      const ext = path.extname(filename).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp'
      };
      const contentType = contentTypes[ext] || 'image/png';

      // Upload to Supabase Storage (upsert to overwrite if exists)
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType,
          upsert: true
        });

      if (error) {
        console.error(`  Error: ${error.message}`);
        errors++;
      } else {
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(storagePath);

        console.log(`  ✓ Uploaded to: ${publicUrl}`);
        uploaded++;
      }
    } catch (err: any) {
      console.error(`  Error: ${err.message}`);
      errors++;
    }
  }

  console.log('');
  console.log('Upload complete!');
  console.log(`  ✓ Uploaded: ${uploaded}`);
  if (errors > 0) {
    console.log(`  ✗ Errors: ${errors}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
