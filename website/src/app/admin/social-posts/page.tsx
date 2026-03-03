'use client'

import React, { useEffect, useState, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

// New Interfaces for FeedItem
interface Profile {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
}

interface FeedItem {
  id: string;
  created_at: string;
  updated_at: string;
  created_by_maya_profile_id: Profile; 
  item_type: string; 
  source_system: string; 
  content_data: any; 
  status: 'pending_review' | 'approved' | 'rejected' | 'approved_for_posting' | 'posted_social' | 'error_posting'; 
  reviewed_by_user_id?: Profile | null; 
  reviewed_at?: string | null;
  approved_at?: string | null;
  admin_review_notes?: string | null;
  original_context?: any | null; 
  posted_to_platforms?: any | null; 
  error_details?: any | null; 
}

// For API response for GET /feed/items
interface FeedResponse {
  items: FeedItem[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
}

export default function SocialPostsPage() {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isLoadingFeedItems, setIsLoadingFeedItems] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit, setLimit] = useState(20); // Or your preferred default

  const MEMORY_WORKER_API_URL = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002';

  // State for dialogs
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentFeedItemToActOn, setCurrentFeedItemToActOn] = useState<FeedItem | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [editableContentData, setEditableContentData] = useState<any>({}); // To hold content for editing
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  async function fetchFeedItems(page = currentPage, currentLimit = limit) {
    setIsLoadingFeedItems(true);
    // Construct query parameters for filters as well (status, item_type, etc.)
    // For now, just page and limit
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: currentLimit.toString(),
      // TODO: Add other filter states here, e.g.:
      // status: filterStatus, 
      // item_type: filterItemType,
    });

    try {
      // CORRECTED API ENDPOINT
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items?${queryParams.toString()}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch feed items.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data: FeedResponse = await response.json();
      setFeedItems(data.items || []);
      setTotalPages(data.total_pages || 1);
      setCurrentPage(data.page || 1);
      // Removed toast.success here, can be too noisy for frequent refreshes
    } catch (error: any) {
      console.error('Error fetching feed items:', error);
      toast.error(error.message || 'Failed to fetch feed items.');
      setFeedItems([]); // Clear items on error
      setTotalPages(1); // Reset pages
    } finally {
      setIsLoadingFeedItems(false);
    }
  }

  useEffect(() => {
    fetchFeedItems(1); // Fetch first page on initial load
  }, []); // Removed currentPage and limit from dependency array to prevent loops if not careful, manual refetch for now

  const openRejectDialog = (item: FeedItem) => {
    setCurrentFeedItemToActOn(item);
    setRejectionNotes(item.admin_review_notes || '');
    setIsRejectDialogOpen(true);
  };

  const openEditDialog = (item: FeedItem) => {
    setCurrentFeedItemToActOn(item);
    // Initialize editableContentData based on item_type
    if (item.item_type === 'text_mood_engine') {
      setEditableContentData({ text: item.content_data?.text || '', mood_id: item.content_data?.mood_id || '' });
    } else {
      setEditableContentData(JSON.parse(JSON.stringify(item.content_data))); // Deep copy for general editing
    }
    setIsEditDialogOpen(true);
  };

  // Unified Approve Action
  async function handleApprove(item: FeedItem) {
    setIsProcessingAction(true);
    toast.info(`Approving item: ${item.id}`);
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${item.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // body: JSON.stringify({ admin_review_notes: 'Optional notes on approval' }), // If needed
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to approve item.');
      }
      toast.success(`Item ${item.id} approved successfully.`);
      fetchFeedItems(currentPage); // Refresh current page
    } catch (error: any) {
      toast.error(error.message);
      console.error("Error approving item:", error);
    } finally {
      setIsProcessingAction(false);
    }
  }

  // Reject Action
  const handleRejectSubmit = async () => {
    if (!currentFeedItemToActOn) return;
    setIsProcessingAction(true);
    toast.info(`Rejecting item: ${currentFeedItemToActOn.id}`);
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${currentFeedItemToActOn.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_review_notes: rejectionNotes }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to reject item.');
      }
      toast.success(`Item ${currentFeedItemToActOn.id} rejected.`);
      fetchFeedItems(currentPage); // Refresh current page
      setIsRejectDialogOpen(false);
      setCurrentFeedItemToActOn(null);
    } catch (error: any) {
      toast.error(error.message);
      console.error("Error rejecting item:", error);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Edit/Save Content Action
  async function handleEditSave() {
    if (!currentFeedItemToActOn) return;

    // Basic check for actual changes
    if (JSON.stringify(editableContentData) === JSON.stringify(currentFeedItemToActOn.content_data)) {
      toast.info("No changes made to content.");
      setIsEditDialogOpen(false);
      return;
    }
    setIsProcessingAction(true);
    toast.info(`Saving changes for item: ${currentFeedItemToActOn.id}`);
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${currentFeedItemToActOn.id}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_data: editableContentData }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save edited content.');
      }
      toast.success('Content updated successfully!');
      setIsEditDialogOpen(false);
      setCurrentFeedItemToActOn(null);
      fetchFeedItems(currentPage); // Refresh current page
    } catch (error: any) {
      toast.error(error.message);
      console.error("Error saving edited content:", error);
    } finally {
      setIsProcessingAction(false);
    }
  }
  
  // Placeholder for rendering different content types
  const renderContentData = (item: FeedItem) => {
    if (item.item_type === 'text_mood_engine' && item.content_data) {
      return (
        <>
          <p className="text-sm text-gray-200 whitespace-pre-wrap">
            <strong>Generated Text:</strong><br/>
            {item.content_data.text || 'No text content.'}
          </p>
          <p className="text-xs text-gray-400 italic">
            Mood: {item.content_data.mood_id || 'N/A'}
          </p>
          {item.original_context?.internal_thought_seed && 
            <p className="text-xs text-gray-400 italic">
              Thought Seed: {item.original_context.internal_thought_seed}
            </p>}
        </>
      );
    } else if (item.item_type === 'image_comfyui' && item.content_data) {
      return (
        <>
          {item.content_data.image_url && 
            <img 
              src={item.content_data.image_url} 
              alt={item.content_data.prompt || 'Generated Image'} 
              className="rounded-md max-w-sm max-h-sm my-2" // Adjust size as needed
            />}
          <p className="text-xs text-gray-400">
            <strong>Prompt:</strong> {item.content_data.prompt || 'N/A'}
          </p>
          {/* Display other ComfyUI params if needed, e.g., seed, steps */}
          {item.content_data.seed && <p className="text-xs text-gray-400">Seed: {item.content_data.seed}</p>}
        </>
      );
    } else {
      return (
        <p className="text-sm text-gray-300">
          <span className="font-semibold">Raw Content Data:</span>
          <pre className="text-xs bg-gray-700 p-2 rounded-md overflow-x-auto">
            {JSON.stringify(item.content_data, null, 2)}
          </pre>
        </p>
      );
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent pb-2 mb-4">
        Maya's Activity Feed
      </h1>

      {/* TODO: Add Filter Controls: Status, ItemType, SourceSystem, Date Range */}

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Feed Items</CardTitle>
              <CardDescription>Review and manage items generated by Maya or other systems.</CardDescription>
            </div>
            <Button onClick={() => fetchFeedItems(1)} disabled={isLoadingFeedItems || isProcessingAction} variant="outline" size="sm">
              {isLoadingFeedItems ? 'Refreshing...' : 'Refresh Feed'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingFeedItems && !feedItems.length ? (
            <p>Loading feed items...</p>
          ) : feedItems.length > 0 ? (
            <div className="space-y-4">
              {feedItems.map((item) => (
                <Card key={item.id} className={`bg-gray-800/50 border ${item.status === 'pending_review' ? 'border-yellow-500/50' : item.status === 'approved' ? 'border-green-500/50' : item.status === 'rejected' ? 'border-red-500/50' : 'border-gray-700/50'}`}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className="text-lg flex items-center">
                                {item.created_by_maya_profile_id?.avatar_url && 
                                    <img src={item.created_by_maya_profile_id.avatar_url} alt={item.created_by_maya_profile_id.name || 'Creator'} className="w-8 h-8 rounded-full mr-2" />}
                                {item.created_by_maya_profile_id?.name || item.created_by_maya_profile_id?.id || 'Unknown Creator'}
                                <span className="text-sm text-gray-400 ml-2">({item.source_system} - {item.item_type})</span>
                            </CardTitle>
                            <CardDescription className="text-xs text-gray-400">Created: {new Date(item.created_at).toLocaleString()}</CardDescription>
                        </div>
                        <div className={`px-2 py-1 text-xs rounded-full ${item.status === 'pending_review' ? 'bg-yellow-500 text-black' : item.status === 'approved' ? 'bg-green-500 text-white' : item.status === 'rejected' ? 'bg-red-500 text-white' : 'bg-gray-600 text-gray-200'}`}>
                            {item.status.replace('_', ' ').toUpperCase()}
                        </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {renderContentData(item)}
                    {item.admin_review_notes && 
                      <p className="text-xs text-purple-300 italic border-l-2 border-purple-400 pl-2 mt-2">
                        <strong>Admin Notes:</strong> {item.admin_review_notes}
                      </p>}
                     {item.reviewed_by_user_id && 
                        <p className="text-xs text-gray-400 mt-1">
                            Reviewed by: {item.reviewed_by_user_id.name || item.reviewed_by_user_id.id} at {item.reviewed_at ? new Date(item.reviewed_at).toLocaleTimeString() : ''}
                        </p>
                     }

                    {item.status === 'pending_review' && (
                        <div className="flex space-x-2 pt-2">
                            <Button size="sm" variant="outline" onClick={() => openEditDialog(item)} disabled={isProcessingAction}>Edit Content</Button>
                            <Button 
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => handleApprove(item)} 
                                disabled={isProcessingAction}
                            >
                                Approve
                            </Button>
                            <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button size="sm" variant="destructive" onClick={() => setCurrentFeedItemToActOn(item)} disabled={isProcessingAction}>Reject</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-gray-900 border-gray-800 text-gray-100">
                                <AlertDialogHeader>
                                <AlertDialogTitle>Reject Item from {item.source_system}?</AlertDialogTitle>
                                <AlertDialogDescription className="text-gray-400">
                                    Please provide a reason/note for rejecting this item. This helps in refining future generations if applicable.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="grid gap-4 py-4">
                                    <Label htmlFor={`rejectionNotes-${item.id}`} className="text-gray-300">Rejection Notes:</Label>
                                    <Textarea 
                                    id={`rejectionNotes-${item.id}`} 
                                    value={rejectionNotes} 
                                    onChange={(e) => setRejectionNotes(e.target.value)} 
                                    className="bg-gray-800 border-gray-700" 
                                    placeholder="e.g., Tone not quite right, too generic..."
                                    />
                                </div>
                                <AlertDialogFooter>
                                    <AlertDialogCancel onClick={() => { setIsRejectDialogOpen(false); setCurrentFeedItemToActOn(null); setRejectionNotes(''); }} disabled={isProcessingAction}>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleRejectSubmit} disabled={isProcessingAction || !rejectionNotes} className="bg-red-600 hover:bg-red-700">Confirm Reject</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p>No feed items found for the current filters.</p>
          )}
        </CardContent>
         {/* Pagination Controls */}
         {totalPages > 1 && (
            <div className="flex justify-center items-center space-x-2 mt-4 pb-4">
                <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => fetchFeedItems(currentPage - 1)}
                    disabled={currentPage <= 1 || isLoadingFeedItems || isProcessingAction}
                >
                    Previous
                </Button>
                <span className="text-sm text-gray-400">Page {currentPage} of {totalPages}</span>
                <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => fetchFeedItems(currentPage + 1)}
                    disabled={currentPage >= totalPages || isLoadingFeedItems || isProcessingAction}
                >
                    Next
                </Button>
            </div>
        )}
      </Card>

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
                             <input 
                                id="editMoodId"
                                type="text"
                                value={editableContentData?.mood_id || ''}
                                onChange={(e) => setEditableContentData({...editableContentData, mood_id: e.target.value})} 
                                className="w-full p-2 bg-gray-800 border border-gray-700 rounded-md"
                             />
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
                                        // Potentially show a small error to user if JSON is invalid while typing
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
  );
} 