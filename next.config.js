/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Logos are static imports (content-hashed URLs), so optimised copies
    // can be cached for a year on phones and on Vercel's edge.
    minimumCacheTTL: 31536000,
    formats: ["image/webp"],
  },
};

module.exports = nextConfig;
