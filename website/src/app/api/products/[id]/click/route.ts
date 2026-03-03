import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@mayahq/supabase-client';
import crypto from 'crypto';

interface ProductClickRequest {
  referrer?: string;
  user_agent?: string;
  ip_address?: string;
}

// Hash IP address for privacy
function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

// Get client IP address
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const remoteAddr = request.headers.get('x-remote-addr');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  if (remoteAddr) {
    return remoteAddr;
  }
  
  return 'unknown';
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseClient();
    const productId = params.id;
    
    let body: ProductClickRequest = {};
    try {
      body = await request.json();
    } catch {
      // No body provided, that's okay
    }

    // Get request information
    const userAgent = request.headers.get('user-agent') || body.user_agent || 'unknown';
    const referrer = request.headers.get('referer') || body.referrer || 'direct';
    const clientIP = body.ip_address || getClientIP(request);
    const ipHash = hashIP(clientIP);

    // Check if product exists and get affiliate link
    const { data: product, error: productError } = await (supabase as any)
      .from('maya_products')
      .select('id, affiliate_link, is_active')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    if (!product.is_active) {
      return NextResponse.json(
        { error: 'Product is not active' },
        { status: 400 }
      );
    }

    // Record the click
    const { error: clickError } = await (supabase as any)
      .from('maya_product_clicks')
      .insert({
        product_id: productId,
        referrer: referrer.substring(0, 500), // Limit length
        user_agent: userAgent.substring(0, 500), // Limit length
        ip_hash: ipHash
      });

    if (clickError) {
      console.error('Error recording click:', clickError);
      // Don't fail the redirect due to analytics error
    }

    // Update click count on product
    const { error: updateError } = await (supabase as any)
      .from('maya_products')
      .update({ 
        click_count: (supabase as any).raw('click_count + 1')
      })
      .eq('id', productId);

    if (updateError) {
      console.error('Error updating click count:', updateError);
      // Don't fail the redirect due to count update error
    }

    // Return the affiliate link for redirect
    return NextResponse.json({
      success: true,
      affiliate_link: product.affiliate_link,
      message: 'Click recorded successfully'
    });

  } catch (error) {
    console.error('Error in click tracking:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Alternative GET endpoint for simple click tracking via URL
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseClient();
    const productId = params.id;
    const { searchParams } = new URL(request.url);
    
    const referrer = searchParams.get('ref') || request.headers.get('referer') || 'direct';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const clientIP = getClientIP(request);
    const ipHash = hashIP(clientIP);

    // Check if product exists and get affiliate link
    const { data: product, error: productError } = await (supabase as any)
      .from('maya_products')
      .select('id, affiliate_link, is_active')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    if (!product.is_active) {
      return NextResponse.json(
        { error: 'Product is not active' },
        { status: 400 }
      );
    }

    // Record the click (fire and forget)
    (supabase as any)
      .from('maya_product_clicks')
      .insert({
        product_id: productId,
        referrer: referrer.substring(0, 500),
        user_agent: userAgent.substring(0, 500),
        ip_hash: ipHash
      })
      .then(() => {
        // Update click count
        return (supabase as any)
          .from('maya_products')
          .update({ 
            click_count: (supabase as any).raw('click_count + 1')
          })
          .eq('id', productId);
      })
      .catch((err: any) => console.error('Background click tracking error:', err));

    // Redirect to affiliate link immediately
    return NextResponse.redirect(product.affiliate_link, { status: 302 });

  } catch (error) {
    console.error('Error in click tracking redirect:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 