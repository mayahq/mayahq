import ical, { ICalCalendar, ICalEvent } from 'ical-generator';
import { DateTime } from 'luxon';
import type { CalendarEvent, ICSOptions, MayaEventMetadata } from './types';

/**
 * Generate ICS calendar from Maya calendar events
 */
export function generateICS(
  events: CalendarEvent[],
  options: ICSOptions = {}
): string {
  const {
    calendarName = 'Maya HQ Calendar',
    description = 'Personal calendar from Maya HQ',
    timezone = 'UTC',
    includeMetadata = true,
  } = options;

  const calendar = ical({
    name: calendarName,
    description,
    timezone,
    prodId: {
      company: 'Maya HQ',
      product: 'Maya Calendar',
      language: 'EN',
    },
  });

  events.forEach(event => {
    addEventToCalendar(calendar, event, includeMetadata);
  });

  return calendar.toString();
}

/**
 * Add a single event to an ICS calendar
 */
function addEventToCalendar(
  calendar: ICalCalendar,
  event: CalendarEvent,
  includeMetadata: boolean = true
): void {
  const icalEvent = calendar.createEvent({
    id: event.id,
    start: new Date(event.starts_at),
    end: new Date(event.ends_at),
    summary: event.title,
    description: formatEventDescription(event, includeMetadata),
    location: event.location,
    allDay: event.all_day,
    timezone: event.timezone || 'UTC',
  });

  // Add recurrence rule if present
  if (event.rrule) {
    icalEvent.repeating(event.rrule);
  }

  // Add categories based on Maya metadata
  if (includeMetadata && event.metadata) {
    const metadata = event.metadata as MayaEventMetadata;
    const categories: string[] = [];
    
    if (metadata.mood) categories.push(`Mood: ${metadata.mood}`);
    if (metadata.priority) categories.push(`Priority: ${metadata.priority}`);
    if (metadata.energy_level) categories.push(`Energy: ${metadata.energy_level}`);
    if (metadata.tags) categories.push(...metadata.tags);
    
    if (categories.length > 0) {
      icalEvent.categories(categories.map(cat => ({ name: cat })));
    }
  }
}

/**
 * Format event description with Maya metadata
 */
function formatEventDescription(
  event: CalendarEvent,
  includeMetadata: boolean
): string {
  let description = event.description || '';

  if (includeMetadata && event.metadata) {
    const metadata = event.metadata as MayaEventMetadata;
    const metadataLines: string[] = [];

    if (metadata.mood) {
      metadataLines.push(`🎭 Mood: ${metadata.mood}`);
    }
    
    if (metadata.priority) {
      metadataLines.push(`⚡ Priority: ${metadata.priority}`);
    }
    
    if (metadata.energy_level) {
      metadataLines.push(`🔋 Energy Level: ${metadata.energy_level}`);
    }
    
    if (metadata.source_system) {
      metadataLines.push(`📱 Source: ${metadata.source_system}`);
    }
    
    if (metadata.ai_generated) {
      metadataLines.push(`🤖 AI Generated: Yes`);
    }
    
    if (metadata.tags && metadata.tags.length > 0) {
      metadataLines.push(`🏷️ Tags: ${metadata.tags.join(', ')}`);
    }

    if (metadataLines.length > 0) {
      if (description) {
        description += '\n\n--- Maya Metadata ---\n';
      }
      description += metadataLines.join('\n');
    }
  }

  return description;
}

/**
 * Generate ICS for a specific user's events within a date range
 */
export function generateUserCalendarICS(
  events: CalendarEvent[],
  userId: string,
  startDate?: Date,
  endDate?: Date,
  options: ICSOptions = {}
): string {
  // Filter events for the user
  let userEvents = events.filter(event => event.owner_id === userId);

  // Apply date filtering if provided
  if (startDate || endDate) {
    userEvents = userEvents.filter(event => {
      const eventStart = new Date(event.starts_at);
      const eventEnd = new Date(event.ends_at);
      
      if (startDate && eventEnd < startDate) return false;
      if (endDate && eventStart > endDate) return false;
      
      return true;
    });
  }

  return generateICS(userEvents, {
    calendarName: `Maya Calendar - ${userId}`,
    ...options,
  });
}

/**
 * Create a cache-busting URL for ICS feeds
 */
export function createICSUrl(
  baseUrl: string,
  userId: string,
  secretToken?: string
): string {
  const params = new URLSearchParams();
  
  if (secretToken) {
    params.set('token', secretToken);
  }
  
  // Add cache-busting parameter based on current hour
  const now = new Date();
  const cacheVersion = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}`;
  params.set('v', cacheVersion);

  return `${baseUrl}/calendar/${userId}.ics?${params.toString()}`;
}

/**
 * Validate ICS content
 */
export function validateICS(icsContent: string): boolean {
  try {
    // Basic validation - check for required ICS structure
    return (
      icsContent.includes('BEGIN:VCALENDAR') &&
      icsContent.includes('END:VCALENDAR') &&
      icsContent.includes('PRODID:')
    );
  } catch {
    return false;
  }
}

/**
 * Generate ICS response headers for HTTP responses
 */
export function getICSHeaders(filename: string = 'maya-calendar.ics'): Record<string, string> {
  return {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'public, max-age=300', // 5 minutes cache
    'X-Content-Type-Options': 'nosniff',
  };
} 