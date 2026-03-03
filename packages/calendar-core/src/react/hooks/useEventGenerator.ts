import { useState, useCallback, useMemo } from 'react';
import { 
  generateRecurringInstances, 
  createRRule, 
  parseRRule, 
  getNextOccurrence,
  RRULE_PRESETS 
} from '../../rrule-utils';
import type { CalendarEvent, RecurrenceOptions } from '../../types';

interface UseEventGeneratorOptions {
  defaultTimeZone?: string;
}

interface UseEventGeneratorReturn {
  isGenerating: boolean;
  error: string | null;
  generateRecurringEvents: (
    event: CalendarEvent,
    startDate: Date,
    endDate: Date
  ) => CalendarEvent[];
  createRecurrenceRule: (options: RecurrenceOptions, dtstart: Date) => string | null;
  parseRecurrenceRule: (rrule: string) => RecurrenceOptions | null;
  getNextEventOccurrence: (event: CalendarEvent, after?: Date) => Date | null;
  generateEventSeries: (
    baseEvent: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>,
    recurrence: RecurrenceOptions,
    count: number
  ) => Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>[];
  presets: typeof RRULE_PRESETS;
}

export function useEventGenerator(
  options: UseEventGeneratorOptions = {}
): UseEventGeneratorReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { defaultTimeZone = 'UTC' } = options;

  const generateRecurringEvents = useCallback((
    event: CalendarEvent,
    startDate: Date,
    endDate: Date
  ): CalendarEvent[] => {
    try {
      setIsGenerating(true);
      setError(null);
      
      return generateRecurringInstances(event, startDate, endDate);
    } catch (err: any) {
      setError(err.message || 'Failed to generate recurring events');
      console.error('Error generating recurring events:', err);
      return [event];
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const createRecurrenceRule = useCallback((
    recurrenceOptions: RecurrenceOptions,
    dtstart: Date
  ): string | null => {
    try {
      setError(null);
      return createRRule(recurrenceOptions, dtstart);
    } catch (err: any) {
      setError(err.message || 'Failed to create recurrence rule');
      console.error('Error creating recurrence rule:', err);
      return null;
    }
  }, []);

  const parseRecurrenceRule = useCallback((rrule: string): RecurrenceOptions | null => {
    try {
      setError(null);
      return parseRRule(rrule);
    } catch (err: any) {
      setError(err.message || 'Failed to parse recurrence rule');
      console.error('Error parsing recurrence rule:', err);
      return null;
    }
  }, []);

  const getNextEventOccurrence = useCallback((
    event: CalendarEvent,
    after?: Date
  ): Date | null => {
    try {
      setError(null);
      return getNextOccurrence(event, after);
    } catch (err: any) {
      setError(err.message || 'Failed to get next occurrence');
      console.error('Error getting next occurrence:', err);
      return null;
    }
  }, []);

  const generateEventSeries = useCallback((
    baseEvent: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>,
    recurrence: RecurrenceOptions,
    count: number
  ): Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>[] => {
    try {
      setIsGenerating(true);
      setError(null);
      
      const startDate = new Date(baseEvent.starts_at);
      const rrule = createRRule({ ...recurrence, count }, startDate);
      
      if (!rrule) {
        throw new Error('Failed to create recurrence rule');
      }

      // Create a temporary event with the rrule
      const tempEvent: CalendarEvent = {
        ...baseEvent,
        id: 'temp',
        rrule,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Generate events for the next year to get the required count
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
      
      const instances = generateRecurringInstances(tempEvent, startDate, endDate);
      
      // Remove the temporary fields and limit to requested count
      return instances.slice(0, count).map(({ id, created_at, updated_at, ...event }) => event);
    } catch (err: any) {
      setError(err.message || 'Failed to generate event series');
      console.error('Error generating event series:', err);
      return [baseEvent];
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const presets = useMemo(() => RRULE_PRESETS, []);

  return {
    isGenerating,
    error,
    generateRecurringEvents,
    createRecurrenceRule,
    parseRecurrenceRule,
    getNextEventOccurrence,
    generateEventSeries,
    presets,
  };
} 