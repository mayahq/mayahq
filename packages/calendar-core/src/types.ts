import { z } from 'zod';

// Base calendar event schema
export const CalendarEventSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  starts_at: z.string().datetime(), // ISO 8601 string
  ends_at: z.string().datetime(),
  all_day: z.boolean().default(false),
  rrule: z.string().optional(), // RFC 5545 RRULE string
  timezone: z.string().default('UTC'),
  location: z.string().optional(),
  metadata: z.record(z.any()).optional(), // Maya-specific metadata
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

// Maya-specific metadata types
export const MayaEventMetadataSchema = z.object({
  mood: z.enum(['work', 'personal', 'family', 'health', 'creative', 'social']).optional(),
  energy_level: z.enum(['low', 'medium', 'high']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  workflow_hooks: z.array(z.object({
    trigger: z.enum(['before_event', 'during_event', 'after_event']),
    action: z.string(),
    params: z.record(z.any()).optional(),
  })).optional(),
  ai_generated: z.boolean().default(false),
  source_system: z.string().optional(), // e.g., 'maya-agent', 'google-calendar', 'manual'
  tags: z.array(z.string()).optional(),
  attendees: z.array(z.object({
    email: z.string().email(),
    name: z.string().optional(),
    status: z.enum(['pending', 'accepted', 'declined', 'tentative']).optional(),
  })).optional(),
});

export type MayaEventMetadata = z.infer<typeof MayaEventMetadataSchema>;

// Event creation/update schemas
export const CreateCalendarEventSchema = CalendarEventSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const UpdateCalendarEventSchema = CreateCalendarEventSchema.partial();

export type CreateCalendarEvent = z.infer<typeof CreateCalendarEventSchema>;
export type UpdateCalendarEvent = z.infer<typeof UpdateCalendarEventSchema>;

// Recurrence utilities
export interface RecurrenceOptions {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval?: number;
  count?: number;
  until?: Date;
  byweekday?: number[];
  bymonthday?: number[];
  bymonth?: number[];
}

// Calendar view types
export type CalendarView = 'day' | 'week' | 'month' | 'year' | 'agenda';

export interface CalendarViewOptions {
  start: Date;
  end: Date;
  timezone?: string;
}

// ICS export options
export interface ICSOptions {
  calendarName?: string;
  description?: string;
  timezone?: string;
  includeMetadata?: boolean;
}

// Event query filters
export interface EventFilters {
  start_date?: string;
  end_date?: string;
  tags?: string[];
  mood?: MayaEventMetadata['mood'];
  priority?: MayaEventMetadata['priority'];
  source_system?: string;
  search?: string;
} 