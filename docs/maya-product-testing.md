# Maya Product Management Testing Guide

This guide shows how to test Maya's new product management capabilities through both MCP tools and conversational interface.

## 🧪 **Test Commands for Maya**

### **1. Creating Products**

**Example 1: Basic Product Creation**
```
User: "Create a product called AirPods Pro with affiliate link https://amazon.com/airpods-pro"
Expected: Maya uses maya_product_create tool and responds with product details
```

**Example 2: Detailed Product Creation**
```
User: "Add a new tech product called MacBook Air M3 on amazon for $999, category tech"
Expected: Maya extracts platform, category, and price information
```

### **2. Listing Products**

**Example 1: Basic Product List**
```
User: "Show me our products"
Expected: Maya uses maya_product_list tool and shows formatted product portfolio
```

**Example 2: Contextual Product Request**
```
User: "What affiliate products do we have?"
Expected: Maya displays products with intelligent insights and recommendations
```

### **3. Product Analytics**

**Example 1: Performance Overview**
```
User: "How are our products doing?"
Expected: Maya uses maya_product_analytics tool and provides performance insights
```

**Example 2: Specific Analytics**
```
User: "Show me product analytics for the last 30 days"
Expected: Maya displays click data, top performers, and recommendations
```

### **4. Product Updates**

**Example 1: Price Update**
```
User: "Update product AirPods Pro price to $199"
Expected: Maya uses maya_product_update tool to modify the price
```

**Example 2: Description Update**
```
User: "Change the description of MacBook Air to 'Lightweight powerhouse for creators'"
Expected: Maya updates the product description
```

### **5. Product Deletion**

**Example 1: Remove Product**
```
User: "Delete product AirPods Pro"
Expected: Maya uses maya_product_delete tool and confirms removal
```

## 🔧 **MCP Tool Testing**

### **Direct MCP Calls**

You can test the MCP tools directly through the memory worker:

```javascript
// Test product creation
const createResult = await mcpClient.callTool('maya_product_create', {
  userId: 'test-user-id',
  name: 'Test Product',
  description: 'A test product for MCP testing',
  affiliateLink: 'https://example.com/test',
  platform: 'amazon',
  category: 'tech',
  tags: ['test', 'demo'],
  originalPrice: 99.99,
  salePrice: 79.99
});
console.log('Create Result:', createResult);

// Test product listing
const listResult = await mcpClient.callTool('maya_product_list', {
  userId: 'test-user-id',
  limit: 5
});
console.log('List Result:', listResult);

// Test analytics
const analyticsResult = await mcpClient.callTool('maya_product_analytics', {
  userId: 'test-user-id',
  days: 30
});
console.log('Analytics Result:', analyticsResult);
```

## 🎯 **Expected Maya Behavior**

### **Intelligence Features**

1. **Context Awareness**: Maya should understand product-related queries in natural language
2. **Smart Recommendations**: Maya provides insights like "Your top performer is X" or "Consider promoting Y"
3. **Error Handling**: Graceful handling of ambiguous product names or missing data
4. **Rich Formatting**: Product responses include emojis, formatting, and actionable links

### **Integration with Memory System**

1. **Memory Embedding**: Product-related conversations are embedded in Maya's memory
2. **Context Retrieval**: Maya can reference previous product discussions
3. **Learning**: Maya learns user preferences for product types, platforms, etc.

## 🐛 **Troubleshooting**

### **Common Issues**

1. **No Products Found**: Check database connection and product data
2. **Permission Errors**: Verify Supabase service role permissions
3. **Tool Not Recognized**: Ensure MCP client is properly registered

### **Debug Commands**

```bash
# Check memory worker logs
npm run dev

# Test direct API calls
curl -X POST http://localhost:3001/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Product","affiliate_link":"https://test.com","platform":"amazon"}'

# Check Supabase data
SELECT * FROM maya_products ORDER BY created_at DESC LIMIT 5;
```

## 📊 **Success Metrics**

### **What Success Looks Like**

1. ✅ Maya responds naturally to product management requests
2. ✅ Database operations execute without errors
3. ✅ Response formatting includes intelligent insights
4. ✅ Click tracking and analytics work correctly
5. ✅ Integration with existing task/reminder/calendar systems

### **Performance Expectations**

- Product creation: < 2 seconds
- Product listing: < 1 second  
- Analytics queries: < 3 seconds
- Natural language processing: < 500ms

## 🚀 **Advanced Testing**

### **Workflow Integration Tests**

```
User: "Create a product for MacBook Air and remind me to promote it tomorrow"
Expected: Maya creates product AND sets up reminder, showing integration
```

```
User: "Add iPhone 15 Pro as a product and block time tomorrow to create marketing content"
Expected: Maya creates product AND calendar event, demonstrating workflow awareness
```

### **Multi-Turn Conversations**

```
Turn 1: "Show me our products"
Turn 2: "How is the MacBook Air performing?"
Turn 3: "Update its price to $899"
Turn 4: "Remind me to check analytics next week"
Expected: Maya maintains context across the entire conversation
```

This comprehensive testing approach ensures Maya's product management capabilities work seamlessly within her existing intelligence framework. 