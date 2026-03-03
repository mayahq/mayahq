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

-- Entity links table for connecting any entities (messages, tasks, reminders, calendar events)
CREATE TABLE entity_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Source entity (the one that creates/references the target)
    source_entity_type TEXT NOT NULL, -- 'message', 'task', 'reminder', 'calendar_event'
    source_entity_id TEXT NOT NULL, -- UUID or integer as string
    
    -- Target entity (the one being referenced)
    target_entity_type TEXT NOT NULL, -- 'message', 'task', 'reminder', 'calendar_event'
    target_entity_id TEXT NOT NULL, -- UUID or integer as string
    
    -- Relationship details
    link_type relationship_type NOT NULL, -- 'creates', 'spawns', 'references', etc.
    context TEXT, -- optional description of the relationship
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Ensure we don't have duplicate links
    CONSTRAINT unique_entity_link UNIQUE (source_entity_type, source_entity_id, target_entity_type, target_entity_id, link_type),
    
    -- Valid entity types
    CONSTRAINT check_valid_source_entity_type CHECK (source_entity_type IN ('message', 'task', 'reminder', 'calendar_event')),
    CONSTRAINT check_valid_target_entity_type CHECK (target_entity_type IN ('message', 'task', 'reminder', 'calendar_event'))
);

-- Indexes for performance
CREATE INDEX idx_entity_links_source ON entity_links(source_entity_type, source_entity_id);
CREATE INDEX idx_entity_links_target ON entity_links(target_entity_type, target_entity_id);
CREATE INDEX idx_entity_links_type ON entity_links(link_type);
CREATE INDEX idx_entity_links_created_at ON entity_links(created_at);

-- Enable Row Level Security
ALTER TABLE entity_links ENABLE ROW LEVEL SECURITY;

-- RLS Policy - users can only see links involving their own entities
CREATE POLICY "Users can manage links for their own entities" ON entity_links
    FOR ALL USING (
        -- Check if user owns the source entity
        (source_entity_type = 'message' AND EXISTS (
            SELECT 1 FROM messages WHERE id::TEXT = source_entity_id AND user_id = auth.uid()
        )) OR
        (source_entity_type = 'task' AND EXISTS (
            SELECT 1 FROM tasks WHERE id::TEXT = source_entity_id AND user_id = auth.uid()
        )) OR
        (source_entity_type = 'reminder' AND EXISTS (
            SELECT 1 FROM maya_reminders WHERE id::TEXT = source_entity_id AND user_id = auth.uid()
        )) OR
        (source_entity_type = 'calendar_event' AND EXISTS (
            SELECT 1 FROM calendar_events WHERE id::TEXT = source_entity_id AND created_by = auth.uid()::TEXT
        )) OR
        -- Check if user owns the target entity
        (target_entity_type = 'message' AND EXISTS (
            SELECT 1 FROM messages WHERE id::TEXT = target_entity_id AND user_id = auth.uid()
        )) OR
        (target_entity_type = 'task' AND EXISTS (
            SELECT 1 FROM tasks WHERE id::TEXT = target_entity_id AND user_id = auth.uid()
        )) OR
        (target_entity_type = 'reminder' AND EXISTS (
            SELECT 1 FROM maya_reminders WHERE id::TEXT = target_entity_id AND user_id = auth.uid()
        )) OR
        (target_entity_type = 'calendar_event' AND EXISTS (
            SELECT 1 FROM calendar_events WHERE id::TEXT = target_entity_id AND created_by = auth.uid()::TEXT
        ))
    );

-- Function to create an entity link
CREATE OR REPLACE FUNCTION create_entity_link(
    p_source_entity_type TEXT,
    p_source_entity_id TEXT,
    p_target_entity_type TEXT,
    p_target_entity_id TEXT,
    p_link_type relationship_type,
    p_context TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_link_id UUID;
BEGIN
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
    ) RETURNING id INTO v_link_id;
    
    RETURN v_link_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all links for an entity (bidirectional)
