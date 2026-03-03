# Maya MCP Integration Guide: Product Management System

This guide explains how Maya can interact with the Product & Affiliate Management System using MCP (Model Context Protocol) tools.

## Overview

Maya can manage products through two main methods:
1. **Supabase MCP Server** - Direct database operations
2. **HTTP API Calls** - REST API endpoints

## Method 1: Supabase MCP Server (Recommended)

### Prerequisites
- Supabase MCP server configured and connected
- Access to `maya_products` and `maya_product_clicks` tables

### Available MCP Tools

#### 1. Create Product
```typescript
// Tool: mcp_Supabase_MCP_execute_sql
await supabase.executeSQL({
  project_id: "your-project-id",
  query: `
    INSERT INTO maya_products (
      name, description, affiliate_link, image_url, 
      original_price, sale_price, platform, category, 
      tags, is_active, meta_title, meta_description, slug
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    ) RETURNING *;
  `,
  params: [
    "Wireless Headphones",
    "Premium noise-canceling headphones",
    "https://amazon.com/dp/example",
    "https://images.example.com/headphones.jpg",
    299.99,
    199.99,
    "amazon",
    "tech",
    ["headphones", "wireless", "audio"],
    true,
    "Best Wireless Headphones 2025",
    "Experience premium sound quality",
    "wireless-headphones-2025"
  ]
});
```

#### 2. List Products with Filters
```typescript
// Get active tech products
await supabase.executeSQL({
  project_id: "your-project-id", 
  query: `
    SELECT * FROM maya_products 
    WHERE is_active = true 
    AND category = $1 
    ORDER BY created_at DESC 
    LIMIT $2 OFFSET $3;
  `,
  params: ["tech", 20, 0]
});
```

#### 3. Update Product
```typescript
await supabase.executeSQL({
  project_id: "your-project-id",
  query: `
    UPDATE maya_products 
    SET name = $1, sale_price = $2, updated_at = NOW()
    WHERE id = $3 
    RETURNING *;
  `,
  params: ["Updated Product Name", 149.99, "product-uuid"]
});
```

#### 4. Get Product Analytics
```typescript
await supabase.executeSQL({
  project_id: "your-project-id",
  query: `
    SELECT 
      p.id, p.name, p.click_count,
      COUNT(pc.id) as recent_clicks,
      COUNT(CASE WHEN pc.clicked_at >= NOW() - INTERVAL '7 days' THEN 1 END) as clicks_this_week
    FROM maya_products p
    LEFT JOIN maya_product_clicks pc ON p.id = pc.product_id
    WHERE p.id = $1
    GROUP BY p.id, p.name, p.click_count;
  `,
  params: ["product-uuid"]
});
```

#### 5. Search Products
```typescript
await supabase.executeSQL({
  project_id: "your-project-id",
  query: `
    SELECT * FROM maya_products 
    WHERE (name ILIKE $1 OR description ILIKE $1)
    AND is_active = true
    AND ($2::text IS NULL OR platform = $2)
    AND ($3::text IS NULL OR category = $3)
    ORDER BY click_count DESC, created_at DESC
    LIMIT $4;
  `,
  params: ["%wireless%", "amazon", "tech", 10]
});
```

## Method 2: HTTP API Calls

### Base URL
```
https://mayascott.ai/api/products
```

### Available Endpoints

#### 1. Create Product
```typescript
const response = await fetch('https://mayascott.ai/api/products', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: "Smart Watch",
    description: "Advanced fitness tracking smartwatch",
    affiliate_link: "https://amazon.com/dp/smartwatch",
    image_url: "https://images.example.com/watch.jpg",
    original_price: 399.99,
    sale_price: 299.99,
    platform: "amazon",
    category: "tech",
    tags: ["smartwatch", "fitness", "wearable"],
    is_active: true,
    meta_title: "Best Smart Watch 2025",
    meta_description: "Track your fitness goals with this advanced smartwatch"
  })
});
```

#### 2. Upload Product Image
```typescript
const formData = new FormData();
formData.append('file', imageFile);

const response = await fetch('https://mayascott.ai/api/products/upload-image', {
  method: 'POST',
  body: formData
});

const result = await response.json();
// Use result.url as image_url in product creation
```

#### 3. List/Search Products
```typescript
// Basic list
const products = await fetch('https://mayascott.ai/api/products?page=1&limit=20');

// With filters
const filteredProducts = await fetch(
  'https://mayascott.ai/api/products?' + 
  'platform=amazon&category=tech&search=wireless&is_active=true'
);

// Advanced search with facets
const searchResults = await fetch(
  'https://mayascott.ai/api/products/search?' +
  'search=headphones&min_price=50&max_price=300&include_facets=true'
);
```

