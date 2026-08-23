/**
 * SEO Controller — WECARE.DIGITAL
 *
 * Global runtime SEO override engine.
 * Called from masterPage.js on every page load.
 *
 * Uses @wix/site-seo to set:
 * - Title
 * - Meta tags (description, robots, OG, Twitter, article)
 * - Link tags (canonical, hreflang)
 * - Structured data (JSON-LD)
 *
 * This replaces manual Wix Dashboard SEO Panel editing for all
 * static and system pages. Blog posts and products are handled
 * by their respective REST APIs.
 */

// Migrated from the legacy `wix-seo-frontend` module to the current
// `@wix/site-seo` package (already in package.json). Same four methods,
// namespaced under `seo` instead of a default export.
import { seo } from '@wix/site-seo';
import { seoMap, defaultSeo } from 'public/seo-map.js';

const BASE = 'https://www.wecare.digital';

/**
 * Normalize wix-location-frontend.path (array) to a string path.
 * Examples:
 *   [] → '/'
 *   ['bnb'] → '/bnb'
 *   ['account', 'my-orders'] → '/account/my-orders'
 *   ['post', 'some-slug'] → '/post/some-slug'
 */
function normalizePath(pathArray) {
  if (!pathArray || !pathArray.length) return '/';
  var joined = '/' + pathArray.join('/');
  return joined.replace(/\/+$/, '') || '/';
}

/**
 * Build meta tags array from SEO config.
 * Only includes tags that have non-empty values.
 */
function buildMetaTags(config) {
  var tags = [];

  if (config.description) {
    tags.push({ type: 'meta', props: { name: 'description', content: config.description } });
  }

  if (config.robots) {
    tags.push({ type: 'meta', props: { name: 'robots', content: config.robots } });
  }

  // Open Graph
  tags.push({ type: 'meta', props: { property: 'og:type', content: config.ogType || 'website' } });
  if (config.ogTitle) {
    tags.push({ type: 'meta', props: { property: 'og:title', content: config.ogTitle } });
  }
  if (config.ogDescription) {
    tags.push({ type: 'meta', props: { property: 'og:description', content: config.ogDescription } });
  }
  if (config.ogImage) {
    tags.push({ type: 'meta', props: { property: 'og:image', content: config.ogImage } });
    tags.push({ type: 'meta', props: { property: 'og:image:alt', content: config.ogTitle || config.title || 'WECARE.DIGITAL' } });
    // Only declare dimensions we actually know. Claiming 1200x630 for a square
    // logo makes Facebook/LinkedIn/X crop the card wrong.
    if (config.ogImageWidth && config.ogImageHeight) {
      tags.push({ type: 'meta', props: { property: 'og:image:width', content: String(config.ogImageWidth) } });
      tags.push({ type: 'meta', props: { property: 'og:image:height', content: String(config.ogImageHeight) } });
    }
  }
  if (config.canonical) {
    tags.push({ type: 'meta', props: { property: 'og:url', content: config.canonical } });
  }
  tags.push({ type: 'meta', props: { property: 'og:site_name', content: 'WECARE.DIGITAL' } });
  tags.push({ type: 'meta', props: { property: 'og:locale', content: 'en_IN' } });

  // Twitter Card
  tags.push({ type: 'meta', props: { name: 'twitter:card', content: 'summary_large_image' } });
  if (config.twitterTitle) {
    tags.push({ type: 'meta', props: { name: 'twitter:title', content: config.twitterTitle } });
  }
  if (config.twitterDescription) {
    tags.push({ type: 'meta', props: { name: 'twitter:description', content: config.twitterDescription } });
  }
  if (config.ogImage) {
    tags.push({ type: 'meta', props: { name: 'twitter:image', content: config.ogImage } });
  }

  return tags;
}

/**
 * Build link tags array from SEO config.
 */
function buildLinks(config) {
  var links = [];

  if (config.canonical) {
    links.push({ rel: 'canonical', href: config.canonical });
  }

  if (Array.isArray(config.hreflang)) {
    config.hreflang.forEach(function (alt) {
      links.push({ rel: 'alternate', hreflang: alt.lang, href: alt.href });
    });
  }

  return links;
}

/**
 * Check if a path is for a blog post or product page.
 * These are handled by their respective REST APIs, not by this controller.
 */
function isApiManagedPath(path) {
  return path.indexOf('/post/') === 0 || path.indexOf('/product-page/') === 0;
}

/**
 * Apply SEO settings for the current page.
 * Called from masterPage.js $w.onReady().
 *
 * @param {string[]} locationPath - wixLocation.path array
 */
export function applySeo(locationPath) {
  var path = normalizePath(locationPath);

  // Skip blog posts and product pages — handled by REST API seoData
  if (isApiManagedPath(path)) {
    return;
  }

  var config = seoMap[path];

  // If path not in map, try lowercase
  if (!config) {
    config = seoMap[path.toLowerCase()];
  }

  // If still not found, fall back to the site-level defaults — but never
  // inherit the homepage canonical. Pointing an unmapped page's canonical at
  // '/' tells Google the page is a duplicate of the homepage and drops it
  // from the index. Same for the homepage title/OG copy.
  if (!config) {
    console.log('[seo-controller] unmapped path: ' + path);
    if (!defaultSeo) return;
    config = {
      description: defaultSeo.description,
      robots: defaultSeo.robots,
      ogImage: defaultSeo.ogImage,
      ogType: 'website',
      canonical: BASE + path,
      structuredData: [],
    };
  }

  // Apply title
  if (config.title) {
    try { seo.setTitle(config.title); } catch (e) { console.error('[seo-controller] setTitle error:', e); }
  }

  // Apply meta tags
  var metaTags = buildMetaTags(config);
  if (metaTags.length) {
    try { seo.setMetaTags(metaTags); } catch (e) { console.error('[seo-controller] setMetaTags error:', e); }
  }

  // Apply link tags
  var links = buildLinks(config);
  if (links.length) {
    try { seo.setLinks(links); } catch (e) { console.error('[seo-controller] setLinks error:', e); }
  }

  // Apply structured data
  if (Array.isArray(config.structuredData) && config.structuredData.length) {
    try { seo.setStructuredData(config.structuredData); } catch (e) { console.error('[seo-controller] setStructuredData error:', e); }
  }
}

export default { applySeo };
