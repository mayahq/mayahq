'use client'

import * as React from 'react'
import { format, isValid } from 'date-fns' // Import isValid
import { Calendar as CalendarIcon, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface DatePickerProps {
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({ date, setDate, placeholder = "Pick a date", className }: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-full justify-start text-left font-normal bg-gray-800 border-gray-700 hover:bg-gray-700 h-9 text-sm',
            !date && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {/* Check if date is valid before formatting */}
          {date && isValid(date) ? format(date, 'PPP') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-700" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          initialFocus
          className="text-gray-100"
        />
      </PopoverContent>
    </Popover>
  )
}

interface DateTimePickerProps {
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function DateTimePicker({ date, setDate, placeholder = "Pick date and time", className }: DateTimePickerProps) {
  const [timeValue, setTimeValue] = React.useState<string>(() => {
    if (date && isValid(date)) {
      return format(date, 'HH:mm')
    }
    return '09:00'
  })

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) {
      setDate(undefined)
      return
    }

    // Parse the current time value and combine with selected date
    const [hours, minutes] = timeValue.split(':').map(Number)
    const newDateTime = new Date(selectedDate)
    newDateTime.setHours(hours, minutes, 0, 0)
    setDate(newDateTime)
  }

  const handleTimeChange = (time: string) => {
    setTimeValue(time)
    
    if (date && isValid(date)) {
      const [hours, minutes] = time.split(':').map(Number)
      const newDateTime = new Date(date)
      newDateTime.setHours(hours, minutes, 0, 0)
      setDate(newDateTime)
    }
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={'outline'}
            className={cn(
              'flex-1 justify-start text-left font-normal bg-gray-800 border-gray-700 hover:bg-gray-700 h-9 text-sm',
              !date && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date && isValid(date) ? format(date, 'PPP') : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-700" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            initialFocus
            className="text-gray-100"
          />
        </PopoverContent>
      </Popover>
      
      <div className="relative">
        <Clock className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="time"
          value={timeValue}
          onChange={(e) => handleTimeChange(e.target.value)}
          className="w-32 pl-8 bg-gray-800 border-gray-700 text-gray-100"
        />
      </div>
    </div>
  )
} 