'use client'

import { useState, useEffect, useCallback } from 'react'
import { AddMemoryDialog } from '@/app/admin/memories/components/add-memory-dialog'
import { EditMemoryDialog } from '@/components/ui/edit-memory-dialog'
import { DataTable } from '@/components/ui/data-table'
import { columns, Memory } from './columns'
import { type Tables } from '@/lib/database.types'
import { addMemory, updateMemory, deleteMemory, getMemories, searchMemories } from './actions'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function MemoriesPage() {
  const [data, setData] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchMemories = useCallback(async (query: string = '') => {
    setLoading(true)
    try {
      const action = query ? searchMemories(query) : getMemories()
      const result = await action
      if (result && 'success' in result && result.success && result.data) {
        setData(result.data as Memory[])
      } else if (result && result.data) {
        setData(result.data as Memory[])
      } else {
        toast.error('Failed to fetch memories')
        console.error(result && 'error' in result ? result.error : 'Unknown error')
      }
    } catch (error) {
      toast.error('Error fetching memories')
      console.error('Fetch error:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMemories()
  }, [fetchMemories])

  const handleAdd = async (newData: { modality: string; content: string }) => {
    try {
      const result = await addMemory(newData)
      if (result && 'success' in result && result.success) {
        toast.success('Memory added successfully!')
        fetchMemories(searchQuery)
        setIsAddDialogOpen(false)
      } else {
        toast.error('Failed to add memory')
        console.error(result && 'error' in result ? result.error : 'Unknown error')
      }
    } catch (error) {
      toast.error('Error adding memory')
      console.error('Add error:', error)
    }
  }

  const handleEdit = (memory: Memory) => {
    setSelectedMemory(memory)
    setIsEditDialogOpen(true)
  }

  const handleUpdate = async (updatedData: { id: string; modality: string; content: string }) => {
    try {
      const result = await updateMemory(updatedData)
      if (result && 'success' in result && result.success) {
        toast.success('Memory updated successfully!')
        fetchMemories(searchQuery)
        setIsEditDialogOpen(false)
        setSelectedMemory(null)
      } else {
        toast.error('Failed to update memory')
        console.error(result && 'error' in result ? result.error : 'Unknown error')
      }
    } catch (error) {
      toast.error('Error updating memory')
      console.error('Update error:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this memory?')) {
      try {
        const result = await deleteMemory(id)
        if (result && 'success' in result && result.success) {
          toast.success('Memory deleted successfully!')
          fetchMemories(searchQuery)
        } else {
          toast.error('Failed to delete memory')
          console.error(result && 'error' in result ? result.error : 'Unknown error')
        }
      } catch (error) {
        toast.error('Error deleting memory')
        console.error('Delete error:', error)
      }
    }
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value)
  }

  const handleSearchSubmit = () => {
    fetchMemories(searchQuery)
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">Memories</h1>
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2 w-1/2">
          <Input 
            placeholder="Search memories (semantic)..."
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearchSubmit()
              }
            }}
            className="max-w-sm"
          />
          <Button onClick={handleSearchSubmit}>Search</Button>
        </div>
        <AddMemoryDialog onAdd={handleAdd} />
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <DataTable columns={columns({ onEdit: handleEdit, onDelete: handleDelete })} data={data} />
      )}
      {selectedMemory && (
        <EditMemoryDialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedMemory(null)
            }
            setIsEditDialogOpen(open)
          }}
          memory={selectedMemory}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  )
} 