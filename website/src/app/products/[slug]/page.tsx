import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createSupabaseClient } from '@mayahq/supabase-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, Tag, Calendar, Eye } from 'lucide-react';
import { AffiliateLink } from '@/components/affiliate-link';
import { ProductEmbed } from '@/components/product-embed';
import { ShareButton } from '@/components/share-button';
import Image from 'next/image';

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
  meta_title?: string | null;
  meta_description?: string | null;
  slug: string;
  created_at: string;
  updated_at: string;
}

interface ProductPageProps {
  params: { slug: string };
}

async function getProduct(slug: string): Promise<Product | null> {
  try {
    const supabase = createSupabaseClient();
    const { data: product, error } = await (supabase as any)
      .from('maya_products')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error || !product) {
      return null;
    }

    return product;
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  try {
    const supabase = createSupabaseClient();
    
    // First try to get products from the same category
    let query = (supabase as any)
      .from('maya_products')
      .select('*')
      .eq('is_active', true)
      .neq('id', product.id)
      .limit(limit);

    if (product.category) {
      query = query.eq('category', product.category);
    }

    const { data: categoryProducts } = await query;

    if (categoryProducts && categoryProducts.length >= limit) {
      return categoryProducts;
    }

    // If not enough from category, get by platform
    if (product.platform) {
      const { data: platformProducts } = await (supabase as any)
        .from('maya_products')
        .select('*')
        .eq('platform', product.platform)
        .eq('is_active', true)
        .neq('id', product.id)
        .limit(limit);

      const combined = [...(categoryProducts || []), ...(platformProducts || [])];
      const unique = combined.filter((p, index, self) => 
        index === self.findIndex(item => item.id === p.id)
      );

      if (unique.length >= limit) {
        return unique.slice(0, limit);
      }
    }

    // Fill remaining with any active products
    const { data: anyProducts } = await (supabase as any)
      .from('maya_products')
      .select('*')
      .eq('is_active', true)
      .neq('id', product.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    return anyProducts || [];
  } catch (error) {
    console.error('Error fetching related products:', error);
    return [];
  }
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const product = await getProduct(params.slug);

  if (!product) {
    return {
      title: 'Product Not Found',
      description: 'The requested product could not be found.',
    };
  }

  const title = product.meta_title || product.name;
  const description = product.meta_description || product.description || `Check out ${product.name} on ${product.platform || 'our platform'}`;
  const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://mayahq.dev'}/products/${product.slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      images: product.image_url ? [
        {
          url: product.image_url,
          width: 1200,
          height: 630,
          alt: product.name,
        }
      ] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: product.image_url ? [product.image_url] : [],
    },
    alternates: {
      canonical: url,
    },
  };
}

function generateStructuredData(product: Product) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://mayahq.dev';
  
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.name,
    "description": product.description,
    "image": product.image_url,
    "url": `${baseUrl}/products/${product.slug}`,
    "brand": {
      "@type": "Brand",
      "name": product.platform || "Maya"
    },
    "offers": product.sale_price || product.original_price ? {
      "@type": "Offer",
      "price": product.sale_price || product.original_price,
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "url": product.affiliate_link
    } : undefined,
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.5",
      "reviewCount": "1"
    }
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProduct(params.slug);

  if (!product) {
    notFound();
  }

  const relatedProducts = await getRelatedProducts(product);
  const structuredData = generateStructuredData(product);

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const shareUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://mayahq.dev'}/products/${product.slug}`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-muted-foreground">
          <a href="/" className="hover:text-foreground">Home</a>
          <span className="mx-2">/</span>
          <a href="/products" className="hover:text-foreground">Products</a>
          <span className="mx-2">/</span>
          <span className="text-foreground">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Product Image */}
          <div className="space-y-4">
            {product.image_url ? (
              <div className="relative aspect-square overflow-hidden rounded-lg border">
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
              </div>
            ) : (
              <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <ExternalLink className="h-12 w-12 mx-auto mb-2" />
                  <p>No image available</p>
                </div>
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {product.platform && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    {product.platform}
                  </Badge>
                )}
                {product.category && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {product.category}
                  </Badge>
                )}
              </div>

              {(product.original_price || product.sale_price) && (
                <div className="mb-4">
                  {product.sale_price && (
                    <div className="text-3xl font-bold text-green-600">
                      {formatPrice(product.sale_price)}
                    </div>
                  )}
                  {product.original_price && (
                    <div className={`text-lg ${product.sale_price ? 'line-through text-muted-foreground' : 'font-bold'}`}>
                      {formatPrice(product.original_price)}
                    </div>
                  )}
                  {product.sale_price && product.original_price && product.sale_price < product.original_price && (
                    <div className="text-sm text-green-600 font-medium">
                      Save {formatPrice(product.original_price - product.sale_price)} 
                      ({Math.round((1 - product.sale_price / product.original_price) * 100)}% off)
                    </div>
                  )}
                </div>
              )}
            </div>

            {product.description && (
              <div>
                <h2 className="text-lg font-semibold mb-2">Description</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {product.description}
                </p>
              </div>
            )}

            {product.tags && product.tags.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {product.tags.map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* CTA Section */}
            <div className="space-y-4 pt-4 border-t">
              <AffiliateLink productId={product.id} href={product.affiliate_link}>
                <Button size="lg" className="w-full">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Product
                </Button>
              </AffiliateLink>
              
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {product.click_count} clicks
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Added {formatDate(product.created_at)}
                </div>
              </div>
            </div>

            {/* Share Button */}
            <ShareButton 
              title={product.name}
              text={product.description || `Check out ${product.name}`}
              url={shareUrl}
              className="w-full"
            />
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-6">Related Products</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.map((relatedProduct) => (
                <ProductEmbed key={relatedProduct.id} product={relatedProduct} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
} 