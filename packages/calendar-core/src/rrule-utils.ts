import { RRule, RRuleSet, rrulestr } from 'rrule';
import { DateTime } from 'luxon';
import type { RecurrenceOptions, CalendarEvent } from './types';

/**
 * Convert RecurrenceOptions to RRULE string
 */
export function createRRule(options: RecurrenceOptions, dtstart: Date): string {
  const ruleOptions: Partial<RRule['options']> = {
    freq: RRule[options.freq],
    dtstart,
  };

  if (options.interval) ruleOptions.interval = options.interval;
  if (options.count) ruleOptions.count = options.count;
  if (options.until) ruleOptions.until = options.until;
  if (options.byweekday) ruleOptions.byweekday = options.byweekday;
  if (options.bymonthday) ruleOptions.bymonthday = options.bymonthday;
  if (options.bymonth) ruleOptions.bymonth = options.bymonth;

  const rule = new RRule(ruleOptions);
  return rule.toString();
}

/**
 * Parse RRULE string to get recurrence options
 */
export function parseRRule(rruleString: string): RecurrenceOptions | null {
  try {
    const rule = rrulestr(rruleString);
    const options = rule.options;

    return {
      freq: Object.keys(RRule).find(key => RRule[key as keyof typeof RRule] === options.freq) as RecurrenceOptions['freq'],
      interval: options.interval || 1,
      count: options.count || undefined,
      until: options.until || undefined,
      byweekday: options.byweekday || undefined,
      bymonthday: options.bymonthday || undefined,
      bymonth: options.bymonth || undefined,
    };
  } catch (error) {
    console.error('Failed to parse RRULE:', error);
    return null;
  }
}

/**
 * Generate event instances for a recurring event within a date range
 */
export function generateRecurringInstances(
  event: CalendarEvent,
  startDate: Date,
  endDate: Date
): CalendarEvent[] {
  if (!event.rrule) {
    return [event];
  }

  try {
    const rule = rrulestr(event.rrule, {
      dtstart: new Date(event.starts_at),
    });

    const occurrences = rule.between(startDate, endDate, true);
    const eventDuration = new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime();

    return occurrences.map((occurrence, index) => ({
      ...event,
      id: index === 0 ? event.id : `${event.id}-${occurrence.getTime()}`,
      starts_at: occurrence.toISOString(),
      ends_at: new Date(occurrence.getTime() + eventDuration).toISOString(),
    }));
  } catch (error) {
    console.error('Failed to generate recurring instances:', error);
    return [event];
  }
}

/**
 * Check if an event is recurring
 */
export function isRecurringEvent(event: CalendarEvent): boolean {
  return Boolean(event.rrule);
}

/**
 * Get next occurrence of a recurring event
 */
export function getNextOccurrence(event: CalendarEvent, after?: Date): Date | null {
  if (!event.rrule) return null;

  try {
    const rule = rrulestr(event.rrule, {
      dtstart: new Date(event.starts_at),
    });

    const afterDate = after || new Date();
    return rule.after(afterDate);
  } catch (error) {
    console.error('Failed to get next occurrence:', error);
    return null;
  }
}

/**
 * Common RRULE presets for quick setup
 */
export const RRULE_PRESETS = {
  daily: (dtstart: Date, count?: number): string => 
    createRRule({ freq: 'DAILY', count }, dtstart),
  
  weekly: (dtstart: Date, count?: number): string => 
    createRRule({ freq: 'WEEKLY', count }, dtstart),
  
  monthly: (dtstart: Date, count?: number): string => 
    createRRule({ freq: 'MONTHLY', count }, dtstart),
  
  yearly: (dtstart: Date, count?: number): string => 
    createRRule({ freq: 'YEARLY', count }, dtstart),
  
  weekdays: (dtstart: Date, count?: number): string => 
    createRRule({ freq: 'WEEKLY', byweekday: [0, 1, 2, 3, 4], count }, dtstart), // Mon-Fri
  
  weekends: (dtstart: Date, count?: number): string => 
    createRRule({ freq: 'WEEKLY', byweekday: [5, 6], count }, dtstart), // Sat-Sun
};

/**
 * Validate RRULE string
 */
export function validateRRule(rruleString: string): boolean {
  try {
    rrulestr(rruleString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert timezone-aware dates for RRULE processing
 */
export function normalizeEventDates(event: CalendarEvent): {
  startDate: Date;
  endDate: Date;
} {
  const timezone = event.timezone || 'UTC';
  
  const startDate = DateTime.fromISO(event.starts_at, { zone: timezone }).toJSDate();
  const endDate = DateTime.fromISO(event.ends_at, { zone: timezone }).toJSDate();
  
  return { startDate, endDate };
} 