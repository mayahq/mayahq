'use client'

import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ExternalLink, User, LogOut, Menu, ChevronLeft, ChevronRight, Search, Command, Sun, Moon, Monitor, Bell } from 'lucide-react'
import { DashboardNav } from './components/dashboard-nav'
import { useAuth } from '@/contexts/AuthContext'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [isNavCollapsed, setIsNavCollapsed] = useState(false)
  const { user, profile, loading, supabase } = useAuth()

  const handleSignOut = async () => {
    if (!supabase) {
      console.error('Error signing out: Supabase client not available from AuthContext.')
      return
    }
    try {
      await supabase.auth.signOut()
      window.location.href = '/login'
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <p>Loading admin area...</p>
      </div>
    )
  }

  const UserDropdown = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-8 w-8 rounded-full border-2 border-purple-500/30 hover:border-purple-500/50 hover:shadow-[0_0_15px_rgba(168,85,247,0.35)] transition-all duration-300"
        >
          {profile?.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.name || 'User'}
              className="rounded-full object-cover"
              fill
              sizes="32px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-full bg-purple-500/20">
              <User className="h-4 w-4 text-purple-400" />
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-gray-900 border-gray-800">
        <DropdownMenuItem asChild>
          <Link href="/admin/profile" className="flex items-center text-gray-200 hover:text-purple-400">
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/links" target="_blank" className="flex items-center text-gray-200 hover:text-purple-400">
            <ExternalLink className="mr-2 h-4 w-4" />
            <span>View Site</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-black overflow-hidden">
      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 flex-shrink-0">
            <Image
              src="https://dlaczmexhnoxfggpzxkl.supabase.co/storage/v1/object/public/avatars/61770892-9e5b-46a5-b622-568be7066664/0.7963898365589204.jpg"
              alt="Maya"
              fill
              className="rounded-lg object-cover"
              sizes="40px"
            />
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
            MayaHQ
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            className="lg:hidden text-gray-400 hover:text-purple-400"
          >
            <Menu className="h-6 w-6" />
          </Button>
          <UserDropdown />
        </div>
      </div>

      {/* Mobile nav overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden bg-black/80 backdrop-blur-sm transition-opacity",
          isMobileNavOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsMobileNavOpen(false)}
      />

      {/* Mobile nav drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 transform transition-transform lg:hidden",
          isMobileNavOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <DashboardNav onNavItemClick={() => setIsMobileNavOpen(false)} />
      </div>

      {/* Desktop sidebar + collapse toggle */}
      <div className="hidden lg:flex flex-shrink-0 relative">
        <DashboardNav
          collapsed={isNavCollapsed}
        />
        {/* Collapse toggle - sits on the border seam */}
        <button
          onClick={() => setIsNavCollapsed(!isNavCollapsed)}
          className="absolute -right-3 top-[4.5rem] z-20 flex h-6 w-6 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-500 hover:text-purple-400 hover:border-purple-500/50 transition-colors shadow-sm"
          title={isNavCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isNavCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Main content - independently scrollable */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="hidden lg:flex items-center justify-end gap-3 sticky top-0 z-10 px-4 lg:px-8 pt-4 lg:pt-6 pb-4 bg-black/60 backdrop-blur-xl shadow-[0_1px_12px_rgba(0,0,0,0.4)]">
          {/* Search bar */}
          <button className="flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-700 bg-gray-900/60 text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors min-w-[200px]">
            <Search className="h-4 w-4" />
            <span className="text-sm">Search</span>
            <kbd className="ml-auto flex items-center gap-0.5 rounded border border-gray-700 bg-gray-800/80 px-1.5 py-0.5 text-[10px] text-gray-500">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>

          {/* Theme picker */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg border border-gray-700 bg-gray-900/60 text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors"
              >
                <Sun className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36 bg-gray-900 border-gray-800">
              <DropdownMenuItem className="flex items-center text-gray-200 hover:text-purple-400">
                <Sun className="mr-2 h-4 w-4" />
                <span>Light</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center text-gray-200 hover:text-purple-400">
                <Moon className="mr-2 h-4 w-4" />
                <span>Dark</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center text-gray-200 hover:text-purple-400">
                <Monitor className="mr-2 h-4 w-4" />
                <span>System</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 rounded-lg border border-gray-700 bg-gray-900/60 text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-purple-500 border-2 border-black/60 text-[8px] font-bold text-white flex items-center justify-center">
              3
            </span>
          </Button>

          <UserDropdown />
        </div>
        <div className="p-4 lg:px-8 lg:pb-8 lg:pt-4">
          {children}
        </div>
      </div>
    </div>
  )
}
