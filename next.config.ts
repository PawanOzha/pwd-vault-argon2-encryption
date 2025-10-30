/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {}, // Enable Turbopack (optional)
  // Ensure Next.js works properly with Electron
  output: 'standalone',
  
  // Handle TypeScript and ES modules
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: false,
  },
  
  // Disable SWC minification if having issues (uncomment if needed)
  // swcMinify: false,
  
  // Custom webpack configuration
  webpack: (config, { isServer }) => {
    // Handle electron modules
    if (!isServer) {
      config.target = 'web';
    }
    
    // Prevent webpack from trying to resolve electron
    config.externals = config.externals || {};
    if (typeof config.externals === 'object' && !Array.isArray(config.externals)) {
      config.externals['electron'] = 'electron';
    }
    
    return config;
  },
  
  // Environment variables that should be available
  env: {
    NEXT_PUBLIC_ELECTRON: process.env.ELECTRON || 'false',
  },
  
  // Disable image optimization for Electron (optional)
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig

