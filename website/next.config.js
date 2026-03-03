/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@mayahq/supabase-client',
    '@mayahq/chat-sdk',
    '@mayahq/memory-worker',
    '@mayahq/calendar-core'
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Fallbacks for Node.js modules when bundling for the browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        assert: false,
        http: false,
        https: false,
        url: false,
        zlib: false,
      }
    }
    return config
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'dlaczmexhnoxfggpzxkl.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'mayascott.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'mayascott.s3.us-east-1.amazonaws.com',
      },
    ],
  },
  // Skip API routes that require env vars during build time
  experimental: {
    missingSuspenseWithCSRBailout: false,
    serverComponentsExternalPackages: ['@supabase/supabase-js']
  },
  typescript: {
    // Ignore TypeScript errors during build
    ignoreBuildErrors: true,
  },
  eslint: {
    // Ignore ESLint errors during build
    ignoreDuringBuilds: true,
  },
  // Skip static optimization for pages that use Supabase
  reactStrictMode: false,
  output: 'standalone'
}

module.exports = nextConfig 