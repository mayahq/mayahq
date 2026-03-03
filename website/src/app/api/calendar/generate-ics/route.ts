import { NextRequest, NextResponse } from 'next/server';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
  location?: string;
  metadata?: {
    mood?: string;
    priority?: string;
    energy_level?: string;
    tags?: string[];
  };
}

interface ICSOptions {
  calendarName?: string;
  description?: string;
  timezone?: string;
  includeMetadata?: boolean;
}

function generateICS(events: CalendarEvent[], options: ICSOptions = {}): string {
  const {
    calendarName = 'Maya HQ Calendar',
    description = 'Personal calendar from Maya HQ',
    timezone = 'UTC',
    includeMetadata = true,
  } = options;

  // Generate VCALENDAR header
  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maya HQ//Maya Calendar//EN',
    `X-WR-CALNAME:${calendarName}`,
    `X-WR-CALDESC:${description}`,
    `X-WR-TIMEZONE:${timezone}`,
  ];

  // Add events
  events.forEach(event => {
    const startDate = new Date(event.starts_at);
    const endDate = new Date(event.ends_at);
    
    let eventDescription = event.description || '';
    
    // Add metadata to description if enabled
    if (includeMetadata && event.metadata) {
      const metadata = event.metadata;
      const metadataLines: string[] = [];

      if (metadata.mood) metadataLines.push(`🎭 Mood: ${metadata.mood}`);
      if (metadata.priority) metadataLines.push(`⚡ Priority: ${metadata.priority}`);
      if (metadata.energy_level) metadataLines.push(`🔋 Energy Level: ${metadata.energy_level}`);
      if (metadata.tags && metadata.tags.length > 0) metadataLines.push(`🏷️ Tags: ${metadata.tags.join(', ')}`);

      if (metadataLines.length > 0) {
        if (eventDescription) eventDescription += '\\n\\n--- Maya Metadata ---\\n';
        eventDescription += metadataLines.join('\\n');
      }
    }

    ics.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@mayahq.com`,
      `DTSTART:${formatDateForICS(startDate)}`,
      `DTEND:${formatDateForICS(endDate)}`,
      `SUMMARY:${escapeICSText(event.title)}`,
      `DESCRIPTION:${escapeICSText(eventDescription)}`,
      ...(event.location ? [`LOCATION:${escapeICSText(event.location)}`] : []),
      `CREATED:${formatDateForICS(new Date())}`,
      `LAST-MODIFIED:${formatDateForICS(new Date())}`,
      'END:VEVENT'
    );
  });

  ics.push('END:VCALENDAR');
  
  return ics.join('\r\n');
}

function formatDateForICS(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

export async function POST(request: NextRequest) {
  try {
    const { events, options } = await request.json();
    
    if (!Array.isArray(events)) {
      return NextResponse.json(
        { error: 'Events must be an array' },
        { status: 400 }
      );
    }

    const icsContent = generateICS(events as CalendarEvent[], options as ICSOptions);
    
    return new NextResponse(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="maya-calendar.ics"',
      },
    });
  } catch (error) {
    console.error('Error generating ICS:', error);
    return NextResponse.json(
      { error: 'Failed to generate ICS calendar' },
      { status: 500 }
    );
  }
} 