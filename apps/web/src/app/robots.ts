import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/** /robots.txt: the whole public site may be indexed; the sitemap lists every page. Preview deployments are not indexed. */
export default function robots(): MetadataRoute.Robots {
  const preview = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production';
  return {
    rules: preview ? { userAgent: '*', disallow: '/' } : { userAgent: '*', allow: '/', disallow: ['/api/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
