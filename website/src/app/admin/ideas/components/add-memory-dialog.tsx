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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type Database, type Tables } from '@/lib/database.types'

type Memory = Tables<'maya_memories'>

const PRIORITY_OPTIONS = [
  { value: '1', label: 'Low' },
  { value: '2', label: 'Medium' },
  { value: '3', label: 'High' },
  { value: '4', label: 'Urgent' },
  { value: '5', label: 'Critical' },
]

const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

interface AddMemoryDialogProps {
  onMemoryAdd: (memory: Omit<Memory, 'id' | 'created_at' | 'embedding'> & Partial<Pick<Memory, 'embedding'>>) => void
}

export function AddMemoryDialog({ onMemoryAdd }: AddMemoryDialogProps) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [priority, setPriority] = useState('1')
  const [status, setStatus] = useState('backlog')
  const [tag, setTag] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [modality, setModality] = useState('idea')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const memoryData: Omit<Memory, 'id' | 'created_at' | 'embedding'> & Partial<Pick<Memory, 'embedding'>> = {
      content,
      modality: modality,
      importance: parseInt(priority),
      tags: tags,
      embedding_model: null,
      embedding_ver: null,
      expires_at: null,
      metadata: {
        status,
        source: 'idea_dialog'
      },
    }

    onMemoryAdd(memoryData)
    setOpen(false)
    setContent('')
    setPriority('1')
    setStatus('backlog')
    setTags([])
    setModality('idea')
  }

  const addTag = () => {
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
      setTag('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Idea as Memory
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-gray-900 text-gray-200">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Idea as Memory</DialogTitle>
            <DialogDescription className="text-gray-400">
              Capture your idea as a new memory.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="content">Idea / Content</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="bg-gray-800 border-gray-700"
                required
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="modality">Type</Label>
              <Select value={modality} onValueChange={setModality}>
                <SelectTrigger id="modality">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="idea">Idea</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="task_reference">Task Reference</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="priority">Priority (Metadata)</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger id="priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Status (Metadata)</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tags">Tags (Metadata)</Label>
              <div className="flex gap-2">
                <Input
                  id="tags"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className="bg-gray-800 border-gray-700"
                  placeholder="Add a tag"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addTag}
                  className="border-gray-700"
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600"
                  >
                    {t}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => removeTag(t)}
                    />
                  </Badge>
                ))}
              </div>
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