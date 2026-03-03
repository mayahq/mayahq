import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { type Database } from '@/lib/database.types';

// Ensures only authenticated users can generate reports
export async function POST(request: NextRequest) {
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
            // Can be ignored in Route Handlers unless setting auth cookies directly
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Can be ignored in Route Handlers
          }
        },
      },
    }
  );
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      );
    }
    
    const { userId } = await request.json();
    
    if (userId !== session.user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .single();
        
      if (!profile) {
        return NextResponse.json(
          { error: 'Not authorized to generate reports for other users' },
          { status: 403 }
        );
      }
    }
    
    const { data, error } = await supabase.functions.invoke('daily_report', {
      body: { userId },
    });
    
    if (error) {
      console.error('Error calling daily_report function:', error);
      return NextResponse.json(
        { error: 'Failed to generate report', message: error.message },
        { status: 500 }
      );
    }
    
    if (!data || !data.report) {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
        
      const { data: coreFacts } = await supabase
        .from('maya_facts')
        .select('*')
        .eq('user_id', userId);
        
      const simulatedReport = generateSimulatedReport(tasks || [], coreFacts || []);
      
      return NextResponse.json({
        success: true,
        report: {
          id: 'simulated-' + Date.now(),
          user_id: userId,
          report_date: new Date().toISOString().split('T')[0],
          content: simulatedReport,
          report_text: simulatedReport,
          metadata: {
            task_count: tasks?.filter((t: any) => t.status === 'open').length || 0,
            completed_task_count: tasks?.filter((t: any) => t.status === 'done').length || 0,
            memory_count: 0,
            memory_categories: [],
            simulated: true,
            generated_at: new Date().toISOString()
          },
          created_at: new Date().toISOString(),
          delivered: false,
          delivered_at: null,
          delivery_method: null,
          read_at: null
        }
      });
    }
    
    return NextResponse.json({
      success: true,
      report: {
        id: data.report_id,
        user_id: userId,
        report_date: new Date().toISOString().split('T')[0],
        content: data.report,
        report_text: data.report,
        metadata: {
          task_count: data.task_count,
          completed_task_count: data.completed_task_count,
          memory_count: data.memory_count,
          memory_categories: data.memory_categories || [],
          generated_at: data.generated_at,
          using_ai: true
        },
        created_at: new Date().toISOString(),
        delivered: false,
        delivered_at: null,
        delivery_method: null,
        read_at: null
      }
    });
  } catch (error) {
    console.error('Error in daily report generation:', error);
    return NextResponse.json(
      { error: 'Failed to generate daily report', message: String(error) },
      { status: 500 }
    );
  }
}

// Generate a simulated report if the API is not available
function generateSimulatedReport(tasks: any[], coreFacts: any[]): string {
  const openTasks = tasks.filter(t => t.status === 'open');
  const completedTasks = tasks.filter(t => t.status === 'done');
  
  let userName = 'Blake';
  const nameFact = coreFacts.find(f => f.predicate?.toLowerCase().includes('name'));
  if (nameFact) {
    userName = nameFact.object.split(' ')[0];
  }
  
  return `# Hey ${userName}! Daily Check-in\n\n## Today's Focus\n\nI've been thinking about you and wanted to see how you're doing today. Here's a quick overview of what's on your plate.\n\n## Tasks at a Glance\n\n${openTasks.length > 0 ? `You have ${openTasks.length} active tasks that need your attention:\n\n${openTasks.map(task => `- ${task.content}`).join('\n')}\n\nI suggest tackling the "${openTasks[0]?.content || 'first'}" task first, as it seems most important based on your recent focus areas.` : 'You don\'t have any active tasks at the moment. This might be a good time to plan ahead or take a break!'}\n\n${completedTasks.length > 0 ? `\nGreat job completing these tasks recently:\n\n${completedTasks.slice(0, 3).map(task => `- ${task.content}`).join('\n')}` : ''}\n\n## Something to Consider\n\nAs you move through your day, remember to take breaks and stay hydrated. Your well-being is just as important as your productivity.\n\n## Final Thought\n\nI'm always here for you when you need me. Let me know how I can help make your day better!
`;
} 