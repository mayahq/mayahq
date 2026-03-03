'use client'

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Database } from '@/lib/database.types';
import { 
  Calendar, 
  Clock, 
  Download, 
  Link, 
  Plus, 
  Trash2, 
  RefreshCw, 
  ChevronDown,
  Filter,
  CalendarDays,
  MoreHorizontal,
  MapPin,
  Star,
  Edit3,
  Save,
  X,
  CheckSquare,
  Bell,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type RelationshipType = Database['public']['Enums']['relationship_type'];

interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean | null;
  location?: string | null;
  timezone: string | null;
  mood?: string | null;
  priority?: number | null;
  energy_level?: string | null;
  tags?: string[] | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CreateEventData {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  all_day?: boolean;
  location?: string;
  timezone?: string;
  mood?: string;
  priority?: number;
  energy_level?: string;
  tags?: string[];
}

interface Filters {
  dateRange: 'today' | 'week' | 'month' | 'all';
  mood?: string;
  priority?: number;
  energyLevel?: string;
  search?: string;
}

interface Task {
  id: number;
  content: string;
  status: string | null;
  priority: string | null;
  due_at: string | null;
  created_at: string | null;
}

interface Reminder {
  id: string;
  title: string;
  content: string | null;
  remind_at: string;
  status: string;
  priority: string;
  created_at: string | null;
}

interface LinkedItem {
  link_id: string;
  link_type: string;
  link_context: string | null;
  entity_type: string;
  entity_id: string;
  entity_data: any;
  created_at: string | null;
}

export default function AdminCalendarPage() {
  const { user, supabase } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showCalendarFeed, setShowCalendarFeed] = useState(false);
  const [filters, setFilters] = useState<Filters>({ dateRange: 'today' });
  const [newEvent, setNewEvent] = useState<CreateEventData>({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
    all_day: false,
    timezone: 'UTC',
    location: '',
    mood: 'work',
    priority: 3,
    energy_level: 'medium',
    tags: [],
  });
  const [icsToken, setIcsToken] = useState<string>('');

  // Edit functionality state
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editedEventData, setEditedEventData] = useState<Partial<CalendarEvent>>({});

  // Linking functionality state
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkingEventId, setLinkingEventId] = useState<string | null>(null);
  const [linkedItems, setLinkedItems] = useState<{ [key: string]: LinkedItem[] }>({});
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [availableReminders, setAvailableReminders] = useState<Reminder[]>([]);

  // Get today's events and other filtered events
  const { todayEvents, filteredEvents } = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    const todayEvents = events.filter(event => {
      const eventDate = new Date(event.start_time);
      return eventDate >= todayStart && eventDate <= todayEnd;
    });

    let filtered = events;

    // Apply date range filter
    if (filters.dateRange === 'today') {
      filtered = todayEvents;
    } else if (filters.dateRange === 'week') {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59);
      
      filtered = events.filter(event => {
        const eventDate = new Date(event.start_time);
        return eventDate >= weekStart && eventDate <= weekEnd;
      });
    } else if (filters.dateRange === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
      
      filtered = events.filter(event => {
        const eventDate = new Date(event.start_time);
        return eventDate >= monthStart && eventDate <= monthEnd;
      });
    }

    // Apply other filters
    if (filters.mood) {
      filtered = filtered.filter(event => event.mood === filters.mood);
    }
    if (filters.priority) {
      filtered = filtered.filter(event => event.priority === filters.priority);
    }
    if (filters.energyLevel) {
      filtered = filtered.filter(event => event.energy_level === filters.energyLevel);
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(event => 
        event.title.toLowerCase().includes(searchLower) ||
        event.description?.toLowerCase().includes(searchLower) ||
        event.location?.toLowerCase().includes(searchLower)
      );
    }

    return { todayEvents, filteredEvents: filtered };
  }, [events, filters]);

  const fetchEvents = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('created_by', user.id)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const generateICSToken = async () => {
    if (!user?.id) {
      toast.error('User not authenticated');
      return;
    }

    try {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => 
        byte.toString(16).padStart(2, '0')
      ).join('');
      
      const { error } = await supabase
        .from('calendar_ics_tokens')
        .insert({
          user_id: user.id,
          token: token,
          name: 'Admin Calendar Feed',
          active: true,
          created_at: new Date().toISOString(),
          last_accessed: null
        });

      if (error) throw error;

      setIcsToken(token);
      toast.success('ICS token generated!');
    } catch (error) {
      console.error('Error generating ICS token:', error);
      toast.error('Failed to generate ICS token');
    }
  };

  const copyICSUrl = () => {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/calendar-ics?user_id=${user?.id}&token=${icsToken}`;
    navigator.clipboard.writeText(url);
    toast.success('Calendar feed URL copied!');
  };

  const fetchICSToken = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('calendar_ics_tokens')
        .select('token')
        .eq('user_id', user.id)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        setIcsToken(data.token);
      }
    } catch (error) {
      console.log('No existing ICS token found');
    }
  };

  useEffect(() => {
    fetchEvents();
    fetchICSToken();
  }, [user?.id]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEvent.title || !newEvent.start_time || !newEvent.end_time) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const { error } = await supabase
        .from('calendar_events')
        .insert([{
          ...newEvent,
          created_by: user?.id,
        }]);

      if (error) throw error;

      toast.success('Event created successfully!');
      setShowCreateForm(false);
      setNewEvent({
        title: '',
        description: '',
        start_time: '',
        end_time: '',
        all_day: false,
        timezone: 'UTC',
        location: '',
        mood: 'work',
        priority: 3,
        energy_level: 'medium',
        tags: [],
      });
      fetchEvents();
    } catch (error) {
      console.error('Error creating event:', error);
      toast.error('Failed to create event');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;

      toast.success('Event deleted successfully!');
      fetchEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event');
    }
  };

  const downloadICS = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/calendar-ics?user_id=${user?.id}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const icsContent = await response.text();
      
      const blob = new Blob([icsContent], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'maya-calendar.ics';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Calendar downloaded!');
    } catch (error) {
      console.error('Error downloading calendar:', error);
      toast.error('Failed to download calendar');
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  };

  const getMoodColor = (mood?: string) => {
    switch (mood) {
      case 'work': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'personal': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'family': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'health': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'creative': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'social': return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const icsUrl = user ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/calendar-ics?user_id=${user.id}&token=${icsToken}` : '';

  // Edit functionality
  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEventId(event.id);
    setEditedEventData({
      title: event.title,
      description: event.description || '',
      start_time: event.start_time,
      end_time: event.end_time,
      location: event.location || '',
      mood: event.mood || '',
      priority: event.priority || 3,
      energy_level: event.energy_level || '',
      all_day: event.all_day || false
    });
  };

  const handleCancelEdit = () => {
    setEditingEventId(null);
    setEditedEventData({});
  };

  const handleSaveEdit = async (eventId: string) => {
    if (!editedEventData.title || !editedEventData.start_time || !editedEventData.end_time) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!user?.id) {
      toast.error('User not authenticated');
      return;
    }

    try {
      const { error } = await supabase
        .from('calendar_events')
        .update({
          ...editedEventData,
          updated_at: new Date().toISOString()
        })
        .eq('id', eventId)
        .eq('created_by', user.id);

      if (error) throw error;

      toast.success('Event updated successfully!');
      setEditingEventId(null);
      setEditedEventData({});
      fetchEvents();
      fetchLinkedItems();
    } catch (error) {
      console.error('Error updating event:', error);
      toast.error('Failed to update event');
    }
  };

  // Linking functionality
  const fetchLinkedItems = useCallback(async () => {
    if (!user?.id || !supabase || events.length === 0) return;

    try {
      const linkPromises = events.map(async (event) => {
        const { data: links, error } = await supabase
          .rpc('find_related_entities', {
            p_entity_type: 'calendar_event',
            p_entity_id: event.id
          });

        if (error) {
          console.error(`Error fetching links for event ${event.id}:`, error);
          return { eventId: event.id, links: [] };
        }

        return { eventId: event.id, links: links || [] };
      });

      const linkResults = await Promise.all(linkPromises);
      const linksMap: { [key: string]: LinkedItem[] } = {};
      linkResults.forEach(({ eventId, links }) => {
        linksMap[eventId] = links;
      });
      setLinkedItems(linksMap);
    } catch (error) {
      console.error('Error fetching linked items:', error);
    }
  }, [user?.id, supabase, events]);

  const fetchAvailableTasksAndReminders = async () => {
    if (!user?.id || !supabase) return;

    try {
      // Fetch available tasks
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('id, content, status, priority, due_at, created_at')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(20);

      if (tasksError) {
        console.error('Error fetching tasks:', tasksError);
      } else {
        setAvailableTasks(tasks || []);
      }

      // Fetch available reminders
      const { data: reminders, error: remindersError } = await supabase
        .from('maya_reminders')
        .select('id, title, content, remind_at, status, priority, created_at')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20);

      if (remindersError) {
        console.error('Error fetching reminders:', remindersError);
      } else {
        setAvailableReminders(reminders || []);
      }
    } catch (error) {
      console.error('Error fetching available items:', error);
    }
  };

  const handleOpenLinkDialog = (eventId: string) => {
    setLinkingEventId(eventId);
    setShowLinkDialog(true);
    fetchAvailableTasksAndReminders();
  };

  const handleCreateLink = async (
    targetType: string, 
    targetId: string, 
    linkType: RelationshipType, 
    context?: string
  ) => {
    if (!linkingEventId || !user?.id) return;

    try {
      const { data, error } = await supabase
        .rpc('create_entity_link', {
          p_source_entity_type: 'calendar_event',
          p_source_entity_id: linkingEventId,
          p_target_entity_type: targetType,
          p_target_entity_id: targetId,
          p_link_type: linkType,
          p_context: context || undefined
        });

      if (error) throw error;

      toast.success(`Successfully linked ${targetType}!`);
      fetchLinkedItems();
      setShowLinkDialog(false);
    } catch (error) {
      console.error('Error creating link:', error);
      toast.error('Failed to create link');
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!user?.id) {
      toast.error('User not authenticated');
      return;
    }

    try {
      console.log('Attempting to delete link with ID:', linkId);
      
      // Try to delete the link - if it doesn't exist, that's fine
      const { error } = await supabase
        .from('entity_links')
        .delete()
        .eq('id', linkId);

      // Log any errors but don't fail for missing records
      if (error) {
        console.log('Delete error (may be expected):', error);
      }

      // Always remove from UI - if it doesn't exist in DB, it shouldn't be in UI either
      setLinkedItems(prevLinkedItems => {
        const updatedLinkedItems = { ...prevLinkedItems };
        
        Object.keys(updatedLinkedItems).forEach(eventId => {
          updatedLinkedItems[eventId] = updatedLinkedItems[eventId].filter(
            item => item.link_id !== linkId
          );
        });
        
        return updatedLinkedItems;
      });

      toast.success('Link removed successfully!');
    } catch (error) {
      console.error('Error deleting link:', error);
      
      // Even if deletion fails, remove from UI to fix inconsistency
      setLinkedItems(prevLinkedItems => {
        const updatedLinkedItems = { ...prevLinkedItems };
        
        Object.keys(updatedLinkedItems).forEach(eventId => {
          updatedLinkedItems[eventId] = updatedLinkedItems[eventId].filter(
            item => item.link_id !== linkId
          );
        });
        
        return updatedLinkedItems;
      });
      
      toast.message('Link removed from display!');
    }
  };

  // Enhanced useEffect to also fetch linked items
  useEffect(() => {
    if (user?.id) {
      fetchEvents();
      fetchICSToken();
    }
  }, [user?.id]);

  useEffect(() => {
    if (events.length > 0 && user?.id) {
      fetchLinkedItems();
    }
  }, [fetchLinkedItems, events.length, user?.id]);

  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'task':
        return <CheckSquare className="h-4 w-4" />;
      case 'reminder':
        return <Bell className="h-4 w-4" />;
      default:
        return <ExternalLink className="h-4 w-4" />;
    }
  };

  const getLinkTypeColor = (linkType: string) => {
    switch (linkType) {
      case 'blocks_for':
        return 'bg-purple-800 text-purple-300 border border-purple-700';
      case 'reminds_about':
        return 'bg-blue-800 text-blue-300 border border-blue-700';
      case 'references':
        return 'bg-green-800 text-green-300 border border-green-700';
      default:
        return 'bg-gray-800 text-gray-300 border border-gray-700';
    }
  };

  const handleNavigateToLinkedItem = (entityType: string, entityId: string) => {
    switch (entityType) {
      case 'task':
        router.push('/admin/tasks');
        break;
      case 'reminder':
        router.push('/admin/reminders');
        break;
      default:
        console.log('Unknown entity type:', entityType);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-32 bg-gray-800 rounded mb-4"></div>
          <div className="h-48 bg-gray-800 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2 text-white">
            <Calendar className="h-8 w-8 text-purple-400" />
            Calendar
          </h1>
          <p className="text-gray-400 mt-1">
            Today's agenda and calendar management
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowFilters(!showFilters)} 
            variant="outline" 
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>

          {/* Calendar Feed & Download Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">
                <Download className="h-4 w-4 mr-2" />
                Export
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700">
              <DropdownMenuItem onClick={downloadICS} className="text-gray-300 hover:bg-gray-700">
                <Download className="h-4 w-4 mr-2" />
                Download ICS File
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-700" />
              <DropdownMenuItem onClick={() => setShowCalendarFeed(true)} className="text-gray-300 hover:bg-gray-700">
                <Link className="h-4 w-4 mr-2" />
                Calendar Feed URL
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={() => fetchEvents()} variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">
            <RefreshCw className="h-4 w-4" />
          </Button>
          
          <Button onClick={() => setShowCreateForm(!showCreateForm)} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="h-4 w-4 mr-2" />
            New Event
          </Button>
        </div>
      </div>

      {/* Date Range Tabs */}
      <div className="flex gap-1 bg-gray-900 p-1 rounded-lg w-fit">
        {[
          { key: 'today', label: 'Today', icon: CalendarDays },
          { key: 'week', label: 'Week', icon: Calendar },
          { key: 'month', label: 'Month', icon: Calendar },
          { key: 'all', label: 'All', icon: Calendar }
        ].map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            variant={filters.dateRange === key ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilters(prev => ({ ...prev, dateRange: key as any }))}
            className={filters.dateRange === key 
              ? 'bg-purple-600 text-white' 
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }
          >
            <Icon className="h-4 w-4 mr-1" />
            {label}
          </Button>
        ))}
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-gray-300">Search</Label>
                <Input
                  placeholder="Search events..."
                  value={filters.search || ''}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-300">Mood</Label>
                <Select 
                  value={filters.mood || ''}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, mood: value || undefined }))}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="All moods" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="" className="text-white">All moods</SelectItem>
                    <SelectItem value="work" className="text-white">Work</SelectItem>
                    <SelectItem value="personal" className="text-white">Personal</SelectItem>
                    <SelectItem value="family" className="text-white">Family</SelectItem>
                    <SelectItem value="health" className="text-white">Health</SelectItem>
                    <SelectItem value="creative" className="text-white">Creative</SelectItem>
                    <SelectItem value="social" className="text-white">Social</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-300">Priority</Label>
                <Select 
                  value={filters.priority?.toString() || ''}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value ? parseInt(value) : undefined }))}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="All priorities" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="" className="text-white">All priorities</SelectItem>
                    <SelectItem value="1" className="text-white">1 - Low</SelectItem>
                    <SelectItem value="2" className="text-white">2</SelectItem>
                    <SelectItem value="3" className="text-white">3 - Medium</SelectItem>
                    <SelectItem value="4" className="text-white">4</SelectItem>
                    <SelectItem value="5" className="text-white">5 - High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-300">Energy Level</Label>
                <Select 
                  value={filters.energyLevel || ''}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, energyLevel: value || undefined }))}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="All energy levels" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="" className="text-white">All energy levels</SelectItem>
                    <SelectItem value="low" className="text-white">Low</SelectItem>
                    <SelectItem value="medium" className="text-white">Medium</SelectItem>
                    <SelectItem value="high" className="text-white">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Agenda - Featured Section */}
      {filters.dateRange === 'today' && (
        <Card className="bg-gradient-to-br from-purple-900/20 to-gray-900 border-purple-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <CalendarDays className="h-5 w-5 text-purple-400" />
              Today's Agenda
              <span className="text-sm font-normal text-gray-400">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No events scheduled for today</p>
                <p className="text-sm">Looks like you have a free day!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayEvents.map((event, index) => (
                  <div key={event.id} className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-purple-500/50 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col items-center">
                        <div className="text-sm font-medium text-purple-400">
                          {formatTime(event.start_time)}
                        </div>
                        <div className="w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
                        {index < todayEvents.length - 1 && (
                          <div className="w-0.5 h-8 bg-gray-600 mt-2"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-white text-lg">{event.title}</h3>
                            {event.description && (
                              <p className="text-gray-400 mt-1 text-sm">{event.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2">
                              {event.location && (
                                <div className="flex items-center gap-1 text-sm text-gray-400">
                                  <MapPin className="h-3 w-3" />
                                  {event.location}
                                </div>
                              )}
                              <div className="text-sm text-gray-400">
                                {formatTime(event.start_time)} - {formatTime(event.end_time)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-3">
                              {event.mood && (
                                <Badge variant="secondary" className={getMoodColor(event.mood)}>
                                  {event.mood}
                                </Badge>
                              )}
                              {event.priority && event.priority >= 4 && (
                                <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                                  <Star className="h-3 w-3 mr-1" />
                                  High Priority
                                </Badge>
                              )}
                              {event.energy_level && (
                                <Badge variant="secondary" className="bg-gray-500/20 text-gray-300 border-gray-500/30">
                                  {event.energy_level} energy
                                </Badge>
                              )}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700">
                              <DropdownMenuItem 
                                onClick={() => handleEditEvent(event)}
                                className="text-gray-300 hover:bg-gray-700"
                              >
                                <Edit3 className="h-4 w-4 mr-2" />
                                Edit Event
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleOpenLinkDialog(event.id)}
                                className="text-gray-300 hover:bg-gray-700"
                              >
                                <Link className="h-4 w-4 mr-2" />
                                Link Items
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-gray-700" />
                              <DropdownMenuItem 
                                onClick={() => handleDeleteEvent(event.id)}
                                className="text-red-400 hover:bg-red-500/10"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>

                    {/* Linked Items Section */}
                    {linkedItems[event.id] && linkedItems[event.id].length > 0 && (
                      <div className="mt-4 pt-3 border-t border-gray-700">
                        <h4 className="text-sm font-medium text-gray-400 mb-2">Linked Items</h4>
                        <div className="space-y-1">
                          {linkedItems[event.id].map((linkedItem) => (
                            <div 
                              key={linkedItem.link_id} 
                              className="flex items-center gap-2 p-2 rounded-md bg-gray-800/50 hover:bg-gray-700/50 transition-colors group"
                            >
                              {getEntityIcon(linkedItem.entity_type)}
                              <span 
                                className="text-sm text-gray-300 flex-1 group-hover:text-white transition-colors cursor-pointer"
                                onClick={() => handleNavigateToLinkedItem(linkedItem.entity_type, linkedItem.entity_id)}
                              >
                                {linkedItem.entity_type === 'task' 
                                  ? linkedItem.entity_data?.content 
                                  : linkedItem.entity_data?.title || 'Unknown'}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${getLinkTypeColor(linkedItem.link_type)}`}>
                                {linkedItem.link_type}
                              </span>
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  
                                  if (!user?.id) {
                                    toast.error('User not authenticated. Cannot delete link.');
                                    return;
                                  }

                                  const linkIdToDelete = linkedItem.link_id;
                                  console.log(`Attempting to delete link ID: ${linkIdToDelete} for user ID: ${user.id}`);

                                  try {
                                    const { data: deletedData, error: dbError } = await supabase
                                      .from('entity_links')
                                      .delete()
                                      .eq('id', linkIdToDelete)
                                      .eq('created_by', user.id) // Crucial for RLS
                                      .select(); // To confirm what was deleted

                                    if (dbError) {
                                      console.error('Supabase delete error:', dbError);
                                      toast.error(`Failed to delete link: ${dbError.message}`);
                                      return; // Stop if DB error
                                    }

                                    if (deletedData && deletedData.length > 0) {
                                      console.log('Successfully deleted from DB:', deletedData);
                                      // Update UI only after successful DB deletion
                                      setLinkedItems(prev => {
                                        const updated = { ...prev };
                                        Object.keys(updated).forEach(eventId => {
                                          updated[eventId] = updated[eventId].filter(
                                            item => item.link_id !== linkIdToDelete
                                          );
                                        });
                                        return updated;
                                      });
                                      toast.success('Link successfully removed!');
                                    } else {
                                      console.log('No records deleted from DB. Link not found or RLS prevented delete.');
                                      toast.message('Could not delete link. It might have already been removed or access was denied.');
                                      // Refresh linked items to ensure UI consistency if delete failed due to no record found
                                      fetchLinkedItems(); 
                                    }
                                  } catch (catchError) {
                                    console.error('Exception during delete operation:', catchError);
                                    toast.error('An unexpected error occurred while deleting the link.');
                                  }
                                }}
                                className="text-gray-500 hover:text-red-400 h-6 w-6 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Calendar Feed Modal */}
      <Dialog open={showCalendarFeed} onOpenChange={setShowCalendarFeed}>
        <DialogContent className="bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Link className="h-5 w-5 text-purple-400" />
              Calendar Feed
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Generate a secure token to subscribe to this calendar in Google Calendar, Apple Calendar, or any other calendar app:
            </p>
            
            <div className="flex gap-2">
              <Button 
                onClick={generateICSToken} 
                variant="outline" 
                className="border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                {icsToken ? 'Regenerate Token' : 'Generate Token'}
              </Button>
              {icsToken && (
                <Button 
                  onClick={copyICSUrl} 
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  Copy Feed URL
                </Button>
              )}
            </div>

            {icsToken ? (
              <div className="bg-gray-800 p-3 rounded-md font-mono text-sm break-all text-gray-300 border border-gray-700">
                {icsUrl}
              </div>
            ) : (
              <div className="bg-gray-800 p-3 rounded-md text-sm text-gray-500 border border-gray-700">
                Generate a token first to get your calendar feed URL
              </div>
            )}
            
            <p className="text-xs text-gray-500">
              {icsToken 
                ? 'Copy the URL above and add it to your calendar app as a new calendar subscription.'
                : 'Click "Generate Token" to create a secure feed URL for external calendar apps.'
              }
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Event Form */}
      {showCreateForm && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Create New Event</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title" className="text-gray-300">Title *</Label>
                  <Input
                    id="title"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Event title"
                    required
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                  />
                </div>
                
                <div>
                  <Label htmlFor="location" className="text-gray-300">Location</Label>
                  <Input
                    id="location"
                    value={newEvent.location}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="Event location"
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                  />
                </div>

                <div>
                  <Label htmlFor="start_time" className="text-gray-300">Start Time *</Label>
                  <Input
                    id="start_time"
                    type="datetime-local"
                    value={newEvent.start_time}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, start_time: e.target.value }))}
                    required
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>

                <div>
                  <Label htmlFor="end_time" className="text-gray-300">End Time *</Label>
                  <Input
                    id="end_time"
                    type="datetime-local"
                    value={newEvent.end_time}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, end_time: e.target.value }))}
                    required
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description" className="text-gray-300">Description</Label>
                <Textarea
                  id="description"
                  value={newEvent.description}
                  onChange={(e) => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Event description"
                  className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-gray-300">Mood</Label>
                  <Select 
                    value={newEvent.mood}
                    onValueChange={(value) => setNewEvent(prev => ({ ...prev, mood: value }))}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select mood" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="work" className="text-white">Work</SelectItem>
                      <SelectItem value="personal" className="text-white">Personal</SelectItem>
                      <SelectItem value="family" className="text-white">Family</SelectItem>
                      <SelectItem value="health" className="text-white">Health</SelectItem>
                      <SelectItem value="creative" className="text-white">Creative</SelectItem>
                      <SelectItem value="social" className="text-white">Social</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-300">Priority</Label>
                  <Select 
                    value={newEvent.priority?.toString()}
                    onValueChange={(value) => setNewEvent(prev => ({ ...prev, priority: parseInt(value) }))}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="1" className="text-white">1 - Low</SelectItem>
                      <SelectItem value="2" className="text-white">2</SelectItem>
                      <SelectItem value="3" className="text-white">3 - Medium</SelectItem>
                      <SelectItem value="4" className="text-white">4</SelectItem>
                      <SelectItem value="5" className="text-white">5 - High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-300">Energy Level</Label>
                  <Select 
                    value={newEvent.energy_level}
                    onValueChange={(value) => setNewEvent(prev => ({ ...prev, energy_level: value }))}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select energy level" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="low" className="text-white">Low</SelectItem>
                      <SelectItem value="medium" className="text-white">Medium</SelectItem>
                      <SelectItem value="high" className="text-white">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" className="bg-purple-600 hover:bg-purple-700">
                  Create Event
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowCreateForm(false)}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* All Events List (when not showing today) */}
      {filters.dateRange !== 'today' && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">
              {filters.dateRange === 'week' ? 'This Week' : 
               filters.dateRange === 'month' ? 'This Month' : 
               'All Events'}
              {filteredEvents.length > 0 && (
                <span className="text-sm font-normal text-gray-400 ml-2">
                  ({filteredEvents.length} events)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No events found</p>
                <p className="text-sm">Try adjusting your filters or create a new event</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredEvents.map((event) => (
                  <div key={event.id} className="border border-gray-700 rounded-lg p-4 hover:border-purple-500/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-white text-lg">{event.title}</h3>
                        {event.description && (
                          <p className="text-gray-400 mt-1">{event.description}</p>
                        )}
                        
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {formatDate(event.start_time)} at {formatTime(event.start_time)}
                          </div>
                          {event.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              {event.location}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                          {event.mood && (
                            <Badge variant="secondary" className={getMoodColor(event.mood)}>
                              {event.mood}
                            </Badge>
                          )}
                          {event.priority && (
                            <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                              Priority {event.priority}
                            </Badge>
                          )}
                          {event.energy_level && (
                            <Badge variant="secondary" className="bg-green-500/20 text-green-300 border-green-500/30">
                              {event.energy_level} energy
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditEvent(event)}
                        className="text-gray-400 hover:text-white"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Linked Items Section */}
                    {linkedItems[event.id] && linkedItems[event.id].length > 0 && (
                      <div className="mt-4 pt-3 border-t border-gray-700">
                        <h4 className="text-sm font-medium text-gray-400 mb-2">Linked Items</h4>
                        <div className="space-y-1">
                          {linkedItems[event.id].map((linkedItem) => (
                            <div 
                              key={linkedItem.link_id} 
                              className="flex items-center gap-2 p-2 rounded-md bg-gray-800/50 hover:bg-gray-700/50 transition-colors group"
                            >
                              {getEntityIcon(linkedItem.entity_type)}
                              <span 
                                className="text-sm text-gray-300 flex-1 group-hover:text-white transition-colors cursor-pointer"
                                onClick={() => handleNavigateToLinkedItem(linkedItem.entity_type, linkedItem.entity_id)}
                              >
                                {linkedItem.entity_type === 'task' 
                                  ? linkedItem.entity_data?.content 
                                  : linkedItem.entity_data?.title || 'Unknown'}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${getLinkTypeColor(linkedItem.link_type)}`}>
                                {linkedItem.link_type}
                              </span>
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  
                                  if (!user?.id) {
                                    toast.error('User not authenticated. Cannot delete link.');
                                    return;
                                  }

                                  const linkIdToDelete = linkedItem.link_id;
                                  console.log(`Attempting to delete link ID: ${linkIdToDelete} for user ID: ${user.id}`);

                                  try {
                                    const { data: deletedData, error: dbError } = await supabase
                                      .from('entity_links')
                                      .delete()
                                      .eq('id', linkIdToDelete)
                                      .eq('created_by', user.id) // Crucial for RLS
                                      .select(); // To confirm what was deleted

                                    if (dbError) {
                                      console.error('Supabase delete error:', dbError);
                                      toast.error(`Failed to delete link: ${dbError.message}`);
                                      return; // Stop if DB error
                                    }

                                    if (deletedData && deletedData.length > 0) {
                                      console.log('Successfully deleted from DB:', deletedData);
                                      // Update UI only after successful DB deletion
                                      setLinkedItems(prev => {
                                        const updated = { ...prev };
                                        Object.keys(updated).forEach(eventId => {
                                          updated[eventId] = updated[eventId].filter(
                                            item => item.link_id !== linkIdToDelete
                                          );
                                        });
                                        return updated;
                                      });
                                      toast.success('Link successfully removed!');
                                    } else {
                                      console.log('No records deleted from DB. Link not found or RLS prevented delete.');
                                      toast.message('Could not delete link. It might have already been removed or access was denied.');
                                      // Refresh linked items to ensure UI consistency if delete failed due to no record found
                                      fetchLinkedItems(); 
                                    }
                                  } catch (catchError) {
                                    console.error('Exception during delete operation:', catchError);
                                    toast.error('An unexpected error occurred while deleting the link.');
                                  }
                                }}
                                className="text-gray-500 hover:text-red-400 h-6 w-6 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Event Form */}
      {editingEventId && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Edit Event</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-title" className="text-gray-300">Title *</Label>
                  <Input
                    id="edit-title"
                    value={editedEventData.title || ''}
                    onChange={(e) => setEditedEventData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Event title"
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                  />
                </div>
                
                <div>
                  <Label htmlFor="edit-location" className="text-gray-300">Location</Label>
                  <Input
                    id="edit-location"
                    value={editedEventData.location || ''}
                    onChange={(e) => setEditedEventData(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="Event location"
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-start_time" className="text-gray-300">Start Time *</Label>
                  <Input
                    id="edit-start_time"
                    type="datetime-local"
                    value={editedEventData.start_time ? new Date(editedEventData.start_time).toISOString().slice(0, 16) : ''}
                    onChange={(e) => setEditedEventData(prev => ({ ...prev, start_time: e.target.value }))}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-end_time" className="text-gray-300">End Time *</Label>
                  <Input
                    id="edit-end_time"
                    type="datetime-local"
                    value={editedEventData.end_time ? new Date(editedEventData.end_time).toISOString().slice(0, 16) : ''}
                    onChange={(e) => setEditedEventData(prev => ({ ...prev, end_time: e.target.value }))}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-description" className="text-gray-300">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editedEventData.description || ''}
                  onChange={(e) => setEditedEventData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Event description"
                  className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-gray-300">Mood</Label>
                  <Select 
                    value={editedEventData.mood || ''}
                    onValueChange={(value) => setEditedEventData(prev => ({ ...prev, mood: value }))}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select mood" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="work" className="text-white">Work</SelectItem>
                      <SelectItem value="personal" className="text-white">Personal</SelectItem>
                      <SelectItem value="family" className="text-white">Family</SelectItem>
                      <SelectItem value="health" className="text-white">Health</SelectItem>
                      <SelectItem value="creative" className="text-white">Creative</SelectItem>
                      <SelectItem value="social" className="text-white">Social</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-300">Priority</Label>
                  <Select 
                    value={editedEventData.priority?.toString() || ''}
                    onValueChange={(value) => setEditedEventData(prev => ({ ...prev, priority: parseInt(value) }))}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="1" className="text-white">1 - Low</SelectItem>
                      <SelectItem value="2" className="text-white">2</SelectItem>
                      <SelectItem value="3" className="text-white">3 - Medium</SelectItem>
                      <SelectItem value="4" className="text-white">4</SelectItem>
                      <SelectItem value="5" className="text-white">5 - High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-300">Energy Level</Label>
                  <Select 
                    value={editedEventData.energy_level || ''}
                    onValueChange={(value) => setEditedEventData(prev => ({ ...prev, energy_level: value }))}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select energy level" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="low" className="text-white">Low</SelectItem>
                      <SelectItem value="medium" className="text-white">Medium</SelectItem>
                      <SelectItem value="high" className="text-white">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={() => handleSaveEdit(editingEventId)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleCancelEdit}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Link Items Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Link className="h-5 w-5 text-purple-400" />
              Link Tasks & Reminders
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <p className="text-sm text-gray-400">
              Link existing tasks and reminders to this calendar event for better organization.
            </p>

            {/* Available Tasks */}
            <div>
              <h3 className="text-lg font-medium text-white mb-3">Available Tasks</h3>
              {availableTasks.length === 0 ? (
                <p className="text-sm text-gray-500">No open tasks available to link.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableTasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-2 flex-1">
                        <CheckSquare className="h-4 w-4 text-blue-400" />
                        <span className="text-sm text-gray-300">{task.content}</span>
                        {task.priority && (
                          <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-400">
                            {task.priority}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => handleCreateLink('task', task.id.toString(), 'blocks_for', 'Calendar event blocks time for this task')}
                          className="text-xs h-7 bg-purple-600 hover:bg-purple-700"
                        >
                          Block Time
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCreateLink('task', task.id.toString(), 'references', 'Calendar event references this task')}
                          className="text-xs h-7 border-gray-600 text-gray-300 hover:bg-gray-700"
                        >
                          Reference
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Available Reminders */}
            <div>
              <h3 className="text-lg font-medium text-white mb-3">Available Reminders</h3>
              {availableReminders.length === 0 ? (
                <p className="text-sm text-gray-500">No pending reminders available to link.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableReminders.map((reminder) => (
                    <div key={reminder.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-2 flex-1">
                        <Bell className="h-4 w-4 text-orange-400" />
                        <span className="text-sm text-gray-300">{reminder.title}</span>
                        {reminder.priority && (
                          <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-400">
                            {reminder.priority}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => handleCreateLink('reminder', reminder.id, 'reminds_about', 'Calendar event has related reminder')}
                          className="text-xs h-7 bg-blue-600 hover:bg-blue-700"
                        >
                          Link Reminder
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCreateLink('reminder', reminder.id, 'references', 'Calendar event references this reminder')}
                          className="text-xs h-7 border-gray-600 text-gray-300 hover:bg-gray-700"
                        >
                          Reference
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 