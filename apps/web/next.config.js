/** @type {import('next').NextConfig} */
const host = process.env.MC_BIND_HOST || '127.0.0.1';
const port = process.env.MC_WEB_PORT || '4010';

const nextConfig = {
  // Dev-only: allow Tailnet origin to fetch HMR assets.
  allowedDevOrigins: [
    'http://100.64.0.2:4010',
    'http://127.0.0.1:4010',
    'http://localhost:4010',
    `http://${host}:${port}`,
  ],
};

module.exports = nextConfig;
