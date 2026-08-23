/**
 * Catalog V3 access — WECARE.DIGITAL
 *
 * This site runs Wix Stores **Catalog V3**. The legacy wix-data collection
 * `Stores/Products` is a V1 surface and returns 0 rows here, which is why
 * /_functions/health, /_functions/stats, /_functions/rssproducts and
 * /_functions/productfeed all report an empty catalog while the store
 * actually holds live products.
 *
 * Every product read should go through this module instead of wixData.
 *
 * Endpoints used (Catalog V3):
 *   POST /stores/v3/products/count
 *   POST /stores/v3/products/search
 *   PATCH /stores/v3/products/{id}
 */

import { getSecret } from 'wix-secrets-backend';

const WIX_API = 'https://www.wixapis.com';
const WIX_SITE = 'd3ed75eb-e0b7-45c2-a743-f83cfa19379a';
const BASE = 'https://www.wecare.digital';
const BRAND = 'WECARE.DIGITAL';

let _key = null;
async function getWixKey () {
  if ( _key ) return _key;
  try { _key = await getSecret( 'api' ); } catch { _key = ''; }
  return _key;
}

export async function wixApi ( method, path, body ) {
  const key = await getWixKey();
  const opts = { method, headers: { Authorization: key, 'Content-Type': 'application/json', 'wix-site-id': WIX_SITE } };
  if ( body ) opts.body = JSON.stringify( body );
  const r = await fetch( WIX_API + path, opts );
  const text = await r.text();
  try { return { ok: r.ok, status: r.status, data: JSON.parse( text ) }; }
  catch { return { ok: r.ok, status: r.status, data: text }; }
}

/** Number of products in the catalog. */
export async function countProducts () {
  const r = await wixApi( 'POST', '/stores/v3/products/count', {} );
  return r.ok ? Number( r.data.count || 0 ) : 0;
}

/**
 * All visible products, cursor-paged. Returns raw V3 product objects.
 * `fields` must be V3 field-projection enums, not arbitrary field names.
 */
export async function listProducts ( { limit = 100, fields = [ 'CURRENCY', 'URL', 'DESCRIPTION' ] } = {} ) {
  const out = [];
  let cursor = null;
  do {
    const search = cursor ? { cursorPaging: { limit, cursor } } : { cursorPaging: { limit } };
    const r = await wixApi( 'POST', '/stores/v3/products/search', { search, fields } );
    if ( !r.ok ) throw new Error( 'searchProducts failed: ' + r.status + ' ' + JSON.stringify( r.data ) );
    out.push( ...( r.data.products || [] ) );
    cursor = r.data.pagingMetadata?.hasNext ? r.data.pagingMetadata.cursors?.next : null;
  } while ( cursor );
  return out;
}

export async function getProductBySlug ( slug ) {
  const all = await listProducts();
  return all.find( p => p.slug === slug ) || null;
}

/** Look up by product id first, falling back to slug. */
export async function getProduct ( idOrSlug ) {
  const r = await wixApi( 'GET', '/stores/v3/products/' + idOrSlug + '?fields=CURRENCY&fields=URL&fields=DESCRIPTION' );
  if ( r.ok && r.data?.product ) return r.data.product;
  return getProductBySlug( idOrSlug );
}

/**
 * Categories replace V1 "collections" in Catalog V3.
 *
 * treeReference is required. Categories are namespaced per app, and without
 * it the search returns an empty list rather than an error - which is how
 * /_functions/stats ended up reporting 0 collections on a store that has 12.
 */
export async function listCategories ( { limit = 100 } = {} ) {
  const r = await wixApi( 'POST', '/categories/v1/categories/search', {
    search: { cursorPaging: { limit } },
    treeReference: { appNamespace: '@wix/stores' },
  } );
  if ( !r.ok ) throw new Error( 'searchCategories failed: ' + r.status + ' ' + JSON.stringify( r.data ) );
  return r.data.categories || [];
}

/** Inventory items, optionally scoped to one product. */
export async function listInventoryItems ( { productId = '', limit = 100 } = {} ) {
  const search = { cursorPaging: { limit } };
  if ( productId ) search.filter = { productId: { $eq: productId } };
  const r = await wixApi( 'POST', '/stores/v3/inventory-items/search', { search } );
  if ( !r.ok ) throw new Error( 'searchInventoryItems failed: ' + r.status + ' ' + JSON.stringify( r.data ) );
  return r.data.inventoryItems || [];
}

/**
 * Fetch a product including its full variants + options, which the V3 write
 * path requires before any variant edit. Use this, not listProducts, when you
 * intend to write — Search Products deliberately omits variant data.
 */
