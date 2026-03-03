'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Upload, Trash2, Image as ImageIcon, Plus, X, FolderOpen } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface VisualElement {
  id: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  storage_path: string;
  created_at: string;
}

const CATEGORY_OPTIONS = [
  { value: 'character', label: 'Character' },
  { value: 'object', label: 'Object' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'background', label: 'Background' },
  { value: 'style', label: 'Style Reference' },
  { value: 'other', label: 'Other' },
];

export default function MediaLibraryPage() {
  const [elements, setElements] = useState<VisualElement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Upload form state
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadCategory, setUploadCategory] = useState('character');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MEMORY_WORKER_API_URL = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002';

  const fetchElements = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/visual-elements`);
      if (!response.ok) throw new Error('Failed to fetch visual elements');
      const data = await response.json();
      setElements(data.elements || []);
    } catch (error: any) {
      console.error('Error fetching visual elements:', error);
      toast.error(error.message || 'Failed to load visual elements');
    } finally {
      setIsLoading(false);
    }
  }, [MEMORY_WORKER_API_URL]);

  useEffect(() => {
    fetchElements();
  }, [fetchElements]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      // Auto-fill name from filename if empty
      if (!uploadName) {
        setUploadName(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
    }
  };

  const resetUploadForm = () => {
    setUploadName('');
    setUploadDescription('');
    setUploadCategory('character');
    setUploadTags('');
    setUploadFile(null);
    setUploadPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) {
      toast.error('Please provide a name and select a file');
      return;
    }

    setIsUploading(true);
    try {
      // Convert file to base64 data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve(reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });

      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/visual-elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: uploadName.trim(),
          description: uploadDescription.trim() || null,
          category: uploadCategory,
          tags: uploadTags.split(',').map(t => t.trim()).filter(Boolean),
          imageBase64: dataUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload');
      }

      toast.success('Visual element uploaded successfully');
      resetUploadForm();
      setIsDialogOpen(false);
      fetchElements();
    } catch (error: any) {
      console.error('Error uploading:', error);
      toast.error(error.message || 'Failed to upload visual element');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (element: VisualElement) => {
    if (!confirm(`Delete "${element.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/visual-elements/${element.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete');
      }

      toast.success('Visual element deleted');
      fetchElements();
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error(error.message || 'Failed to delete visual element');
    }
  };

  const getImageUrl = (element: VisualElement) => {
    return `${MEMORY_WORKER_API_URL}/api/v1/visual-elements/${element.id}/image`;
  };

  const filteredElements = selectedCategory === 'all'
    ? elements
    : elements.filter(e => e.category === selectedCategory);

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6 flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-12 w-12 animate-spin text-purple-400" />
        <p className="ml-4 text-lg text-gray-300">Loading Media Library...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-500 to-pink-400 bg-clip-text text-transparent pb-2">
            Media Library
          </h1>
          <p className="text-gray-400">
            Visual elements for consistent image generation (characters, objects, styles)
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-purple-600 hover:bg-purple-700">
              <Plus className="mr-2 h-4 w-4" />
              Upload Element
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-gray-700 sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-gray-100">Upload Visual Element</DialogTitle>
              <DialogDescription className="text-gray-400">
                Add a new visual element for use in image generation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Image Upload */}
              <div
                className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadPreview ? (
                  <div className="relative">
                    <img
                      src={uploadPreview}
                      alt="Preview"
                      className="max-h-48 mx-auto rounded-lg"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-0 right-0 text-gray-400 hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadFile(null);
                        setUploadPreview(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-gray-400">
                    <Upload className="h-10 w-10 mx-auto mb-2" />
                    <p>Click to select an image</p>
                    <p className="text-sm text-gray-500">PNG, JPG, WEBP (max 10MB)</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-300">Name *</Label>
                <Input
                  id="name"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="e.g., Blake's Photo, Teddy Bear, etc."
                  className="bg-gray-800 border-gray-700 text-gray-100"
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="category" className="text-gray-300">Category</Label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700 text-gray-100">
                    {CATEGORY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-gray-300">Description</Label>
                <Textarea
                  id="description"
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Describe the visual element for better AI understanding..."
                  className="bg-gray-800 border-gray-700 text-gray-100 min-h-[80px]"
                />
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label htmlFor="tags" className="text-gray-300">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  placeholder="e.g., person, boyfriend, casual"
                  className="bg-gray-800 border-gray-700 text-gray-100"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  resetUploadForm();
                  setIsDialogOpen(false);
                }}
                className="border-gray-700 text-gray-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={isUploading || !uploadFile || !uploadName.trim()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-4">
        <Label className="text-gray-400">Filter by category:</Label>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-48 bg-gray-800 border-gray-700 text-gray-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700 text-gray-100">
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORY_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-gray-500 text-sm">
          {filteredElements.length} element{filteredElements.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Elements Grid */}
      {filteredElements.length === 0 ? (
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">
              {selectedCategory === 'all'
                ? 'No visual elements yet. Upload your first one!'
                : `No elements in the "${selectedCategory}" category.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredElements.map((element) => (
            <Card key={element.id} className="bg-gray-900 border-gray-700 overflow-hidden group">
              <div className="aspect-square relative bg-gray-800">
                <img
                  src={getImageUrl(element)}
                  alt={element.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Image</text></svg>';
                  }}
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/30"
                    onClick={() => handleDelete(element)}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-3">
                <h3 className="font-medium text-gray-100 truncate">{element.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs border-gray-700 text-gray-400 capitalize">
                    {element.category}
                  </Badge>
                </div>
                {element.description && (
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2">{element.description}</p>
                )}
                {element.tags && element.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {element.tags.slice(0, 3).map((tag, i) => (
                      <span key={i} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                    {element.tags.length > 3 && (
                      <span className="text-xs text-gray-500">+{element.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
