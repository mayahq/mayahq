'use client'

import React, { useEffect, useState, useRef, FormEvent, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Profile, FeedItem, FeedResponse } from '@/types/feed-types';
import { DatePicker } from '@/components/ui/date-picker';
import { format as formatDate, formatDistanceToNow } from 'date-fns';
import { FeedItemSkeletonCard } from './components/feed-item-skeleton-card';
import { FeedCommentsSection, type FeedCommentData } from './components/feed-comments-section';
import { Inbox, Info, MessageCircle, SendHorizonal, Filter as FilterIcon, Image as ImageIcon, Heart, RefreshCw, CalendarDays, RotateCcw, Download, Twitter, Instagram, Linkedin, Facebook, Send, Bookmark, Video } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const ITEM_TYPES = ['text_mood_engine', 'image_comfyui', 'image_mood_engine', 'image_studio_manual', 'image_studio_series_master', 'image_series_variation', 'image_inspo', 'image_generated'];
const SOURCE_SYSTEMS = ['MoodEngine', 'ComfyUI', 'SeriesGenerator', 'ImageStudio', 'ImageStudioSeries', 'InstagramInspo', 'SceneReplication'];
const STATUS_OPTIONS: FeedItem['status'][] = ['pending_review', 'approved', 'rejected', 'approved_for_posting', 'posted_social', 'error_posting', 'prompt_generated', 'image_generated_pending_review', 'series_generated'];

// Get source system badge color
const getSourceSystemColor = (sourceSystem: string) => {
  switch (sourceSystem) {
    case 'InstagramInspo':
      return 'bg-pink-600/40 text-pink-300'; // Instagram pink
    case 'SceneReplication':
      return 'bg-purple-600/40 text-purple-300';
    case 'MoodEngine':
      return 'bg-violet-600/40 text-violet-300';
    case 'ComfyUI':
      return 'bg-red-600/40 text-red-300';
    case 'SeriesGenerator':
      return 'bg-emerald-600/40 text-emerald-300';
    case 'ImageStudio':
    case 'ImageStudioSeries':
      return 'bg-amber-600/40 text-amber-300';
    default:
      return 'bg-teal-600/40 text-teal-300';
  }
};

// Updated interface for comments
export interface FeedItemComment {
  id: string;
  feed_item_id: string;
  user_id: string; // The ID of the user who commented
  comment_text: string;
  created_at: string;
  updated_at: string;
  user_profile: Profile | null; // Embedded commenter profile (can be null if join fails or profile missing)
}

