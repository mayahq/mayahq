'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProductGrid } from '@/components/product-embed';
import { Search, Filter, X, SlidersHorizontal } from 'lucide-react';
import { Label } from '@/components/ui/label';

interface Product {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  affiliate_link: string;
  original_price?: number | null;
  sale_price?: number | null;
  platform?: string | null;
  tags?: string[] | null;
  category?: string | null;
  is_active: boolean;
  click_count: number;
  slug: string;
  created_at: string;
  updated_at: string;
}

interface ProductsData {
  products: Product[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
}

interface Facets {
  platforms: Array<{ value: string; count: number }>;
  categories: Array<{ value: string; count: number }>;
  tags: Array<{ value: string; count: number }>;
}

interface ProductsClientProps {
  initialData: ProductsData;
  facets: Facets;
  searchParams: {
    page?: string;
    search?: string;
    platform?: string;
    category?: string;
    tags?: string;
    sort_by?: string;
    sort_order?: string;
  };
}

export function ProductsClient({ initialData, facets, searchParams }: ProductsClientProps) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  
  const [data, setData] = useState<ProductsData>(initialData);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState(searchParams.search || '');
  const [selectedPlatform, setSelectedPlatform] = useState(searchParams.platform || '');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.category || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(
    searchParams.tags ? searchParams.tags.split(',').filter(Boolean) : []
  );
  const [sortBy, setSortBy] = useState(searchParams.sort_by || 'created_at');
  const [sortOrder, setSortOrder] = useState(searchParams.sort_order || 'desc');
  const [showFilters, setShowFilters] = useState(false);

  // Update URL when filters change
  const updateURL = (newParams: Record<string, string | undefined>) => {
    const params = new URLSearchParams(urlSearchParams?.toString() || '');
    
    Object.entries(newParams).forEach(([key, value]) => {
      if (value && value !== '') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    
    // Reset to page 1 when filters change (unless specifically setting page)
    if (!newParams.page) {
      params.delete('page');
    }
    
    router.push(`/products?${params.toString()}`);
  };

  // Fetch products with current filters
  const fetchProducts = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });

      if (searchTerm) params.set('search', searchTerm);
      if (selectedPlatform) params.set('platform', selectedPlatform);
      if (selectedCategory) params.set('category', selectedCategory);
      if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
      if (sortBy) params.set('sort_by', sortBy);
      if (sortOrder) params.set('sort_order', sortOrder);

      const response = await fetch(`/api/products?${params}`);
      if (!response.ok) throw new Error('Failed to fetch products');

