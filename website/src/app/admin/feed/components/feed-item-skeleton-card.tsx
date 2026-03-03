'use client'

import { Skeleton } from "@/components/ui/skeleton";

export function FeedItemSkeletonCard() {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700/60 overflow-hidden">
      {/* Image placeholder */}
      <Skeleton className="w-full aspect-[4/3] bg-gray-800" />
      {/* Header */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-3.5 w-24 mb-1.5" />
            <div className="flex gap-1.5">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-4 w-20 rounded-full" />
            </div>
          </div>
        </div>
        <Skeleton className="h-3 w-full mb-1.5" />
        <Skeleton className="h-3 w-3/4" />
        <div className="flex space-x-2 pt-3 mt-3 border-t border-gray-800">
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
      </div>
    </div>
  );
}
