import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  output: 'standalone',
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key:'X-Content-Type-Options', value:'nosniff' },
      { key:'Referrer-Policy', value:'no-referrer' },
      { key:'X-Frame-Options', value:'DENY' },
      { key:'Permissions-Policy', value:'camera=(self), microphone=(self), geolocation=()' }
    ] }];
  }
};
export default nextConfig;
