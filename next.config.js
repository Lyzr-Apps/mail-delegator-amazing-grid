/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for optimized Docker deployments
  output: 'standalone',

  // Optimize for faster builds
  swcMinify: true,

  // Reduce build time by skipping type checking (run separately)
  typescript: {
    ignoreBuildErrors: false,
  },

  // Skip ESLint during builds (run separately)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Optimize images
  images: {
    unoptimized: true,
  },

  // Enable experimental features for faster dev
  experimental: {
    // Optimize package imports for faster builds
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      'recharts',
      'date-fns',
    ],
  },

  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    // Faster rebuilds in development
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      }
    }
    return config
  },
}

module.exports = nextConfig
