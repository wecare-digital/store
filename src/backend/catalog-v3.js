// Catalog V3 access used only by the administrator SKU tools.
import { getSecret } from 'wix-secrets-backend';

const WIX_API = 'https://www.wixapis.com';
const WIX_SITE = 'c17b0e20-d96d-4fa1-b05c-bc97c04b4ac5';

async function wixApi ( method, path, body ) {
  let key;
  try { key = await getSecret( 'api' ); }
  catch { throw new Error( 'Wix API key secret "api" is unavailable' ); }
  if ( typeof key !== 'string' || !key.trim() ) {
    throw new Error( 'Wix API key secret "api" is empty' );
  }
  const opts = { method, headers: { Authorization: key, 'Content-Type': 'application/json', 'wix-site-id': WIX_SITE } };
  if ( body ) opts.body = JSON.stringify( body );
  const response = await fetch( WIX_API + path, opts );
  const text = await response.text();
  if ( !response.ok ) throw new Error( 'Catalog V3 request failed: ' + response.status );
  return JSON.parse( text );
}

/** Scan the complete catalog, including products that are not visible. */
export async function listProducts ( { limit = 100 } = {} ) {
  const products = [];
  const seen = new Set();
  let cursor;
  do {
    const cursorPaging = cursor ? { limit, cursor } : { limit };
    const data = await wixApi( 'POST', '/stores/v3/products/search', { search: { cursorPaging } } );
    if ( !Array.isArray( data.products ) ) throw new Error( 'Catalog product list is missing' );
    products.push( ...data.products );
    if ( !data.pagingMetadata?.hasNext ) break;
    cursor = data.pagingMetadata.cursors?.next;
    if ( !cursor || seen.has( cursor ) ) throw new Error( 'Catalog pagination cursor is missing or repeated' );
    seen.add( cursor );
  } while ( cursor );
  return products;
}

/** Get Product, unlike Search, returns the complete variant array. */
export async function getProductWithVariants ( productId ) {
  // Include cost data and choice display images so rewriting arrays preserves them.
  const data = await wixApi( 'GET', '/stores/v3/products/' + encodeURIComponent( productId ) +
    '?fields=MERCHANT_DATA&fields=PRODUCT_CHOICES_DISPLAY_IMAGE' );
  const product = data.product;
  if ( !product || product.id !== productId || !Array.isArray( product.variantsInfo?.variants ) ) {
    throw new Error( 'Complete Catalog V3 product variants are unavailable' );
  }
  return product;
}

/**
 * Change only SKUs. Catalog V3 replaces arrays, so preserve the full variants,
 * option choices, identities and metadata with the freshly fetched revision.
 * skuFor receives (variant, index, completeVariants).
 */
export async function setVariantSkus ( productId, skuFor, dryRun = true ) {
  dryRun = dryRun !== false;
  const product = await getProductWithVariants( productId );
  const existing = product.variantsInfo.variants;
  let changed = 0;
  const variants = existing.map( ( variant, index ) => {
    const next = skuFor( variant, index, existing );
    const sku = next === null || next === undefined ? variant.sku : next;
    if ( sku !== variant.sku ) changed++;
    return { ...variant, sku };
  } );
  const preview = variants.map( ( variant, index ) => ( {
    id: variant.id, oldSku: existing[ index ].sku || null, newSku: variant.sku,
  } ) );
  if ( dryRun || !changed ) return { productId, changed, variants: preview, dryRun };
  if ( !product.revision || variants.some( variant => !variant.id || !variant.price?.actualPrice ) ) {
    throw new Error( 'Cannot update SKUs without the revision, variant IDs and prices' );
  }
  if ( !Array.isArray( product.options ) ) throw new Error( 'Complete product options are unavailable' );
  await wixApi( 'PATCH', '/stores/v3/products/' + encodeURIComponent( productId ), {
    product: { id: productId, revision: product.revision, options: product.options, variantsInfo: { variants } },
  } );
  return { productId, changed, variants: preview, dryRun: false };
}

export function normalizeProduct ( product ) {
  return { id: product.id, name: product.name || '', variantCount: product.variantSummary?.variantCount || 1 };
}
