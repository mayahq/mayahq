import { 
  Twitter, 
  Github, 
  Linkedin, 
  Youtube,
  Instagram,
  Globe,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'

const icons: Record<string, LucideIcon> = {
  twitter: Twitter,
  github: Github,
  linkedin: Linkedin,
  youtube: Youtube,
  instagram: Instagram,
  website: Globe,
}

interface SocialIconProps {
  platform: string
  className?: string
}

export function SocialIcon({ platform, className }: SocialIconProps) {
  const Icon = icons[platform.toLowerCase()] || Globe

  return <Icon className={cn('h-5 w-5', className)} />
} 