/**
 * Product SEO — WECARE.DIGITAL
 *
 * Writes per-product SEO (title, meta, Open Graph, Twitter, canonical and
 * JSON-LD) into each product's `seoData` via the Catalog V3 Update Product
 * endpoint. This is the store-side equivalent of the blog's buildSeoTags()
 * in http-functions.js, and it lives in the repo so the applied SEO is
 * reproducible instead of one-off API calls.
 *
 * JSON-LD emitted per product:
 *   - Product (with Offer: price, currency, availability, seller, condition)
 *   - BreadcrumbList (Home → brand store page → product)
 *
 * Endpoint: PATCH /stores/v3/products/{id}  — requires the current `revision`.
 */

import { listProducts, normalizeProduct, wixApi } from 'backend/catalog-v3.js';

const BASE = 'https://www.wecare.digital';
const BRAND = 'WECARE.DIGITAL';
const LOGO = 'https://app.wecare.digital/stream/media/m/wecare-digital.png';

/**
 * Brand/ribbon → the real store page on this site.
 * The previously-applied product schema pointed breadcrumbs at /shop, which
 * is not a page in this site's page tree — a breadcrumb link to a 404 is
 * worse than no breadcrumb, so route to the brand's actual store page.
 */
const STORE_PAGES = [
  { match: /bnb/i, name: 'BNB Club Store', path: '/bnb-store' },
  { match: /legal\s*champ/i, name: 'Legal Champ Store', path: '/legalchamp-store' },
  { match: /ritual/i, name: 'Ritual Guru Store', path: '/ritual-store' },
  { match: /swdhya/i, name: 'Swdhya Store', path: '/swdhya-store' },
  { match: /no\s*fault/i, name: 'No Fault Store', path: '/nofault-store' },
  { match: /partner\s*up/i, name: 'Partner Up', path: '/partner-up' },
  { match: /expo\s*week/i, name: 'Expo Week', path: '/expoweek' },
];

/**
 * Returns null when the product doesn't belong to a known brand store. A
 * two-level Home → product breadcrumb is correct; guessing a parent produces
 * a breadcrumb that links somewhere the product isn't.
 */
function storePageFor ( product ) {
  const hay = ( product.ribbon || '' ) + ' ' + ( product.brand || '' );
  return STORE_PAGES.find( s => s.match.test( hay ) ) || null;
}

/**
 * Hand-written copy per product, drafted from each product's own info-section
 * content (Overview / Snapshot / Merch Kit / What's Included) rather than from
 * a template. Anything not listed here falls back to the generated copy below.
 *
 * Titles are kept under 60 chars and descriptions under 155 so search engines
 * display them whole. Prices are deliberately NOT in the description — they go
 * stale and then mismatch the Offer schema; the Offer carries the live price.
 */
const COPY = {
  'visa-assistance-tourist-visa-single-country': {
    title: 'Tourist Visa Assistance — Single Country | WECARE.DIGITAL',
    description: 'End-to-end tourist visa support for a single destination — document checks, form filing and appointment coordination, handled start to finish.',
  },
  'sahachintan': {
    title: 'Sahachintan — A Co-Thinking Session | Swdhya',
    description: 'A focused audio session that turns the question you are holding into 1–3 clear next steps. Surface patterns, weigh trade-offs, decide. By Swdhya.',
  },
  'newnorth': {
    title: 'NewNorth — Mutual-Consent Documentation | No Fault',
    description: 'End-to-end paperwork for uncontested, mutual-consent matters. Choose DIY drafting or have partner lawyers file for you. Available across India.',
  },
  'partner-bundle': {
    title: 'Partner Merch Kit — Tee, Mug, Cards & More | WECARE.DIGITAL',
    description: 'Partner merch kit: laser-etched keychain, premium cotton tee, ceramic mug, 18×12 poster and 100 business cards. For meetings, events and every day.',
  },
  'storeslate': {
    title: 'StoreSlate — 10″ Android POS Tablet | WECARE.DIGITAL',
    description: 'Rugged 10″ Android POS for retail, cafés, events and field sales. Toughened glass, all-day battery, Wi-Fi/Bluetooth, WECARE.DIGITAL POS preinstalled.',
  },
  'partner-up': {
    title: 'Partner Up — Earn on 4,000+ SKUs | WECARE.DIGITAL',
    description: 'Activate once and earn on every valid order across 4,000+ SKUs from BNB Club, Legal Champ, Ritual Guru, Swdhya, No Fault and more. No renewals.',
  },
};

function clamp ( text, max ) {
  const t = ( text || '' ).replace( /\s+/g, ' ' ).trim();
  if ( t.length <= max ) return t;
  const cut = t.slice( 0, max );
  const space = cut.lastIndexOf( ' ' );
  return ( space > max * 0.6 ? cut.slice( 0, space ) : cut ).replace( /[,;:\-–—]$/, '' ) + '…';
}

function tag ( type, props, children ) {
  return { type, props: props || {}, children: children || '', custom: true, disabled: false };
}

function metaName ( name, content ) { return tag( 'meta', { name, content } ); }
function metaProp ( property, content ) { return tag( 'meta', { property, content } ); }
function ldJson ( obj ) { return tag( 'script', { type: 'application/ld+json' }, JSON.stringify( obj ) ); }

/**
 * Build the full seoData payload for one normalized product.
 * Titles are clamped to ~60 chars and descriptions to ~155 so search engines
 * display them whole.
 */
