/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev-only: allow Tailnet origin to fetch HMR assets.
  allowedDevOrigins: ['http://100.64.0.2:4010', 'http://127.0.0.1:4010', 'http://localhost:4010'],
};

module.exports = nextConfig;
