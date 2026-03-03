'use client';

import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';

interface ShareButtonProps {
  title: string;
  text: string;
  url: string;
  className?: string;
}

export function ShareButton({ title, text, url, className = "w-full" }: ShareButtonProps) {
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title,
        text,
        url,
      }).catch((error) => {
        console.error('Error sharing:', error);
        // Fallback to clipboard
        navigator.clipboard.writeText(url);
      });
    } else {
      // Fallback to clipboard
      navigator.clipboard.writeText(url);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleShare}
      className={className}
    >
      <Share2 className="mr-2 h-4 w-4" />
      Share Product
    </Button>
  );
} 