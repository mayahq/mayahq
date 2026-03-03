-- Create calendar_events table
CREATE TABLE calendar_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN DEFAULT FALSE,
    rrule TEXT, -- RFC 5545 RRULE string for recurring events
    timezone TEXT DEFAULT 'UTC',
    location TEXT,
    metadata JSONB DEFAULT '{}', -- Maya-specific metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_calendar_events_owner_id ON calendar_events(owner_id);
CREATE INDEX idx_calendar_events_starts_at ON calendar_events(starts_at);
CREATE INDEX idx_calendar_events_ends_at ON calendar_events(ends_at);
CREATE INDEX idx_calendar_events_title ON calendar_events USING gin(to_tsvector('english', title));
CREATE INDEX idx_calendar_events_metadata ON calendar_events USING gin(metadata);

-- Create a compound index for common queries
CREATE INDEX idx_calendar_events_owner_date_range ON calendar_events(owner_id, starts_at, ends_at);

-- Add check constraints
ALTER TABLE calendar_events ADD CONSTRAINT check_ends_after_starts 
    CHECK (ends_at > starts_at);

-- Enable Row Level Security
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own calendar events" ON calendar_events
    FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own calendar events" ON calendar_events
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own calendar events" ON calendar_events
    FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own calendar events" ON calendar_events
    FOR DELETE USING (auth.uid() = owner_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_calendar_events_updated_at();

-- Create function to validate RRULE format (basic validation)
CREATE OR REPLACE FUNCTION validate_rrule(rrule_text TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Basic RRULE validation - check if it starts with FREQ=
    IF rrule_text IS NULL THEN
        RETURN TRUE;
    END IF;
    
    RETURN rrule_text ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)';
END;
$$ LANGUAGE plpgsql;

-- Add RRULE validation constraint
ALTER TABLE calendar_events ADD CONSTRAINT check_valid_rrule 
    CHECK (validate_rrule(rrule));

-- Create calendar_event_reminders table for future reminder functionality
CREATE TABLE calendar_event_reminders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    reminder_minutes INTEGER NOT NULL, -- Minutes before event to remind
    reminder_type TEXT NOT NULL DEFAULT 'notification', -- 'notification', 'email', 'sms'
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for reminders
CREATE INDEX idx_calendar_event_reminders_event_id ON calendar_event_reminders(event_id);
CREATE INDEX idx_calendar_event_reminders_sent_at ON calendar_event_reminders(sent_at);

-- RLS for reminders
ALTER TABLE calendar_event_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage reminders for their events" ON calendar_event_reminders
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM calendar_events 
            WHERE calendar_events.id = calendar_event_reminders.event_id 
            AND calendar_events.owner_id = auth.uid()
        )
    );

-- Create function to generate ICS secret tokens for users
CREATE TABLE calendar_ics_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    name TEXT, -- Optional name for the calendar feed
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed TIMESTAMPTZ
);

-- Index for ICS tokens
CREATE INDEX idx_calendar_ics_tokens_user_id ON calendar_ics_tokens(user_id);
CREATE INDEX idx_calendar_ics_tokens_token ON calendar_ics_tokens(token);

-- RLS for ICS tokens
ALTER TABLE calendar_ics_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own ICS tokens" ON calendar_ics_tokens
    FOR ALL USING (auth.uid() = user_id);

-- Function to generate a random token
CREATE OR REPLACE FUNCTION generate_ics_token()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to create default ICS token for a user
CREATE OR REPLACE FUNCTION create_default_ics_token(user_uuid UUID)
RETURNS TEXT AS $$
DECLARE
    new_token TEXT;
BEGIN
    new_token := generate_ics_token();
    
    INSERT INTO calendar_ics_tokens (user_id, token, name)
    VALUES (user_uuid, new_token, 'Default Maya Calendar');
    
    RETURN new_token;
END;
$$ LANGUAGE plpgsql;

-- Create system logs table for calendar operations (if it doesn't exist)
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add some sample calendar event types that Maya agents might create
COMMENT ON TABLE calendar_events IS 'Calendar events for Maya HQ with support for recurring events and AI-generated metadata';
COMMENT ON COLUMN calendar_events.metadata IS 'JSONB field for Maya-specific metadata like mood, priority, energy_level, workflow_hooks, etc.'; 