export async function getProductWithVariants ( productId ) {
  const r = await wixApi( 'GET', '/stores/v3/products/' + productId + '?fields=CURRENCY&fields=URL&fields=DESCRIPTION' );
  if ( !r.ok ) throw new Error( 'getProduct failed: ' + r.status + ' ' + JSON.stringify( r.data ) );
  return r.data.product;
}

/** Partial product update. `revision` must be the value you just read. */
export async function updateProduct ( id, revision, patch ) {
  const r = await wixApi( 'PATCH', '/stores/v3/products/' + id, {
    product: Object.assign( { id, revision }, patch ),
  } );
  if ( !r.ok ) throw new Error( 'updateProduct failed: ' + r.status + ' ' + JSON.stringify( r.data ) );
  return r.data.product;
}

/**
 * Rewrite variant SKUs on a V3 product.
 *
 * The V3 API does NOT merge array fields. Sending one changed variant deletes
 * the rest, and `variantsInfo.variants` and `options` are mutually dependent —
 * send one and you must send the other. So this reads the product fresh, maps
 * SKUs onto the complete existing variant array, and sends everything back
 * with each variant's `id` preserved (a variant with no id is created new).
 *
 * @param {string} productId
 * @param {(variant: object, index: number) => string|null} skuFor
 *        Return the new SKU, or null to leave that variant untouched.
 * @param {boolean} dryRun
 * @returns {Promise<{productId, changed, variants, dryRun}>}
 */
export async function setVariantSkus ( productId, skuFor, dryRun = true ) {
  const product = await getProductWithVariants( productId );
  const existing = product.variantsInfo?.variants || [];
  if ( !existing.length ) return { productId, changed: 0, variants: [], dryRun };

  let changed = 0;
  const variants = existing.map( ( v, i ) => {
    const next = skuFor( v, i );
    const sku = ( next === null || next === undefined ) ? v.sku : next;
    if ( sku !== v.sku ) changed++;
    // Resend the whole variant. Dropping a field here drops it on the product.
    return {
      id: v.id,
      visible: v.visible,
      sku,
      choices: v.choices || [],
      price: v.price,
      media: v.media,
      physicalProperties: v.physicalProperties,
    };
  } );

  const preview = variants.map( ( v, i ) => ( { id: v.id, oldSku: existing[ i ].sku || null, newSku: v.sku } ) );
  if ( dryRun || !changed ) return { productId, changed, variants: preview, dryRun: true };

  await updateProduct( productId, product.revision, {
    options: product.options || [],
    variantsInfo: { variants },
  } );
  return { productId, changed, variants: preview, dryRun: false };
}

/**
 * Flatten a V3 product into the shape the feeds and JSON-LD builders want.
 * V1 → V3 field moves this covers:
 *   price.price      → actualPriceRange.minValue.amount
 *   price.currency   → currency
 *   mainMedia        → media.main.image.url
 *   inStock          → inventory.availabilityStatus === 'IN_STOCK'
 *   description      → plainDescription (requires the DESCRIPTION projection)
 */
export function normalizeProduct ( p ) {
  const min = p.actualPriceRange?.minValue?.amount;
  const max = p.actualPriceRange?.maxValue?.amount;
  return {
    id: p.id,
    revision: p.revision,
    name: p.name || '',
    slug: p.slug || '',
    url: p.url?.url || ( BASE + '/product-page/' + ( p.slug || p.id ) ),
    description: ( p.plainDescription || '' ).replace( /<[^>]*>/g, '' ).trim(),
    image: p.media?.main?.image?.url || '',
    imageWidth: p.media?.main?.image?.width || null,
    imageHeight: p.media?.main?.image?.height || null,
    currency: p.currency || 'INR',
    // actualPrice is what the customer pays; compareAtPrice is the struck-through
    // "was" price. Structured data must advertise actualPrice — publishing the
    // compareAt value is a price mismatch against the page.
    price: min || '',
    priceMax: max || min || '',
    hasPriceRange: !!( min && max && min !== max ),
    compareAtPrice: p.compareAtPriceRange?.minValue?.amount || '',
    categoryIds: [ p.mainCategoryId ].filter( Boolean ),
    variantCount: p.variantSummary?.variantCount || 1,
    // SKU lives on the variant in V3. Single-variant products - the common
    // case here - have exactly one, and Google wants it in Product schema.
    sku: p.variantsInfo?.variants?.length === 1 ? ( p.variantsInfo.variants[ 0 ].sku || '' ) : '',
    inStock: p.inventory?.availabilityStatus === 'IN_STOCK',
    availabilityStatus: p.inventory?.availabilityStatus || 'OUT_OF_STOCK',
    brand: p.brand?.name || BRAND,
    ribbon: p.ribbon?.name || '',
    visible: p.visible !== false,
    createdDate: p.createdDate,
    updatedDate: p.updatedDate,
    seoData: p.seoData || null,
  };
}
