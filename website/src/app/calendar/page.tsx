'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

export default function CalendarPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Calendar className="h-8 w-8" />
            Maya Calendar
          </h1>
          <p className="text-gray-600 mt-2">
            Calendar functionality is currently being updated
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Calendar Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">
            The calendar feature is being rebuilt to improve reliability and performance. 
            Please check back soon for the full calendar integration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
} 