      const newData = await response.json();
      setData(newData);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle search
  const handleSearch = () => {
    updateURL({
      search: searchTerm,
      platform: selectedPlatform,
      category: selectedCategory,
      tags: selectedTags.join(','),
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    fetchProducts();
  };

  // Handle filter changes
  const handlePlatformChange = (platform: string) => {
    setSelectedPlatform(platform);
    updateURL({
      search: searchTerm,
      platform: platform,
      category: selectedCategory,
      tags: selectedTags.join(','),
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    fetchProducts();
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    updateURL({
      search: searchTerm,
      platform: selectedPlatform,
      category: category,
      tags: selectedTags.join(','),
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    fetchProducts();
  };

  const handleTagToggle = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    
    setSelectedTags(newTags);
    updateURL({
      search: searchTerm,
      platform: selectedPlatform,
      category: selectedCategory,
      tags: newTags.join(','),
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    fetchProducts();
  };

  const handleSortChange = (newSortBy: string) => {
    setSortBy(newSortBy);
    updateURL({
      search: searchTerm,
      platform: selectedPlatform,
      category: selectedCategory,
      tags: selectedTags.join(','),
      sort_by: newSortBy,
      sort_order: sortOrder,
    });
    fetchProducts();
  };

  const handleSortOrderChange = (newSortOrder: string) => {
    setSortOrder(newSortOrder);
    updateURL({
      search: searchTerm,
      platform: selectedPlatform,
      category: selectedCategory,
      tags: selectedTags.join(','),
      sort_by: sortBy,
      sort_order: newSortOrder,
    });
    fetchProducts();
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedPlatform('');
    setSelectedCategory('');
    setSelectedTags([]);
    setSortBy('created_at');
    setSortOrder('desc');
    router.push('/products');
    fetchProducts();
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    updateURL({
      page: newPage.toString(),
      search: searchTerm,
      platform: selectedPlatform,
      category: selectedCategory,
      tags: selectedTags.join(','),
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    fetchProducts(newPage);
  };

  // Check if any filters are active
  const hasActiveFilters = searchTerm || selectedPlatform || selectedCategory || selectedTags.length > 0;

  return (
    <div className="space-y-6">
      {/* Search and Filter Bar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search & Filter
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              {showFilters ? 'Hide' : 'Show'} Filters
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch}>Search</Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            )}
          </div>

          {/* Active Filters */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2">
              {searchTerm && (
                <Badge variant="secondary">
                  Search: {searchTerm}
                  <X 
                    className="h-3 w-3 ml-1 cursor-pointer" 
                    onClick={() => {
                      setSearchTerm('');
                      handleSearch();
                    }}
                  />
                </Badge>
              )}
              {selectedPlatform && (
                <Badge variant="secondary">
                  Platform: {selectedPlatform}
                  <X 
                    className="h-3 w-3 ml-1 cursor-pointer" 
                    onClick={() => handlePlatformChange('')}
                  />
                </Badge>
              )}
              {selectedCategory && (
                <Badge variant="secondary">
                  Category: {selectedCategory}
                  <X 
                    className="h-3 w-3 ml-1 cursor-pointer" 
                    onClick={() => handleCategoryChange('')}
                  />
                </Badge>
              )}
              {selectedTags.map(tag => (
                <Badge key={tag} variant="secondary">
                  Tag: {tag}
                  <X 
                    className="h-3 w-3 ml-1 cursor-pointer" 
                    onClick={() => handleTagToggle(tag)}
                  />
                </Badge>
              ))}
            </div>
          )}

          {/* Expanded Filters */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
              {/* Platform Filter */}
              <div>
                <Label htmlFor="platform">Platform</Label>
                <Select value={selectedPlatform} onValueChange={handlePlatformChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="All platforms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All platforms</SelectItem>
                    {facets.platforms.map(({ value, count }) => (
                      <SelectItem key={value} value={value}>
                        {value} ({count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category Filter */}
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={selectedCategory} onValueChange={handleCategoryChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All categories</SelectItem>
                    {facets.categories.map(({ value, count }) => (
                      <SelectItem key={value} value={value}>
                        {value} ({count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sort By */}
              <div>
                <Label htmlFor="sort">Sort By</Label>
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Date Added</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="click_count">Popularity</SelectItem>
                    <SelectItem value="original_price">Price</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort Order */}
              <div>
                <Label htmlFor="order">Sort Order</Label>
                <Select value={sortOrder} onValueChange={handleSortOrderChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Descending</SelectItem>
                    <SelectItem value="asc">Ascending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Tags */}
          {showFilters && facets.tags.length > 0 && (
            <div>
              <Label>Popular Tags</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {facets.tags.slice(0, 15).map(({ value, count }) => (
                  <Badge
                    key={value}
                    variant={selectedTags.includes(value) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => handleTagToggle(value)}
                  >
                    {value} ({count})
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {data.products.length} of {data.total_count} products
        </div>
        <div className="text-sm text-muted-foreground">
          Page {data.page} of {data.total_pages}
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : data.products.length > 0 ? (
        <ProductGrid 
          products={data.products} 
          showDescription={true}
          showStats={false}
          size="md"
          columns={4}
        />
      ) : (
        <div className="text-center py-12">
          <div className="text-muted-foreground">
            {hasActiveFilters ? 'No products found matching your filters.' : 'No products available.'}
          </div>
          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters} className="mt-4">
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Pagination */}
      {data.total_pages > 1 && (
        <div className="flex justify-center space-x-2">
          <Button
            variant="outline"
            onClick={() => handlePageChange(Math.max(1, data.page - 1))}
            disabled={data.page <= 1}
          >
            Previous
          </Button>
          
          {/* Page numbers */}
          {Array.from({ length: Math.min(5, data.total_pages) }, (_, i) => {
            const pageNum = Math.max(1, Math.min(data.total_pages, data.page - 2 + i));
            return (
              <Button
                key={pageNum}
                variant={pageNum === data.page ? "default" : "outline"}
                onClick={() => handlePageChange(pageNum)}
              >
                {pageNum}
              </Button>
            );
          })}
          
          <Button
            variant="outline"
            onClick={() => handlePageChange(Math.min(data.total_pages, data.page + 1))}
            disabled={data.page >= data.total_pages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
} 