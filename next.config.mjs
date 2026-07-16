const isDev = process.env.NODE_ENV !== 'production';

const scriptSrc = ["'self'", "'unsafe-inline'"];

if (isDev) {
  scriptSrc.push("'unsafe-eval'");
}

// When NEXT_PUBLIC_API_BASE_URL points to an external origin (e.g. localhost:8000
// in CI / dev), the browser needs connect-src permission to reach it. The value
// is inlined at build time by Next.js, so this runs during `next build`.
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
const extraConnectSrc = apiBaseUrl && !apiBaseUrl.startsWith('/') ? ` ${apiBaseUrl}` : '';

const cspHeader = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://storage.googleapis.com",
  "font-src 'self' data:",
  `connect-src 'self' https://storage.googleapis.com ws:${extraConnectSrc}`,
  "media-src 'self' blob: https://storage.googleapis.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: cspHeader,
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'same-origin',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
