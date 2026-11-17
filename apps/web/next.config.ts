import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import createNextIntlPlugin from 'next-intl/plugin';

// Shown in the footer: the release (package.json, kept equal to the CHANGELOG) and the deployed commit (set by Vercel).
const release = (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version;
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7);

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const config: NextConfig = {
  transpilePackages: ['@afrofoot/ui', '@afrofoot/db', '@afrofoot/i18n', '@afrofoot/federation'],
  poweredByHeader: false,
  env: { NEXT_PUBLIC_RELEASE: release, NEXT_PUBLIC_COMMIT: commit },
  // Old WordPress addresses (afrofoot.club until 2026), still linked from Facebook and search results.
  async redirects() {
    return [
      { source: '/:year(\\d{4})/:month(\\d{2})/:day(\\d{2})/:slug', destination: '/news/:slug', permanent: true },
      { source: '/category/:path*', destination: '/news', permanent: true },
      { source: '/tag/:path*', destination: '/news', permanent: true },
      { source: '/feed', destination: '/news', permanent: false },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    ] }];
  },
};
export default withNextIntl(config);
