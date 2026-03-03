import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Profile } from './profile';
import { type Database } from '@/lib/database.types';

export default async function UserPage({
  params: { username },
}: {
  params: { username: string };
}) {
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
  
  // Optional: Authentication check. If this page should behave differently for logged-in users.
  // const { data: { user } } = await supabase.auth.getUser();

  if (!username) {
    let { data: mayaProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', '61770892-9e5b-46a5-b622-568be7066664') // Maya's ID
      .single();

    if (!mayaProfile) {
      console.log('[UserPage] Maya profile by ID not found, trying by name...');
      const { data: nameProfile } = await supabase
        .from('profiles')
        .select('*')
        .ilike('name', '%Maya%') // Flexible name search
        .limit(1)
        .single();
      mayaProfile = nameProfile;
    }

    if (!mayaProfile) {
      console.log('[UserPage] Maya profile by name not found, trying first profile...');
      const { data: firstProfile } = await supabase
        .from('profiles')
        .select('*')
        .limit(1)
        .single();
      mayaProfile = firstProfile;
    }

    if (!mayaProfile) {
      return notFound();
    }
    return <Profile profile={mayaProfile} />;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .ilike('name', username.replace(/-/g, ' '))
    .single();

  if (!profile) {
    return notFound();
  }

  return <Profile profile={profile} />;
} 