CREATE OR REPLACE FUNCTION get_entity_links(
    p_entity_type TEXT,
    p_entity_id TEXT
)
RETURNS TABLE (
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
    WHERE (el.source_entity_type = p_entity_type AND el.source_entity_id = p_entity_id)
       OR (el.target_entity_type = p_entity_type AND el.target_entity_id = p_entity_id)
    ORDER BY el.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find related entities with their full data
CREATE OR REPLACE FUNCTION find_related_entities(
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_relationship_types relationship_type[] DEFAULT NULL
)
RETURNS TABLE (
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
    SELECT 
        el.id,
        el.link_type,
        el.context,
        CASE 
            WHEN el.source_entity_type = p_entity_type AND el.source_entity_id = p_entity_id 
            THEN el.target_entity_type
            ELSE el.source_entity_type
        END as related_entity_type,
        CASE 
            WHEN el.source_entity_type = p_entity_type AND el.source_entity_id = p_entity_id 
            THEN el.target_entity_id
            ELSE el.source_entity_id
        END as related_entity_id,
        CASE 
            WHEN el.source_entity_type = p_entity_type AND el.source_entity_id = p_entity_id 
            THEN 
                CASE el.target_entity_type
                    WHEN 'message' THEN (
                        SELECT jsonb_build_object(
                            'id', m.id,
                            'content', m.content,
                            'role', m.role,
                            'created_at', m.created_at,
                            'room_id', m.room_id
                        ) FROM messages m WHERE m.id::TEXT = el.target_entity_id
                    )
                    WHEN 'task' THEN (
                        SELECT jsonb_build_object(
                            'id', t.id,
                            'content', t.content,
                            'status', t.status,
                            'priority', t.priority,
                            'due_at', t.due_at,
                            'created_at', t.created_at
                        ) FROM tasks t WHERE t.id::TEXT = el.target_entity_id
                    )
                    WHEN 'reminder' THEN (
                        SELECT jsonb_build_object(
                            'id', r.id,
                            'title', r.title,
                            'content', r.content,
                            'remind_at', r.remind_at,
                            'status', r.status,
                            'priority', r.priority,
                            'created_at', r.created_at
                        ) FROM maya_reminders r WHERE r.id::TEXT = el.target_entity_id
                    )
                    WHEN 'calendar_event' THEN (
                        SELECT jsonb_build_object(
                            'id', c.id,
                            'title', c.title,
                            'description', c.description,
                            'start_time', c.start_time,
                            'end_time', c.end_time,
                            'created_at', c.created_at
                        ) FROM calendar_events c WHERE c.id::TEXT = el.target_entity_id
                    )
                END
            ELSE 
                CASE el.source_entity_type
                    WHEN 'message' THEN (
                        SELECT jsonb_build_object(
                            'id', m.id,
                            'content', m.content,
                            'role', m.role,
                            'created_at', m.created_at,
                            'room_id', m.room_id
                        ) FROM messages m WHERE m.id::TEXT = el.source_entity_id
                    )
                    WHEN 'task' THEN (
                        SELECT jsonb_build_object(
                            'id', t.id,
                            'content', t.content,
                            'status', t.status,
                            'priority', t.priority,
                            'due_at', t.due_at,
                            'created_at', t.created_at
                        ) FROM tasks t WHERE t.id::TEXT = el.source_entity_id
                    )
                    WHEN 'reminder' THEN (
                        SELECT jsonb_build_object(
                            'id', r.id,
                            'title', r.title,
                            'content', r.content,
                            'remind_at', r.remind_at,
                            'status', r.status,
                            'priority', r.priority,
                            'created_at', r.created_at
                        ) FROM maya_reminders r WHERE r.id::TEXT = el.source_entity_id
                    )
                    WHEN 'calendar_event' THEN (
                        SELECT jsonb_build_object(
                            'id', c.id,
                            'title', c.title,
                            'description', c.description,
                            'start_time', c.start_time,
                            'end_time', c.end_time,
                            'created_at', c.created_at
                        ) FROM calendar_events c WHERE c.id::TEXT = el.source_entity_id
                    )
                END
        END as entity_data,
        el.created_at
    FROM entity_links el
    WHERE (el.source_entity_type = p_entity_type AND el.source_entity_id = p_entity_id)
       OR (el.target_entity_type = p_entity_type AND el.target_entity_id = p_entity_id)
       AND (p_relationship_types IS NULL OR el.link_type = ANY(p_relationship_types))
    ORDER BY el.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create view for enriched entity links with full entity data
CREATE VIEW enriched_entity_links AS
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
    CASE el.source_entity_type
        WHEN 'message' THEN (
            SELECT jsonb_build_object(
                'id', m.id,
                'content', m.content,
                'role', m.role,
                'created_at', m.created_at,
                'room_id', m.room_id,
                'user_id', m.user_id
            ) FROM messages m WHERE m.id::TEXT = el.source_entity_id
        )
        WHEN 'task' THEN (
            SELECT jsonb_build_object(
                'id', t.id,
                'content', t.content,
                'status', t.status,
                'priority', t.priority,
                'due_at', t.due_at,
                'created_at', t.created_at,
                'user_id', t.user_id
            ) FROM tasks t WHERE t.id::TEXT = el.source_entity_id
        )
        WHEN 'reminder' THEN (
            SELECT jsonb_build_object(
                'id', r.id,
                'title', r.title,
                'content', r.content,
                'remind_at', r.remind_at,
                'status', r.status,
                'priority', r.priority,
                'created_at', r.created_at,
                'user_id', r.user_id
            ) FROM maya_reminders r WHERE r.id::TEXT = el.source_entity_id
        )
        WHEN 'calendar_event' THEN (
            SELECT jsonb_build_object(
                'id', c.id,
                'title', c.title,
                'description', c.description,
                'start_time', c.start_time,
                'end_time', c.end_time,
                'created_at', c.created_at,
                'created_by', c.created_by
            ) FROM calendar_events c WHERE c.id::TEXT = el.source_entity_id
        )
    END as source_entity_data,
    
    -- Target entity data
    CASE el.target_entity_type
        WHEN 'message' THEN (
            SELECT jsonb_build_object(
                'id', m.id,
                'content', m.content,
                'role', m.role,
                'created_at', m.created_at,
                'room_id', m.room_id,
                'user_id', m.user_id
            ) FROM messages m WHERE m.id::TEXT = el.target_entity_id
        )
        WHEN 'task' THEN (
            SELECT jsonb_build_object(
                'id', t.id,
                'content', t.content,
                'status', t.status,
                'priority', t.priority,
                'due_at', t.due_at,
                'created_at', t.created_at,
                'user_id', t.user_id
            ) FROM tasks t WHERE t.id::TEXT = el.target_entity_id
        )
        WHEN 'reminder' THEN (
            SELECT jsonb_build_object(
                'id', r.id,
                'title', r.title,
                'content', r.content,
                'remind_at', r.remind_at,
                'status', r.status,
                'priority', r.priority,
                'created_at', r.created_at,
                'user_id', r.user_id
            ) FROM maya_reminders r WHERE r.id::TEXT = el.target_entity_id
        )
        WHEN 'calendar_event' THEN (
            SELECT jsonb_build_object(
                'id', c.id,
                'title', c.title,
                'description', c.description,
                'start_time', c.start_time,
                'end_time', c.end_time,
                'created_at', c.created_at,
                'created_by', c.created_by
            ) FROM calendar_events c WHERE c.id::TEXT = el.target_entity_id
        )
    END as target_entity_data
FROM entity_links el;

-- Comments
COMMENT ON TABLE entity_links IS 'Links between different entity types (messages, tasks, reminders, calendar events)';
COMMENT ON FUNCTION create_entity_link IS 'Creates a new link between two entities';
COMMENT ON FUNCTION get_entity_links IS 'Gets all links for a specific entity (bidirectional)';
COMMENT ON FUNCTION find_related_entities IS 'Finds related entities with their full data';
COMMENT ON VIEW enriched_entity_links IS 'Entity links with full source and target entity data'; 