import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { LinksDataTable } from '../components/links-data-table'
import { type Database } from '@/lib/database.types'

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LinksPage() {
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
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Errors can be ignored in Server Components
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Errors can be ignored in Server Components
          }
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('Auth error or no user in LinksPage:', authError);
    console.log('User not authenticated in LinksPage, data might be RLS restricted or empty.');
  }

  const { data: links, error: dbError } = await supabase
    .from('links')
    .select('*')
    .order('order');

  if (dbError) {
    console.error('[DEBUG] LinksPage DB error fetching links:', dbError);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white neon-glow">Links</h1>
        <p className="text-gray-400">
          Manage your public links and their order.
        </p>
      </div>

      <LinksDataTable data={links ?? []} />
    </div>
  )
} 