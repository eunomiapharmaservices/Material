/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allows the app to be self-hosted (Option 3) with `next start`
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,

  // Allow Supabase storage images/files
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },

  // Increase body size limit for file uploads (default 4mb → 50mb)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

module.exports = nextConfig;
