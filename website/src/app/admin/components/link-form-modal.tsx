import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Database } from '@/lib/database.types'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'

type Link = Database['public']['Tables']['links']['Row']

interface LinkFormModalProps {
  isOpen: boolean
  onClose: () => void
  link?: Link
  onSuccess: () => void
}

export function LinkFormModal({ isOpen, onClose, link, onSuccess }: LinkFormModalProps) {
  const { supabase } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: link?.title || '',
    url: link?.url || '',
    image_url: link?.image_url || '',
    is_active: link?.is_active ?? true,
    order: link?.order ?? 0
  })

  const handleSubmit = async (e: React.FormEvent) => {
    if (!supabase) {
      toast.error('Supabase client not available. Cannot save link.')
      return
    }
    e.preventDefault()
    setIsLoading(true)

    try {
      // Get the maximum order value
      const { data: maxOrderData, error: maxOrderError } = await supabase
        .from('links')
        .select('order')
        .order('order', { ascending: false })
        .limit(1)
        .single()

      if (maxOrderError && maxOrderError.code !== 'PGRST116') {
        console.error('Error getting max order:', maxOrderError)
        toast.error(`Failed to get order: ${maxOrderError.message}`)
        throw maxOrderError
      }

      const newOrder = maxOrderData?.order != null ? maxOrderData.order + 1 : 0

      if (link) {
        // Update existing link
        const { error } = await supabase
          .from('links')
          .update({
            title: formData.title,
            url: formData.url,
            image_url: formData.image_url,
            is_active: formData.is_active
          })
          .eq('id', link.id)

        if (error) {
          console.error('Error updating link:', error)
          toast.error(`Failed to update link: ${error.message}`)
          throw error
        }
      } else {
        // Create new link
        const { error } = await supabase
          .from('links')
          .insert([{
            title: formData.title,
            url: formData.url,
            image_url: formData.image_url,
            is_active: formData.is_active,
            order: newOrder
          }])

        if (error) {
          console.error('Error creating link:', error)
          toast.error(`Failed to create link: ${error.message}`)
          throw error
        }
      }

      toast.success(link ? 'Link updated successfully' : 'Link created successfully')
      onSuccess()
      onClose()
    } catch (error) {
      console.error('Error saving link:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900/90 w-full max-w-md rounded-lg shadow-lg border border-gray-800">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4 text-white">
            {link ? 'Edit Link' : 'Create New Link'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-1 text-gray-200">
                Title
              </label>
              <input
                type="text"
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>
            <div>
              <label htmlFor="url" className="block text-sm font-medium mb-1 text-gray-200">
                URL
              </label>
              <input
                type="url"
                id="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>
            <div>
              <label htmlFor="image_url" className="block text-sm font-medium mb-1 text-gray-200">
                Image URL
              </label>
              <input
                type="url"
                id="image_url"
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label htmlFor="is_active" className="text-sm font-medium text-gray-200">
                Active
              </label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
            <div className="flex justify-end space-x-2 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
                className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading}
                className="bg-purple-500/20 text-purple-400 border border-purple-500/50 hover:bg-purple-500/30"
              >
                {isLoading ? 'Saving...' : link ? 'Save Changes' : 'Create Link'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
} 