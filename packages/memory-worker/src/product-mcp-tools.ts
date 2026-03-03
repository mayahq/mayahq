import { createClient } from '@supabase/supabase-js';
import { MCPResult } from './mcp-bridge';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface Product {
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

/**
 * Maya Product MCP Tools - Intelligent Product Management
 * Integrates product management with Maya's memory worker system
 */
export class ProductMCPTools {

  /**
   * Create a new affiliate product
   */
  static async createProduct(args: any): Promise<MCPResult> {
    try {
      const { 
        userId, 
        name, 
        description,
        affiliateLink,
        imageUrl,
        originalPrice,
        salePrice,
        platform = 'other',
        category = 'other',
        tags = [],
        isActive = true
      } = args;
      
      if (!userId || !name || !affiliateLink) {
        throw new Error('Missing required fields: userId, name, affiliateLink');
      }

      // Generate slug
      const slug = name.toLowerCase()
        .replace(/[^a-zA-Z0-9\s\-_]/g, '')
        .trim()
        .replace(/\s+/g, '-') + '-' + Date.now();

      const productData = {
        name,
        description: description || null,
        image_url: imageUrl || null,
        affiliate_link: affiliateLink,
        original_price: originalPrice || null,
        sale_price: salePrice || null,
        platform,
        category,
        tags: tags.length > 0 ? tags : null,
        is_active: isActive,
        meta_title: name,
        meta_description: description || `Check out ${name} on ${platform}`,
        slug,
        click_count: 0
      };

      const { data: product, error } = await supabase
        .from('maya_products')
        .insert(productData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create product: ${error.message}`);
      }

      // Maya's intelligent response
      let response = `🛍️ **Product Created Successfully!**\n\n`;
      response += `📦 **${product.name}**\n`;
      if (product.description) response += `📝 ${product.description}\n`;
      if (product.platform) response += `🏪 Platform: ${product.platform}\n`;
      if (product.category) response += `📂 Category: ${product.category}\n`;
      if (product.original_price) response += `💰 Price: $${product.original_price}`;
      if (product.sale_price && product.sale_price < product.original_price) {
        response += ` ➜ **$${product.sale_price}** (${Math.round((1 - product.sale_price / product.original_price) * 100)}% off!)`;
      }
      response += `\n🔗 [View Product](https://mayascott.ai/products/${product.slug})`;
      response += `\n📊 Tracking link ready for analytics`;
      response += `\n🆔 Product ID: ${product.id}`;

      if (tags.length > 0) {
        response += `\n🏷️ Tags: ${tags.join(', ')}`;
      }

      return {
        content: [{ type: 'text', text: response }],
        isError: false,
        _meta: { 
          source: 'maya-products', 
          action: 'create_product', 
          productId: product.id,
          slug: product.slug,
          platform: product.platform
        }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to create product: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Get products with Maya's intelligent filtering and insights
   */
  static async getProducts(args: any): Promise<MCPResult> {
    try {
      const { 
        userId, 
        platform, 
        category, 
        search,
        isActive = true,
        limit = 10,
        sortBy = 'created_at'
      } = args;
      
      if (!userId) {
        throw new Error('Missing required field: userId');
      }

      let query = supabase
        .from('maya_products')
        .select('*');

      if (isActive !== null) {
        query = query.eq('is_active', isActive);
      }
      if (platform) {
        query = query.eq('platform', platform);
      }
      if (category) {
        query = query.eq('category', category);
      }
      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }

      query = query
        .order(sortBy, { ascending: false })
        .limit(limit);

      const { data: products, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch products: ${error.message}`);
      }

      if (!products || products.length === 0) {
        let response = `📦 No products found`;
        if (search) response += ` matching "${search}"`;
        if (platform) response += ` on ${platform}`;
        if (category) response += ` in ${category}`;
        response += `.`;
        
        return {
          content: [{ type: 'text', text: response }],
          isError: false,
          _meta: { source: 'maya-products', action: 'get_products', count: 0 }
        };
      }

      // Maya's intelligent analysis
      const totalProducts = products.length;
      const totalClicks = products.reduce((sum, p) => sum + p.click_count, 0);
      const platforms = [...new Set(products.map(p => p.platform).filter(Boolean))];
      const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
      const avgPrice = products
        .filter(p => p.sale_price || p.original_price)
        .reduce((sum, p, _, arr) => sum + (p.sale_price || p.original_price || 0) / arr.length, 0);

      let response = `🛍️ **Your Product Portfolio**\n\n`;
      
      // Maya's insights
      response += `📊 **Overview**: ${totalProducts} products, ${totalClicks} total clicks`;
      if (avgPrice > 0) response += `, avg price $${avgPrice.toFixed(2)}`;
      response += `\n🏪 **Platforms**: ${platforms.join(', ') || 'Various'}`;
      response += `\n📂 **Categories**: ${categories.join(', ') || 'Various'}\n\n`;

      // Product list with Maya's intelligent formatting
      response += `**Products**:\n`;
      products.forEach((product, index) => {
        const clickIcon = product.click_count > 0 ? '🔥' : '📦';
        const priceText = product.sale_price 
          ? `$${product.sale_price}` + (product.original_price > product.sale_price ? ` (was $${product.original_price})` : '')
          : product.original_price ? `$${product.original_price}` : '';
        
        response += `${index + 1}. ${clickIcon} **${product.name}**`;
        if (priceText) response += ` - ${priceText}`;
        response += `\n   🏪 ${product.platform || 'Unknown'} | 📂 ${product.category || 'Uncategorized'}`;
        if (product.click_count > 0) response += ` | 👆 ${product.click_count} clicks`;
        response += `\n   🔗 [View](https://mayascott.ai/products/${product.slug}) | 🆔 ${product.id}\n`;
      });

      // Maya's recommendations
      if (totalClicks === 0) {
        response += `\n💡 **Maya's Tip**: None of your products have clicks yet. Consider promoting them on social media or optimizing their descriptions!`;
      } else {
        const topProduct = products.sort((a, b) => b.click_count - a.click_count)[0];
        if (topProduct.click_count > 0) {
          response += `\n🌟 **Top Performer**: "${topProduct.name}" with ${topProduct.click_count} clicks!`;
        }
      }

      return {
        content: [{ type: 'text', text: response }],
        isError: false,
        _meta: { 
          source: 'maya-products', 
          action: 'get_products', 
          count: totalProducts,
          totalClicks,
          platforms,
          categories
        }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to get products: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Update an existing product
   */
  static async updateProduct(args: any): Promise<MCPResult> {
    try {
      const { userId, productIdentifier, updates } = args;
      
      if (!userId || !productIdentifier || !updates) {
        throw new Error('Missing required fields: userId, productIdentifier, updates');
      }

      // Find the product
      let query = supabase.from('maya_products').select('*');
      
      // Try to find by ID first, then by name
      if (productIdentifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        query = query.eq('id', productIdentifier);
      } else {
        query = query.ilike('name', `%${productIdentifier}%`);
      }

      const { data: products, error: searchError } = await query;

      if (searchError || !products || products.length === 0) {
        return {
          content: [{ type: 'text', text: `❌ Could not find a product matching "${productIdentifier}".` }],
          isError: true
        };
      }

      if (products.length > 1) {
        let response = `🔍 Found multiple products matching "${productIdentifier}". Please be more specific:\n\n`;
        products.forEach((product, index) => {
          response += `${index + 1}. **${product.name}** (${product.platform}) - ID: ${product.id}\n`;
        });
        return {
          content: [{ type: 'text', text: response }],
          isError: false,
          _meta: { source: 'maya-products', action: 'ambiguous_match', count: products.length }
        };
      }

      const product = products[0];
      const { data: updatedProduct, error: updateError } = await supabase
        .from('maya_products')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', product.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update product: ${updateError.message}`);
      }

      let response = `✅ **Product Updated Successfully!**\n\n`;
      response += `📦 **${updatedProduct.name}**\n`;
      response += `🔗 [View Product](https://mayascott.ai/products/${updatedProduct.slug})\n`;
      response += `🆔 Product ID: ${updatedProduct.id}\n\n`;
      response += `**Updated Fields**: ${Object.keys(updates).join(', ')}`;

      return {
        content: [{ type: 'text', text: response }],
        isError: false,
        _meta: { 
          source: 'maya-products', 
          action: 'update_product', 
          productId: updatedProduct.id,
          updatedFields: Object.keys(updates)
        }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to update product: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Get product analytics with Maya's insights
   */
  static async getProductAnalytics(args: any): Promise<MCPResult> {
    try {
      const { userId, days = 30, productId } = args;
      
      if (!userId) {
        throw new Error('Missing required field: userId');
      }

      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      // Get product analytics
      let analyticsQuery = `
        SELECT 
          p.id, p.name, p.platform, p.category, p.click_count,
          COUNT(pc.id) as recent_clicks,
          COUNT(CASE WHEN pc.clicked_at >= NOW() - INTERVAL '7 days' THEN 1 END) as clicks_this_week,
          COUNT(CASE WHEN pc.clicked_at >= NOW() - INTERVAL '1 day' THEN 1 END) as clicks_today
        FROM maya_products p
        LEFT JOIN maya_product_clicks pc ON p.id = pc.product_id
        WHERE p.is_active = true
      `;
      
      if (productId) {
        analyticsQuery += ` AND p.id = '${productId}'`;
      }
      
      analyticsQuery += `
        GROUP BY p.id, p.name, p.platform, p.category, p.click_count
        ORDER BY recent_clicks DESC, p.click_count DESC
        LIMIT 10
      `;

      const { data: analytics, error } = await supabase.rpc('exec_sql', {
        sql: analyticsQuery
      });

      if (error) {
        // Fallback to basic analytics
        const { data: products, error: fallbackError } = await supabase
          .from('maya_products')
          .select('*')
          .eq('is_active', true)
          .order('click_count', { ascending: false })
          .limit(10);

        if (fallbackError) {
          throw new Error(`Failed to get analytics: ${fallbackError.message}`);
        }

        return this.formatBasicAnalytics(products, days);
      }

      // Maya's intelligent analytics response
      let response = `📊 **Product Analytics Report** (Last ${days} days)\n\n`;

      if (!analytics || analytics.length === 0) {
        response += `📦 No active products found for analytics.`;
        return {
          content: [{ type: 'text', text: response }],
          isError: false,
          _meta: { source: 'maya-products', action: 'get_analytics', count: 0 }
        };
      }

      const totalClicks = analytics.reduce((sum: number, p: any) => sum + (p.recent_clicks || 0), 0);
      const totalProducts = analytics.length;

      response += `🎯 **Summary**: ${totalProducts} products, ${totalClicks} clicks in ${days} days\n\n`;
      response += `**Top Performers**:\n`;

      analytics.forEach((product: any, index: number) => {
        const trendIcon = product.clicks_today > 0 ? '🔥' : 
                         product.clicks_this_week > 0 ? '📈' : '📦';
        
        response += `${index + 1}. ${trendIcon} **${product.name}**\n`;
        response += `   🏪 ${product.platform} | 📂 ${product.category}\n`;
        response += `   📊 ${product.recent_clicks || 0} clicks (${days}d), ${product.clicks_this_week || 0} this week\n`;
        response += `   📈 Total: ${product.click_count} all-time clicks\n\n`;
      });

      // Maya's insights
      const topPerformer = analytics[0];
      if (topPerformer && topPerformer.recent_clicks > 0) {
        response += `🌟 **Maya's Insight**: "${topPerformer.name}" is your top performer with ${topPerformer.recent_clicks} recent clicks!`;
      } else {
        response += `💡 **Maya's Tip**: No clicks recently. Consider promoting your products or refreshing your content strategy!`;
      }

      return {
        content: [{ type: 'text', text: response }],
        isError: false,
        _meta: { 
          source: 'maya-products', 
          action: 'get_analytics', 
          totalProducts,
          totalClicks,
          days
        }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to get analytics: ${error.message}` }],
        isError: true
      };
    }
  }

  private static formatBasicAnalytics(products: any[], days: number): MCPResult {
    let response = `📊 **Product Analytics Report** (Basic)\n\n`;
    
    if (!products || products.length === 0) {
      response += `📦 No active products found.`;
      return {
        content: [{ type: 'text', text: response }],
        isError: false,
        _meta: { source: 'maya-products', action: 'get_analytics', count: 0 }
      };
    }

    const totalClicks = products.reduce((sum, p) => sum + p.click_count, 0);
    response += `🎯 **Summary**: ${products.length} products, ${totalClicks} total clicks\n\n`;
    response += `**Your Products**:\n`;

    products.forEach((product, index) => {
      const icon = product.click_count > 0 ? '📈' : '📦';
      response += `${index + 1}. ${icon} **${product.name}** - ${product.click_count} clicks\n`;
      response += `   🏪 ${product.platform} | 📂 ${product.category}\n\n`;
    });

    return {
      content: [{ type: 'text', text: response }],
      isError: false,
      _meta: { 
        source: 'maya-products', 
        action: 'get_analytics', 
        totalProducts: products.length,
        totalClicks
      }
    };
  }

  /**
   * Delete a product
   */
  static async deleteProduct(args: any): Promise<MCPResult> {
    try {
      const { userId, productIdentifier } = args;
      
      if (!userId || !productIdentifier) {
        throw new Error('Missing required fields: userId, productIdentifier');
      }

      // Find the product (same logic as update)
      let query = supabase.from('maya_products').select('*');
      
      if (productIdentifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        query = query.eq('id', productIdentifier);
      } else {
        query = query.ilike('name', `%${productIdentifier}%`);
      }

      const { data: products, error: searchError } = await query;

      if (searchError || !products || products.length === 0) {
        return {
          content: [{ type: 'text', text: `❌ Could not find a product matching "${productIdentifier}" to delete.` }],
          isError: true
        };
      }

      if (products.length > 1) {
        let response = `🔍 Found multiple products. Please be more specific about which one to delete:\n\n`;
        products.forEach((product, index) => {
          response += `${index + 1}. **${product.name}** (${product.platform}) - ID: ${product.id}\n`;
        });
        return {
          content: [{ type: 'text', text: response }],
          isError: false
        };
      }

      const product = products[0];
      const productName = product.name;
      const productId = product.id;

      const { error: deleteError } = await supabase
        .from('maya_products')
        .delete()
        .eq('id', product.id);

      if (deleteError) {
        throw new Error(`Failed to delete product: ${deleteError.message}`);
      }

      return {
        content: [{
          type: 'text',
          text: `✅ **Product Deleted Successfully!**\n\n🗑️ Removed: **${productName}**\n🆔 Product ID: ${productId}\n\n📝 The product and all its analytics data have been permanently removed.`
        }],
        isError: false,
        _meta: { source: 'maya-products', action: 'delete_product', productId: productId }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to delete product: ${error.message}` }],
        isError: true
      };
    }
  }
}

/**
 * Available Maya Product MCP Tools for memory-worker integration
 */
export const MAYA_PRODUCT_TOOLS = [
  {
    name: 'maya_product_create',
    description: 'Create a new affiliate product with intelligent suggestions',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        name: { type: 'string', description: 'Product name' },
        description: { type: 'string', description: 'Product description (optional)' },
        affiliateLink: { type: 'string', description: 'Affiliate link URL' },
        imageUrl: { type: 'string', description: 'Product image URL (optional)' },
        originalPrice: { type: 'number', description: 'Original price (optional)' },
        salePrice: { type: 'number', description: 'Sale price (optional)' },
        platform: { 
          type: 'string', 
          enum: ['amazon', 'tiktok_shop', 'digital', 'shopify', 'etsy', 'other'], 
          description: 'Platform where product is sold (default: other)' 
        },
        category: { 
          type: 'string', 
          enum: ['tech', 'fashion', 'home', 'beauty', 'books', 'sports', 'other'], 
          description: 'Product category (default: other)' 
        },
        tags: { type: 'array', items: { type: 'string' }, description: 'Product tags (optional)' },
        isActive: { type: 'boolean', description: 'Whether product is active (default: true)' }
      },
      required: ['userId', 'name', 'affiliateLink']
    }
  },
  {
    name: 'maya_product_list',
    description: 'Get products with Maya\'s intelligent insights and analysis',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        platform: { type: 'string', description: 'Filter by platform (optional)' },
        category: { type: 'string', description: 'Filter by category (optional)' },
        search: { type: 'string', description: 'Search in product names and descriptions (optional)' },
        isActive: { type: 'boolean', description: 'Filter by active status (default: true)' },
        limit: { type: 'number', description: 'Maximum number of products to return (default: 10)' },
        sortBy: { type: 'string', enum: ['created_at', 'click_count', 'name'], description: 'Sort field (default: created_at)' }
      },
      required: ['userId']
    }
  },
  {
    name: 'maya_product_update',
    description: 'Update an existing product with intelligent validation',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        productIdentifier: { type: 'string', description: 'Product ID or name to identify the product' },
        updates: { 
          type: 'object', 
          description: 'Fields to update',
          properties: {
            name: { type: 'string', description: 'New product name' },
            description: { type: 'string', description: 'New description' },
            affiliate_link: { type: 'string', description: 'New affiliate link' },
            image_url: { type: 'string', description: 'New image URL' },
            original_price: { type: 'number', description: 'New original price' },
            sale_price: { type: 'number', description: 'New sale price' },
            platform: { type: 'string', description: 'New platform' },
            category: { type: 'string', description: 'New category' },
            tags: { type: 'array', items: { type: 'string' }, description: 'New tags' },
            is_active: { type: 'boolean', description: 'New active status' }
          }
        }
      },
      required: ['userId', 'productIdentifier', 'updates']
    }
  },
  {
    name: 'maya_product_analytics',
    description: 'Get product performance analytics with Maya\'s insights',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        days: { type: 'number', description: 'Number of days to analyze (default: 30)' },
        productId: { type: 'string', description: 'Specific product ID to analyze (optional)' }
      },
      required: ['userId']
    }
  },
  {
    name: 'maya_product_delete',
    description: 'Delete a product with confirmation',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        productIdentifier: { type: 'string', description: 'Product ID or name to identify the product to delete' }
      },
      required: ['userId', 'productIdentifier']
    }
  }
]; 