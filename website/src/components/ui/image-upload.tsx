'use client'

import { useState, forwardRef } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import Image from 'next/image'
import { ImagePlus, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface ImageUploadProps {
  value: string
  onChange: (url: string | null) => void
  bucket: string
  path: string
  children?: React.ReactNode
}

export const ImageUpload = forwardRef<HTMLDivElement, ImageUploadProps>(
  ({ value, onChange, bucket, path, children }, ref) => {
    const [loading, setLoading] = useState(false)
    const { supabase } = useAuth()

    const onUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!supabase) {
        toast.error('Supabase client not available. Cannot upload image.')
        return
      }
      try {
        setLoading(true)

        if (!event.target.files || event.target.files.length === 0) {
          throw new Error('You must select an image to upload.')
        }

        const file = event.target.files[0]
        const fileExt = file.name.split('.').pop()
        const filePath = `${path}/${Math.random()}.${fileExt}`

        // Upload the file to Supabase storage
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, file)

        if (uploadError) throw uploadError

        // Get the public URL
        const { data } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath)

        if (data) {
          onChange(data.publicUrl)
          toast.success('Image uploaded successfully')
        }
      } catch (error) {
        console.error('Error uploading image:', error)
        toast.error('Failed to upload image')
      } finally {
        setLoading(false)
      }
    }

    const onRemove = async () => {
      if (!supabase) {
        toast.error('Supabase client not available. Cannot remove image.')
        return
      }
      try {
        setLoading(true)

        if (!value) return

        // Extract the file path from the URL
        const filePath = value.split(`${bucket}/`)[1]
        if (!filePath) return

        // Delete the file from storage
        const { error } = await supabase.storage
          .from(bucket)
          .remove([filePath])

        if (error) throw error

        onChange(null)
        toast.success('Image removed successfully')
      } catch (error) {
        console.error('Error removing image:', error)
        toast.error('Failed to remove image')
      } finally {
        setLoading(false)
      }
    }

    if (children) {
      return (
        <div ref={ref} className="relative">
          <input
            type="file"
            accept="image/*"
            onChange={onUpload}
            disabled={loading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          {children}
        </div>
      )
    }

    return (
      <div ref={ref} className="flex items-center gap-4">
        <div className="relative w-[100px] h-[100px] rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center">
          {value ? (
            <Image
              src={value}
              alt="Uploaded image"
              fill
              className="object-cover rounded-lg"
            />
          ) : (
            <ImagePlus className="w-6 h-6 text-gray-400" />
          )}
          {loading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={onUpload}
            disabled={loading}
            className="hidden"
            id="image-upload"
          />
          <label htmlFor="image-upload">
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              className="cursor-pointer"
              asChild
            >
              <span>
                {loading ? 'Uploading...' : value ? 'Change Image' : 'Upload Image'}
              </span>
            </Button>
          </label>
          {value && (
            <Button
              type="button"
              variant="destructive"
              onClick={onRemove}
              disabled={loading}
              size="sm"
            >
              Remove
            </Button>
          )}
        </div>
      </div>
    )
  }
)

ImageUpload.displayName = 'ImageUpload' 