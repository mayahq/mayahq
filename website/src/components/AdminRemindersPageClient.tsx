'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, Calendar, CheckSquare, MessageSquare, ExternalLink, Filter, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database } from '@/lib/database.types';

type Reminder = Database['public']['Tables']['maya_reminders']['Row'];
type EntityLink = Database['public']['Tables']['entity_links']['Row'];

interface LinkedItem {
  link_id: string;
  link_type: Database['public']['Enums']['relationship_type'];
  link_context: string | null;
  entity_type: string;
  entity_id: string;
  entity_data: any;
  created_at: string | null;
}

export default function AdminRemindersPageClient() {
  const { user, supabase, loading: authLoading } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [linkedItems, setLinkedItems] = useState<{ [key: string]: LinkedItem[] }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const fetchReminders = async () => {
    if (!user || !supabase) return;
    
    setLoading(true);
    try {
      // Fetch reminders
      const { data: remindersData, error: remindersError } = await supabase
        .from('maya_reminders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (remindersError) throw remindersError;

      setReminders(remindersData || []);

      // Fetch linked items for each reminder
      const linkPromises = (remindersData || []).map(async (reminder) => {
        const { data: links, error: linksError } = await supabase
          .rpc('find_related_entities', {
            p_entity_type: 'reminder',
            p_entity_id: reminder.id
          });

        if (linksError) {
          console.error(`Error fetching links for reminder ${reminder.id}:`, linksError);
          return { reminderId: reminder.id, links: [] };
        }

        return { reminderId: reminder.id, links: links || [] };
      });

      const linkResults = await Promise.all(linkPromises);
      const linksMap: { [key: string]: LinkedItem[] } = {};
      linkResults.forEach(({ reminderId, links }) => {
        linksMap[reminderId] = links;
      });
      setLinkedItems(linksMap);

      setError(null);
    } catch (err) {
      console.error('Error fetching reminders:', err);
      setError('Failed to load reminders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();
  }, [user, supabase]);

  const filteredReminders = reminders.filter(reminder => {
    if (!showCompleted && reminder.status !== 'pending') return false;
    if (priorityFilter !== 'all' && reminder.priority !== priorityFilter) return false;
    return true;
  });

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-900/40 text-red-300 border border-red-700/50';
      case 'high':
        return 'bg-orange-900/40 text-orange-300 border border-orange-700/50';
      case 'medium':
        return 'bg-blue-900/40 text-blue-300 border border-blue-700/50';
      case 'low':
        return 'bg-gray-800 text-gray-300 border border-gray-700';
      default:
        return 'bg-gray-800 text-gray-300 border border-gray-700';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1 && diffHours > -1) {
      return 'Now';
    } else if (diffHours < 24 && diffHours > 0) {
      return `In ${diffHours}h`;
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffDays > 1) {
      return `In ${diffDays} days`;
    } else if (diffDays === -1) {
      return 'Yesterday';
    } else if (diffDays < -1) {
      return `${Math.abs(diffDays)} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/50';
      case 'sent':
        return 'bg-blue-900/40 text-blue-300 border border-blue-700/50';
      case 'acknowledged':
        return 'bg-green-900/40 text-green-300 border border-green-700/50';
      case 'dismissed':
        return 'bg-gray-800 text-gray-300 border border-gray-700';
      case 'snoozed':
        return 'bg-purple-900/40 text-purple-300 border border-purple-700/50';
      default:
        return 'bg-gray-800 text-gray-300 border border-gray-700';
    }
  };

  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'message':
        return <MessageSquare className="h-4 w-4" />;
      case 'task':
        return <CheckSquare className="h-4 w-4" />;
      case 'calendar_event':
        return <Calendar className="h-4 w-4" />;
      case 'reminder':
        return <Clock className="h-4 w-4" />;
      default:
        return <ExternalLink className="h-4 w-4" />;
    }
  };

  const getEntityDisplay = (entityType: string, entityData: any) => {
    switch (entityType) {
      case 'message':
        return entityData?.content ? `"${entityData.content.substring(0, 50)}..."` : 'Message';
      case 'task':
        return entityData?.content || 'Task';
      case 'calendar_event':
        return entityData?.title || 'Calendar Event';
      case 'reminder':
        return entityData?.title || 'Reminder';
      default:
        return 'Unknown';
    }
  };

  const getLinkTypeColor = (linkType: string) => {
    switch (linkType) {
      case 'creates':
        return 'bg-green-800 text-green-300 border border-green-700';
      case 'references':
        return 'bg-blue-800 text-blue-300 border border-blue-700';
      case 'reminds_about':
        return 'bg-purple-800 text-purple-300 border border-purple-700';
      case 'follows_up':
        return 'bg-orange-800 text-orange-300 border border-orange-700';
      default:
        return 'bg-gray-800 text-gray-300 border border-gray-700';
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 text-gray-200">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Reminder Management</h1>
        <p className="text-gray-400 mt-2">Manage your reminders and view their connections</p>
        <div className="mt-2 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
          <p className="text-sm text-blue-300">
            📋 <strong>Development Note:</strong> This is a preview of the reminders interface. 
            Database integration will be completed once the maya_reminders table types are available.
          </p>
        </div>
      </div>
      
      {authLoading && (
        <div className="flex justify-center items-center h-32">
          <p>Loading user information...</p>
        </div>
      )}

      {!authLoading && !user && (
        <div className="flex justify-center items-center h-32">
          <p>Please log in to manage reminders.</p>
        </div>
      )}

      {!authLoading && user && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 ${
                  showCompleted 
                    ? 'bg-purple-900/50 text-purple-300 border border-purple-700' 
                    : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                }`}
              >
                <Filter className="h-4 w-4" />
                {showCompleted ? 'Hide Completed' : 'Show Completed'}
              </button>
              
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-3 py-2 rounded-md text-sm bg-gray-800 border border-gray-700 text-gray-300"
              >
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="text-sm text-gray-400">
              {filteredReminders.length} reminder{filteredReminders.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Loading and Error States */}
          {loading && (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-md bg-red-900/20 text-red-300 border border-red-900/30">
              {error}
            </div>
          )}

          {/* Reminders List */}
          {!loading && !error && (
            <div className="space-y-3">
              <AnimatePresence>
                {filteredReminders.map((reminder) => (
                  <motion.div
                    key={reminder.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 50 }}
                    className={`rounded-lg p-4 border transition-all ${
                      reminder.status !== 'pending'
                        ? 'bg-gray-900/30 border-gray-800 opacity-60'
                        : 'bg-gray-900/70 border-gray-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className={`font-medium ${reminder.status !== 'pending' ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                            {reminder.title}
                          </h3>
                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${getPriorityBadge(reminder.priority)}`}>
                            {reminder.priority}
                          </span>
                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${getStatusBadge(reminder.status)}`}>
                            {reminder.status}
                          </span>
                        </div>
                        
                        {reminder.content && (
                          <p className={`text-sm mb-3 ${reminder.status !== 'pending' ? 'text-gray-600' : 'text-gray-400'}`}>
                            {reminder.content}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{formatDate(reminder.remind_at)}</span>
                          </div>
                          <span>Type: {reminder.reminder_type}</span>
                          <span>Created: {new Date(reminder.created_at || '').toLocaleDateString()}</span>
                        </div>

                        {/* Linked Items */}
                        {linkedItems[reminder.id] && linkedItems[reminder.id].length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-800">
                            <h4 className="text-sm font-medium text-gray-400 mb-2">Linked Items</h4>
                            <div className="space-y-1">
                              {linkedItems[reminder.id].map((linkedItem) => (
                                <div key={linkedItem.link_id} className="flex items-center gap-2 p-2 rounded-md bg-gray-800/50">
                                  {getEntityIcon(linkedItem.entity_type)}
                                  <span className="text-sm text-gray-300">
                                    {getEntityDisplay(linkedItem.entity_type, linkedItem.entity_data)}
                                  </span>
                                  <span className={`text-xs px-2 py-1 rounded ${getLinkTypeColor(linkedItem.link_type)}`}>
                                    {linkedItem.link_type}
                                  </span>
                                  {linkedItem.link_context && (
                                    <span className="text-xs text-gray-500">
                                      ({linkedItem.link_context})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {filteredReminders.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-400">
                  <Clock className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-1">No reminders found</p>
                  <p className="text-sm">
                    {priorityFilter !== 'all' || !showCompleted ? 'Try adjusting your filters.' : 'Your reminders will appear here.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 