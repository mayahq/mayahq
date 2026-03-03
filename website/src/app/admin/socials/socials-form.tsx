'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Database } from '@/lib/database.types'
import { 
  Twitter, 
  Github, 
  Linkedin, 
  Youtube,
  Instagram,
  Globe,
  Plus,
  Trash2
} from 'lucide-react'
import { SocialIcon } from '@/components/social-icon'

type Social = Database['public']['Tables']['socials']['Row']

const PLATFORMS = [
  { id: 'twitter', name: 'Twitter', icon: Twitter },
  { id: 'github', name: 'GitHub', icon: Github },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin },
  { id: 'youtube', name: 'YouTube', icon: Youtube },
  { id: 'instagram', name: 'Instagram', icon: Instagram },
  { id: 'website', name: 'Website', icon: Globe },
]

export function SocialsForm({ socials: initialSocials }: { socials: Social[] }) {
  const [socials, setSocials] = useState<Social[]>(initialSocials)
  const [saving, setSaving] = useState(false)
  const { supabase } = useAuth()

  async function addSocial() {
    if (!supabase) {
      alert('Supabase client not available.')
      return
    }

    const newSocial = {
      platform: '',
      url: '',
      icon: null
    }

    const { data, error } = await supabase
      .from('socials')
      .insert([newSocial])
      .select('id, platform, url, icon')

    if (error) {
      alert('Error adding social link!')
      console.log(error)
      return
    }

    setSocials([...socials, data[0]])
  }

  async function updateSocial(index: number, updates: Partial<Social>) {
    if (!supabase) {
      alert('Supabase client not available.')
      return
    }
    try {
      setSaving(true)
      const social = socials[index]
      const updatedSocial = { ...social, ...updates }

      const { error } = await supabase
        .from('socials')
        .update(updatedSocial)
        .eq('id', social.id)

      if (error) throw error

      const newSocials = [...socials]
      newSocials[index] = updatedSocial
      setSocials(newSocials)
    } catch (error) {
      alert('Error updating social link!')
      console.log(error)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSocial(index: number) {
    if (!supabase) {
      alert('Supabase client not available.')
      return
    }
    try {
      const social = socials[index]

      const { error } = await supabase
        .from('socials')
        .delete()
        .eq('id', social.id)

      if (error) throw error

      const newSocials = socials.filter((_, i) => i !== index)
      setSocials(newSocials)
    } catch (error) {
      alert('Error deleting social link!')
      console.log(error)
    }
  }

  return (
    <div className="space-y-4">
      {socials.map((social, index) => (
        <div 
          key={social.id} 
          className="flex items-center gap-4 p-4 rounded-lg bg-gray-900/50 border border-gray-800 hover:border-purple-500/50 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-[140px]">
            <SocialIcon platform={social.platform || 'website'} className="text-gray-400" />
            <select
              value={social.platform || ''}
              onChange={(e) => updateSocial(index, { platform: e.target.value })}
              className="flex-1 bg-transparent border-none text-white focus:ring-0 focus:outline-none"
            >
              <option value="" className="bg-gray-900">Select Platform</option>
              {PLATFORMS.map((platform) => (
                <option key={platform.id} value={platform.id} className="bg-gray-900">
                  {platform.name}
                </option>
              ))}
            </select>
          </div>
          
          <input
            type="url"
            value={social.url || ''}
            onChange={(e) => updateSocial(index, { url: e.target.value })}
            placeholder="https://"
            className="flex-1 bg-transparent border-none text-white placeholder-gray-500 focus:ring-0 focus:outline-none"
          />
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteSocial(index)}
            className="text-gray-400 hover:text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      
      <Button 
        onClick={addSocial} 
        className="w-full bg-purple-500/20 text-purple-400 border border-purple-500/50 hover:bg-purple-500/30"
        disabled={saving}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Social Link
      </Button>
    </div>
  )
} 