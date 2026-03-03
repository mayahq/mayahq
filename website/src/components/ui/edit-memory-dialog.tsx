"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { type Tables } from '@/lib/database.types'
import { useState, useEffect } from "react"
import { Badge } from "./badge"
import { Textarea } from "./textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Memory = Tables<'maya_memories'>

const MEMORY_MODALITIES = [
  { value: 'conversation', label: 'Conversation' },
  { value: 'experience', label: 'Experience' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'relationship', label: 'Relationship' },
  { value: 'idea', label: 'Idea' }
]

interface EditMemoryDialogProps {
  memory: Memory | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (memory: { id: string; modality: string; content: string }) => void
}

export function EditMemoryDialog({ memory, open, onOpenChange, onSubmit }: EditMemoryDialogProps) {
  const [content, setContent] = useState('')
  const [modality, setModality] = useState('conversation')

  useEffect(() => {
    if (memory) {
      setContent(memory.content)
      
      // Get modality either from the direct field or from metadata
      const memoryModality = memory.modality || 
                           (memory.metadata as any)?.modality || 
                           'conversation'
      setModality(memoryModality)
    }
  }, [memory])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!memory) return

    onSubmit({
      id: memory.id.toString(),
      modality,
      content,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-gray-900 text-gray-200">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Memory</DialogTitle>
            <DialogDescription className="text-gray-400">
              Make changes to your memory here.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="modality">Type</Label>
              <Select value={modality} onValueChange={setModality}>
                <SelectTrigger id="modality">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_MODALITIES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="bg-gray-800 border-gray-700"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" className="bg-purple-600 hover:bg-purple-700">
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
} 