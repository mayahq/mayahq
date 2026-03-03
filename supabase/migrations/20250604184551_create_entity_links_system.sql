-- Entity Links System Migration
-- This creates the tables and functions for linking entities across Maya's system

-- First, extend the relationship_type enum with linking values
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'creates';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'spawns';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'references';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'blocks_for';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'reminds_about';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'follows_up';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'depends_on';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'similar_to';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'part_of';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'context_for';

-- Create entity_links table for polymorphic linking between entities
CREATE TABLE IF NOT EXISTS entity_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_entity_type TEXT NOT NULL CHECK (source_entity_type IN ('message', 'task', 'reminder', 'calendar_event')),
    source_entity_id TEXT NOT NULL,
    target_entity_type TEXT NOT NULL CHECK (target_entity_type IN ('message', 'task', 'reminder', 'calendar_event')),
    target_entity_id TEXT NOT NULL,
    link_type relationship_type NOT NULL,
    context TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    
    -- Ensure we don't create duplicate links
    UNIQUE(source_entity_type, source_entity_id, target_entity_type, target_entity_id, link_type)
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_entity_links_source ON entity_links(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_target ON entity_links(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_type ON entity_links(link_type);
CREATE INDEX IF NOT EXISTS idx_entity_links_created_at ON entity_links(created_at);

-- Function to create entity links with validation
CREATE OR REPLACE FUNCTION create_entity_link(
    p_source_entity_type TEXT,
    p_source_entity_id TEXT,
    p_target_entity_type TEXT,
    p_target_entity_id TEXT,
    p_link_type relationship_type,
    p_context TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    link_id UUID;
BEGIN
    -- Validate entity types
    IF p_source_entity_type NOT IN ('message', 'task', 'reminder', 'calendar_event') THEN
        RAISE EXCEPTION 'Invalid source entity type: %', p_source_entity_type;
    END IF;
    
    IF p_target_entity_type NOT IN ('message', 'task', 'reminder', 'calendar_event') THEN
        RAISE EXCEPTION 'Invalid target entity type: %', p_target_entity_type;
    END IF;
    
    -- Insert the link
    INSERT INTO entity_links (
        source_entity_type,
        source_entity_id,
        target_entity_type,
        target_entity_id,
        link_type,
        context,
        metadata,
        created_by
    ) VALUES (
        p_source_entity_type,
        p_source_entity_id,
        p_target_entity_type,
        p_target_entity_id,
        p_link_type,
        p_context,
        p_metadata,
        auth.uid()
    )
    ON CONFLICT (source_entity_type, source_entity_id, target_entity_type, target_entity_id, link_type)
    DO UPDATE SET
        context = EXCLUDED.context,
        metadata = EXCLUDED.metadata,
        created_at = NOW()
    RETURNING id INTO link_id;
    
    RETURN link_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all links for an entity (bidirectional)
CREATE OR REPLACE FUNCTION get_entity_links(
    p_entity_type TEXT,
    p_entity_id TEXT
) RETURNS TABLE (
    link_id UUID,
    source_entity_type TEXT,
    source_entity_id TEXT,
    target_entity_type TEXT,
    target_entity_id TEXT,
    link_type relationship_type,
    context TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        el.id,
        el.source_entity_type,
        el.source_entity_id,
        el.target_entity_type,
        el.target_entity_id,
        el.link_type,
        el.context,
        el.metadata,
        el.created_at
    FROM entity_links el
    WHERE 
        (el.source_entity_type = p_entity_type AND el.source_entity_id = p_entity_id)
        OR 
        (el.target_entity_type = p_entity_type AND el.target_entity_id = p_entity_id)
    ORDER BY el.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find related entities with enriched data
CREATE OR REPLACE FUNCTION find_related_entities(
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_relationship_types relationship_type[] DEFAULT NULL
) RETURNS TABLE (
    link_id UUID,
    link_type relationship_type,
    link_context TEXT,
    entity_type TEXT,
    entity_id TEXT,
    entity_data JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    WITH entity_links_expanded AS (
        SELECT 
            el.id as link_id,
            el.link_type,
            el.context as link_context,
            el.created_at,
            CASE 
                WHEN el.source_entity_type = p_entity_type AND el.source_entity_id = p_entity_id 
                THEN el.target_entity_type 
                ELSE el.source_entity_type 
            END as related_entity_type,
            CASE 
                WHEN el.source_entity_type = p_entity_type AND el.source_entity_id = p_entity_id 
                THEN el.target_entity_id 
                ELSE el.source_entity_id 
            END as related_entity_id
        FROM entity_links el
        WHERE 
            (el.source_entity_type = p_entity_type AND el.source_entity_id = p_entity_id)
            OR 
            (el.target_entity_type = p_entity_type AND el.target_entity_id = p_entity_id)
            AND (p_relationship_types IS NULL OR el.link_type = ANY(p_relationship_types))
    )
    SELECT 
        ele.link_id,
        ele.link_type,
        ele.link_context,
        ele.related_entity_type,
        ele.related_entity_id,
        CASE 
            WHEN ele.related_entity_type = 'message' THEN
                (SELECT to_jsonb(m) FROM messages m WHERE m.id::text = ele.related_entity_id LIMIT 1)
            WHEN ele.related_entity_type = 'task' THEN
                (SELECT to_jsonb(t) FROM tasks t WHERE t.id::text = ele.related_entity_id LIMIT 1)
            WHEN ele.related_entity_type = 'reminder' THEN
                (SELECT to_jsonb(r) FROM maya_reminders r WHERE r.id::text = ele.related_entity_id LIMIT 1)
            WHEN ele.related_entity_type = 'calendar_event' THEN
                (SELECT to_jsonb(ce) FROM calendar_events ce WHERE ce.id::text = ele.related_entity_id LIMIT 1)
            ELSE NULL
        END as entity_data,
        ele.created_at
    FROM entity_links_expanded ele
    ORDER BY ele.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a view for enriched entity links (optional, for easier querying)
CREATE OR REPLACE VIEW enriched_entity_links AS
SELECT 
    el.id,
    el.source_entity_type,
    el.source_entity_id,
    el.target_entity_type,
    el.target_entity_id,
    el.link_type,
    el.context,
    el.metadata,
    el.created_at,
    el.created_by,
    
    -- Source entity data
    CASE 
        WHEN el.source_entity_type = 'message' THEN
            (SELECT to_jsonb(m) FROM messages m WHERE m.id::text = el.source_entity_id LIMIT 1)
        WHEN el.source_entity_type = 'task' THEN
            (SELECT to_jsonb(t) FROM tasks t WHERE t.id::text = el.source_entity_id LIMIT 1)
        WHEN el.source_entity_type = 'reminder' THEN
            (SELECT to_jsonb(r) FROM maya_reminders r WHERE r.id::text = el.source_entity_id LIMIT 1)
        WHEN el.source_entity_type = 'calendar_event' THEN
            (SELECT to_jsonb(ce) FROM calendar_events ce WHERE ce.id::text = el.source_entity_id LIMIT 1)
        ELSE NULL
    END as source_entity_data,
    
    -- Target entity data
    CASE 
        WHEN el.target_entity_type = 'message' THEN
            (SELECT to_jsonb(m) FROM messages m WHERE m.id::text = el.target_entity_id LIMIT 1)
        WHEN el.target_entity_type = 'task' THEN
            (SELECT to_jsonb(t) FROM tasks t WHERE t.id::text = el.target_entity_id LIMIT 1)
        WHEN el.target_entity_type = 'reminder' THEN
            (SELECT to_jsonb(r) FROM maya_reminders r WHERE r.id::text = el.target_entity_id LIMIT 1)
        WHEN el.target_entity_type = 'calendar_event' THEN
            (SELECT to_jsonb(ce) FROM calendar_events ce WHERE ce.id::text = el.target_entity_id LIMIT 1)
        ELSE NULL
    END as target_entity_data
    
FROM entity_links el;

-- Enable RLS on entity_links table
ALTER TABLE entity_links ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for entity_links
CREATE POLICY "Users can view their own entity links" ON entity_links
    FOR SELECT USING (
        -- Check if user owns the source entity
        (CASE 
            WHEN source_entity_type = 'message' THEN
                EXISTS(SELECT 1 FROM messages WHERE id::text = source_entity_id AND user_id = auth.uid())
            WHEN source_entity_type = 'task' THEN
                EXISTS(SELECT 1 FROM tasks WHERE id::text = source_entity_id AND user_id = auth.uid())
            WHEN source_entity_type = 'reminder' THEN
                EXISTS(SELECT 1 FROM maya_reminders WHERE id::text = source_entity_id AND user_id = auth.uid())
            WHEN source_entity_type = 'calendar_event' THEN
                EXISTS(SELECT 1 FROM calendar_events WHERE id::text = source_entity_id AND created_by = auth.uid())
            ELSE FALSE
        END)
        OR
        -- Check if user owns the target entity
        (CASE 
            WHEN target_entity_type = 'message' THEN
                EXISTS(SELECT 1 FROM messages WHERE id::text = target_entity_id AND user_id = auth.uid())
            WHEN target_entity_type = 'task' THEN
                EXISTS(SELECT 1 FROM tasks WHERE id::text = target_entity_id AND user_id = auth.uid())
            WHEN target_entity_type = 'reminder' THEN
                EXISTS(SELECT 1 FROM maya_reminders WHERE id::text = target_entity_id AND user_id = auth.uid())
            WHEN target_entity_type = 'calendar_event' THEN
                EXISTS(SELECT 1 FROM calendar_events WHERE id::text = target_entity_id AND created_by = auth.uid())
            ELSE FALSE
        END)
    );

CREATE POLICY "Users can create entity links for their own entities" ON entity_links
    FOR INSERT WITH CHECK (
        -- User must own both source and target entities
        (CASE 
            WHEN source_entity_type = 'message' THEN
                EXISTS(SELECT 1 FROM messages WHERE id::text = source_entity_id AND user_id = auth.uid())
            WHEN source_entity_type = 'task' THEN
                EXISTS(SELECT 1 FROM tasks WHERE id::text = source_entity_id AND user_id = auth.uid())
            WHEN source_entity_type = 'reminder' THEN
                EXISTS(SELECT 1 FROM maya_reminders WHERE id::text = source_entity_id AND user_id = auth.uid())
            WHEN source_entity_type = 'calendar_event' THEN
                EXISTS(SELECT 1 FROM calendar_events WHERE id::text = source_entity_id AND created_by = auth.uid())
            ELSE FALSE
        END)
        AND
        (CASE 
            WHEN target_entity_type = 'message' THEN
                EXISTS(SELECT 1 FROM messages WHERE id::text = target_entity_id AND user_id = auth.uid())
            WHEN target_entity_type = 'task' THEN
                EXISTS(SELECT 1 FROM tasks WHERE id::text = target_entity_id AND user_id = auth.uid())
            WHEN target_entity_type = 'reminder' THEN
                EXISTS(SELECT 1 FROM maya_reminders WHERE id::text = target_entity_id AND user_id = auth.uid())
            WHEN target_entity_type = 'calendar_event' THEN
                EXISTS(SELECT 1 FROM calendar_events WHERE id::text = target_entity_id AND created_by = auth.uid())
            ELSE FALSE
        END)
    );

CREATE POLICY "Users can delete their own entity links" ON entity_links
    FOR DELETE USING (created_by = auth.uid());

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, DELETE ON entity_links TO authenticated;
GRANT EXECUTE ON FUNCTION create_entity_link TO authenticated;
GRANT EXECUTE ON FUNCTION get_entity_links TO authenticated;
GRANT EXECUTE ON FUNCTION find_related_entities TO authenticated;
GRANT SELECT ON enriched_entity_links TO authenticated;
