import { NextApiRequest, NextApiResponse } from 'next';
import handler from './generate-daily';

// A simple test endpoint for the daily report functionality
export default async function testHandler(req: NextApiRequest, res: NextApiResponse) {
  // Convert this GET request to a POST for the main handler
  // This way we can easily test via browser
  if (req.method === 'GET') {
    // Use the query parameters
    const userId = req.query.userId as string || '4c850152-30ef-4b1b-89b3-bc72af461e14';
    
    // Create a new request with POST method and body
    const modifiedReq = {
      ...req,
      method: 'POST',
      body: {
        userId
      }
    };
    
    return handler(modifiedReq as NextApiRequest, res);
  }
  
  // If not GET, just pass through to the main handler
  return handler(req, res);
} 