/** @type {import('next').NextConfig} */
const nextConfig = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
