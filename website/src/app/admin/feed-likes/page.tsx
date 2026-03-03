'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays, Heart, X, ArrowLeft, RotateCcw, Trash, Calendar, MessageCircle, ThumbsUp, User, Download, SendHorizonal } from 'lucide-react'
import Image from 'next/image'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'

type FeedLike = {
  id: string
  feed_item_id: string
  user_id: string
  created_at: string
  feed_item: {
    id: string
    item_type: string
    content_data: any
    source_system: string
    status: string
    created_at: string
    created_by_maya_profile_id: string
  }
}

type Comment = {
  id: string
  feed_item_id: string
  user_id: string
  comment_text: string
  created_at: string
  user?: {
    name: string
    avatar_url: string | null
  }
}

export default function FeedLikesPage() {
  const [feedLikes, setFeedLikes] = useState<FeedLike[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<FeedLike | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoadingComments, setIsLoadingComments] = useState(false)
  const [mayaProfile, setMayaProfile] = useState<{name: string, avatar_url: string | null} | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const itemsPerPage = 20
  const router = useRouter()
  const [newCommentText, setNewCommentText] = useState<{[key: string]: string}>({})
  const { user, profile, supabase } = useAuth()
  
  useEffect(() => {
    if (supabase) {
      fetchLikedImages(1)
      fetchMayaProfile()
    }
  }, [supabase])
  
  useEffect(() => {
    if (selectedImage && supabase) {
      console.log("Selected image changed:", selectedImage);
      const feedItemId = getFeedItemId(selectedImage);
      console.log("Feed item ID to use for comments:", feedItemId);
      console.log("Content data structure:", selectedImage.feed_item?.content_data);
      fetchComments(feedItemId);
    }
  }, [selectedImage, supabase])
  
  const fetchMayaProfile = async () => {
    if (!supabase) return;
    try {
      // Maya's profile ID is often hardcoded or stored in a config
      const mayaProfileId = '61770892-9e5b-46a5-b622-568be7066664' // This is an example - use the actual ID
      
      const { data, error } = await supabase
        .from('profiles')
        .select('name, avatar_url')
        .eq('id', mayaProfileId)
        .single()
        
      if (error) throw error
      
      setMayaProfile(data)
    } catch (error) {
      console.error('Error fetching Maya profile:', error)
    }
  }
  
  const fetchComments = async (feedItemId: string) => {
    if (!feedItemId || !supabase) {
      console.error("Cannot fetch comments: missing feed item ID or supabase");
      return;
    }
    
    setIsLoadingComments(true);
    setComments([]); // Reset comments while loading
    
    console.log("Fetching comments for feed item ID:", feedItemId);
    
    let commentsFound = false;
    
    // Method 1: Try direct Supabase query first
    try {
      const { data, error } = await supabase
        .from('feed_item_comments')
        .select(`
          id,
          feed_item_id,
          user_id,
          comment_text,
          created_at,
          user:profiles(name, avatar_url)
        `)
        .eq('feed_item_id', feedItemId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error("Supabase query error:", error);
      } else if (data && data.length > 0) {
        console.log("Comments found via Supabase query:", data.length, data);
        setComments(data);
        commentsFound = true;
      } else {
        console.log("No comments found via Supabase query");
      }
    } catch (err) {
      console.error("Exception during Supabase query:", err);
    }
    
    // Method 2: If Supabase query found nothing, try memory worker API
    if (!commentsFound) {
      try {
        const memoryWorkerUrl = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002';
        console.log("Trying Memory Worker API:", `${memoryWorkerUrl}/api/v1/feed/items/${feedItemId}/comments`);
        
        const response = await fetch(`${memoryWorkerUrl}/api/v1/feed/items/${feedItemId}/comments`);
        
        if (!response.ok) {
          throw new Error(`Memory Worker API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data && Array.isArray(data) && data.length > 0) {
          console.log("Comments found via Memory Worker API:", data.length, data);
          setComments(data);
          commentsFound = true;
        } else {
          console.log("No comments found via Memory Worker API");
        }
      } catch (err) {
        console.error("Exception during Memory Worker API call:", err);
      }
    }
    
    if (!commentsFound) {
      console.log("No comments found via any method for feed item:", feedItemId);
    }
    
    setIsLoadingComments(false);
  };
  
  const fetchLikedImages = async (page: number) => {
    if (!supabase) return;
    setIsLoading(true)
    try {
      // Calculate pagination
      const from = (page - 1) * itemsPerPage
      const to = from + itemsPerPage - 1
      
      // Get count first for pagination
      const { count } = await supabase
        .from('feed_item_likes')
        .select('id', { count: 'exact', head: true })
      
      // Get actual data
      const { data, error } = await supabase
        .from('feed_item_likes')
        .select(`
          id,
          feed_item_id,
          user_id,
          created_at,
          feed_item:feed_item_id (
            id,
            item_type,
            content_data,
            source_system,
            status,
            created_at,
            created_by_maya_profile_id
          )
        `)
        .order('created_at', { ascending: false })
        .range(from, to)
      
      if (error) {
        throw error
      }
      
      setFeedLikes(data || [])
      setCurrentPage(page)
      setTotalPages(Math.ceil((count || 0) / itemsPerPage))
    } catch (error) {
      console.error('Error fetching feed likes:', error)
      toast.error('Failed to load feed likes')
    } finally {
      setIsLoading(false)
    }
  }
  
  const getImageUrl = (feedLike: FeedLike) => {
    try {
      const contentData = typeof feedLike.feed_item?.content_data === 'string' 
        ? JSON.parse(feedLike.feed_item.content_data) 
        : feedLike.feed_item?.content_data
        
      return contentData?.image_url || 
             (contentData?.generated_series_data && contentData.generated_series_data[0]?.image_url) ||
             '/placeholder-image.jpg'
    } catch (error) {
      console.error('Error parsing content data:', error)
      return '/placeholder-image.jpg'
    }
  }
  
  const getPrompt = (feedLike: FeedLike) => {
    try {
      const contentData = typeof feedLike.feed_item?.content_data === 'string' 
        ? JSON.parse(feedLike.feed_item.content_data) 
        : feedLike.feed_item?.content_data
        
      return contentData?.generated_image_prompt || 
             contentData?.prompt || 
             'No prompt available'
    } catch (error) {
      console.error('Error parsing content data for prompt:', error)
      return 'Error retrieving prompt'
    }
  }
  
  // Function to handle recreation of an image (placeholder for now)
  const handleRecreate = (feedLike: FeedLike) => {
    toast.info('Recreation functionality coming soon!')
  }
  
  // Function to handle deletion of a like
  const handleUnlike = async (feedLike: FeedLike) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('feed_item_likes')
        .delete()
        .eq('id', feedLike.id)
      
      if (error) throw error
      
      toast.success('Image unliked successfully')
      setSelectedImage(null)
      fetchLikedImages(currentPage)
    } catch (error) {
      console.error('Error unliking image:', error)
      toast.error('Failed to unlike image')
    }
  }

  const handleAddComment = async (feedItemId: string) => {
    if (!user || !supabase) {
      toast.error("You must be logged in to add comments.");
      return;
    }
    
    const text = newCommentText[feedItemId]?.trim();
    if (!text) {
      toast.error("Comment cannot be empty.");
      return;
    }
    
    if (!feedItemId) {
      console.error("Missing feed item ID for comment");
      toast.error("Cannot add comment: Missing feed item ID");
      return;
    }
    
    console.log("Adding comment to feed item ID:", feedItemId);
    console.log("Comment text:", text);
    
    // Display optimistic update
    const optimisticComment: Comment = {
      id: `temp-${Date.now()}`,
      feed_item_id: feedItemId,
      user_id: user.id,
      comment_text: text,
      created_at: new Date().toISOString(),
      user: {
        name: profile?.name || user.email || 'You',
        avatar_url: profile?.avatar_url || null
      }
    };
    
    // Add optimistic comment to UI immediately
    setComments(prev => [optimisticComment, ...prev]);
    
    // Clear the input
    setNewCommentText(prev => ({...prev, [feedItemId]: ''}));
    
    // Now try to save the comment
    try {
      // Try direct Supabase insertion first (most reliable)
      const { data, error } = await supabase
        .from('feed_item_comments')
        .insert({
          feed_item_id: feedItemId,
          user_id: user.id,
          comment_text: text
        });
        
      if (error) {
        console.error("Error adding comment via Supabase:", error);
        
        // Fallback to API
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          throw new Error("Authentication error. Please log in again.");
        }
        
        const memoryWorkerUrl = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002';
        const response = await fetch(`${memoryWorkerUrl}/api/v1/feed/items/${feedItemId}/comments`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({ comment_text: text }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to add comment.');
        }
      }
      
      // If we get here, comment was added successfully
      toast.success('Comment added!');
      
      // Refresh comments after a slight delay to ensure the backend has processed
      setTimeout(() => {
        fetchComments(feedItemId);
      }, 500);
    } catch (error: any) {
      console.error("Error adding comment:", error);
      toast.error(error.message || 'Failed to add comment');
      
      // Remove the optimistic comment since it failed
      setComments(prev => prev.filter(c => c.id !== optimisticComment.id));
    }
  };

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

  const getDebugFeedItemId = (feedLike: FeedLike) => {
    console.log("Feed like structure:", feedLike);
    return feedLike.feed_item_id || "missing-id";
  };

  // Helper function to get the correct feed item ID in all cases
  const getFeedItemId = (feedLike: FeedLike): string => {
    // Try to get the ID from the feed_item_id property first
    if (feedLike && feedLike.feed_item_id) {
      return feedLike.feed_item_id;
    }
    
    // Fallback to feed_item.id if available
    if (feedLike && feedLike.feed_item && feedLike.feed_item.id) {
      return feedLike.feed_item.id;
    }
    
    // Otherwise return dummy ID (should not happen)
    console.error("Unable to determine feed item ID from:", feedLike);
    return "unknown-id";
  };

  // Render image grid
  const renderImageGrid = () => {
    if (isLoading && feedLikes.length === 0) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i} className="overflow-hidden bg-gray-800/50 border-gray-700 hover:border-purple-500/50 transition-all">
              <CardContent className="p-0">
                <Skeleton className="aspect-square w-full h-48 bg-gray-700/50" />
              </CardContent>
            </Card>
          ))}
        </div>
      )
    }
    
    if (feedLikes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Heart className="w-16 h-16 text-gray-500 mb-4" />
          <h3 className="text-xl font-bold text-gray-300 mb-2">No liked images yet</h3>
          <p className="text-gray-400 max-w-md">
            When you or users like images in the feed, they will appear here
          </p>
        </div>
      )
    }
    
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {feedLikes.map((feedLike) => (
          <Card 
            key={feedLike.id} 
            className="overflow-hidden bg-gray-800/50 border-gray-700 hover:border-purple-500/50 transition-all cursor-pointer group"
            onClick={() => setSelectedImage(feedLike)}
          >
            <CardContent className="p-0 relative">
              <div className="aspect-square w-full relative overflow-hidden">
                <Image 
                  src={getImageUrl(feedLike)} 
                  alt="Liked image"
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                />
              </div>
              <div className="absolute top-2 right-2">
                <Badge className="bg-purple-600/80 hover:bg-purple-600 text-white">
                  <Heart className="h-3 w-3 mr-1" />
                  <span className="text-xs">Liked</span>
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }
  
  // Render pagination controls
  const renderPagination = () => {
    if (totalPages <= 1) return null
    
    return (
      <div className="flex justify-center items-center mt-8 space-x-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchLikedImages(currentPage - 1)}
          disabled={currentPage === 1 || isLoading}
        >
          Previous
        </Button>
        <span className="text-sm text-gray-400">
          Page {currentPage} of {totalPages}
        </span>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchLikedImages(currentPage + 1)}
          disabled={currentPage === totalPages || isLoading}
        >
          Next
        </Button>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Feed Likes Gallery</h1>
      </div>
      
      {renderImageGrid()}
      {renderPagination()}
      
      {/* Image Detail Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-5xl w-full max-h-[90vh] overflow-y-auto">
          {selectedImage && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="relative aspect-square w-full max-h-[60vh] overflow-hidden bg-black rounded-lg">
                  <Image 
                    src={getImageUrl(selectedImage)} 
                    alt="Liked image"
                    className="object-contain"
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                </div>
                
                <div className="space-y-6">
                  {/* Creator Info */}
                  <div className="flex items-center space-x-3 mb-4">
                    <Avatar className="h-10 w-10 border border-purple-500/30">
                      <AvatarImage src={mayaProfile?.avatar_url || ''} alt="Maya" />
                      <AvatarFallback className="bg-purple-500/20 text-purple-200">
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-gray-200">{mayaProfile?.name || 'Maya'}</p>
                      <p className="text-xs text-gray-400">Creator</p>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-semibold text-gray-300 mb-1">Image Details</h3>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge className="bg-purple-600 hover:bg-purple-700">{selectedImage.feed_item?.source_system}</Badge>
                    </div>
                    
                    <div className="flex items-center space-x-2 text-xs text-gray-400 mb-3">
                      <CalendarDays className="h-3 w-3" />
                      <span>Created: {new Date(selectedImage.feed_item?.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-semibold text-gray-300 mb-1">Prompt</h3>
                    <div className="bg-gray-800 p-3 rounded text-xs text-gray-300 max-h-[150px] overflow-y-auto">
                      {getPrompt(selectedImage)}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mt-6">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-2"
                      onClick={() => handleRecreate(selectedImage)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Recreate
                    </Button>
                    
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="flex items-center gap-2"
                      onClick={() => handleUnlike(selectedImage)}
                    >
                      <Trash className="h-3 w-3" />
                      Unlike
                    </Button>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-2"
                      onClick={() => handleDownloadImage(getImageUrl(selectedImage), `maya-image-${new Date().getTime()}.jpg`)}
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </Button>
                  </div>
                  
                  {/* Comments Section - Complete rewrite */}
                  <div className="mt-8">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center">
                      <MessageCircle className="h-4 w-4 mr-1" />
                      Comments
                    </h3>
                    
                    {isLoadingComments ? (
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
                    ) : comments.length === 0 ? (
                      <p className="text-sm text-gray-400 mb-4">No comments yet</p>
                    ) : (
                      <div className="space-y-4 max-h-[200px] overflow-y-auto mb-4">
                        {comments.map(comment => (
                          <div key={comment.id} className="border-b border-gray-800 pb-3">
                            <div className="flex items-start space-x-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={comment.user?.avatar_url || ''} alt={comment.user?.name || 'User'} />
                                <AvatarFallback className="bg-gray-700 text-gray-300">
                                  <User className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <p className="text-sm font-medium text-gray-200">{comment.user?.name || 'User'}</p>
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
                    
                    {/* Comment input form */}
                    {user && (
                      <form 
                        className="flex space-x-2 items-start mt-4"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const feedItemId = getFeedItemId(selectedImage);
                          handleAddComment(feedItemId);
                        }}
                      >
                        <Avatar className="w-7 h-7 mt-1">
                          <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.name || 'Your avatar'} />
                          <AvatarFallback className="text-xs bg-purple-600">
                            {profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <Textarea 
                          placeholder="Add a comment..."
                          value={newCommentText[getFeedItemId(selectedImage)] || ''}
                          onChange={(e) => {
                            const feedItemId = getFeedItemId(selectedImage);
                            setNewCommentText(prev => ({...prev, [feedItemId]: e.target.value}));
                          }}
                          rows={1}
                          className="flex-grow bg-gray-700 border-gray-600 text-sm resize-none min-h-[40px] focus-within:min-h-[60px] transition-all duration-150 ease-in-out"
                        />
                        <Button 
                          type="submit"
                          size="icon" 
                          disabled={!newCommentText[getFeedItemId(selectedImage)]?.trim()}
                          className="h-9 w-9 flex-shrink-0 bg-purple-600 hover:bg-purple-700"
                          aria-label="Send comment"
                        >
                          <SendHorizonal className="h-4 w-4" />
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
} 