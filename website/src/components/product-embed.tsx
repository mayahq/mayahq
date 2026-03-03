'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AffiliateLink } from '@/components/affiliate-link';
import { ExternalLink, Tag, Eye } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

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

interface ProductEmbedProps {
  product: Product;
  showDescription?: boolean;
  showStats?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ProductEmbed({ 
  product, 
  showDescription = false, 
  showStats = false,
  size = 'md'
}: ProductEmbedProps) {
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  const imageSize = {
    sm: 'h-32',
    md: 'h-48', 
    lg: 'h-64'
  }[size];

  const cardSize = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  }[size];

  return (
    <Card className="group hover:shadow-lg transition-shadow duration-200">
      <CardHeader className={`${cardSize} pb-2`}>
        {/* Product Image */}
        <div className={`relative ${imageSize} overflow-hidden rounded-md bg-muted mb-3`}>
          {product.image_url ? (
            <Link href={`/products/${product.slug}`}>
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-200"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </Link>
          ) : (
            <Link href={`/products/${product.slug}`} className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <ExternalLink className="h-8 w-8 mx-auto mb-1" />
                <p className="text-xs">No image</p>
              </div>
            </Link>
          )}
        </div>

        {/* Product Title */}
        <CardTitle className={`${size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base'} line-clamp-2`}>
          <Link 
            href={`/products/${product.slug}`}
            className="hover:text-primary transition-colors"
          >
            {product.name}
          </Link>
        </CardTitle>

        {/* Platform and Category Badges */}
        <div className="flex flex-wrap gap-1">
          {product.platform && (
            <Badge variant="outline" className="text-xs">
              {product.platform}
            </Badge>
          )}
          {product.category && (
            <Badge variant="secondary" className="text-xs">
              {product.category}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className={`${cardSize} pt-0 space-y-3`}>
        {/* Description */}
        {showDescription && product.description && (
          <CardDescription className="text-sm line-clamp-2">
            {product.description}
          </CardDescription>
        )}

        {/* Pricing */}
        {(product.original_price || product.sale_price) && (
          <div className="space-y-1">
            {product.sale_price && (
              <div className="text-lg font-bold text-green-600">
                {formatPrice(product.sale_price)}
              </div>
            )}
            {product.original_price && (
              <div className={`text-sm ${product.sale_price ? 'line-through text-muted-foreground' : 'font-semibold'}`}>
                {formatPrice(product.original_price)}
              </div>
            )}
            {product.sale_price && product.original_price && product.sale_price < product.original_price && (
              <div className="text-xs text-green-600 font-medium">
                {Math.round((1 - product.sale_price / product.original_price) * 100)}% off
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        {product.tags && product.tags.length > 0 && size !== 'sm' && (
          <div className="flex flex-wrap gap-1">
            {product.tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {product.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{product.tags.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        {showStats && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {product.click_count}
            </div>
          </div>
        )}

        {/* CTA Buttons */}
        <div className="space-y-2">
          <Link href={`/products/${product.slug}`} className="w-full">
            <Button variant="outline" size="sm" className="w-full">
              View Details
            </Button>
          </Link>
          
          <AffiliateLink productId={product.id} href={product.affiliate_link}>
            <Button size="sm" className="w-full">
              <ExternalLink className="mr-1 h-3 w-3" />
              Buy Now
            </Button>
          </AffiliateLink>
        </div>
      </CardContent>
    </Card>
  );
}

// Grid component for displaying multiple products
interface ProductGridProps {
  products: Product[];
  showDescription?: boolean;
  showStats?: boolean;
  size?: 'sm' | 'md' | 'lg';
  columns?: 2 | 3 | 4;
}

export function ProductGrid({ 
  products, 
  showDescription = false, 
  showStats = false,
  size = 'md',
  columns = 4
}: ProductGridProps) {
  const gridCols = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
  }[columns];

  return (
    <div className={`grid gap-6 ${gridCols}`}>
      {products.map((product) => (
        <ProductEmbed 
          key={product.id} 
          product={product} 
          showDescription={showDescription}
          showStats={showStats}
          size={size}
        />
      ))}
    </div>
  );
} 