export function buildProductSeo ( p ) {
  const store = storePageFor( p );
  const url = p.url;
  const written = COPY[ p.slug ];

  const title = written ? written.title : clamp( p.name + ' | ' + BRAND, 60 );
  const description = written
    ? written.description
    : ( p.description && p.description.length >= 50
      ? clamp( p.description, 155 )
      : clamp( p.name + ' from ' + p.brand + ' — a ' + BRAND + ' microservice. Transparent pricing, delivered across India.', 155 ) );

  const image = p.image || LOGO;
  const availability = p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';

  // Offer price must be a plain number string; a range needs low/high price.
  const offer = {
    '@type': 'Offer',
    price: String( p.price ),
    priceCurrency: p.currency,
    availability,
    itemCondition: 'https://schema.org/NewCondition',
    url,
    seller: { '@type': 'Organization', '@id': BASE + '/#organization', name: BRAND },
  };

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': url + '#product',
    name: p.name,
    description,
    image: [ image ],
    url,
    brand: { '@type': 'Brand', name: p.brand },
    offers: p.hasPriceRange
      ? {
        '@type': 'AggregateOffer',
        lowPrice: String( p.price ),
        highPrice: String( p.priceMax ),
        priceCurrency: p.currency,
        offerCount: 1,
        availability,
        url,
        seller: { '@type': 'Organization', '@id': BASE + '/#organization', name: BRAND },
      }
      : offer,
    isPartOf: { '@id': BASE + '/#website' },
    inLanguage: 'en-IN',
  };

  // Google uses sku as a product identifier for rich results and free
  // Merchant listings. Only single-variant products have one unambiguous SKU.
  if ( p.sku ) productLd.sku = p.sku;

  const crumbs =[ { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' } ];
  if ( store ) crumbs.push( { '@type': 'ListItem', position: 2, name: store.name, item: BASE + store.path } );
  crumbs.push( { '@type': 'ListItem', position: crumbs.length + 1, name: p.name, item: url } );

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': url + '#breadcrumb',
    itemListElement: crumbs,
  };

  const tags = [
    tag( 'title', {}, title ),
    metaName( 'description', description ),
    metaName( 'robots', 'index, follow, max-image-preview:large, max-snippet:-1' ),
    metaProp( 'og:type', 'product' ),
    metaProp( 'og:title', title ),
    metaProp( 'og:description', description ),
    metaProp( 'og:url', url ),
    metaProp( 'og:image', image ),
    metaProp( 'og:image:alt', p.name ),
    metaProp( 'og:site_name', BRAND ),
    metaProp( 'og:locale', 'en_IN' ),
    metaProp( 'product:price:amount', String( p.price ) ),
    metaProp( 'product:price:currency', p.currency ),
    metaProp( 'product:availability', p.inStock ? 'in stock' : 'out of stock' ),
    metaName( 'twitter:card', 'summary_large_image' ),
    metaName( 'twitter:title', title ),
    metaName( 'twitter:description', description ),
    metaName( 'twitter:image', image ),
    metaName( 'twitter:image:alt', p.name ),
    tag( 'link', { rel: 'canonical', href: url } ),
    ldJson( productLd ),
    ldJson( breadcrumbLd ),
  ];

  // Only declare image dimensions we actually know — hardcoded 1200x630 on a
  // square asset makes social cards crop wrong.
  if ( p.imageWidth && p.imageHeight ) {
    tags.push( metaProp( 'og:image:width', String( p.imageWidth ) ) );
    tags.push( metaProp( 'og:image:height', String( p.imageHeight ) ) );
  }

  const primary = p.name.toLowerCase().replace( /[^a-z0-9\s]/g, ' ' ).replace( /\s+/g, ' ' ).trim();
  const settings = {
    preventAutoRedirect: false,
    keywords: [ { term: primary, isMain: true } ].concat(
      primary.split( ' ' ).filter( w => w.length > 3 ).slice( 0, 3 ).map( w => ( { term: w, isMain: false } ) )
    ),
  };

  return { tags, settings, title, description, url, jsonLdTypes: [ 'Product', 'BreadcrumbList' ] };
}

function validateJsonLd ( tags ) {
  for ( const t of tags ) {
    if ( t.type === 'script' && t.props?.type === 'application/ld+json' ) {
      try { JSON.parse( t.children ); } catch ( e ) { return { valid: false, error: 'Invalid JSON-LD: ' + e.message }; }
    }
  }
  return { valid: true };
}

/**
 * Apply SEO to every product. Pass { dryRun: true } to preview without writing.
 * Returns one result row per product so you can eyeball the copy before
 * committing — nothing is pushed live on a dry run.
 */
export async function applyProductSeo ( { dryRun = true, slug = '' } = {} ) {
  const raw = await listProducts();
  const products = raw.map( normalizeProduct ).filter( p => !slug || p.slug === slug );
  const results = [];

  for ( const p of products ) {
    const seo = buildProductSeo( p );
    const v = validateJsonLd( seo.tags );
    if ( !v.valid ) { results.push( { slug: p.slug, ok: false, error: v.error } ); continue; }

    if ( dryRun ) {
      results.push( { slug: p.slug, ok: true, dryRun: true, title: seo.title, description: seo.description, price: p.price + ' ' + p.currency, inStock: p.inStock, tagCount: seo.tags.length } );
      continue;
    }

    const r = await wixApi( 'PATCH', '/stores/v3/products/' + p.id, {
      product: { id: p.id, revision: p.revision, seoData: { tags: seo.tags, settings: seo.settings } },
    } );
    results.push( r.ok
      ? { slug: p.slug, ok: true, title: seo.title, description: seo.description, jsonLdTypes: seo.jsonLdTypes, tagCount: seo.tags.length }
      : { slug: p.slug, ok: false, status: r.status, error: r.data } );
  }

  return { dryRun, count: results.length, applied: results.filter( r => r.ok && !r.dryRun ).length, results };
}
