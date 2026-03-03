import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SocialsForm } from './socials-form';
import { type Database } from '@/lib/database.types';
import { redirect } from 'next/navigation';

export default async function SocialsPage() {
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
            // Errors can be ignored in Server Components
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', options);
          } catch (error) {
            // Errors can be ignored in Server Components
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return redirect('/login?next=/admin/socials');
  }

  const { data: socials } = await supabase
    .from('socials')
    .select('*')
    .order('platform');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white">Social Media Links</h3>
        <p className="text-sm text-muted-foreground">
          Manage your social media profiles and links.
        </p>
      </div>
      <SocialsForm socials={socials || []} />
    </div>
  );
} 