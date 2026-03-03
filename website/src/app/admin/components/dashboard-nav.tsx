'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Link as LinkIcon, Users, FileText, Brain, MessageSquare, CheckSquare, Sparkles, ListChecks, Image as ImageIcon, Heart, Database, Calendar, Clock, ShoppingBag, Settings, FolderOpen, LayoutDashboard, FolderKanban, Activity, Newspaper, Moon, CalendarCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashboardNavProps {
  className?: string
  onNavItemClick?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'Mission Control',
    items: [
      { href: '/admin/mission-control', label: 'Overview', icon: LayoutDashboard },
      { href: '/admin/mission-control/board', label: 'Task Board', icon: FolderKanban },
      { href: '/admin/mission-control/cron-log', label: 'Cron Log', icon: Activity },
      { href: '/admin/mission-control/digest', label: 'Digest', icon: Newspaper },
      { href: '/admin/mission-control/dailys', label: 'Dailys', icon: CalendarCheck },
    ],
  },
  {
    title: 'Content',
    items: [
      { href: '/admin/links', label: 'Links', icon: LinkIcon },
      { href: '/admin/socials', label: 'Socials', icon: Users },
      { href: '/admin/posts', label: 'Blog Posts', icon: FileText },
      { href: '/admin/products', label: 'Products', icon: ShoppingBag },
    ],
  },
  {
    title: 'Maya',
    items: [
      { href: '/admin/chat', label: 'Chat', icon: MessageSquare },
      { href: '/admin/memories', label: 'Memories', icon: Brain },
      { href: '/admin/tasks', label: 'Tasks', icon: CheckSquare },
      { href: '/admin/reminders', label: 'Reminders', icon: Clock },
      { href: '/admin/calendar', label: 'Calendar', icon: Calendar },
      { href: '/admin/midnight-maya', label: 'Midnight Maya', icon: Moon },
    ],
  },
  {
    title: 'Image Generation',
    items: [
      { href: '/admin/feed', label: 'Feed', icon: ListChecks },
      { href: '/admin/feed-likes', label: 'Feed Likes', icon: Heart },
      { href: '/admin/image-studio', label: 'Image Studio', icon: ImageIcon },
      { href: '/admin/media-library', label: 'Media Library', icon: FolderOpen },
      { href: '/admin/mood-engine', label: 'Mood Engine', icon: Sparkles },
    ],
  },
  {
    title: 'Settings',
    items: [
      { href: '/admin/data-sources', label: 'Data Sources', icon: Database },
      { href: '/admin/llm-settings', label: 'LLM Settings', icon: Settings },
    ],
  },
]

export function DashboardNav({ className, onNavItemClick, collapsed = false, onToggleCollapse }: DashboardNavProps) {
  const pathname = usePathname()

  const handleClick = () => {
    onNavItemClick?.()
  }

  const isActive = (href: string) => {
    if (!pathname) return false
    if (pathname === href) return true
    if (href === '/admin/image-studio' && pathname.startsWith('/admin/image-studio/')) return true
    if (href === '/admin/feed-likes' && pathname.startsWith('/admin/feed-likes/')) return true
    if (href === '/admin/media-library' && pathname.startsWith('/admin/media-library/')) return true
    if (href === '/admin/mission-control/board' && pathname.startsWith('/admin/mission-control/board')) return true
    if (href === '/admin/mission-control/cron-log' && pathname.startsWith('/admin/mission-control/cron-log')) return true
    if (href === '/admin/mission-control/digest' && pathname.startsWith('/admin/mission-control/digest')) return true
    if (href === '/admin/mission-control/dailys' && pathname.startsWith('/admin/mission-control/dailys')) return true
    if (href === '/admin/midnight-maya' && pathname.startsWith('/admin/midnight-maya')) return true
    return false
  }

  return (
    <div
      className={cn(
        'h-full flex flex-col border-r border-gray-800 transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Header */}
      <div className={cn('flex-shrink-0 p-4', collapsed ? 'px-3' : 'p-6 pb-4')}>
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-3')}>
          <div className="relative w-10 h-10 flex-shrink-0">
            <Image
              src="https://dlaczmexhnoxfggpzxkl.supabase.co/storage/v1/object/public/avatars/61770892-9e5b-46a5-b622-568be7066664/0.7963898365589204.jpg"
              alt="Maya"
              fill
              className="rounded-lg object-cover"
              sizes="40px"
            />
          </div>
          {!collapsed && (
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
              Maya HQ
            </h1>
          )}
        </div>
      </div>

      {/* Scrollable nav area */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 px-3 pb-4">
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">
                {section.title}
              </h2>
            )}
            {collapsed && (
              <div className="h-px bg-gray-800 mx-1 mb-2" />
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleClick}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center rounded-lg text-gray-400 transition-all hover:text-purple-400 hover:bg-purple-500/10',
                      collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
                      isActive(item.href) && 'bg-purple-500/20 text-purple-400'
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

    </div>
  )
}
