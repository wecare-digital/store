// backend/sku-batch.web.js
//
// Batch SKU assignment for the Wix Stores catalog.
//
// Rewritten for Catalog V3. The previous version used wixData.query
// ("Stores/Products" / "Stores/Variants") and wixStoresBackend
// .updateVariantData / .updateProductFields — all V1 surfaces that read and
// write nothing on this site. It reported success while doing nothing.
//
// Two V3 facts shape this file:
//   1. There is no product-level SKU. Every product has at least one variant,
//      and the SKU lives on the variant. Single-variant products are the
//      normal case, so "the product SKU" means "its only variant's SKU".
//   2. Array fields do not merge. Writing variants means resending the whole
//      array plus `options`. setVariantSkus() in catalog-v3.js handles that.

import { webMethod, Permissions } from 'wix-web-module';
import { listProducts, normalizeProduct, setVariantSkus, getProductWithVariants } from 'backend/catalog-v3.js';

// Same charset as orderId/events — no 0/O/1/I
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SKU_LENGTH = 8;

function makeRandomSku () {
  let sku = '';
  for ( let i = 0; i < SKU_LENGTH; i++ ) {
    sku += CHARSET.charAt( Math.floor( Math.random() * CHARSET.length ) );
  }
  return sku;
}

function makeUniqueSku ( used ) {
  for ( let attempt = 0; attempt < 50; attempt++ ) {
    const sku = makeRandomSku();
    if ( !used.has( sku.toUpperCase() ) ) {
      used.add( sku.toUpperCase() );
      return sku;
    }
  }
  throw new Error( 'Failed to generate unique SKU after 50 attempts' );
}

/** Every SKU currently in the catalog, for collision avoidance. */
async function collectExistingSkus ( products ) {
  const used = new Set();
  for ( const p of products ) {
    const full = await getProductWithVariants( p.id );
    for ( const v of full.variantsInfo?.variants || [] ) {
      if ( v.sku && v.sku.trim() ) used.add( v.sku.trim().toUpperCase() );
    }
  }
  return used;
}

/**
 * Assign SKUs across the catalog.
 *
 * Single-variant products get BASE. Multi-variant products get BASE-01,
 * BASE-02, … in the catalog's own variant order.
 *
 * Options:
 *   overwrite (bool)   false (default): only fill empty SKUs. true: replace all.
 *   dryRun    (bool)   true (default): preview without writing.
 *   prefix    (string) e.g. "WD" -> "WD-ABCD1234"
 */
export const assignSkusToAllProducts = webMethod(
  Permissions.Admin,
  async ( { overwrite = false, dryRun = true, prefix = 'WD' } = {} ) => {
    const raw = await listProducts();
    const products = raw.map( normalizeProduct );
    const usedSkus = await collectExistingSkus( products );
    const cleanPrefix = ( prefix || '' ).trim().toUpperCase();

    const updated = [];
    const skipped = [];
    const errors = [];
    let variantsUpdated = 0;

    for ( const p of products ) {
      try {
        let base = makeUniqueSku( usedSkus );
        if ( cleanPrefix ) {
          base = cleanPrefix + '-' + base;
          usedSkus.add( base.toUpperCase() );
        }

        const result = await setVariantSkus( p.id, ( variant, i ) => {
          const current = ( variant.sku || '' ).trim();
          if ( current && !overwrite ) return null;          // leave it alone
          if ( p.variantCount === 1 ) return base;
          const numbered = base + '-' + String( i + 1 ).padStart( 2, '0' );
          usedSkus.add( numbered.toUpperCase() );
          return numbered;
        }, dryRun );

        if ( result.changed > 0 ) {
          variantsUpdated += result.changed;
          updated.push( { id: p.id, name: p.name, changed: result.changed, variants: result.variants } );
        } else {
          skipped.push( { id: p.id, name: p.name, reason: 'all variants already have SKUs' } );
        }
      } catch ( err ) {
        errors.push( { id: p.id, name: p.name, error: err?.message || String( err ) } );
      }
    }

    return {
      dryRun,
      catalogVersion: 'V3',
      prefix: cleanPrefix || null,
      totalProducts: products.length,
      updated,
      skipped,
      errors,
      variantsUpdated,
      summary: `${ updated.length } products touched, ${ skipped.length } skipped, ${ errors.length } errors, ` +
        `${ variantsUpdated } variant SKUs${ dryRun ? ' (DRY RUN — nothing written)' : '' }`,
    };
  }
);

/**
 * Change the prefix on every variant SKU.
 * Body: { oldPrefix: 'OLD', newPrefix: 'WD', dryRun: true }
 */
export const reprefixSKUs = webMethod(
  Permissions.Admin,
  async ( { oldPrefix = '', newPrefix = 'WD', dryRun = true } = {} ) => {
    const products = ( await listProducts() ).map( normalizeProduct );
    const cleanOld = ( oldPrefix || '' ).trim().toUpperCase();
    const cleanNew = ( newPrefix || 'WD' ).trim().toUpperCase();

    const updated = [];
    const skipped = [];
    const errors = [];

    for ( const p of products ) {
      try {
        const result = await setVariantSkus( p.id, ( variant ) => {
          const current = ( variant.sku || '' ).trim();
          if ( !current ) return null;
          const upper = current.toUpperCase();
          if ( cleanOld && !upper.startsWith( cleanOld ) ) return null;

          let base = current;
          if ( cleanOld && upper.startsWith( cleanOld ) ) {
            base = current.slice( cleanOld.length );
            if ( base.startsWith( '-' ) ) base = base.slice( 1 );
          }
          const next = cleanNew ? cleanNew + '-' + base : base;
          return next.toUpperCase() === upper ? null : next;
        }, dryRun );

        if ( result.changed > 0 ) updated.push( { id: p.id, name: p.name, variants: result.variants } );
        else skipped.push( { id: p.id, name: p.name, reason: 'no matching prefix or already correct' } );
      } catch ( err ) {
        errors.push( { id: p.id, name: p.name, error: err?.message || String( err ) } );
      }
    }

    return {
      dryRun,
      catalogVersion: 'V3',
      oldPrefix: cleanOld || null,
      newPrefix: cleanNew,
      totalProducts: products.length,
      updated,
      skipped,
      errors,
      summary: `${ updated.length } re-prefixed, ${ skipped.length } skipped, ${ errors.length } errors${ dryRun ? ' (DRY RUN)' : '' }`,
    };
  }
);

/** Assign SKUs only where they're missing. */
export const assignMissingSKUs = webMethod(
  Permissions.Admin,
  async ( { prefix = 'WD', dryRun = true } = {} ) =>
    assignSkusToAllProducts( { overwrite: false, dryRun, prefix } )
);
