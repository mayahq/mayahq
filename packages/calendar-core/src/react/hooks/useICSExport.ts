import { useState, useCallback } from 'react';
// Remove direct import of ical-generator functions that cause Node.js issues
// import { generateICS, generateUserCalendarICS, createICSUrl } from '../../ics';
import type { CalendarEvent, ICSOptions } from '../../types';

interface UseICSExportReturn {
  isGenerating: boolean;
  error: string | null;
  exportToICS: (events: CalendarEvent[], options?: ICSOptions) => Promise<string | null>;
  exportUserCalendar: (
    events: CalendarEvent[],
    userId: string,
    startDate?: Date,
    endDate?: Date,
    options?: ICSOptions
  ) => Promise<string | null>;
  downloadICS: (events: CalendarEvent[], filename?: string, options?: ICSOptions) => Promise<void>;
  createICSFeedUrl: (baseUrl: string, userId: string, secretToken?: string) => string;
}

/**
 * Create a cache-busting URL for ICS feeds (client-safe)
 */
function createICSUrl(
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
 * Generate ICS content on the server via API call
 */
async function generateICSViaAPI(events: CalendarEvent[], options: ICSOptions = {}): Promise<string> {
  const response = await fetch('/api/calendar/generate-ics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ events, options }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate ICS: ${response.statusText}`);
  }

  return await response.text();
}

export function useICSExport(): UseICSExportReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportToICS = useCallback(async (
    events: CalendarEvent[],
    options: ICSOptions = {}
  ): Promise<string | null> => {
    try {
      setIsGenerating(true);
      setError(null);
      
      const icsContent = await generateICSViaAPI(events, options);
      return icsContent;
    } catch (err: any) {
      setError(err.message || 'Failed to generate ICS');
      console.error('Error generating ICS:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const exportUserCalendar = useCallback(async (
    events: CalendarEvent[],
    userId: string,
    startDate?: Date,
    endDate?: Date,
    options: ICSOptions = {}
  ): Promise<string | null> => {
    try {
      setIsGenerating(true);
      setError(null);
      
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

      const userOptions = {
        calendarName: `Maya Calendar - ${userId}`,
        ...options,
      };
      
      const icsContent = await generateICSViaAPI(userEvents, userOptions);
      return icsContent;
    } catch (err: any) {
      setError(err.message || 'Failed to generate user calendar ICS');
      console.error('Error generating user calendar ICS:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const downloadICS = useCallback(async (
    events: CalendarEvent[],
    filename: string = 'maya-calendar.ics',
    options: ICSOptions = {}
  ): Promise<void> => {
    try {
      setIsGenerating(true);
      setError(null);
      
      const icsContent = await generateICSViaAPI(events, options);
      
      // Create blob and download
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to download ICS');
      console.error('Error downloading ICS:', err);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const createICSFeedUrl = useCallback((
    baseUrl: string,
    userId: string,
    secretToken?: string
  ): string => {
    return createICSUrl(baseUrl, userId, secretToken);
  }, []);

  return {
    isGenerating,
    error,
    exportToICS,
    exportUserCalendar,
    downloadICS,
    createICSFeedUrl,
  };
} 