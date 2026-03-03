import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type Tables } from '@/lib/database.types'

type Memory = Tables<'maya_memories'>

const MEMORY_MODALITIES = [
  { value: 'conversation', label: 'Conversation' },
  { value: 'experience', label: 'Experience' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'relationship', label: 'Relationship' },
  { value: 'idea', label: 'Idea' }
]

interface AddMemoryDialogProps {
  onAdd: (memory: { modality: string; content: string }) => void
}

export function AddMemoryDialog({ onAdd }: AddMemoryDialogProps) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [modality, setModality] = useState('conversation')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onAdd({
      modality,
      content,
    })
    setOpen(false)
    setContent('')
    setModality('conversation')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Memory
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-gray-900 text-gray-200">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Memory</DialogTitle>
            <DialogDescription className="text-gray-400">
              Add a new memory to your collection.
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
              Add Memory
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
} 