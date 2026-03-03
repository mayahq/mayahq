'use server';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type Database } from '@/lib/database.types';

export async function loginWithPassword(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
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
            // Occurs on Server Components trying to set cookies, can be ignored if middleware handles refresh
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Occurs on Server Components trying to delete cookies, can be ignored if middleware handles refresh
          }
        },
      },
    }
  );

  const { error, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Server Action Login Error:', error);
    // Instead of redirecting to /login?error=..., 
    // it's better to return an error object that the form can display.
    // For now, for simplicity, we'll redirect, but this can be improved.
    // return redirect('/login?error=' + encodeURIComponent(error.message));
    return { error: { message: error.message, code: error.code } };
  }

  if (data.session) {
    console.log('Server Action Login Successful, session:', data.session.user.id);
    return redirect('/admin/feed'); // DIRECTLY redirect to admin page
  } else {
    // Should not happen if no error
    console.error('Server Action Login: No error but no session');
    return { error: { message: 'Login failed: No session data received.' } };
  } 
} 