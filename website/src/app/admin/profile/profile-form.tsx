'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Database } from '@/lib/database.types'
import Image from 'next/image'
import { toast } from 'sonner'

type Profile = Database['public']['Tables']['profiles']['Row']

export function ProfileForm({ profile: initialProfile }: { profile: Profile | null }) {
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const { supabase, user: authUser, profile: authContextProfile } = useAuth()

  const [profileData, setProfileData] = useState<Profile>(() => ({
    id: initialProfile?.id || authUser?.id || '',
    name: initialProfile?.name || authContextProfile?.name || authUser?.email?.split('@')[0] || 'Maya User',
    bio: initialProfile?.bio || authContextProfile?.bio || '',
    avatar_url: initialProfile?.avatar_url || authContextProfile?.avatar_url || null,
    created_at: initialProfile?.created_at || new Date().toISOString(),
    updated_at: initialProfile?.updated_at || new Date().toISOString(),
  }))

  useEffect(() => {
    if (authContextProfile) {
      setProfileData(prev => ({
        ...prev,
        id: authContextProfile.id || prev.id,
        name: authContextProfile.name || prev.name,
        bio: authContextProfile.bio || prev.bio,
        avatar_url: authContextProfile.avatar_url || prev.avatar_url,
        updated_at: authContextProfile.updated_at > prev.updated_at ? authContextProfile.updated_at : prev.updated_at,
      }))
    }
  }, [authContextProfile])

  useEffect(() => {
    if (!authUser && !saving && !uploading) {
      console.warn('[ProfileForm] Auth user became null.')
    }
  }, [authUser, saving, uploading])

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    if (!supabase || !authUser) {
      toast.error('Authentication required to upload avatar.')
      return
    }

    try {
      setUploading(true)

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.')
      }

      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random()}.${fileExt}`
      const filePath = `${authUser.id}/${fileName}`

      // Delete old avatar if it exists
      if (profileData.avatar_url) {
        try {
          const oldPath = new URL(profileData.avatar_url).pathname.split('/public/avatars/')[1]
          if (oldPath) {
            await supabase.storage
              .from('avatars')
              .remove([oldPath])
          }
        } catch (error) {
          console.log('Error removing old avatar:', error)
        }
      }

      // Show loading toast
      const toastId = toast.loading('Uploading avatar...')

      // Upload new avatar
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('avatars')
        .upload(filePath, file)

      if (uploadError) {
        toast.dismiss(toastId)
        throw uploadError
      }

      if (!uploadData) {
        toast.dismiss(toastId)
        throw new Error('Upload succeeded but no data returned')
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      if (!urlData?.publicUrl) {
        toast.dismiss(toastId)
        throw new Error('Could not get public URL for uploaded file')
      }

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          avatar_url: urlData.publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', authUser.id)

      if (updateError) {
        toast.dismiss(toastId)
        throw updateError
      }

      // Update local state
      setProfileData(prev => ({
        ...prev,
        avatar_url: urlData.publicUrl
      }))
      
      // Show success toast
      toast.success('Avatar updated successfully', {
        id: toastId,
        duration: 3000,
      })

    } catch (error) {
      console.error('Error uploading avatar:', error)
      toast.error(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setUploading(false)
    }
  }

  async function updateProfile(updatedProfileData: Partial<Profile>) {
    if (!supabase || !authUser) {
      toast.error('Authentication required to update profile.')
      return
    }

    try {
      setSaving(true)

      const profileToUpdate = {
        ...profileData,  // Include all current data
        ...updatedProfileData,  // Override with updates
        id: authUser.id,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('profiles')
        .upsert(profileToUpdate)

      if (error) {
        throw error
      }

      setProfileData(prev => ({
        ...prev,
        ...profileToUpdate
      }))
      
      // Show success toast
      toast.success('Profile updated successfully', {
        duration: 3000,
      })
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-8">
        <div className="relative h-24 w-24">
          {profileData.avatar_url ? (
            <Image
              src={profileData.avatar_url}
              alt="Profile"
              className="rounded-full object-cover"
              fill
              sizes="96px"
              unoptimized
            />
          ) : (
            <div className="h-full w-full rounded-full bg-muted flex items-center justify-center">
              <span className="text-2xl text-muted-foreground">
                {profileData.name ? profileData.name[0].toUpperCase() : 'M'}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-white">{profileData.name || 'Your Name'}</h4>
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={uploadAvatar}
              className="hidden"
              id="avatar"
              disabled={uploading}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('avatar')?.click()}
              disabled={uploading}
              className="bg-white/10 text-white hover:bg-white/20"
            >
              {uploading ? 'Uploading...' : 'Change Avatar'}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-white mb-1">
            Name
          </label>
          <input
            id="name"
            className="w-full rounded-md border border-white/10 bg-white/5 p-2 text-white placeholder-white/50 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
            value={profileData.name}
            onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
            onBlur={(e) => {
              if (e.target.value.trim() === '') {
                toast.error('Name cannot be empty')
                setProfileData(prev => ({ ...prev, name: 'Maya User' }))
                return
              }
              updateProfile({ name: e.target.value })
            }}
            placeholder="Enter your name"
          />
        </div>
        <div>
          <label htmlFor="bio" className="block text-sm font-medium text-white mb-1">
            Bio
          </label>
          <textarea
            id="bio"
            className="w-full rounded-md border border-white/10 bg-white/5 p-2 text-white placeholder-white/50 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
            rows={3}
            value={profileData.bio || ''}
            onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
            onBlur={(e) => updateProfile({ bio: e.target.value })}
            placeholder="Tell us about yourself"
          />
        </div>
        <Button 
          onClick={() => updateProfile(profileData)}
          disabled={saving}
          className="w-full bg-green-500 text-white hover:bg-green-600"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
} 