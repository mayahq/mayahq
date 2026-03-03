import { NextResponse } from 'next/server'
import { Maya } from '@/lib/maya-agent'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Database } from '@/lib/database.types'

// Get environment variables with type checking
const openAIApiKey = process.env.OPENAI_API_KEY || '';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const modelName = process.env.OPENAI_MODEL || 'gpt-4';

// Initialize Maya agent with configuration
let maya: Maya | null = null;

// Lazy initialize the Maya agent
function getMayaAgent() {
    if (!maya) {
        try {
            maya = new Maya({
                openAIApiKey,
                supabaseUrl,
                supabaseKey,
                temperature: 0.7,
                modelName,
                maxMemories: 5
            });
            console.log('Maya agent initialized for memory migration');
        } catch (error) {
            console.error('Failed to initialize Maya agent:', error);
            throw error;
        }
    }
    return maya;
}

export async function POST(req: Request) {
    try {
        // Check if user is authenticated
        const cookieStore = cookies();
        const serverSupabase = createServerClient<Database>(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value;
                    },
                    set(name: string, value: string, options: any) {
                        cookieStore.set({ name, value, ...options });
                    },
                    remove(name: string, options: any) {
                        cookieStore.set({ name, value: '', ...options });
                    },
                },
            }
        );

        const { data: { session } } = await serverSupabase.auth.getSession();
        
        if (!session?.user) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }
        
        // Parse request body to get old user ID
        let body;
        try {
            body = await req.json();
        } catch (parseError) {
            return NextResponse.json(
                { error: 'Invalid request format' },
                { status: 400 }
            );
        }
        
        const { oldUserId } = body;
        
        if (!oldUserId) {
            return NextResponse.json(
                { error: 'Old user ID is required' },
                { status: 400 }
            );
        }
        
        // Create the new user ID in the same format used by the chat system
        const newUserId = `admin-user-${session.user.id.substring(0, 8)}`;
        
        // Initialize the Maya agent
        const agent = getMayaAgent();
        
        // Migrate memories from old ID to new ID
        const migratedCount = await agent.migrateMemories(oldUserId, newUserId);
        
        return NextResponse.json({
            success: true,
            message: `Migrated ${migratedCount} memories`,
            oldUserId,
            newUserId
        });
    } catch (error: any) {
        console.error(`Memory migration error: ${error.message}`);
        return NextResponse.json(
            { error: 'Failed to migrate memories', details: error.message },
            { status: 500 }
        );
    }
} 