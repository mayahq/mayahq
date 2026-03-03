import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Generation } from '../../page';
import { notFound } from 'next/navigation';
import ClientTagPage from './client';
import { type Database } from '@/lib/database.types';

interface TagPageProps {
  params: { tag: string }
}

export default async function TagRoute({ params }: TagPageProps) {
  const tag = decodeURIComponent(params.tag);
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set(name, value, options);
          } catch (error) {
            // Can be ignored in Server Components
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', options);
          } catch (error) {
            // Can be ignored in Server Components
          }
        },
      },
    }
  );
  // Fetch all generations
  const { data, error } = await supabase.from('generations').select('*');
  if (error || !data) {
    console.error('Error fetching generations for tag page:', error);
    return notFound();
  }
  // Filter images that have the tag (ignoring type prefix)
  const images = (data as Generation[]).filter(img =>
    (img.tags || []).some(t => {
      const idx = t.indexOf(':');
      const clean = idx !== -1 ? t.slice(idx + 1) : t;
      return clean === tag;
    })
  );
  if (!images.length) return notFound();
  return <ClientTagPage tag={tag} images={images} />;
} 