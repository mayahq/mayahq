import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, ArrowUpDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type Tables } from '@/lib/database.types'
import { format } from 'date-fns'

export type Memory = Tables<'maya_memories'>

export interface ColumnProps {
  onEdit: (memory: Memory) => void
  onDelete: (id: string) => void
}

export const columns = ({
  onEdit,
  onDelete,
}: ColumnProps): ColumnDef<Memory>[] => [
  {
    id: 'modality',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Type
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      // Check for modality in the main record first, then in metadata
      const modality = row.original.modality || 
                     (row.original.metadata as { modality?: string })?.modality
      
      if (!modality) return <Badge variant="outline">Unknown</Badge>
      return (
        <Badge variant="outline">
          {modality.charAt(0).toUpperCase() + modality.slice(1)}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'content',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Content
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    id: 'created_at',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Created At
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const createdAt = row.original.created_at
      if (!createdAt) return <span>Invalid Date</span>
      try {
        return format(new Date(createdAt), 'MMM d, yyyy h:mm a')
      } catch (e) {
        return <span>Invalid Date</span>
      }
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const memory = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(memory.id.toString())}
            >
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(memory)}>
              Edit Memory
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(memory.id.toString())}
              className="text-red-600"
            >
              Delete Memory
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
] 