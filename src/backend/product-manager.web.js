/**
 * Product Manager — WECARE.DIGITAL
 *
 * Web module for product CRUD operations.
 * Dynamically imported by http-functions.js for the product endpoints:
 *   POST /_functions/create-product
 *   POST /_functions/bulk-create-products
 *   POST /_functions/update-product
 *   POST /_functions/delete-product
 *   GET  /_functions/sample-products
 *
 * Uses wix-stores-backend for all product mutations.
 * All functions are Admin-only.
 *
 * Docs: https://dev.wix.com/docs/velo/apis/wix-web-module
 */

import { Permissions, webMethod } from 'wix-web-module';
import wixStoresBackend from 'wix-stores-backend';
import { getProductWithVariants, updateProduct as v3UpdateProduct } from 'backend/catalog-v3.js';

// ---------------------------------------------------------------------------
// createProduct — create a single product
// ---------------------------------------------------------------------------

export const createProduct = webMethod(
  Permissions.Admin,
  async (productData) => {
    try {
      if (!productData || !productData.name) {
        return { success: false, error: 'product name is required' };
      }
      const product = await wixStoresBackend.createProduct(productData);
      return { success: true, product };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  }
);

// ---------------------------------------------------------------------------
// bulkCreateProducts — create multiple products
// ---------------------------------------------------------------------------

export const bulkCreateProducts = webMethod(
  Permissions.Admin,
  async (productsArray) => {
    try {
      if (!Array.isArray(productsArray) || productsArray.length === 0) {
        return { success: false, error: 'non-empty products array is required' };
      }

      const results = [];
      const errors = [];

      for (const data of productsArray) {
        try {
          if (!data.name) {
            errors.push({ data, error: 'missing product name' });
            continue;
          }
          const product = await wixStoresBackend.createProduct(data);
          results.push(product);
        } catch (err) {
          errors.push({ data, error: err?.message || String(err) });
        }
      }

      return {
        success: errors.length === 0,
        created: results,
        errors,
        summary: `${results.length} created, ${errors.length} failed`,
      };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  }
);

// ---------------------------------------------------------------------------
// updateProduct — update fields on an existing product
// ---------------------------------------------------------------------------

export const updateProduct = webMethod(
  Permissions.Admin,
  async (productId, updates) => {
    try {
      if (!productId) {
        return { success: false, error: 'productId is required' };
      }
      // Catalog V3 write path. wixStoresBackend.updateProductFields is a V1
      // API and does nothing on this site. V3 needs the current revision for
      // optimistic locking, so read before write.
      const current = await getProductWithVariants(productId);
      const product = await v3UpdateProduct(productId, current.revision, updates || {});
      return { success: true, product };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  }
);

// ---------------------------------------------------------------------------
// deleteProduct — remove a product by ID
// ---------------------------------------------------------------------------

export const deleteProduct = webMethod(
  Permissions.Admin,
  async (productId) => {
    try {
      if (!productId) {
        return { success: false, error: 'productId is required' };
      }
      await wixStoresBackend.deleteProduct(productId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  }
);

// ---------------------------------------------------------------------------
// getSampleProducts — returns empty (sample templates removed)
// ---------------------------------------------------------------------------

export const getSampleProducts = webMethod(
  Permissions.Admin,
  async () => {
    return {
      success: true,
      products: [],
      count: 0,
    };
  }
);
