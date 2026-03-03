'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Database } from '@/lib/database.types'
import { SocialIcon } from './social-icon'

type Link = Database['public']['Tables']['links']['Row']
type Social = Database['public']['Tables']['socials']['Row']

interface LinksPageProps {
  links: Link[]
  socials: Social[]
}

export function LinksPage({ links, socials }: LinksPageProps) {
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Profile Section */}
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-4">
            <Image
              src="/images/maya-profile.jpg"
              alt="Maya Scott"
              className="rounded-full neon-border"
              fill
              sizes="96px"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold neon-glow">Maya Scott</h1>
          <p className="mt-2 text-gray-400">AI Researcher & Developer</p>
        </div>

        {/* Social Icons */}
        {socials.length > 0 && (
          <div className="flex justify-center gap-4">
            {socials.map((social) => (
              <SocialIcon
                key={social.id}
                platform={social.platform ?? ''}
                url={social.url ?? '#'}
              />
            ))}
          </div>
        )}

        {/* Links */}
        <div className="space-y-4">
          {links.map((link) => (
            <motion.a
              key={link.id}
              href={link.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="link-card block"
              onHoverStart={() => setHoveredLink(link.id)}
              onHoverEnd={() => setHoveredLink(null)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-4">
                {link.image_url && (
                  <div className="relative w-12 h-12 flex-shrink-0">
                    <Image
                      src={link.image_url}
                      alt={link.title ?? ''}
                      className="rounded object-cover"
                      fill
                      sizes="48px"
                    />
                  </div>
                )}
                <div className="flex-grow">
                  <h2 className="text-lg font-semibold">
                    {link.title}
                  </h2>
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </div>
  )
} 