#### 4. Update Product
```typescript
const response = await fetch(`https://mayascott.ai/api/products/${productId}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    sale_price: 149.99,
    is_active: true
  })
});
```

#### 5. Track Click
```typescript
const response = await fetch(`https://mayascott.ai/api/products/${productId}/click`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    referrer: 'https://example.com',
    user_agent: 'Mozilla/5.0...'
  })
});
```

## Common Maya Use Cases

### 1. Add Product from Amazon Link
```typescript
async function addAmazonProduct(amazonUrl: string, customTitle?: string) {
  // Maya could scrape product details
  const productDetails = await scrapeAmazonProduct(amazonUrl);
  
  // Upload image if found
  let imageUrl = null;
  if (productDetails.imageUrl) {
    const imageResponse = await fetch('/api/products/upload-image', {
      method: 'POST',
      body: createImageFormData(productDetails.imageUrl)
    });
    const imageResult = await imageResponse.json();
    imageUrl = imageResult.url;
  }
  
  // Create product
  return await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: customTitle || productDetails.title,
      description: productDetails.description,
      affiliate_link: amazonUrl,
      image_url: imageUrl,
      original_price: productDetails.price,
      platform: "amazon",
      category: inferCategory(productDetails.title),
      tags: extractTags(productDetails.title, productDetails.description),
      is_active: true
    })
  });
}
```

### 2. Weekly Analytics Report
```typescript
async function generateWeeklyReport() {
  const products = await supabase.executeSQL({
    project_id: "your-project-id",
    query: `
      SELECT 
        p.name, p.platform, p.category,
        p.click_count as total_clicks,
        COUNT(CASE WHEN pc.clicked_at >= NOW() - INTERVAL '7 days' THEN 1 END) as clicks_this_week,
        COUNT(CASE WHEN pc.clicked_at >= NOW() - INTERVAL '1 day' THEN 1 END) as clicks_today
      FROM maya_products p
      LEFT JOIN maya_product_clicks pc ON p.id = pc.product_id
      WHERE p.is_active = true
      GROUP BY p.id, p.name, p.platform, p.category, p.click_count
      ORDER BY clicks_this_week DESC, total_clicks DESC
      LIMIT 10;
    `
  });
  
  return formatAnalyticsReport(products);
}
```

### 3. Bulk Update Sale Prices
```typescript
async function startSaleEvent(category: string, discountPercent: number) {
  return await supabase.executeSQL({
    project_id: "your-project-id",
    query: `
      UPDATE maya_products 
      SET sale_price = ROUND(original_price * (1 - $1/100.0), 2)
      WHERE category = $2 
      AND is_active = true 
      AND sale_price IS NULL
      RETURNING name, original_price, sale_price;
    `,
    params: [discountPercent, category]
  });
}
```

### 4. Find Top Performing Products
```typescript
async function getTopPerformers(days: number = 30) {
  return await supabase.executeSQL({
    project_id: "your-project-id",
    query: `
      SELECT 
        p.name, p.slug, p.platform, p.category,
        COUNT(pc.id) as recent_clicks,
        ROUND(COUNT(pc.id)::decimal / $1, 2) as avg_clicks_per_day
      FROM maya_products p
      JOIN maya_product_clicks pc ON p.id = pc.product_id
      WHERE pc.clicked_at >= NOW() - INTERVAL '$1 days'
      GROUP BY p.id, p.name, p.slug, p.platform, p.category
      HAVING COUNT(pc.id) > 5
      ORDER BY recent_clicks DESC
      LIMIT 10;
    `,
    params: [days]
  });
}
```

## Error Handling

```typescript
try {
  const result = await supabase.executeSQL({
    project_id: "your-project-id",
    query: "SELECT * FROM maya_products WHERE id = $1",
    params: [productId]
  });
  
  if (!result.data || result.data.length === 0) {
    return { error: "Product not found" };
  }
  
  return { success: true, product: result.data[0] };
} catch (error) {
  console.error("Database error:", error);
  return { error: "Failed to fetch product" };
}
```

## Best Practices for Maya

1. **Always validate inputs** before database operations
2. **Use transactions** for multi-step operations
3. **Include error handling** for all database calls
4. **Log operations** for debugging and analytics
5. **Use parameterized queries** to prevent SQL injection
6. **Cache frequently accessed data** when possible
7. **Monitor rate limits** on external API calls

## Security Considerations

- All database operations require proper authentication
- Image uploads are validated for file type and size
- SQL injection protection through parameterized queries
- Rate limiting on API endpoints
- CORS configuration for web requests

## Monitoring and Logging

Maya can track:
- Product creation/update timestamps
- Click tracking analytics
- Error rates and types
- Performance metrics
- User engagement patterns 