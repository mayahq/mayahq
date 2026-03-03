/**
 * PRODUCT MANAGEMENT REFERENCE GUIDE FOR MAYA
 * 
 * This file is NOT an MCP server - it's documentation showing Maya how to use
 * the existing Supabase MCP server to manage products.
 * 
 * Maya should use these patterns with the existing mcp_Supabase_MCP_* tools
 * that are already available through the Supabase MCP server.
 * 
 * Think of this as a "user manual" for the product management system.
 */

// MCP tools for Maya to interact with the Product Management System
// These tools integrate with Supabase MCP server for database operations

export interface MCPProductTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

// Tool definitions for Maya to use via MCP
export const productMCPTools: MCPProductTool[] = [
  {
    name: "create_product",
    description: "Create a new affiliate product with image upload support",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Product name"
        },
        description: {
          type: "string", 
          description: "Product description"
        },
        affiliate_link: {
          type: "string",
          description: "Affiliate link URL"
        },
        image_url: {
          type: "string",
          description: "Product image URL (can be uploaded via upload_product_image)"
        },
        original_price: {
          type: "number",
          description: "Original price of the product"
        },
        sale_price: {
          type: "number",
          description: "Sale price of the product"
        },
        platform: {
          type: "string",
          enum: ["amazon", "tiktok_shop", "digital", "shopify", "etsy", "other"],
          description: "Platform where the product is sold"
        },
        category: {
          type: "string",
          enum: ["tech", "fashion", "home", "beauty", "books", "sports", "other"],
          description: "Product category"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Product tags for categorization"
        },
        is_active: {
          type: "boolean",
          description: "Whether the product is active and visible"
        },
        meta_title: {
          type: "string",
          description: "SEO meta title"
        },
        meta_description: {
          type: "string", 
          description: "SEO meta description"
        }
      },
      required: ["name", "affiliate_link"]
    }
  },
  
  {
    name: "upload_product_image",
    description: "Upload an image for a product to Supabase storage",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Local path to the image file to upload"
        },
        file_name: {
          type: "string",
          description: "Name for the uploaded file"
        }
      },
      required: ["file_path"]
    }
  },

  {
    name: "list_products",
    description: "Get a list of products with filtering and pagination",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "integer",
          description: "Page number (default: 1)"
        },
        limit: {
          type: "integer", 
          description: "Number of products per page (default: 20)"
        },
        platform: {
          type: "string",
          description: "Filter by platform"
        },
        category: {
          type: "string",
          description: "Filter by category"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags"
        },
        is_active: {
          type: "boolean",
          description: "Filter by active status"
        },
        search: {
          type: "string",
          description: "Search in product name and description"
        },
        sort_by: {
          type: "string",
          enum: ["created_at", "name", "click_count", "original_price"],
          description: "Sort field (default: created_at)"
        },
        sort_order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order (default: desc)"
        }
      }
    }
  },

  {
    name: "get_product",
    description: "Get a single product by ID or slug",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Product ID (UUID) or slug"
        }
      },
      required: ["id"]
    }
  },

  {
    name: "update_product", 
    description: "Update an existing product",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Product ID (UUID)"
        },
        name: {
          type: "string",
          description: "Product name"
        },
        description: {
          type: "string",
          description: "Product description"
        },
        affiliate_link: {
          type: "string", 
          description: "Affiliate link URL"
        },
        image_url: {
          type: "string",
          description: "Product image URL"
        },
        original_price: {
          type: "number",
          description: "Original price"
        },
        sale_price: {
          type: "number",
          description: "Sale price"
        },
        platform: {
          type: "string",
          description: "Platform"
        },
        category: {
          type: "string",
          description: "Category"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags"
        },
        is_active: {
          type: "boolean",
          description: "Active status"
        },
        meta_title: {
          type: "string",
          description: "SEO meta title"
        },
        meta_description: {
          type: "string",
          description: "SEO meta description"
        }
      },
      required: ["id"]
    }
  },

  {
    name: "delete_product",
    description: "Delete a product by ID",
    inputSchema: {
      type: "object", 
      properties: {
        id: {
          type: "string",
          description: "Product ID (UUID)"
        }
      },
      required: ["id"]
    }
  },

  {
    name: "get_product_analytics",
    description: "Get click analytics for products",
    inputSchema: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "Specific product ID (optional)"
        },
        days: {
          type: "integer",
          description: "Number of days back to analyze (default: 30)"
        }
      }
    }
  },

  {
    name: "search_products",
    description: "Advanced product search with facets",
    inputSchema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Search query"
        },
        platform: {
          type: "string",
          description: "Platform filter"
        },
        category: {
          type: "string", 
          description: "Category filter"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tag filters"
        },
        min_price: {
          type: "number",
          description: "Minimum price filter"
        },
        max_price: {
          type: "number",
          description: "Maximum price filter"
        },
        include_facets: {
          type: "boolean",
          description: "Include facet counts in response"
        },
        page: {
          type: "integer",
          description: "Page number"
        },
        limit: {
          type: "integer",
          description: "Results per page"
        }
      }
    }
  }
];

// Usage examples for Maya
export const productMCPExamples = {
  "Create a new product": {
    tool: "create_product",
    example: {
      name: "Wireless Headphones",
      description: "High-quality noise-canceling wireless headphones",
      affiliate_link: "https://amazon.com/dp/example",
      original_price: 199.99,
      sale_price: 149.99,
      platform: "amazon",
      category: "tech",
      tags: ["headphones", "wireless", "audio"],
      is_active: true,
      meta_title: "Best Wireless Headphones 2025",
      meta_description: "Experience premium sound quality with these wireless headphones"
    }
  },
  
  "Upload product image": {
    tool: "upload_product_image", 
    example: {
      file_path: "/path/to/product-image.jpg",
      file_name: "wireless-headphones-main.jpg"
    }
  },

  "Search products": {
    tool: "search_products",
    example: {
      search: "wireless headphones",
      category: "tech",
      min_price: 50,
      max_price: 300,
      include_facets: true
    }
  },

  "Get product analytics": {
    tool: "get_product_analytics",
    example: {
      days: 7
    }
  }
};

// API endpoints Maya can use via HTTP requests
export const productAPIEndpoints = {
  base_url: "https://mayascott.ai",
  endpoints: {
    "POST /api/products": "Create product",
    "GET /api/products": "List products with filters",
    "GET /api/products/{id}": "Get single product",
    "PUT /api/products/{id}": "Update product",
    "DELETE /api/products/{id}": "Delete product",
    "POST /api/products/{id}/click": "Track click",
    "GET /api/products/search": "Advanced search",
    "POST /api/products/upload-image": "Upload image"
  }
}; 