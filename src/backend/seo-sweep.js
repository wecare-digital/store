/**
 * Nightly SEO sweep — WECARE.DIGITAL
 *
 * Events are the fast path: a new blog post triggers wixBlog_onPostPublished,
 * and product SEO is applied when you run the productseo endpoint. Neither is
 * guaranteed. Events can be missed if the site is mid-deploy, a webhook tier
 * can fail silently, and products edited in the Wix Dashboard never fire a
 * Velo event at all.
 *
 * So this runs once a night and repairs anything that drifted:
 *   - products whose seoData is empty or still says "Shop now"
 *   - blog posts with no seoData tags
 *
 * It only writes where SEO is missing or template filler. Hand-written copy is
 * left alone, so running it repeatedly is safe and mostly a no-op.
 *
 * Scheduled from jobs.config.
 */

import { listProducts, normalizeProduct, wixApi } from 'backend/catalog-v3.js';
import { applyProductSeo } from 'backend/product-seo.js';
import { getSecret } from 'wix-secrets-backend';

const BASE = 'https://www.wecare.digital';

/** Template filler the old generator produced, plus genuinely empty SEO. */
function needsSeo ( seoData ) {
  const tags = seoData?.tags || [];
  if ( !tags.length ) return true;
  const desc = tags.find( t => t.type === 'meta' && t.props?.name === 'description' );
  const content = desc?.props?.content || '';
  if ( !content ) return true;
  if ( /\bShop now\.?$/i.test( content ) ) return true;
  if ( content.length < 50 ) return true;
  const hasJsonLd = tags.some( t => t.type === 'script' && t.props?.type === 'application/ld+json' );
  return !hasJsonLd;
}

async function sweepProducts () {
  const products = await listProducts();
  const stale = products.filter( p => needsSeo( p.seoData ) ).map( normalizeProduct );
  if ( !stale.length ) return { checked: products.length, repaired: 0, slugs: [] };

  const results = [];
  for ( const p of stale ) {
    try {
      const r = await applyProductSeo( { dryRun: false, slug: p.slug } );
      results.push( { slug: p.slug, ok: r.applied > 0 } );
    } catch ( e ) {
      results.push( { slug: p.slug, ok: false, error: e.message } );
    }
  }
  return { checked: products.length, repaired: results.filter( r => r.ok ).length, slugs: results };
}

async function sweepPosts () {
  const r = await wixApi( 'GET', '/blog/v3/posts?paging.limit=100&fieldsToInclude=SEO' );
  if ( !r.ok ) throw new Error( 'listPosts failed: ' + r.status );
  const posts = r.data?.posts || [];
  const stale = posts.filter( p => needsSeo( p.seoData ) );
  if ( !stale.length ) return { checked: posts.length, repaired: 0, slugs: [] };

  const key = await getSecret( 'WECARE_API_KEY' ).catch( () => '' );
  const results = [];
  for ( const p of stale ) {
    try {
      const res = await fetch(
        BASE + '/_functions/blogseoapply?dryrun=0&slug=' + encodeURIComponent( p.slug ),
        { headers: key ? { 'x-api-key': key } : {} }
      );
      const data = await res.json();
      results.push( { slug: p.slug, ok: !!data.ok, error: data.error } );
    } catch ( e ) {
      results.push( { slug: p.slug, ok: false, error: e.message } );
    }
  }
  return { checked: posts.length, repaired: results.filter( r => r.ok ).length, slugs: results };
}

/** Entry point for the scheduled job. */
export async function nightlySeoSweep () {
  const started = Date.now();
  const out = { startedAt: new Date().toISOString() };

  try { out.products = await sweepProducts(); }
  catch ( e ) { out.products = { error: e.message }; }

  try { out.posts = await sweepPosts(); }
  catch ( e ) { out.posts = { error: e.message }; }

  out.durationMs = Date.now() - started;
  console.log( '[seo-sweep] ' + JSON.stringify( out ) );
  return out;
}
