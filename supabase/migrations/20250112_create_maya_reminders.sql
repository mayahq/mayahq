-- Maya Reminders System Migration
-- This creates the foundational tables for Maya's intelligent reminder system

-- Main reminders table
CREATE TABLE maya_reminders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    
    -- Timing
    remind_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Reminder type and behavior
    reminder_type TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'pattern', 'context', 'relationship'
    priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'acknowledged', 'dismissed', 'snoozed'
    sent_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    snoozed_until TIMESTAMPTZ,
    
    -- Smart reminder metadata
    metadata JSONB DEFAULT '{}', -- stores pattern data, context, conversation refs, etc.
    
    -- Recurrence (if applicable)
    rrule TEXT, -- RFC 5545 RRULE for recurring reminders
    
    -- Source tracking
    source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    source_room_id UUID,
    
    -- Constraints
    CONSTRAINT check_remind_at_future CHECK (remind_at > created_at),
    CONSTRAINT check_valid_type CHECK (reminder_type IN ('manual', 'pattern', 'context', 'relationship')),
    CONSTRAINT check_valid_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    CONSTRAINT check_valid_status CHECK (status IN ('pending', 'sent', 'acknowledged', 'dismissed', 'snoozed'))
);

-- Pattern analysis table for smart reminders
CREATE TABLE maya_reminder_patterns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Pattern identification
    pattern_type TEXT NOT NULL, -- 'weekly_stress_check', 'work_late_thursday', 'milestone_celebration', etc.
    pattern_name TEXT NOT NULL,
    description TEXT,
    
    -- Pattern data
    confidence_score DECIMAL(3,2) DEFAULT 0.00, -- 0.00 to 1.00
    occurrences INTEGER DEFAULT 1,
    last_triggered TIMESTAMPTZ,
    
    -- Pattern configuration
    trigger_conditions JSONB DEFAULT '{}', -- conditions that trigger this pattern
    reminder_template JSONB DEFAULT '{}', -- template for generating reminders
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    
    CONSTRAINT check_confidence_range CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00)
);

-- Reminder delivery tracking
CREATE TABLE maya_reminder_deliveries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reminder_id UUID NOT NULL REFERENCES maya_reminders(id) ON DELETE CASCADE,
    
    -- Delivery method and status
    delivery_method TEXT NOT NULL, -- 'push', 'message', 'email'
    delivery_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
    
    -- Timing
    attempted_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    
    -- Response tracking
    user_response TEXT, -- 'acknowledged', 'dismissed', 'snoozed'
    response_at TIMESTAMPTZ,
    
    -- Metadata
    delivery_metadata JSONB DEFAULT '{}', -- push token, message ID, etc.
    error_message TEXT,
    
    CONSTRAINT check_valid_delivery_method CHECK (delivery_method IN ('push', 'message', 'email')),
    CONSTRAINT check_valid_delivery_status CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed'))
);

-- Context tracking for smart reminders
CREATE TABLE maya_reminder_contexts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Context identification
    context_type TEXT NOT NULL, -- 'stress_level', 'work_pattern', 'conversation_topic', 'milestone'
    context_key TEXT NOT NULL, -- specific identifier for this context
    context_value JSONB NOT NULL, -- the actual context data
    
    -- Timing and relevance
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    relevance_score DECIMAL(3,2) DEFAULT 0.50,
    expires_at TIMESTAMPTZ, -- when this context becomes irrelevant
    
    -- Source
    source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    source_room_id UUID,
    
    CONSTRAINT check_relevance_range CHECK (relevance_score >= 0.00 AND relevance_score <= 1.00)
);

-- Create indexes for performance
CREATE INDEX idx_maya_reminders_user_id ON maya_reminders(user_id);
CREATE INDEX idx_maya_reminders_status ON maya_reminders(status);
CREATE INDEX idx_maya_reminders_remind_at ON maya_reminders(remind_at);
CREATE INDEX idx_maya_reminders_type ON maya_reminders(reminder_type);
CREATE INDEX idx_maya_reminders_pending_reminders ON maya_reminders(user_id, status, remind_at) 
    WHERE status IN ('pending', 'snoozed');

CREATE INDEX idx_maya_reminder_patterns_user_id ON maya_reminder_patterns(user_id);
CREATE INDEX idx_maya_reminder_patterns_type ON maya_reminder_patterns(pattern_type);
CREATE INDEX idx_maya_reminder_patterns_active ON maya_reminder_patterns(user_id, is_active, confidence_score);

CREATE INDEX idx_maya_reminder_deliveries_reminder_id ON maya_reminder_deliveries(reminder_id);
CREATE INDEX idx_maya_reminder_deliveries_status ON maya_reminder_deliveries(delivery_status);

CREATE INDEX idx_maya_reminder_contexts_user_id ON maya_reminder_contexts(user_id);
CREATE INDEX idx_maya_reminder_contexts_type ON maya_reminder_contexts(context_type);
CREATE INDEX idx_maya_reminder_contexts_expires ON maya_reminder_contexts(expires_at) WHERE expires_at IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE maya_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE maya_reminder_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE maya_reminder_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE maya_reminder_contexts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can manage their own reminders" ON maya_reminders
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own patterns" ON maya_reminder_patterns
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view deliveries for their reminders" ON maya_reminder_deliveries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM maya_reminders 
            WHERE maya_reminders.id = maya_reminder_deliveries.reminder_id 
            AND maya_reminders.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage their own contexts" ON maya_reminder_contexts
    FOR ALL USING (auth.uid() = user_id);

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_maya_reminders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_maya_reminder_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER maya_reminders_updated_at
    BEFORE UPDATE ON maya_reminders
    FOR EACH ROW
    EXECUTE FUNCTION update_maya_reminders_updated_at();

CREATE TRIGGER maya_reminder_patterns_updated_at
    BEFORE UPDATE ON maya_reminder_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_maya_reminder_patterns_updated_at();

-- Function to get pending reminders for processing
CREATE OR REPLACE FUNCTION get_pending_reminders(check_time TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (
    reminder_id UUID,
    user_id UUID,
    title TEXT,
    content TEXT,
    remind_at TIMESTAMPTZ,
    reminder_type TEXT,
    priority TEXT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.user_id,
        r.title,
        r.content,
        r.remind_at,
        r.reminder_type,
        r.priority,
        r.metadata
    FROM maya_reminders r
    WHERE r.status = 'pending' 
        AND r.remind_at <= check_time
        OR (r.status = 'snoozed' AND r.snoozed_until <= check_time)
    ORDER BY r.priority DESC, r.remind_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to mark reminder as sent
CREATE OR REPLACE FUNCTION mark_reminder_sent(reminder_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE maya_reminders 
    SET status = 'sent', sent_at = NOW()
    WHERE id = reminder_uuid AND status IN ('pending', 'snoozed');
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Add some helpful comments
COMMENT ON TABLE maya_reminders IS 'Main table for Maya''s intelligent reminder system';
COMMENT ON TABLE maya_reminder_patterns IS 'Learned patterns for generating smart reminders based on user behavior';
COMMENT ON TABLE maya_reminder_deliveries IS 'Tracking delivery attempts and user responses to reminders';
COMMENT ON TABLE maya_reminder_contexts IS 'Context data used for generating smart, situational reminders'; 