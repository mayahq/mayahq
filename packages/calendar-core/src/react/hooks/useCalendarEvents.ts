import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent, CreateCalendarEvent, UpdateCalendarEvent, EventFilters } from '../../types';

interface UseCalendarEventsOptions {
  supabase: SupabaseClient;
  userId: string;
  filters?: EventFilters;
  realtime?: boolean;
}

interface UseCalendarEventsReturn {
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  createEvent: (event: CreateCalendarEvent) => Promise<CalendarEvent | null>;
  updateEvent: (id: string, updates: UpdateCalendarEvent) => Promise<CalendarEvent | null>;
  deleteEvent: (id: string) => Promise<boolean>;
  refreshEvents: () => Promise<void>;
}

export function useCalendarEvents({
  supabase,
  userId,
  filters = {},
  realtime = true,
}: UseCalendarEventsOptions): UseCalendarEventsReturn {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('calendar_events')
        .select('*')
        .eq('owner_id', userId)
        .order('starts_at', { ascending: true });

      // Apply filters
      if (filters.start_date) {
        query = query.gte('starts_at', filters.start_date);
      }
      if (filters.end_date) {
        query = query.lte('ends_at', filters.end_date);
      }
      if (filters.search) {
        query = query.ilike('title', `%${filters.search}%`);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw fetchError;
      }

      // Apply metadata filters (since these are JSONB, we filter client-side)
      let filteredEvents = data || [];
      
      if (filters.mood) {
        filteredEvents = filteredEvents.filter(event => 
          event.metadata?.mood === filters.mood
        );
      }
      
      if (filters.priority) {
        filteredEvents = filteredEvents.filter(event => 
          event.metadata?.priority === filters.priority
        );
      }
      
      if (filters.tags?.length) {
        filteredEvents = filteredEvents.filter(event => 
          filters.tags!.some(tag => event.metadata?.tags?.includes(tag))
        );
      }
      
      if (filters.source_system) {
        filteredEvents = filteredEvents.filter(event => 
          event.metadata?.source_system === filters.source_system
        );
      }

      setEvents(filteredEvents as CalendarEvent[]);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch events');
      console.error('Error fetching calendar events:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, filters]);

  const createEvent = useCallback(async (eventData: CreateCalendarEvent): Promise<CalendarEvent | null> => {
    try {
      setError(null);
      
      const { data, error: insertError } = await supabase
        .from('calendar_events')
        .insert({
          ...eventData,
          owner_id: userId,
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      const newEvent = data as CalendarEvent;
      setEvents(prev => [...prev, newEvent].sort((a, b) => 
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      ));

      return newEvent;
    } catch (err: any) {
      setError(err.message || 'Failed to create event');
      console.error('Error creating calendar event:', err);
      return null;
    }
  }, [supabase, userId]);

  const updateEvent = useCallback(async (id: string, updates: UpdateCalendarEvent): Promise<CalendarEvent | null> => {
    try {
      setError(null);
      
      const { data, error: updateError } = await supabase
        .from('calendar_events')
        .update(updates)
        .eq('id', id)
        .eq('owner_id', userId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      const updatedEvent = data as CalendarEvent;
      setEvents(prev => 
        prev.map(event => event.id === id ? updatedEvent : event)
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      );

      return updatedEvent;
    } catch (err: any) {
      setError(err.message || 'Failed to update event');
      console.error('Error updating calendar event:', err);
      return null;
    }
  }, [supabase, userId]);

  const deleteEvent = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      
      const { error: deleteError } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', id)
        .eq('owner_id', userId);

      if (deleteError) {
        throw deleteError;
      }

      setEvents(prev => prev.filter(event => event.id !== id));
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to delete event');
      console.error('Error deleting calendar event:', err);
      return false;
    }
  }, [supabase, userId]);

  const refreshEvents = useCallback(() => fetchEvents(), [fetchEvents]);

  // Initial fetch
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Set up realtime subscription
  useEffect(() => {
    if (!realtime) return;

    const channel = supabase
      .channel('calendar-events-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_events',
          filter: `owner_id=eq.${userId}`,
        },
        (payload) => {
          console.log('Calendar event change:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newEvent = payload.new as CalendarEvent;
            setEvents(prev => [...prev, newEvent].sort((a, b) => 
              new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
            ));
          } else if (payload.eventType === 'UPDATE') {
            const updatedEvent = payload.new as CalendarEvent;
            setEvents(prev => 
              prev.map(event => event.id === updatedEvent.id ? updatedEvent : event)
                .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedEvent = payload.old as CalendarEvent;
            setEvents(prev => prev.filter(event => event.id !== deletedEvent.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, realtime]);

  return {
    events,
    loading,
    error,
    createEvent,
    updateEvent,
    deleteEvent,
    refreshEvents,
  };
} 