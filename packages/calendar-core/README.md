# @mayahq/calendar-core

A comprehensive calendar system for Maya HQ with support for recurring events, ICS export, and AI-generated metadata.

## Features

- ✅ **Full Calendar CRUD** - Create, read, update, delete events
- ✅ **Recurring Events** - RFC 5545 RRULE support with `rrule.js`
- ✅ **ICS Export** - Generate .ics files for Google Calendar, Apple Calendar, etc.
- ✅ **Maya Metadata** - Custom fields for mood, priority, energy level, tags
- ✅ **React Hooks** - Easy integration with React and React Native
- ✅ **TypeScript** - Full type safety with Zod validation
- ✅ **Timezone Support** - Built with Luxon for robust timezone handling
- ✅ **Supabase Integration** - Real-time updates and RLS security

## Installation

```bash
# Install the package (done automatically in the monorepo)
pnpm install @mayahq/calendar-core
```

## Quick Start

### 1. Database Setup

Run the Supabase migration to create the calendar tables:

```bash
cd supabase
npx supabase migration up
```

### 2. React Hook Usage

```tsx
import { useCalendarEvents } from '@mayahq/calendar-core/react';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';

function MyCalendar() {
  const supabase = useSupabaseClient();
  const user = useUser();
  
  const {
    events,
    loading,
    error,
    createEvent,
    updateEvent,
    deleteEvent
  } = useCalendarEvents({
    supabase,
    userId: user?.id || '',
    realtime: true
  });

  const handleCreateEvent = async () => {
    await createEvent({
      title: 'Team Meeting',
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 3600000).toISOString(),
      metadata: {
        mood: 'work',
        priority: 'high',
        ai_generated: false
      }
    });
  };

  return (
    <div>
      {events.map(event => (
        <div key={event.id}>
          <h3>{event.title}</h3>
          <p>{new Date(event.starts_at).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}
```

### 3. ICS Export

```tsx
import { useICSExport } from '@mayahq/calendar-core/react';

function CalendarExport() {
  const { exportToICS, downloadICS, createICSFeedUrl } = useICSExport();
  
  const handleExport = async () => {
    await downloadICS(events, 'my-calendar.ics', {
      calendarName: 'Maya Calendar',
      includeMetadata: true
    });
  };

  const feedUrl = createICSFeedUrl(
    'https://your-supabase-url.supabase.co/functions/v1',
    userId,
    'your-secret-token'
  );

  return (
    <div>
      <button onClick={handleExport}>Download Calendar</button>
      <p>Feed URL: {feedUrl}</p>
    </div>
  );
}
```

### 4. Recurring Events

```tsx
import { useEventGenerator, RRULE_PRESETS } from '@mayahq/calendar-core/react';

function RecurringEventCreator() {
  const { createRecurrenceRule, generateEventSeries } = useEventGenerator();
  
  const createWeeklyMeeting = () => {
    const startDate = new Date();
    const rrule = RRULE_PRESETS.weekly(startDate, 10); // 10 occurrences
    
    return createEvent({
      title: 'Weekly Standup',
      starts_at: startDate.toISOString(),
      ends_at: new Date(startDate.getTime() + 3600000).toISOString(),
      rrule
    });
  };
}
```

## API Reference

### Types

```typescript
interface CalendarEvent {
  id: string;
  owner_id: string;
  title: string;
  description?: string;
  starts_at: string; // ISO 8601
  ends_at: string;
  all_day: boolean;
  rrule?: string; // RFC 5545 RRULE
  timezone: string;
  location?: string;
  metadata?: MayaEventMetadata;
  created_at: string;
  updated_at: string;
}

interface MayaEventMetadata {
  mood?: 'work' | 'personal' | 'family' | 'health' | 'creative' | 'social';
  energy_level?: 'low' | 'medium' | 'high';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  workflow_hooks?: Array<{
    trigger: 'before_event' | 'during_event' | 'after_event';
    action: string;
    params?: Record<string, any>;
  }>;
  ai_generated?: boolean;
  source_system?: string;
  tags?: string[];
  attendees?: Array<{
    email: string;
    name?: string;
    status?: 'pending' | 'accepted' | 'declined' | 'tentative';
  }>;
}
```

### React Hooks

#### `useCalendarEvents(options)`

```typescript
interface UseCalendarEventsOptions {
  supabase: SupabaseClient;
  userId: string;
  filters?: EventFilters;
  realtime?: boolean;
}

// Returns: { events, loading, error, createEvent, updateEvent, deleteEvent, refreshEvents }
```

#### `useICSExport()`

```typescript
// Returns: { isGenerating, error, exportToICS, exportUserCalendar, downloadICS, createICSFeedUrl }
```

#### `useEventGenerator(options)`

```typescript
// Returns: { generateRecurringEvents, createRecurrenceRule, parseRecurrenceRule, getNextEventOccurrence, generateEventSeries, presets }
```

## Edge Functions

### Calendar ICS Export

**URL:** `https://your-project.supabase.co/functions/v1/calendar-ics/{userId}.ics`

**Query Parameters:**
- `token` - ICS access token (required for public access)
- `start` - Start date filter (ISO 8601)
- `end` - End date filter (ISO 8601)
- `v` - Cache buster (automatically added)

**Example:**
```
https://xyz.supabase.co/functions/v1/calendar-ics/user-123.ics?token=abc123&start=2024-01-01
```

### Calendar Operations

**URL:** `https://your-project.supabase.co/functions/v1/calendar-operations`

**Endpoints:**
- `GET /` - List events with filters
- `POST /` - Create new event
- `PUT /{eventId}` - Update event
- `DELETE /{eventId}` - Delete event
- `POST /create-token` - Generate ICS access token

## Maya-Specific Features

### Mood-Based Scheduling

Events can include mood metadata to help Maya understand your preferences:

```typescript
{
  title: "Morning Meditation",
  metadata: {
    mood: "health",
    energy_level: "low",
    priority: "medium",
    tags: ["wellness", "routine"]
  }
}
```

### Workflow Integration

Events can trigger Maya workflows:

```typescript
{
  title: "Client Meeting",
  metadata: {
    workflow_hooks: [{
      trigger: "before_event",
      action: "prepare_meeting_notes",
      params: { client_id: "xyz-123" }
    }]
  }
}
```

### AI-Generated Events

Maya can automatically create calendar events:

```typescript
{
  title: "Review quarterly reports",
  metadata: {
    ai_generated: true,
    source_system: "maya-agent",
    mood: "work",
    priority: "high"
  }
}
```

## Adding to Google Calendar

1. Get your ICS feed URL from the Maya calendar settings
2. In Google Calendar, click "+" next to "Other calendars"
3. Select "From URL"
4. Paste your Maya ICS feed URL
5. Google will sync every few hours automatically

## Development

```bash
# Build the package
cd packages/calendar-core
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint
```

## Contributing

This package follows the Maya HQ monorepo conventions. See the main README for development guidelines. 