export default function FeedPage() {
  const { user, profile, supabase, session: authContextSession } = useAuth(); // Use supabase from AuthContext, alias session
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isLoadingFeedItems, setIsLoadingFeedItems] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [limit, setLimit] = useState(24);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterItemType, setFilterItemType] = useState<string>('');
  const [filterSourceSystem, setFilterSourceSystem] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>(undefined);
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>(undefined);

  const MEMORY_WORKER_API_URL = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002';

  const [currentFeedItemToActOn, setCurrentFeedItemToActOn] = useState<FeedItem | null>(null);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [editableContentData, setEditableContentData] = useState<any>({});
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [comments, setComments] = useState<{[itemId: string]: FeedItemComment[]}>({});
  const [isLoadingComments, setIsLoadingComments] = useState<{[itemId: string]: boolean}>({});
  const [newCommentText, setNewCommentText] = useState<{[itemId: string]: string}>({});
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isDesktopFiltersOpen, setIsDesktopFiltersOpen] = useState(false); // State for desktop collapsible

  // New state for Lightbox
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // New state for Series Gallery Dialog - extended
  const [currentSeriesMasterItem, setCurrentSeriesMasterItem] = useState<FeedItem | null>(null);
  const [currentSeriesVariationItems, setCurrentSeriesVariationItems] = useState<FeedItem[]>([]);
  const [isLoadingSeriesVariations, setIsLoadingSeriesVariations] = useState(false);
  const [isSeriesGalleryOpen, setIsSeriesGalleryOpen] = useState(false);

  // New state for user's liked items
  const [userLikedItems, setUserLikedItems] = useState<Set<string>>(new Set());
  const [isLoadingUserLikes, setIsLoadingUserLikes] = useState(false);

  // Add new state for social media posting (simplified)
  const [selectedPlatforms, setSelectedPlatforms] = useState<{[itemId: string]: string[]}>({});
  const [isSocialPostingDialogOpen, setIsSocialPostingDialogOpen] = useState(false);
  const [currentItemForSocialPosting, setCurrentItemForSocialPosting] = useState<FeedItem | null>(null);

  // Add new state for social media platforms (fetched from database)
  const [socialPlatforms, setSocialPlatforms] = useState<Array<{
    id: string;
    name: string;
    display_name: string;
    icon: any;
  }>>([]);
  const [isLoadingSocialPlatforms, setIsLoadingSocialPlatforms] = useState(false);

  // State for scene generation (Instagram Inspo → Maya)
  const [isGeneratingScene, setIsGeneratingScene] = useState<{[itemId: string]: boolean}>({});

  // State for video generation
  const [isGeneratingVideo, setIsGeneratingVideo] = useState<{[itemId: string]: boolean}>({});

  // Fetch social media platforms from database
  const fetchSocialPlatforms = useCallback(async () => {
    if (!supabase) return;
    setIsLoadingSocialPlatforms(true);
    try {
      // Use type assertion to bypass TypeScript errors for new table
      const { data, error } = await (supabase as any)
        .from('social_media_platforms')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('Error fetching social platforms:', error);
        toast.error('Failed to load social media platforms');
        return;
      }

      console.log('[FeedPage] Fetched social platforms:', data);

      // Map database platforms to frontend format with icons
      const platformsWithIcons = data.map((platform: any) => {
        let icon;
        switch (platform.name) {
          case 'twitter':
            icon = Twitter;
            break;
          case 'instagram':
            icon = Instagram;
            break;
          case 'linkedin':
            icon = Linkedin;
            break;
          case 'facebook':
            icon = Facebook;
            break;
          default:
            icon = MessageCircle; // fallback icon
        }
        return {
          id: platform.id,
          name: platform.name,
          display_name: platform.display_name,
          icon
        };
      });

      console.log('[FeedPage] Mapped platforms with icons:', platformsWithIcons);
      setSocialPlatforms(platformsWithIcons);
    } catch (error: any) {
      console.error('Error fetching social platforms:', error);
      toast.error('Failed to load social media platforms');
    } finally {
      setIsLoadingSocialPlatforms(false);
    }
  }, [supabase]);

  // Handle social media platform selection
  const togglePlatformSelection = (itemId: string, platformId: string) => {
    setSelectedPlatforms(prev => {
      const currentSelections = prev[itemId] || [];
      const isSelected = currentSelections.includes(platformId);
      
      if (isSelected) {
        return {
          ...prev,
          [itemId]: currentSelections.filter(id => id !== platformId)
        };
      } else {
        return {
          ...prev,
          [itemId]: [...currentSelections, platformId]
        };
      }
    });
  };

  // Schedule social media posts (simplified)
  const scheduleSocialPosts = async (item: FeedItem, platformIds: string[]) => {
    console.log('[FeedPage] scheduleSocialPosts called with:', { itemId: item.id, platformIds });
    console.log('[FeedPage] Available social platforms:', socialPlatforms);
    console.log('[FeedPage] Selected platforms for item:', selectedPlatforms[item.id]);
    
    if (platformIds.length === 0) {
      toast.error('Please select at least one platform');
      return;
    }
    
    setIsProcessingAction(true);
    try {
      console.log('[FeedPage] Sending request to API with platformIds:', platformIds);
      
      const response = await fetch(`/api/v1/feed/items/${item.id}/schedule-social-posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ platformIds })
      });

      console.log('[FeedPage] API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[FeedPage] API error response:', errorData);
        throw new Error(errorData.error || 'Failed to schedule social media posts');
      }

      const responseData = await response.json();
      console.log('[FeedPage] API success response:', responseData);
      toast.success(`${responseData.message} for: ${responseData.platforms}`);
      setIsSocialPostingDialogOpen(false);
      setSelectedPlatforms(prev => ({ ...prev, [item.id]: [] }));
      
      // Refresh the feed to show updated status
      fetchFeedItems(currentPage);
      
    } catch (error: any) {
      console.error('Error scheduling social posts:', error);
      toast.error(error.message || 'Failed to schedule social media posts');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Open social posting dialog
  const openSocialPostingDialog = (item: FeedItem) => {
    setCurrentItemForSocialPosting(item);
    setIsSocialPostingDialogOpen(true);
  };

  // Enhanced content rendering for n8n processed items
  const renderEnhancedContentData = (item: FeedItem) => {
    const contentData = item.content_data;
    
    // Handle n8n processed social posts
    if (item.source_system === 'n8n_maya_processor' && contentData?.processed_content) {
      return (
        <div className="space-y-3">
          <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-purple-400 font-semibold">✨ Maya's Take</span>
              <Badge variant="outline" className="text-xs border-purple-500/50 text-purple-300">
                AI Processed
              </Badge>
            </div>
            <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
              {contentData.processed_content}
            </p>
          </div>
          
          {/* Original source info */}
          {contentData.original_title && (
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-gray-400 mb-1">Original Source</h4>
              <p className="text-sm text-gray-300">{contentData.original_title}</p>
              {contentData.source_url && (
                <a 
                  href={contentData.source_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 underline mt-1 inline-block"
                >
                  View Original →
                </a>
              )}
              {contentData.source_metadata && (
                <div className="mt-2 text-xs text-gray-500">
                  {contentData.source_metadata.score && (
                    <span className="mr-3">Score: {contentData.source_metadata.score}</span>
                  )}
                  {contentData.source_metadata.comment_count && (
                    <span>Comments: {contentData.source_metadata.comment_count}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    
    // Fallback to original rendering
    return renderContentData(item);
  };

  // Define fetchCommentsForItem BEFORE fetchFeedItems because fetchFeedItems depends on it
  const fetchCommentsForItem = useCallback(async (itemId: string) => {
    if (!supabase) { toast.error("Client not ready"); return; }
    console.log(`[FeedPage] Fetching comments for item: ${itemId}`); 
    setIsLoadingComments(prev => ({...prev, [itemId]: true}));
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${itemId}/comments`);
      if (!response.ok) {
        throw new Error('Failed to fetch comments');
      }
      const data: FeedItemComment[] = await response.json();
      console.log(`[FeedPage] Fetched comments data for item ${itemId}:`, data); 
      setComments(prev => {
        const newState = {...prev, [itemId]: data || []};
        console.log(`[FeedPage] Comments state after setting for item ${itemId}:`, newState); 
        return newState;
      });
    } catch (error: any) {
      toast.error(error.message || 'Could not load comments.');
      setComments(prev => ({...prev, [itemId]: []})); 
    } finally {
      setIsLoadingComments(prev => ({...prev, [itemId]: false}));
    }
  }, [MEMORY_WORKER_API_URL, supabase]);

  const fetchFeedItems = useCallback(async (pageToFetch = 1, currentLimit = limit, append = false) => {
    if (!supabase) { toast.error("Client not ready"); return; }
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoadingFeedItems(true);
    }
    const queryParams = new URLSearchParams({
      page: pageToFetch.toString(),
      limit: currentLimit.toString(),
    });
    if (filterStatus) queryParams.append('status', filterStatus);
    if (filterItemType) queryParams.append('item_type', filterItemType);
    if (filterSourceSystem) queryParams.append('source_system', filterSourceSystem);

    if (filterDateFrom) queryParams.append('date_from', formatDate(filterDateFrom, 'yyyy-MM-dd'));
    if (filterDateTo) queryParams.append('date_to', formatDate(filterDateTo, 'yyyy-MM-dd'));

    let fetchedItems: FeedItem[] = [];

    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items?${queryParams.toString()}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch feed items.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data: FeedResponse = await response.json();
      fetchedItems = data.items || [];
      if (append) {
        setFeedItems(prev => [...prev, ...fetchedItems]);
      } else {
        setFeedItems(fetchedItems);
      }
      setTotalPages(data.total_pages || 1);
      setCurrentPage(data.page || 1);
      setTotalCount(data.total_count || 0);
      setHasMore((data.page || 1) < (data.total_pages || 1));
    } catch (error: any) {
      console.error('Error fetching feed items:', error);
      if (!append) {
        toast.error(error.message || 'Failed to fetch feed items.');
        setFeedItems([]);
        setTotalPages(1);
        setTotalCount(0);
      }
    } finally {
      setIsLoadingFeedItems(false);
      setIsLoadingMore(false);
    }
    if (fetchedItems.length > 0) {
        fetchedItems.forEach(item => {
            fetchCommentsForItem(item.id);
        });
        if (user && fetchedItems.length > 0) {
          fetchUserLikes(fetchedItems.map(item => item.id));
        }
    }
  }, [limit, filterStatus, filterItemType, filterSourceSystem, filterDateFrom, filterDateTo, fetchCommentsForItem, user, supabase]);

  const fetchUserLikes = useCallback(async (itemIds: string[]) => {
    if (!user || itemIds.length === 0 || !supabase) return;
    setIsLoadingUserLikes(true);
    try {
      const { data, error } = await supabase
        .from('feed_item_likes')
        .select('feed_item_id')
        .eq('user_id', user.id)
        .in('feed_item_id', itemIds);

      if (error) {
        console.error("Error fetching user likes:", error);
        toast.error("Could not load your like statuses.");
        setUserLikedItems(new Set());
      } else {
        const likedIds = new Set(data.map(like => like.feed_item_id));
        setUserLikedItems(prevLikes => new Set([...Array.from(prevLikes), ...Array.from(likedIds)]));
      }
    } catch (error: any) {
      console.error("Unexpected error fetching user likes:", error);
      toast.error(error.message || "Could not load your like statuses.");
    } finally {
      setIsLoadingUserLikes(false);
    }
  }, [supabase, user]);

  const fetchSeriesVariationFeedItems = useCallback(async (masterItemId: string) => {
    if (!supabase) { toast.error("Client not ready"); return; }
    console.log(`[FeedPage] fetchSeriesVariationFeedItems called for master ID: ${masterItemId}`);
    if (!masterItemId) {
      console.log('[FeedPage] fetchSeriesVariationFeedItems: masterItemId is null or undefined, returning.');
      return;
    }
    setIsLoadingSeriesVariations(true);
    setCurrentSeriesVariationItems([]);
    try {
      const { data, error } = await supabase
        .from('feed_items')
        .select('*')
        .eq('parent_feed_item_id', masterItemId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error("[FeedPage] Error fetching series variations:", error);
        toast.error("Could not load series variations.");
      } else if (data) {
        console.log(`[FeedPage] Fetched series variations data for master ID ${masterItemId}:`, data);
        setCurrentSeriesVariationItems(data as FeedItem[]);
        if (user && data.length > 0) {
          const itemIds = data.map(item => item.id);
          fetchUserLikes(itemIds); // Fetch likes for variations
          itemIds.forEach(id => fetchCommentsForItem(id)); // Fetch comments for each variation
        }
      }
    } catch (error: any) {
      console.error("[FeedPage] Unexpected error fetching series variations:", error);
      toast.error(error.message || "Could not load series variations.");
    } finally {
      setIsLoadingSeriesVariations(false);
    }
  }, [supabase, user, fetchUserLikes, fetchCommentsForItem]);

  const handleLikeToggle = async (itemId: string, isCurrentlyLiked: boolean) => {
    if (!user || !supabase) { toast.error("Client not ready"); return; }
    setUserLikedItems(prevLikes => {
      const newLikes = new Set(prevLikes);
      if (isCurrentlyLiked) {
        newLikes.delete(itemId);
      } else {
        newLikes.add(itemId);
      }
      return newLikes;
    });
    try {
      const endpoint = `/api/v1/feed/items/${itemId}/${isCurrentlyLiked ? 'unlike' : 'like'}`;
      const method = isCurrentlyLiked ? 'DELETE' : 'POST';
      // const { data: { session } } = await supabase.auth.getSession();
      const token = authContextSession?.access_token;
      if (!token) {
        toast.error("Authentication error. Please log in again.");
        setUserLikedItems(prevLikes => {
          const newLikes = new Set(prevLikes);
          if (isCurrentlyLiked) { newLikes.add(itemId); } else { newLikes.delete(itemId); }
          return newLikes;
        });
        return;
      }
      const response = await fetch(endpoint, { method: method, headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to ${isCurrentlyLiked ? 'unlike' : 'like'} item.`);
      }
    } catch (error: any) {
      console.error(`Error toggling like for item ${itemId}:`, error);
      toast.error(error.message);
      setUserLikedItems(prevLikes => {
        const newLikes = new Set(prevLikes);
        if (isCurrentlyLiked) { newLikes.add(itemId); } else { newLikes.delete(itemId); }
        return newLikes;
      });
    }
  };

  // Handler for Recreate
  const handleRecreate = async (itemToRecreate: FeedItem) => {
    if (!user || !supabase) { toast.error("Client not ready"); return; }
    console.log("[FeedPage] Recreate requested for item:", itemToRecreate);
    setIsProcessingAction(true); // Indicate an action is in progress

    let masterId = itemToRecreate.parent_feed_item_id || itemToRecreate.id;
    let promptForRecreation = itemToRecreate.content_data?.generated_image_prompt || itemToRecreate.content_data?.prompt;

    // Basic check for prompt - can be expanded
    if (!promptForRecreation) {
      // Attempt to reconstruct from raw_image_prompt_components if primary prompt is missing
      // This is a simplified join; more complex reconstruction might be needed depending on structure.
      if (Array.isArray(itemToRecreate.content_data?.raw_image_prompt_components)) {
        promptForRecreation = itemToRecreate.content_data.raw_image_prompt_components
          .map((comp: any) => comp.value)
          .filter(Boolean)
          .join(', ');
      }
      if (!promptForRecreation) {
        toast.error("Could not find a prompt to use for recreation.");
        setIsProcessingAction(false);
        return;
      }
      console.log("[FeedPage] Used reconstructed prompt for recreation:", promptForRecreation);
    }

    // TODO: Implement an optional dialog here for user to edit `promptForRecreation`
    // For now, we use the determined prompt directly.

    const payload = {
      source_feed_item_id: itemToRecreate.id,
      master_feed_item_id: masterId,
      prompt_override: promptForRecreation, // Using the determined/reconstructed prompt as override for now
    };

    toast.info(`Sending recreation request for ${itemToRecreate.id}...`);

    try {
      // const { data: { session } } = await supabase.auth.getSession();
      const token = authContextSession?.access_token;
      if (!token) {
        toast.error("Authentication error. Please log in again.");
        setIsProcessingAction(false);
        return;
      }

      // Assuming series-generator is running on its own port/URL, configure this URL
      // For local development, this might be http://localhost:8009/recreate-variation
      // For production, it's your Railway URL for series-generator
      const SERIES_GENERATOR_API_URL = process.env.NEXT_PUBLIC_SERIES_GENERATOR_URL || 'http://localhost:8009'; 
      
      const response = await fetch(`${SERIES_GENERATOR_API_URL}/recreate-variation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // If your series-generator endpoint is protected
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.error || 'Failed to submit recreation request.');
      }

      const responseData = await response.json();
      toast.success(responseData.message || "Recreation task accepted! Check series gallery shortly.");

      // If the series gallery for this master item is currently open, refresh its variations
      if (isSeriesGalleryOpen && currentSeriesMasterItem?.id === masterId) {
        setTimeout(() => { // Give backend a moment to process before refetching
            fetchSeriesVariationFeedItems(masterId);
        }, 3000); // Adjust delay as needed
      }

    } catch (error: any) {
      console.error("Error submitting recreation request:", error);
      toast.error(error.message || "An error occurred during recreation.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  useEffect(() => {
    setFeedItems([]);
    setCurrentPage(1);
    setHasMore(true);
    fetchFeedItems(1);
  }, [fetchFeedItems]);

  // Infinite scroll observer
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingFeedItems && !isLoadingMore) {
          fetchFeedItems(currentPage + 1, limit, true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoadingFeedItems, isLoadingMore, currentPage, limit, fetchFeedItems]);

  useEffect(() => {
    fetchSocialPlatforms();
  }, [fetchSocialPlatforms]);
  
  const handleFilterChange = () => {
    fetchFeedItems(1);
  };

  const handleImageClick = (imageUrl: string, item: FeedItem) => {
    setLightboxImageUrl(imageUrl);
    setCurrentFeedItemToActOn(item);
    setIsLightboxOpen(true);
  };

  const openSeriesGallery = (masterItem: FeedItem) => {
    if (!masterItem || !masterItem.id) {
      toast.error("Cannot open series gallery: Master item ID is missing.");
      return;
    }
    setCurrentSeriesMasterItem(masterItem);
    setIsSeriesGalleryOpen(true);
    fetchSeriesVariationFeedItems(masterItem.id);
  };

  // Handle generate Maya in scene (for inspo images)
  const handleGenerateScene = async (item: FeedItem) => {
    if (isGeneratingScene[item.id]) return;

    setIsGeneratingScene(prev => ({ ...prev, [item.id]: true }));
    toast.info('Generating Maya in scene... This may take a moment.');

    try {
      const response = await fetch(
        `${MEMORY_WORKER_API_URL}/api/v1/feed/items/${item.id}/generate-scene-replication`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed with status ${response.status}`);
      }

      const result = await response.json();
      toast.success(result.caption || "Maya's version generated successfully!");

      // Refresh the feed to show updated status
      fetchFeedItems(currentPage);

    } catch (error: any) {
      console.error('Scene generation failed:', error);
      toast.error(error.message || 'Failed to generate Maya in scene. Please try again.');
    } finally {
      setIsGeneratingScene(prev => ({ ...prev, [item.id]: false }));
    }
  };

  // Handle generate video from feed item image
  const handleGenerateVideo = async (item: FeedItem) => {
    if (isGeneratingVideo[item.id]) return;

    setIsGeneratingVideo(prev => ({ ...prev, [item.id]: true }));
    toast.info('Video generation started — it\'ll appear in your feed when ready.');

    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data?.session?.access_token;

      const response = await fetch(
        `${MEMORY_WORKER_API_URL}/api/v1/feed/items/${item.id}/generate-video`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed with status ${response.status}`);
      }

      toast.success('Video generation queued! Check back in a few minutes.');
    } catch (error: any) {
      console.error('Video generation failed:', error);
      toast.error(error.message || 'Failed to start video generation.');
    } finally {
      setIsGeneratingVideo(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const openRejectDialog = (item: FeedItem) => {
    setCurrentFeedItemToActOn(item);
    setRejectionNotes(item.admin_review_notes || '');
    setIsRejectDialogOpen(true);
  };

  const openEditDialog = (item: FeedItem) => {
    setCurrentFeedItemToActOn(item);
    if (item.item_type === 'text_mood_engine') {
      setEditableContentData({
        text: item.content_data?.text || '',
        mood_id: item.content_data?.mood_id || ''
      });
    } else if (item.item_type === 'image_comfyui') {
      setEditableContentData({
        image_url: item.content_data?.image_url || '',
        prompt: item.content_data?.prompt || '',
        negative_prompt: item.content_data?.negative_prompt || '',
        ...(typeof item.content_data === 'object' && item.content_data !== null ? item.content_data : {})
      });
    } else if (item.item_type === 'image_mood_engine' || item.item_type === 'image_studio_series_master' || item.item_type === 'image_series_variation') {
      setEditableContentData({
        image_url: item.content_data?.image_url || '',
        generated_image_prompt: item.content_data?.generated_image_prompt || '',
        ...(typeof item.content_data === 'object' && item.content_data !== null && !item.content_data.raw_image_prompt_components ? item.content_data : { raw_image_prompt_components_json_string: JSON.stringify(item.content_data?.raw_image_prompt_components || [], null, 2) })
      });
    } else if (item.item_type === 'image_inspo') {
      setEditableContentData({
        image_url: item.content_data?.image_url || '',
        caption: item.content_data?.caption || '',
        source_account: item.content_data?.source_account || '',
        source_hashtag: item.content_data?.source_hashtag || '',
      });
    } else if (item.item_type === 'image_generated') {
      setEditableContentData({
        image_url: item.content_data?.image_url || '',
        caption: item.content_data?.caption || '',
        generated_image_prompt: item.content_data?.generated_image_prompt || '',
      });
    } else {
      setEditableContentData(JSON.parse(JSON.stringify(item.content_data || {})));
    }
    setIsEditDialogOpen(true);
  };

  async function handleApprove(item: FeedItem) {
    if (!supabase) { toast.error("Client not ready"); return; }
    setIsProcessingAction(true);
    toast.info(`Approving item: ${item.id}`);
    try {
      // const { data: { session } } = await supabase.auth.getSession();
      const token = authContextSession?.access_token;
      if (!token) {
        toast.error("Authentication error. Please log in again.");
        setIsProcessingAction(false);
        return;
      }
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${item.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to approve item.');
      }
      toast.success(`Item ${item.id} approved successfully.`);
      fetchFeedItems(currentPage); 
    } catch (error: any) {
      toast.error(error.message);
      console.error("Error approving item:", error);
    } finally {
      setIsProcessingAction(false);
    }
  }

  const handleRejectSubmit = async () => {
    if (!currentFeedItemToActOn || !supabase) return;
    setIsProcessingAction(true);
    toast.info(`Rejecting item: ${currentFeedItemToActOn.id}`);
    try {
      // const { data: { session } } = await supabase.auth.getSession();
      const token = authContextSession?.access_token;
      if (!token) {
        toast.error("Authentication error. Please log in again.");
        setIsProcessingAction(false);
        return;
      }
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${currentFeedItemToActOn.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ admin_review_notes: rejectionNotes }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to reject item.');
      }
      toast.success(`Item ${currentFeedItemToActOn.id} rejected.`);
      fetchFeedItems(currentPage); 
      setIsRejectDialogOpen(false);
      setCurrentFeedItemToActOn(null);
    } catch (error: any) {
      toast.error(error.message);
      console.error("Error rejecting item:", error);
    } finally {
      setIsProcessingAction(false);
    }
  };

  async function handleEditSave() {
    if (!currentFeedItemToActOn || !supabase) return;
    if (JSON.stringify(editableContentData) === JSON.stringify(currentFeedItemToActOn.content_data)) {
      toast.info("No changes made to content.");
      setIsEditDialogOpen(false);
      return;
    }
    setIsProcessingAction(true);
    toast.info(`Saving changes for item: ${currentFeedItemToActOn.id}`);
    try {
      // const { data: { session } } = await supabase.auth.getSession();
      const token = authContextSession?.access_token;
      if (!token) {
        toast.error("Authentication error. Please log in again.");
        setIsProcessingAction(false);
        return;
      }
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${currentFeedItemToActOn.id}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ content_data: editableContentData }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save edited content.');
      }
      toast.success('Content updated successfully!');
      setIsEditDialogOpen(false);
      setCurrentFeedItemToActOn(null);
      fetchFeedItems(currentPage); 
    } catch (error: any) {
      toast.error(error.message);
      console.error("Error saving edited content:", error);
    } finally {
      setIsProcessingAction(false);
    }
  }
  
  const renderContentData = (item: FeedItem) => {
    console.log(`[FeedPage] Rendering item ID: ${item.id}, Type: ${item.item_type}, Original content_data type: ${typeof item.content_data}`);
    // console.log("[FeedPage] Original item.content_data:", item.content_data); // Uncomment for very verbose logging

    let contentDisplay = null;
    let parsedContentData: any = item.content_data;

    if (typeof item.content_data === 'string') {
      try {
        parsedContentData = JSON.parse(item.content_data);
        console.log(`[FeedPage] Successfully parsed content_data string for item ID: ${item.id}:`, parsedContentData);
      } catch (error) {
        console.error(`[FeedPage] Failed to parse content_data string for item ID: ${item.id}:`, error);
        console.error("[FeedPage] Malformed content_data string was:", item.content_data);
        return <p className="text-red-500 text-xs">Error: Could not display content (invalid JSON string in content_data).</p>;
      }
    }
    
    // Now, parsedContentData should ideally be an object.
    // If it's not an object at this point, it means the original content_data was not a string (so no parsing attempted) 
    // AND it wasn't an object to begin with, OR parsing failed and we already returned.
    if (typeof parsedContentData !== 'object' || parsedContentData === null) {
        console.warn(`[FeedPage] parsedContentData for item ID: ${item.id} is not an object or is null. Type: ${typeof parsedContentData}, Value:`, parsedContentData);
        if (item.content_data) { 
             return <p className="text-xs text-gray-400">Raw Content Data (not an object): {String(item.content_data)}</p>;
        }
        return <p className="text-xs text-gray-400">No content data available (was null or undefined).</p>;
    }

    // If we reach here, parsedContentData IS an object.
    console.log(`[FeedPage] Processing item ID: ${item.id} as object with item_type: ${item.item_type}. Parsed content_data:`, parsedContentData);

    if (item.item_type === 'text_from_github_commit') {
      console.log(`[FeedPage] Matched item_type 'text_from_github_commit' for item ID: ${item.id}`);
      const commitText = parsedContentData.text;
      const commitInfo = parsedContentData.commit_info;

      contentDisplay = (
        <div className="space-y-2">
          <p className="text-sm whitespace-pre-wrap">{commitText || "No generated text."}</p>
          {commitInfo && (
            <Card className="bg-slate-800/50 border-slate-700/50 mt-2">
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-xs text-slate-400">Commit Details</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-1 pb-3">
                {commitInfo.message && <p><strong>Message:</strong> {(commitInfo.message.split('\n')[0] || '').substring(0,100)}{commitInfo.message.length > 100 ? '...' : ''}</p>} 
                {commitInfo.author && <p><strong>Author:</strong> {commitInfo.author}</p>}
                {commitInfo.repo && <p><strong>Repo:</strong> {commitInfo.repo}</p>}
                {commitInfo.files_changed !== undefined && <p><strong>Files Changed:</strong> {commitInfo.files_changed}</p>}
                {commitInfo.timestamp && <p><strong>Date:</strong> {formatDate(new Date(commitInfo.timestamp), "MMM d, yyyy 'at' h:mm a")}</p>}
                {commitInfo.url && (
                  <p>
                    <a
                      href={commitInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      View Commit on GitHub
                    </a>
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      );
    } else if (item.item_type === 'text_mood_engine') {
       console.log(`[FeedPage] Matched item_type 'text_mood_engine' for item ID: ${item.id}`);
       contentDisplay = <p className="text-sm whitespace-pre-wrap">{parsedContentData.text || String(item.content_data)}</p>;
    } else if (item.item_type && (item.item_type.startsWith('image_') || item.item_type.startsWith('video_'))) {
      console.log(`[FeedPage] Matched image/video type for item ID: ${item.id}`);
      const imageUrl = parsedContentData.image_url || parsedContentData.url;
      const prompt = parsedContentData.prompt || parsedContentData.generated_image_prompt;
      contentDisplay = (
        <div className="space-y-2">
          {imageUrl && (
            <img
              src={imageUrl}
              alt={prompt || `Generated ${item.item_type}`}
              className="rounded-lg w-full cursor-pointer border border-slate-700/50"
              onClick={() => handleImageClick(imageUrl, item)}
              loading="lazy"
            />
          )}
          {prompt && <p className="text-xs text-slate-400 italic">Prompt: {prompt}</p>}
        </div>
      );
    } else if (parsedContentData && Object.keys(parsedContentData).length > 0) {
      console.warn(`[FeedPage] Fallback: Rendering generic JSON for item ID: ${item.id}, type: ${item.item_type}`);
      try {
        contentDisplay = (
          <pre className="text-xs bg-slate-800/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(parsedContentData, null, 2)}
          </pre>
        );
      } catch (e) {
        console.error(`[FeedPage] Error stringifying parsedContentData in fallback for item ID: ${item.id}`, e);
        contentDisplay = <p className="text-xs text-gray-400">Raw Content Data (error in fallback): {String(item.content_data)}</p>;
      }
    } else {
      console.warn(`[FeedPage] Fallback: No content data or unhandled type for item ID: ${item.id}, type: ${item.item_type}`);
      contentDisplay = <p className="text-xs text-gray-400">No content data available or type not specifically handled.</p>;
    }

    return contentDisplay;
  };

  const handleAddComment = async (itemId: string) => {
    if (!supabase) { toast.error("Client not ready"); return; }
    const text = newCommentText[itemId]?.trim();
    if (!text) {
      toast.error("Comment cannot be empty.");
      return;
    }
    setIsProcessingAction(true); 
    // const { data: { session } } = await supabase.auth.getSession();
    const token = authContextSession?.access_token;
    if (!token) {
      toast.error("Authentication error. Please log in again.");
      setIsProcessingAction(false);
      return;
    }
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${itemId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ comment_text: text }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to add comment.');
      }
      const newComment: FeedItemComment = await response.json();
      setComments(prev => {
        const updatedItemComments = [...(prev[itemId] || []), newComment];
        return {...prev, [itemId]: updatedItemComments };
      });
      setNewCommentText(prev => ({...prev, [itemId]: ''}));
      toast.success('Comment added!');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const FilterControls = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1">
        <div>
            <Label htmlFor="filterStatus" className="text-xs text-gray-400 mb-1 block">Status</Label>
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value === 'all' ? '' : value)}>
                <SelectTrigger id="filterStatus" className="w-full bg-gray-800 border-gray-700 text-sm h-9">
                    <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-gray-100">
                    <SelectItem value="all">All Statuses</SelectItem>
                    {STATUS_OPTIONS.map(status => (
                        <SelectItem key={status} value={status}>{status.replace('_', ' ').toUpperCase()}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        <div>
            <Label htmlFor="filterItemType" className="text-xs text-gray-400 mb-1 block">Item Type</Label>
            <Select value={filterItemType} onValueChange={(value) => setFilterItemType(value === 'all' ? '' : value)}>
                <SelectTrigger id="filterItemType" className="w-full bg-gray-800 border-gray-700 text-sm h-9">
                    <SelectValue placeholder="All Item Types" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-gray-100">
                    <SelectItem value="all">All Item Types</SelectItem>
                    {ITEM_TYPES.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        <div>
            <Label htmlFor="filterSourceSystem" className="text-xs text-gray-400 mb-1 block">Source System</Label>
            <Select value={filterSourceSystem} onValueChange={(value) => setFilterSourceSystem(value === 'all' ? '' : value)}>
                <SelectTrigger id="filterSourceSystem" className="w-full bg-gray-800 border-gray-700 text-sm h-9">
                    <SelectValue placeholder="All Source Systems" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-gray-100">
                    <SelectItem value="all">All Source Systems</SelectItem>
                    {SOURCE_SYSTEMS.map(system => (
                        <SelectItem key={system} value={system}>{system}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        <div>
            <Label htmlFor="limitPerPage" className="text-xs text-gray-400 mb-1 block">Per Page</Label>
            <Select value={limit.toString()} onValueChange={(value) => setLimit(parseInt(value))}>
                <SelectTrigger id="limitPerPage" className="w-full bg-gray-800 border-gray-700 text-sm h-9">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-gray-100">
                    {[10, 20, 50, 100].map(val => (
                        <SelectItem key={val} value={val.toString()}>{val}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        <div>
            <Label htmlFor="filterDateFrom" className="text-xs text-gray-400 mb-1 block">Date From</Label>
            <DatePicker date={filterDateFrom} setDate={setFilterDateFrom} placeholder="From Date" />
        </div>
        <div>
            <Label htmlFor="filterDateTo" className="text-xs text-gray-400 mb-1 block">Date To</Label>
            <DatePicker date={filterDateTo} setDate={setFilterDateTo} placeholder="To Date" />
        </div>
        <div className="sm:col-span-2 flex items-end">
             <Button onClick={() => { handleFilterChange(); setIsFilterSheetOpen(false); }} className="w-full text-sm h-9" disabled={isLoadingFeedItems || isProcessingAction}>Apply Filters</Button>
        </div>
    </div>
  );

  const handleDownloadImage = (imageUrl: string, fileName: string = 'image.jpg') => {
    // Create a temporary anchor element
    const anchor = document.createElement('a');
    anchor.href = imageUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    toast.success('Downloading image...');
  };

  return (
    <TooltipProvider>
      <div className="p-2 md:p-4 max-w-[1800px] mx-auto">
        <div>
          {isLoadingFeedItems && feedItems.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
              {[...Array(6)].map((_, i) => <FeedItemSkeletonCard key={`skeleton-${i}`} />)}
            </div>
          ) : !isLoadingFeedItems && feedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Inbox className="w-16 h-16 text-gray-500 mb-4" />
              <p className="text-gray-400 text-lg font-semibold">No Feed Items Found</p>
              <p className="text-gray-500 text-sm">Try adjusting your filters or check back later.</p>
            </div>
          ) : feedItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {feedItems.map((item) => {
              const imageUrl = item.content_data?.image_url || item.content_data?.url;
              const videoUrl = item.content_data?.video_url;
              const thumbnailUrl = item.content_data?.thumbnail_url;
              const isVideoItem = !!videoUrl;
              const caption = item.content_data?.generated_image_prompt || item.content_data?.prompt || item.content_data?.caption || item.content_data?.text || item.content_data?.processed_content || (isVideoItem ? 'AI generated video' : null);
              const commentCount = comments[item.id]?.length || 0;
              const isLiked = userLikedItems.has(item.id);
              const canGenerateVideo = imageUrl && item.item_type?.startsWith('image_') && !isGeneratingVideo[item.id];

              return (
                <div
                  key={item.id}
                  className="bg-gray-900 rounded-xl border border-gray-700/60 overflow-hidden"
                >
                  {/* Header */}
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <div className="flex-shrink-0">
                      {item.creator_profile_avatar_url ?
                        <img src={item.creator_profile_avatar_url} alt={item.creator_profile_name || 'Creator'} className="w-8 h-8 rounded-full" />
                        : <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-medium">{(item.creator_profile_name || '?').charAt(0)}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm text-gray-100 truncate block">{item.creator_profile_name || 'Maya'}</span>
                      <span className={`${getSourceSystemColor(item.source_system)} text-[10px] rounded-full font-medium px-1.5 py-0.5 leading-none`}>
                        {item.source_system}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 flex-shrink-0">{new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric' })}</span>
                  </div>

                  {/* Image / Video / Content */}
                  {isVideoItem ? (
                    <div
                      className="w-full aspect-[4/5] bg-black cursor-pointer overflow-hidden"
                      onClick={() => handleImageClick(thumbnailUrl || imageUrl || '', item)}
                    >
                      <video
                        src={videoUrl}
                        poster={thumbnailUrl || imageUrl || undefined}
                        muted
                        autoPlay
                        loop
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : imageUrl ? (
                    <div
                      className="w-full aspect-[4/5] bg-black cursor-pointer overflow-hidden"
                      onClick={() => handleImageClick(imageUrl, item)}
                    >
                      <img
                        src={imageUrl}
                        alt={caption || 'Feed image'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : item.status === 'prompt_generated' ? (
                    <div className="w-full aspect-square bg-gray-800/50 flex items-center justify-center">
                      <div className="text-center px-4">
                        <ImageIcon className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                        <p className="text-xs text-yellow-400 font-medium">Processing...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 pb-2">
                      {renderEnhancedContentData(item)}
                    </div>
                  )}

                  {/* Action Bar - IG style */}
                  <div className="flex items-center px-3 pt-2.5 pb-1">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleLikeToggle(item.id, isLiked)}
                        disabled={isLoadingUserLikes || isProcessingAction}
                        className="hover:opacity-70 transition-opacity disabled:opacity-30"
                        aria-label={isLiked ? "Unlike" : "Like"}
                      >
                        <Heart className={`w-6 h-6 ${isLiked ? 'text-red-500 fill-red-500' : 'text-gray-100'}`} />
                      </button>
                      <button
                        onClick={() => handleImageClick(imageUrl || '', item)}
                        className="hover:opacity-70 transition-opacity flex items-center gap-1"
                        aria-label="View comments"
                      >
                        <MessageCircle className="w-6 h-6 text-gray-100" />
                        {commentCount > 0 && (
                          <span className="text-sm text-gray-100">{commentCount}</span>
                        )}
                      </button>
                      <button className="hover:opacity-70 transition-opacity" aria-label="Share">
                        <Send className="w-5 h-5 text-gray-100" />
                      </button>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {canGenerateVideo && (
                        <button
                          onClick={() => handleGenerateVideo(item)}
                          disabled={isGeneratingVideo[item.id]}
                          className="hover:opacity-70 transition-opacity disabled:opacity-30"
                          aria-label="Generate video"
                          title="Generate video from image"
                        >
                          <Video className={`w-5 h-5 ${isGeneratingVideo[item.id] ? 'text-purple-400 animate-pulse' : 'text-gray-100'}`} />
                        </button>
                      )}
                      <button className="hover:opacity-70 transition-opacity" aria-label="Save">
                        <Bookmark className="w-6 h-6 text-gray-100" />
                      </button>
                    </div>
                  </div>

                  {/* Caption */}
                  {caption && (
                    <div className="px-3 pt-1 pb-2.5">
                      <p className="text-sm text-gray-200 line-clamp-1">
                        <span className="font-semibold mr-1">{item.creator_profile_name || 'Maya'}</span>
                        {caption}
                      </p>
                    </div>
                  )}

                  {!caption && <div className="pb-2" />}
                </div>
              );
            })}
            </div>
          ) : null }

          {/* Infinite scroll sentinel */}
          <div ref={loadMoreRef} className="py-8 flex justify-center">
            {isLoadingMore && (
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-purple-400" />
            )}
            {!hasMore && feedItems.length > 0 && (
              <p className="text-xs text-gray-600">You&apos;ve seen it all</p>
            )}
          </div>
        </div>

        {/* Edit Dialog */}
        {currentFeedItemToActOn && isEditDialogOpen && (
          <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if(!open) {setIsEditDialogOpen(false); setCurrentFeedItemToActOn(null);}}}>
              <DialogContent className="sm:max-w-[600px] bg-gray-900 border-gray-800 text-gray-100">
                  <DialogHeader>
                      <DialogTitle>Edit Content for Item ID: {currentFeedItemToActOn.id}</DialogTitle>
                      <DialogDescription className="text-gray-400">
                          Source: {currentFeedItemToActOn.source_system} | Type: {currentFeedItemToActOn.item_type}
                      </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                      {currentFeedItemToActOn.item_type === 'text_mood_engine' ? (
                          <div className="space-y-2">
                              <Label htmlFor="editTextContent" className="text-gray-300">Generated Text:</Label>
                              <Textarea 
                                  id="editTextContent" 
                                  value={editableContentData?.text || ''}
                                  onChange={(e) => setEditableContentData({...editableContentData, text: e.target.value})}
                                  className="bg-gray-800 border-gray-700 min-h-[100px]"
                              />
                               <Label htmlFor="editMoodId" className="text-gray-300">Mood ID:</Label>
                               <Input 
                                  id="editMoodId"
                                  type="text"
                                  value={editableContentData?.mood_id || ''}
                                  onChange={(e) => setEditableContentData({...editableContentData, mood_id: e.target.value})} 
                                  className="w-full p-2 bg-gray-800 border border-gray-700 rounded-md text-sm h-9"
                               />
                          </div>
                      ) : currentFeedItemToActOn.item_type === 'image_mood_engine' || currentFeedItemToActOn.item_type === 'image_studio_series_master' || currentFeedItemToActOn.item_type === 'image_series_variation' ? (
                          <div className="space-y-2">
                              {editableContentData?.image_url && (
                                  <div className="mb-2">
                                      <Label className="text-gray-300 block mb-1">Current Image:</Label>
                                      <img src={editableContentData.image_url} alt="Current image" className="rounded-md max-w-xs max-h-48 object-contain" />
                                  </div>
                              )}
                              <Label htmlFor="editMoodEnginePrompt" className="text-gray-300">Generated Image Prompt:</Label>
                              <Textarea 
                                  id="editMoodEnginePrompt" 
                                  value={editableContentData?.generated_image_prompt || ''}
                                  onChange={(e) => setEditableContentData({...editableContentData, generated_image_prompt: e.target.value})}
                                  className="bg-gray-800 border-gray-700 min-h-[80px]"
                                  placeholder="Edit the generated image prompt"
                              />
                              <Label htmlFor="editRawComponents" className="text-gray-300">Raw Prompt Components (JSON):</Label>
                              <Textarea 
                                  id="editRawComponents" 
                                  value={editableContentData?.raw_image_prompt_components_json_string || ''}
                                  onChange={(e) => setEditableContentData({...editableContentData, raw_image_prompt_components_json_string: e.target.value})}
                                  className="bg-gray-800 border-gray-700 min-h-[100px] font-mono text-xs"
                                  placeholder="Edit raw components if needed (ensure valid JSON array)"
                              />
                          </div>
                      ) : currentFeedItemToActOn.item_type === 'image_comfyui' ? (
                          <div className="space-y-2">
                              {editableContentData?.image_url && (
                                  <div className="mb-2">
                                      <Label className="text-gray-300 block mb-1">Current Image:</Label>
                                      <img src={editableContentData.image_url} alt="Current image" className="rounded-md max-w-xs max-h-48 object-contain" />
                                  </div>
                              )}
                              <Label htmlFor="editComfyPrompt" className="text-gray-300">Prompt:</Label>
                              <Textarea 
                                  id="editComfyPrompt" 
                                  value={editableContentData?.prompt || ''}
                                  onChange={(e) => setEditableContentData({...editableContentData, prompt: e.target.value})}
                                  className="bg-gray-800 border-gray-700 min-h-[80px]"
                                  placeholder="Enter prompt for image generation"
                              />
                              <Label htmlFor="editComfyNegativePrompt" className="text-gray-300">Negative Prompt:</Label>
                              <Textarea 
                                  id="editComfyNegativePrompt" 
                                  value={editableContentData?.negative_prompt || ''}
                                  onChange={(e) => setEditableContentData({...editableContentData, negative_prompt: e.target.value})}
                                  className="bg-gray-800 border-gray-700 min-h-[60px]"
                                  placeholder="Enter negative prompt"
                              />
                              {Object.entries(editableContentData).map(([key, value]) => {
                                  if (!['image_url', 'prompt', 'negative_prompt'].includes(key) && typeof value !== 'object') {
                                      return (
                                          <div key={key} className="text-xs">
                                              <Label className="text-gray-400">{key}: </Label>
                                              <span className="text-gray-300">{String(value)}</span>
                                          </div>
                                      );
                                  }
                                  return null;
                              })}
                          </div>
                      ) : (
                          <div className="space-y-2">
                              <Label htmlFor="editContentDataJson" className="text-gray-300">Content Data (JSON):</Label>
                              <Textarea 
                                  id="editContentDataJson" 
                                  value={JSON.stringify(editableContentData, null, 2)}
                                  onChange={(e) => {
                                      try {
                                          setEditableContentData(JSON.parse(e.target.value));
                                      }
                                      catch (err) {
                                          console.warn("Invalid JSON in textarea");
                                      }
                                  }}
                                  className="bg-gray-800 border-gray-700 min-h-[200px] font-mono text-xs"
                              />
                          </div>
                      )}
                  </div>
                  <DialogFooter>
                      <DialogClose asChild>
                          <Button variant="outline" onClick={() => {setIsEditDialogOpen(false); setCurrentFeedItemToActOn(null);}} disabled={isProcessingAction}>Cancel</Button>
                      </DialogClose>
                      <Button onClick={handleEditSave} disabled={isProcessingAction} className="bg-blue-600 hover:bg-blue-700">Save Changes</Button>
                  </DialogFooter>
              </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Lightbox Dialog - Placed outside the main mapping */}
      {lightboxImageUrl && (
        <Dialog 
          open={isLightboxOpen} 
          onOpenChange={(open) => {
            setIsLightboxOpen(open);
            if (!open) {
              setLightboxImageUrl(null);
            }
          }}
        >
          <DialogContent className="max-w-5xl w-full max-h-[90vh] overflow-y-auto p-4 bg-gray-900 border-gray-800 text-white">
            <DialogHeader>
              <div className="flex justify-between items-center">
                <DialogTitle>Image Details</DialogTitle>
              </div>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="relative aspect-square w-full max-h-[60vh] overflow-hidden bg-black rounded-lg">
                {currentFeedItemToActOn?.content_data?.video_url ? (
                  <video
                    src={currentFeedItemToActOn.content_data.video_url}
                    poster={lightboxImageUrl || undefined}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={lightboxImageUrl}
                    alt="Enlarged feed image"
                    className="w-full h-full object-contain"
                  />
                )}
              </div>
              
              <div className="space-y-6">
                {/* Creator Info */}
                <div className="flex items-center space-x-3 mb-4">
                  <Avatar className="h-10 w-10 border border-purple-500/30">
                    <AvatarImage src={currentFeedItemToActOn?.creator_profile_avatar_url || ''} alt="Maya" />
                    <AvatarFallback className="bg-purple-500/20 text-purple-200">
                      M
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-gray-200">{currentFeedItemToActOn?.creator_profile_name || 'Maya'}</p>
                    <p className="text-xs text-gray-400">Creator</p>
                  </div>
                </div>
                
                {currentFeedItemToActOn && (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-300 mb-1">Image Details</h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Badge className="bg-purple-600 hover:bg-purple-700">{currentFeedItemToActOn.source_system}</Badge>
                      </div>
                      
                      <div className="flex items-center space-x-2 text-xs text-gray-400 mb-3">
                        <CalendarDays className="h-3 w-3" />
                        <span>Created: {new Date(currentFeedItemToActOn.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-semibold text-gray-300 mb-1">Prompt</h3>
                      <div className="bg-gray-800 p-3 rounded text-xs text-gray-300 max-h-[150px] overflow-y-auto">
                        {currentFeedItemToActOn?.content_data?.generated_image_prompt || 
                         currentFeedItemToActOn?.content_data?.prompt || 
                         'No prompt available'}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-6">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex items-center gap-2"
                        onClick={() => currentFeedItemToActOn && handleRecreate(currentFeedItemToActOn)}
                        disabled={isProcessingAction}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Recreate
                      </Button>
                      
                      {user && (
                        <Button 
                          variant={userLikedItems.has(currentFeedItemToActOn.id) ? "outline" : "secondary"}
                          size="sm" 
                          className="flex items-center gap-2"
                          onClick={() => handleLikeToggle(currentFeedItemToActOn.id, userLikedItems.has(currentFeedItemToActOn.id))}
                          disabled={isProcessingAction}
                        >
                          <Heart className={`h-3 w-3 ${userLikedItems.has(currentFeedItemToActOn.id) ? "text-red-500 fill-red-500" : ""}`} />
                          {userLikedItems.has(currentFeedItemToActOn.id) ? "Unlike" : "Like"}
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                        onClick={() => {
                          const videoUrl = currentFeedItemToActOn?.content_data?.video_url;
                          if (videoUrl) {
                            handleDownloadImage(videoUrl, `maya-video-${new Date().getTime()}.mp4`);
                          } else {
                            handleDownloadImage(lightboxImageUrl, `maya-image-${new Date().getTime()}.jpg`);
                          }
                        }}
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </Button>
                    </div>
                    
                    {/* Comments Section */}
                    <div className="mt-8">
                      <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center">
                        <MessageCircle className="h-4 w-4 mr-1" />
                        Comments ({comments[currentFeedItemToActOn.id]?.length || 0})
                      </h3>
                      
                      {!comments[currentFeedItemToActOn.id] && !isLoadingComments[currentFeedItemToActOn.id] && (
                        <Button variant="outline" size="sm" onClick={() => fetchCommentsForItem(currentFeedItemToActOn.id)} className="mb-2">
                          Load Comments
                        </Button>
                      )}
                      
                      {isLoadingComments[currentFeedItemToActOn.id] && (
                        <div className="space-y-3">
                          {[1, 2].map(i => (
                            <div key={i} className="flex items-start space-x-3">
                              <Skeleton className="h-8 w-8 rounded-full bg-gray-700/50" />
                              <div className="space-y-1 flex-1">
                                <Skeleton className="h-4 w-1/3 bg-gray-700/50" />
                                <Skeleton className="h-3 w-full bg-gray-700/50" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {comments[currentFeedItemToActOn.id] && comments[currentFeedItemToActOn.id].length > 0 && (
                        <div className="space-y-4 max-h-[200px] overflow-y-auto">
                          {comments[currentFeedItemToActOn.id].map(comment => (
                            <div key={comment.id} className="border-b border-gray-800 pb-3">
                              <div className="flex items-start space-x-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={comment.user_profile?.avatar_url || ''} alt={comment.user_profile?.name || 'User'} />
                                  <AvatarFallback className="bg-gray-700 text-gray-300">
                                    {(comment.user_profile?.name || 'U').charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="flex items-center space-x-2">
                                    <p className="text-sm font-medium text-gray-200">{comment.user_profile?.name || 'User'}</p>
                                    <span className="text-xs text-gray-400">
                                      {new Date(comment.created_at).toLocaleString([], {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-300 mt-1">{comment.comment_text}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {comments[currentFeedItemToActOn.id] && comments[currentFeedItemToActOn.id].length === 0 && !isLoadingComments[currentFeedItemToActOn.id] && (
                        <p className="text-sm text-gray-400">No comments yet</p>
                      )}
                      
                      {user && (
                        <div className="flex space-x-2 items-start mt-4">
                          <Avatar className="h-8 w-8 mt-1">
                            <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.name || 'Your avatar'} />
                            <AvatarFallback className="text-xs bg-purple-600">
                              {profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <Textarea 
                            placeholder="Add a comment..."
                            value={newCommentText[currentFeedItemToActOn.id] || ''}
                            onChange={(e) => setNewCommentText(prev => ({...prev, [currentFeedItemToActOn.id]: e.target.value}))}
                            rows={1}
                            className="flex-grow bg-gray-700 border-gray-600 text-sm resize-none min-h-[40px] focus-within:min-h-[60px] transition-all duration-150 ease-in-out"
                          />
                          <Button 
                            size="icon" 
                            onClick={() => handleAddComment(currentFeedItemToActOn.id)} 
                            disabled={isProcessingAction || !newCommentText[currentFeedItemToActOn.id]?.trim()}
                            className="h-9 w-9 flex-shrink-0 bg-purple-600 hover:bg-purple-700"
                            aria-label="Send comment"
                          >
                            <SendHorizonal className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Series Gallery Dialog */}
      {currentSeriesMasterItem && (
        <Dialog 
          open={isSeriesGalleryOpen} 
          onOpenChange={(open) => {
            setIsSeriesGalleryOpen(open);
            if (!open) {
              setCurrentSeriesMasterItem(null);
              setCurrentSeriesVariationItems([]);
            }
          }}
        >
          <DialogContent className="max-w-6xl w-[95vw] md:w-[90vw] lg:w-[80vw] h-[90vh] bg-gray-950 border-gray-800 text-gray-100 flex flex-col p-0">
            <DialogHeader className="p-4 border-b border-gray-800">
              <DialogTitle>
                Series for: {currentSeriesMasterItem.content_data?.generated_image_prompt?.substring(0, 50) || currentSeriesMasterItem.id}
                ({isLoadingSeriesVariations ? 'Loading variations...' : `${currentSeriesVariationItems.length} variations`})
              </DialogTitle>
            </DialogHeader>
            <div className="flex-grow overflow-y-auto p-2 sm:p-4">
              {isLoadingSeriesVariations ? (
                <div className="flex justify-center items-center h-full">
                  <p className="text-gray-400">Loading series variations...</p>
                </div>
              ) : currentSeriesVariationItems.length === 0 ? (
                <p className="text-center text-gray-400">No variations found for this series.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
                  {currentSeriesVariationItems.map((seriesVariationItem, index) => (
                    <Card key={seriesVariationItem.id} className="bg-gray-900 border-gray-700/80 overflow-hidden flex flex-col shadow-lg hover:shadow-purple-500/20 transition-shadow duration-300">
                      <div className="aspect-w-1 aspect-h-1 bg-black flex items-center justify-center overflow-hidden rounded-t-md">
                        {seriesVariationItem.content_data?.image_url ? (
                          <img 
                            src={seriesVariationItem.content_data.image_url} 
                            alt={seriesVariationItem.content_data.generated_image_prompt?.substring(0, 100) || `Series image ${index + 1}`} 
                            className="w-full h-full object-contain cursor-pointer transition-transform duration-300 hover:scale-105"
                            onClick={() => seriesVariationItem.content_data.image_url && handleImageClick(seriesVariationItem.content_data.image_url, seriesVariationItem)}
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500">
                            <ImageIcon className="w-12 h-12" />
                          </div>
                        )}
                      </div>
                      <CardContent className="p-2 sm:p-3 text-xs space-y-1 flex-grow flex flex-col justify-between">
                        <div>
                          <p className="text-gray-300 leading-tight line-clamp-3" title={seriesVariationItem.content_data?.generated_image_prompt}>
                            <span className="font-semibold text-gray-200">Prompt:</span> {seriesVariationItem.content_data?.generated_image_prompt || "N/A"}
                          </p>
                          <div className="flex items-center mt-1 space-x-1">
                            {user && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="w-7 h-7 p-0 hover:bg-gray-700/50"
                                onClick={() => handleLikeToggle(seriesVariationItem.id, userLikedItems.has(seriesVariationItem.id))}
                                disabled={isLoadingUserLikes || isProcessingAction || isLoadingSeriesVariations}
                                aria-label={userLikedItems.has(seriesVariationItem.id) ? "Unlike item" : "Like item"}
                                title={userLikedItems.has(seriesVariationItem.id) ? "Unlike" : "Like"}
                              >
                                <Heart 
                                  className={`w-4 h-4 transition-all ${userLikedItems.has(seriesVariationItem.id) ? 'text-red-500 fill-red-500' : 'text-gray-400 hover:text-red-400'}`} 
                                />
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="w-7 h-7 p-0 hover:bg-gray-700/50"
                              onClick={() => handleRecreate(seriesVariationItem)}
                              disabled={isProcessingAction || isLoadingSeriesVariations}
                              title="Recreate this variation"
                              aria-label="Recreate this variation"
                            >
                              <RefreshCw className="w-4 h-4 text-gray-400 hover:text-sky-400" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="w-7 h-7 p-0 hover:bg-gray-700/50"
                              onClick={() => seriesVariationItem.content_data?.image_url && 
                                handleDownloadImage(seriesVariationItem.content_data.image_url, 
                                  `maya-series-image-${new Date().getTime()}.jpg`)}
                              title="Download image"
                              aria-label="Download image"
                            >
                              <Download className="w-4 h-4 text-gray-400 hover:text-green-400" />
                            </Button>
                          </div>
                          {seriesVariationItem.content_data?.variation_details && (
                            <div className="mt-1 pt-1 border-t border-gray-700/50">
                                <p className="text-gray-400">
                                    <span className="font-medium text-gray-300">Type:</span> {seriesVariationItem.content_data.variation_details.variation_type}
                                </p>
                                <p className="text-gray-400 truncate" title={seriesVariationItem.content_data.variation_details.variation_value}>
                                    <span className="font-medium text-gray-300">Value:</span> {seriesVariationItem.content_data.variation_details.variation_value}
                                </p>
                            </div>
                          )}
                        </div>
                        {/* Comments section for series variation item */}
                        <div className="border-t border-gray-700/50 pt-2 mt-2">
                          <FeedCommentsSection
                            itemId={seriesVariationItem.id}
                            comments={comments[seriesVariationItem.id] as FeedCommentData[] | undefined}
                            isLoadingComments={!!isLoadingComments[seriesVariationItem.id]}
                            newCommentText={newCommentText[seriesVariationItem.id] || ''}
                            user={user}
                            profile={profile}
                            isProcessingAction={isProcessingAction}
                            onLoadComments={fetchCommentsForItem}
                            onAddComment={handleAddComment}
                            onCommentTextChange={(id, text) => setNewCommentText(prev => ({...prev, [id]: text}))}
                            variant="compact"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter className="p-4 border-t border-gray-800">
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Social Media Posting Dialog */}
      {currentItemForSocialPosting && (
        <Dialog 
          open={isSocialPostingDialogOpen} 
          onOpenChange={(open) => {
            setIsSocialPostingDialogOpen(open);
            if (!open) {
              setCurrentItemForSocialPosting(null);
              setSelectedPlatforms(prev => ({ ...prev, [currentItemForSocialPosting?.id || '']: [] }));
            }
          }}
        >
          <DialogContent className="max-w-2xl bg-gray-900 border-gray-800 text-gray-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>📱</span>
                Schedule Social Media Posts
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                Select platforms and customize content for posting Maya's take on this content.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              {/* Content Preview */}
              <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/30 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-purple-400 mb-2">✨ Content to Post</h3>
                <div className="text-sm text-gray-200 max-h-32 overflow-y-auto">
                  {currentItemForSocialPosting.content_data?.processed_content || 
                   currentItemForSocialPosting.content_data?.text || 
                   'No content available'}
                </div>
                {currentItemForSocialPosting.content_data?.image_url && (
                  <img 
                    src={currentItemForSocialPosting.content_data.image_url} 
                    alt="Content preview" 
                    className="mt-3 rounded-lg max-h-32 w-auto object-contain"
                  />
                )}
              </div>

              {/* Platform Selection */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Select Platforms</h3>
                <div className="grid grid-cols-2 gap-3">
                  {socialPlatforms.map(platform => {
                    const IconComponent = platform.icon;
                    return (
                      <Button
                        key={platform.id}
                        variant={selectedPlatforms[currentItemForSocialPosting.id]?.includes(platform.id) ? "default" : "outline"}
                        onClick={() => togglePlatformSelection(currentItemForSocialPosting.id, platform.id)}
                        className={`h-16 flex flex-col items-center justify-center gap-2 ${
                          selectedPlatforms[currentItemForSocialPosting.id]?.includes(platform.id) 
                            ? 'bg-purple-600 hover:bg-purple-700 border-purple-500' 
                            : 'hover:bg-gray-700 border-gray-600'
                        }`}
                        disabled={isProcessingAction}
                      >
                        <IconComponent className="w-6 h-6" />
                        <span className="text-xs font-medium">{platform.display_name}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Platforms Summary */}
              {selectedPlatforms[currentItemForSocialPosting.id]?.length > 0 && (
                <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-gray-300 mb-2">
                    Selected Platforms ({selectedPlatforms[currentItemForSocialPosting.id].length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedPlatforms[currentItemForSocialPosting.id].map(platformId => {
                      const platform = socialPlatforms.find(p => p.id === platformId);
                      if (!platform) return null;
                      const IconComponent = platform.icon;
                      return (
                        <Badge key={platformId} className="bg-purple-600/20 text-purple-300 border-purple-500/50 flex items-center gap-1">
                          <IconComponent className="w-3 h-3" />
                          {platform.display_name}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex justify-between">
              <Button 
                variant="outline" 
                onClick={() => setIsSocialPostingDialogOpen(false)}
                disabled={isProcessingAction}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => scheduleSocialPosts(currentItemForSocialPosting, selectedPlatforms[currentItemForSocialPosting.id] || [])}
                disabled={isProcessingAction || !selectedPlatforms[currentItemForSocialPosting.id]?.length}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isProcessingAction ? 'Scheduling...' : `Schedule Posts (${selectedPlatforms[currentItemForSocialPosting.id]?.length || 0})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </TooltipProvider>
  );
}