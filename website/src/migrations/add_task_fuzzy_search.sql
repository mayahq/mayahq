-- Enable pg_trgm for fast ILIKE/fuzzy search
create extension if not exists pg_trgm;

-- Create index on tasks.content for fast text search
create index if not exists tasks_content_trgm_idx
  on tasks using gin (content gin_trgm_ops);

-- Function to find tasks using fuzzy matching
create or replace function find_tasks_fuzzy(p_user_id text, p_query text)
returns table(id integer, content text, status text, priority text, due_at timestamptz, rank real)
language sql as $$
  select 
    id, 
    content, 
    status, 
    priority,
    due_at,
    similarity(content, p_query) as rank
  from tasks
  where user_id = p_user_id and status != 'done'
  order by rank desc, created_at desc
  limit 5;
$$;

-- Function to get the most recently created task for a user
create or replace function get_most_recent_task(p_user_id text)
returns table(id integer, content text, status text, priority text, due_at timestamptz)
language sql as $$
  select 
    id, 
    content, 
    status, 
    priority,
    due_at
  from tasks
  where user_id = p_user_id
  order by created_at desc
  limit 1;
$$; 