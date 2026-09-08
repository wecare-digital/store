// Administrator-only SKU assignment and prefix updates for Catalog V3.
// Collision checks cover the catalog snapshot and this run's pending values.
// Run one batch at a time: Wix does not provide a cross-product SKU lock here.

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

function makeUniqueSkus ( used, variants, overwrite, prefix ) {
  for ( let attempt = 0; attempt < 50; attempt++ ) {
    const base = ( prefix ? prefix + '-' : '' ) + makeRandomSku();
    const candidates = variants.map( ( variant, index ) => {
      if ( ( variant.sku || '' ).trim() && !overwrite ) return null;
      return variants.length === 1 ? base : base + '-' + String( index + 1 ).padStart( 2, '0' );
    } );
    if ( candidates.every( sku => sku === null || !used.has( sku.toUpperCase() ) ) ) {
      candidates.filter( Boolean ).forEach( sku => used.add( sku.toUpperCase() ) );
      return candidates;
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
    dryRun = dryRun !== false;
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
        let candidates;
        const result = await setVariantSkus( p.id, ( variant, i, variants ) => {
          const current = ( variant.sku || '' ).trim();
          if ( current && !overwrite ) return null;
          if ( !candidates ) {
            for ( const v of variants ) {
              if ( ( v.sku || '' ).trim() ) usedSkus.add( v.sku.trim().toUpperCase() );
            }
            candidates = makeUniqueSkus( usedSkus, variants, overwrite, cleanPrefix );
          }
          return candidates[ i ];
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
    dryRun = dryRun !== false;
    const products = ( await listProducts() ).map( normalizeProduct );
    const usedSkus = await collectExistingSkus( products );
    const cleanOld = ( oldPrefix || '' ).trim().toUpperCase();
    const cleanNew = ( newPrefix || 'WD' ).trim().toUpperCase();

    const updated = [];
    const skipped = [];
    const errors = [];

    for ( const p of products ) {
      try {
        const result = await setVariantSkus( p.id, ( variant, index, variants ) => {
          if ( index === 0 ) {
            for ( const v of variants ) {
              if ( ( v.sku || '' ).trim() ) usedSkus.add( v.sku.trim().toUpperCase() );
            }
          }
          const current = ( variant.sku || '' ).trim();
          if ( !current ) return null;
          const upper = current.toUpperCase();
          if ( cleanOld && upper !== cleanOld && !upper.startsWith( cleanOld + '-' ) ) return null;

          let base = current;
          if ( cleanOld && upper.startsWith( cleanOld ) ) {
            base = current.slice( cleanOld.length );
            if ( base.startsWith( '-' ) ) base = base.slice( 1 );
          }
          const next = cleanNew ? cleanNew + '-' + base : base;
          if ( next.toUpperCase() === upper ) return null;
          if ( usedSkus.has( next.toUpperCase() ) ) throw new Error( 'SKU collision: ' + next );
          usedSkus.add( next.toUpperCase() );
          return next;
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
