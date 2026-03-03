'use client'

import { useState } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/database.types'
import { ImageUpload } from '@/components/ui/image-upload'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { PlusCircle, GripVertical, Pencil, Trash, ImagePlus } from 'lucide-react'
import { LinkFormModal } from './link-form-modal'
import { toast } from 'sonner'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'

type Link = Database['public']['Tables']['links']['Row']

interface LinksDataTableProps {
  data: Link[]
}

export function LinksDataTable({ data: initialData }: LinksDataTableProps) {
  const [links, setLinks] = useState<Link[]>(initialData)
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<Link | undefined>()
  const { supabase } = useAuth()

  const handleDragEnd = async (result: DropResult) => {
    if (!supabase) {
      toast.error('Supabase client not available. Cannot update order.')
      return
    }
    if (!result.destination) return

    const items = Array.from(links)
    const [reorderedItem] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, reorderedItem)

    // Update the order property for each item
    const updatedItems = items.map((item, index) => ({
      ...item,
      order: index,
    }))

    setLinks(updatedItems)

    // Update the order in the database
    try {
      setLoading(true)
      const updates = updatedItems.map((item) => ({
        id: item.id,
        order: item.order,
      }))

      const { error } = await supabase.from('links').upsert(updates)
      if (error) {
        console.error('Database error:', error)
        toast.error(`Failed to update link order: ${error.message}`)
        throw error
      }
      toast.success('Link order updated')
    } catch (error) {
      console.error('Error updating order:', error)
      // Revert to the original order on error
      setLinks(initialData)
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (id: string, is_active: boolean) => {
    if (!supabase) {
      toast.error('Supabase client not available. Cannot update status.')
      return
    }
    try {
      setLoading(true)
      const { error } = await supabase
        .from('links')
        .update({ is_active })
        .eq('id', id)

      if (error) {
        console.error('Database error:', error)
        toast.error(`Failed to update link status: ${error.message}`)
        throw error
      }

      // Re-fetch all links from the server to ensure all (active/inactive) are shown
      const { data, error: fetchError } = await supabase
        .from('links')
        .select('*')
        .order('order')
      if (fetchError) {
        toast.error('Failed to refresh links')
        throw fetchError
      }
      if (data) setLinks(data)
      toast.success('Link status updated')
    } catch (error) {
      console.error('Error updating link:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this link?')) return
    if (!supabase) {
      toast.error('Supabase client not available. Cannot delete link.')
      return
    }
    try {
      setLoading(true)
      const { error } = await supabase
        .from('links')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Database error:', error)
        toast.error(`Failed to delete link: ${error.message}`)
        throw error
      }

      setLinks((prev) => prev.filter((link) => link.id !== id))
      toast.success('Link deleted')
    } catch (error) {
      console.error('Error deleting link:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (link: Link) => {
    setEditingLink(link)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setEditingLink(undefined)
    setIsModalOpen(false)
  }

  const handleModalSuccess = async () => {
    if (!supabase) {
      toast.error('Supabase client not available. Cannot refresh links.')
      handleModalClose()
      return
    }
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('links')
        .select('*')
        .order('order')

      if (error) {
        toast.error('Failed to refresh links')
        throw error
      }

      if (data) {
        setLinks(data)
        toast.success(editingLink ? 'Link updated' : 'Link created')
      }
    } catch (error) {
      console.error('Error refreshing links:', error)
    } finally {
      setLoading(false)
      handleModalClose()
    }
  }

  const handleImageChange = async (linkId: string, url: string | null) => {
    if (!supabase) {
      toast.error('Supabase client not available. Cannot update image.')
      return
    }
    try {
      setLoading(true)
      const { error } = await supabase
        .from('links')
        .update({ image_url: url })
        .eq('id', linkId)

      if (error) {
        toast.error('Failed to update link image')
        throw error
      }

      setLinks((prev) =>
        prev.map((link) =>
          link.id === linkId ? { ...link, image_url: url } : link
        )
      )
      toast.success('Link image updated')
    } catch (error) {
      console.error('Error updating link image:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Button 
        className="bg-purple-500/20 text-purple-400 border border-purple-500/50 hover:bg-purple-500/30"
        onClick={() => setIsModalOpen(true)}
      >
        <PlusCircle className="w-4 h-4 mr-2" />
        Add Link
      </Button>

      <LinkFormModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        link={editingLink}
        onSuccess={handleModalSuccess}
      />

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="links">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-2"
            >
              {links.map((link, index) => (
                <Draggable
                  key={link.id}
                  draggableId={link.id}
                  index={index}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`
                        flex items-center gap-4 p-4 rounded-lg bg-gray-900/50
                        ${snapshot.isDragging ? 'border border-purple-500/50 shadow-lg shadow-purple-500/20' : 'border border-gray-800'}
                      `}
                    >
                      <div
                        {...provided.dragHandleProps}
                        className="cursor-grab hover:text-purple-400"
                      >
                        <GripVertical className="w-5 h-5" />
                      </div>

                      <div className="relative w-12 h-12 flex-shrink-0 group">
                        {link.image_url ? (
                          <div className="relative w-full h-full rounded-md overflow-hidden">
                            <Image
                              src={link.image_url}
                              alt={link.title || ''}
                              fill
                              className="object-cover"
                              sizes="48px"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <ImageUpload
                                value={link.image_url || ''}
                                onChange={(url) => handleImageChange(link.id, url)}
                                bucket="public"
                                path={`links/${link.id}`}
                              >
                                <div className="text-white cursor-pointer p-2 rounded-full bg-purple-500/20 hover:bg-purple-500/30">
                                  <ImagePlus className="w-4 h-4" />
                                </div>
                              </ImageUpload>
                            </div>
                          </div>
                        ) : (
                          <ImageUpload
                            value={link.image_url || ''}
                            onChange={(url) => handleImageChange(link.id, url)}
                            bucket="public"
                            path={`links/${link.id}`}
                          >
                            <div className="w-full h-full rounded-md border-2 border-dashed border-gray-700 hover:border-purple-500/50 transition-colors flex items-center justify-center cursor-pointer bg-gray-800/50 hover:bg-gray-800">
                              <ImagePlus className="w-4 h-4 text-gray-400 group-hover:text-purple-400" />
                            </div>
                          </ImageUpload>
                        )}
                      </div>

                      <div className="flex-grow min-w-0">
                        <h3 className="font-medium text-white truncate">{link.title}</h3>
                        <p className="text-sm text-gray-400 truncate">{link.url}</p>
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        <Switch
                          checked={link.is_active ?? false}
                          onCheckedChange={(checked) =>
                            toggleActive(link.id, checked)
                          }
                          disabled={loading}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-gray-400 hover:text-purple-400 hover:bg-purple-500/10"
                          onClick={() => handleEdit(link)}
                          disabled={loading}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => handleDelete(link.id)}
                          disabled={loading}
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  )
} 