import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from './database.types';

export interface DailyReport {
  id: number;
  user_id: string;
  report_date: string;
  content: string;
  report_text: string;
  metadata: {
    task_count: number;
    memory_count: number;
    [key: string]: any;
  };
  created_at: string;
  delivered: boolean;
  delivered_at: string | null;
  delivery_method: string | null;
  read_at: string | null;
}

/**
 * Fetches the latest daily report for a user
 */
export async function getLatestDailyReport(supabase: SupabaseClient<Database>, userId: string): Promise<DailyReport | null> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('user_id', userId)
    .order('report_date', { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching latest daily report:', error);
    return null;
  }
  
  if (!data) return null;

  // Cast the database response with type assertion to ensure metadata has the required shape
  return {
    ...data,
    metadata: {
      task_count: (data.metadata as any)?.task_count ?? 0,
      memory_count: (data.metadata as any)?.memory_count ?? 0,
      ...(data.metadata as object ?? {})
    }
  } as DailyReport;
}

/**
 * Fetches a specified number of daily reports for a user
 */
export async function getDailyReports(supabase: SupabaseClient<Database>, userId: string, limit = 10): Promise<DailyReport[]> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('user_id', userId)
    .order('report_date', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('Error fetching daily reports:', error);
    return [];
  }
  
  // Cast the database response with type assertion to ensure metadata has the required shape
  return (data ?? []).map(report => ({
    ...report,
    metadata: {
      task_count: (report.metadata as any)?.task_count ?? 0,
      memory_count: (report.metadata as any)?.memory_count ?? 0,
      ...(report.metadata as object ?? {})
    }
  })) as DailyReport[];
}

/**
 * Marks a daily report as read
 */
export async function markReportAsRead(supabase: SupabaseClient<Database>, reportId: number): Promise<boolean> {
  const { error } = await supabase
    .from('daily_reports')
    .update({ read_at: new Date().toISOString() })
    .eq('id', reportId);
  
  if (error) {
    console.error('Error marking report as read:', error);
    return false;
  }
  
  return true;
}

/**
 * Generates a new daily report for a user manually
 */
export async function generateDailyReport(userId: string): Promise<DailyReport | null> {
  try {
    const response = await fetch('/api/daily-report/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
      console.error('Error response from /api/daily-report/generate:', errorData);
      throw new Error(errorData.message || 'Failed to generate daily report from API');
    }
    
    const data = await response.json();
    return data.report as DailyReport | null;
  } catch (error) {
    console.error('Error in generateDailyReport function:', error);
    return null;
  }
}

/**
 * Fetches daily report statistics for a user
 * 
 * @param userId The user ID to fetch statistics for
 * @returns Statistics about the user's daily reports
 */
export async function getDailyReportStats(supabase: SupabaseClient<Database>, userId: string): Promise<{
  total: number,
  delivered: number,
  firstReportDate: string | null,
  lastReportDate: string | null
}> {
  const { count: total, error: countError } = await supabase
    .from('daily_reports')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  
  const { count: delivered, error: deliveredError } = await supabase
    .from('daily_reports')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('delivered', true);
  
  const { data: firstDateData, error: firstDateError } = await supabase
    .from('daily_reports')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  
  const { data: lastDateData, error: lastDateError } = await supabase
    .from('daily_reports')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (countError || deliveredError || firstDateError || lastDateError) {
    console.error('Error fetching report stats:', 
      countError || deliveredError || firstDateError || lastDateError);
  }
  
  return {
    total: total || 0,
    delivered: delivered || 0,
    firstReportDate: firstDateData && firstDateData.length > 0 ? firstDateData[0].created_at : null,
    lastReportDate: lastDateData && lastDateData.length > 0 ? lastDateData[0].created_at : null
  }
} 