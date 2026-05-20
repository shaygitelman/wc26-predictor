import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Country / team flag images (all sizes: /w20/, /w40/, /w80/, etc.)
        protocol: 'https',
        hostname: 'flagcdn.com',
      },
      {
        // API-Football player photos and team crests
        protocol: 'https',
        hostname: 'media.api-sports.io',
      },
      {
        // Google OAuth profile avatars (lh3 is the Google user-content CDN)
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
};

export default nextConfig;
