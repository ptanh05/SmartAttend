/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

// Content Security Policy
// - camera=(self) & microphone=(self) needed for QR Scanner & Ultrasonic sound beacon
// - publickey-credentials-get=(self) needed for WebAuthn FIDO2 biometrics
// - unsafe-eval is only enabled in development for fast-refresh tooling; omitted in production
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  font-src 'self' data:;
  connect-src 'self' https://login.microsoftonline.com;
  media-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self' https://login.microsoftonline.com;
  frame-ancestors 'none';
`.replace(/\s{2,}/g, ' ').trim()

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    const securityHeaders = [
      {
        key: 'Content-Security-Policy',
        value: cspHeader,
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(self), microphone=(self), publickey-credentials-get=(self), geolocation=(), interest-cohort=()',
      },
    ]

    // Do NOT enable HSTS for HTTP Development environments; only enforce in production HTTPS
    if (isProd) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      })
    }

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
