import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!,
);

export type Task = { 
  id: number; 
  content: string; 
  status: string; 
  priority?: string; 
  due_at?: string; 
  tags?: string[]; 
  created_at: string; 
  updated_at?: string; 
};

export type Memory = { 
  id: number; 
  content: any; 
  tags?: string[]; 
  metadata?: any; 
  created_at: string; 
};

export type CoreFact = { 
  id: string;
  user_id: string;
  subject: string; 
  predicate: string; 
  object: string;
  weight: number;
  active: boolean;
};

export const db = {
  tasks: (uid: string) => 
    sb.from('tasks')
      .select('*')
      .eq('user_id', uid)
      .in('status', ['open', 'done'])
      .order('created_at', { ascending: false }),
      
  facts: (uid: string) => 
    sb.from('maya_core_facts')
      .select('*')
      .eq('user_id', uid)
      .eq('active', true),
      
  newestMem: (n = 3) => 
    sb.from('maya_memories')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(n),
      
  matchDocs: (emb: number[], uid: string) => 
    sb.rpc('match_documents', {
      query_embedding: emb,
      match_count: 3,
      filter: { userId: uid }
    }),
    
  saveReport: (uid: string, date: string, md: string) => 
    sb.from('daily_reports')
      .upsert(
        { 
          user_id: uid, 
          report_date: date, 
          content: md, 
          report_text: md 
        },
        { onConflict: 'user_id,report_date' }
      )
      .select('id')
      .single(),
};

export default sb; 