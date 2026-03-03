'use client';

import { ReactNode } from 'react';

interface AffiliateLinkProps {
  productId: string;
  href: string;
  children: ReactNode;
  className?: string;
  target?: string;
  rel?: string;
}

export function AffiliateLink({ 
  productId, 
  href, 
  children, 
  className = '',
  target = '_blank',
  rel = 'noopener noreferrer'
}: AffiliateLinkProps) {
  const handleClick = async (e: React.MouseEvent) => {
    // Track the click asynchronously (don't block navigation)
    try {
      fetch(`/api/products/${productId}/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          referrer: window.location.href,
          user_agent: navigator.userAgent,
        }),
      }).catch(err => console.warn('Click tracking failed:', err));
    } catch (error) {
      console.warn('Click tracking error:', error);
    }
    
    // Don't prevent default - let the browser handle the navigation
  };

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
} 