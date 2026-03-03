import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { type Database } from '@/lib/database.types';

// Beehiiv configuration
const BEEHIIV_API_URL = 'https://api.beehiiv.com/v2';
const BEEHIIV_PUBLICATION_ID = 'pub_94adfa57-7940-491d-bda8-df40f0b7fbd5';
const BEEHIIV_AUTOMATION_ID = 'aut_4065ec51-7088-4847-bd67-489c729368e3';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const email = formData.get('email');

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

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
              // Can be ignored in Route Handlers if not modifying auth state
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value: '', ...options });
            } catch (error) {
              // Can be ignored in Route Handlers if not modifying auth state
            }
          },
        },
      }
    );

    // Subscribe to Beehiiv
    let beehiivSuccess = false;
    try {
      const beehiivResponse = await fetch(
        `${BEEHIIV_API_URL}/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`,
          },
          body: JSON.stringify({
            email,
            reactivate_existing: false,
            send_welcome_email: true,
            utm_source: 'maya_hq_website',
            utm_medium: 'homepage',
            utm_campaign: 'subscription',
            referring_site: 'mayahq.com',
            tags: ['maya_hq_website', 'website_signup'],
            custom_fields: [],
          }),
        }
      );

      if (beehiivResponse.ok) {
        beehiivSuccess = true;
        
        // Add to automation if subscription was successful
        try {
          await fetch(
            `${BEEHIIV_API_URL}/publications/${BEEHIIV_PUBLICATION_ID}/automations/${BEEHIIV_AUTOMATION_ID}/subscribers`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`,
              },
              body: JSON.stringify({
                email,
              }),
            }
          );
        } catch (automationError) {
          console.error('Failed to add subscriber to Beehiiv automation:', automationError);
          // Don't fail the whole request if automation fails
        }
      } else {
        const errorText = await beehiivResponse.text();
        console.error('Beehiiv subscription failed:', {
          status: beehiivResponse.status,
          statusText: beehiivResponse.statusText,
          body: errorText
        });
      }
    } catch (beehiivError) {
      console.error('Error subscribing to Beehiiv:', beehiivError);
    }

    // Store in Supabase as backup (and for analytics)
    let supabaseSuccess = false;
    try {
      const { error } = await supabase
        .from('subscribers')
        .insert({ 
          email,
          beehiiv_subscribed: beehiivSuccess,
          subscribed_at: new Date().toISOString()
        });

      if (!error) {
        supabaseSuccess = true;
      } else {
        console.error('Supabase error subscribing to newsletter:', error);
      }
    } catch (supabaseError) {
      console.error('Supabase subscription error:', supabaseError);
    }

    // Return success if at least one service worked
    if (beehiivSuccess || supabaseSuccess) {
      return NextResponse.json(
        { 
          message: 'Successfully subscribed to newsletter',
          beehiiv: beehiivSuccess,
          backup: supabaseSuccess
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { error: 'Failed to subscribe to newsletter. Please try again.' },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Internal server error in subscribe route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
} 