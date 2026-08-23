/**
 * Member Orders — WECARE.DIGITAL
 *
 * Web module for logged-in members to fetch their own orders.
 * Used by the "My Orders" Wix Form / page to display order history
 * using only the WD custom order ID (Wix native order number is hidden).
 *
 * Flow:
 *   1. Logged-in user opens "My Orders" page/form
 *   2. Page code calls getMyOrders() with the current member's ID
 *   3. This module queries OrderIds by memberId
 *   4. For each match, fetches the full order from Stores/Orders
 *   5. Returns enriched orders with WD number as the primary ID
 *
 * The Wix native order number (order.number) is stripped from the response
 * so it never reaches the frontend.
 *
 * Docs: https://dev.wix.com/docs/velo/apis/wix-web-module
 */

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import {
  extractShortId,
  buildDisplayLabel,
} from 'backend/orderId-helpers';

const ORDER_IDS_COLLECTION = 'OrderIds';
const ORDERS_COLLECTION = 'Stores/Orders';

/**
 * Strip Wix native order number from an order object.
 * We only expose the WD custom order ID.
 */
function stripNativeOrderNumber(order) {
  if (!order) return order;
  const cleaned = { ...order };
  delete cleaned.number; // Wix native sequential number
  return cleaned;
}

/**
 * Get all orders for the currently logged-in member.
 * Returns orders with WD custom order ID as the primary identifier.
 * Wix native order number is stripped.
 *
 * @param {string} memberId - The Wix member ID (from currentMember.getMember())
 * @param {{ limit?: number, offset?: number }} options
 * @returns {{ orders: Array, totalCount: number }}
 */
export const getMyOrders = webMethod(
  Permissions.SiteMember,
  async (memberId, { limit = 20, offset = 0 } = {}) => {
    if (!memberId) throw new Error('memberId is required');

    // Query OrderIds by memberId
    const mappings = await wixData.query(ORDER_IDS_COLLECTION)
      .eq('memberId', memberId)
      .descending('_createdDate')
      .limit(limit)
      .skip(offset)
      .find({ suppressAuth: true });

    if (mappings.items.length === 0) {
      return { orders: [], totalCount: mappings.totalCount };
    }

    // Fetch full order details for each mapping
    const orders = [];
    for (const mapping of mappings.items) {
      try {
        const order = await wixData.get(ORDERS_COLLECTION, mapping.wixOrderId, { suppressAuth: true });
        if (order) {
          const cleaned = stripNativeOrderNumber(order);
          cleaned.customOrderNumber = mapping.orderId;
          cleaned.orderDisplayId = mapping.orderId; // Primary display ID
          cleaned.shortId = extractShortId(mapping.orderId);
          cleaned.displayLabel = buildDisplayLabel(mapping.orderId);
          orders.push(cleaned);
        }
      } catch {
        // Order may have been deleted — still show the mapping
        orders.push({
          _id: mapping.wixOrderId,
          customOrderNumber: mapping.orderId,
          orderDisplayId: mapping.orderId,
          shortId: extractShortId(mapping.orderId),
          displayLabel: buildDisplayLabel(mapping.orderId),
          _status: 'order_not_found',
        });
      }
    }

    return { orders, totalCount: mappings.totalCount };
  }
);

/**
 * Get a single order by WD custom order number.
 * Only returns the order if it belongs to the requesting member.
 * Wix native order number is stripped.
 *
 * @param {string} memberId - The Wix member ID
 * @param {string} customOrderNumber - e.g. "WD-ORD - A3F7B2C1 - 22-02-2026 - 17:43:01 - IST"
 * @returns {object|null}
 */
export const getMyOrderByNumber = webMethod(
  Permissions.SiteMember,
  async (memberId, customOrderNumber) => {
    if (!memberId || !customOrderNumber) return null;

    const mapping = await wixData.query(ORDER_IDS_COLLECTION)
      .eq('orderId', customOrderNumber)
      .eq('memberId', memberId)
      .limit(1)
      .find({ suppressAuth: true });

    if (mapping.items.length === 0) return null;

    try {
      const order = await wixData.get(ORDERS_COLLECTION, mapping.items[0].wixOrderId, { suppressAuth: true });
      if (!order) return null;

      const cleaned = stripNativeOrderNumber(order);
      cleaned.customOrderNumber = customOrderNumber;
      cleaned.orderDisplayId = customOrderNumber;
      cleaned.shortId = extractShortId(customOrderNumber);
      cleaned.displayLabel = buildDisplayLabel(customOrderNumber);
      return cleaned;
    } catch {
      return null;
    }
  }
);

/**
 * Get order count for a member (for badge/notification display).
 *
 * @param {string} memberId
 * @returns {number}
 */
export const getMyOrderCount = webMethod(
  Permissions.SiteMember,
  async (memberId) => {
    if (!memberId) return 0;
    return wixData.query(ORDER_IDS_COLLECTION)
      .eq('memberId', memberId)
      .count({ suppressAuth: true });
  }
);

/**
 * Get just the WD-ORD IDs for a member (for dropdown/select).
 * Queries by buyerEmail because Wix member._id differs from
 * the buyerInfo.id stored in OrderIds.
 * Falls back to Stores/Orders if OrderIds has no email matches.
 *
 * @param {string} email - The member's login email
 * @returns {Array<{ value: string, label: string }>}
 */
export const getMyOrderIdList = webMethod(
  Permissions.SiteMember,
  async (email) => {
    if (!email) return [];

    // Primary: query OrderIds by buyerEmail
    let all = [];
    try {
      let res = await wixData.query(ORDER_IDS_COLLECTION)
        .eq('buyerEmail', email)
        .descending('_createdDate')
        .limit(50)
        .find({ suppressAuth: true });
      all = all.concat(res.items);
      while (res.hasNext()) {
        res = await res.next();
        all = all.concat(res.items);
      }
    } catch (e) {
      console.error('[getMyOrderIdList] OrderIds query failed:', e?.message);
    }

    if (all.length > 0) {
      return all.map(item => ({
        value: item.orderId,
        label: buildDisplayLabel(item.orderId),
        shortId: extractShortId(item.orderId),
      }));
    }

    // Fallback: query Stores/Orders by buyerEmail, read customField
    try {
      const ordersRes = await wixData.query(ORDERS_COLLECTION)
        .eq('buyerEmail', email)
        .descending('_dateCreated')
        .limit(50)
        .find({ suppressAuth: true });

      const results = [];
      for (const order of ordersRes.items) {
        const wdId = order.customField?.value;
        if (wdId && wdId.startsWith('WD-ORD')) {
          results.push({
            value: wdId,
            label: buildDisplayLabel(wdId),
            shortId: extractShortId(wdId),
          });
        }
      }
      return results;
    } catch (e) {
      console.error('[getMyOrderIdList] Stores/Orders fallback failed:', e?.message);
      return [];
    }
  }
);

/**
 * Submit a support/return/exchange request for an order.
 * Writes to the "OrderRequests" Wix collection.
 *
 * Collection schema (create in Wix Editor → CMS):
 *   - orderId (Text): WD-ORD number
 *   - memberId (Text): Wix member ID
 *   - memberEmail (Text): buyer email
 *   - requestType (Text): return | exchange | support | other
 *   - subject (Text): short subject
 *   - description (Text): detailed description
 *   - status (Text): pending | in_progress | resolved | closed
 *
 * @param {{ orderId: string, memberId: string, memberEmail: string, requestType: string, subject: string, description: string }} payload
 * @returns {{ success: boolean, requestId: string }}
 */
export const submitOrderRequest = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const { orderId, memberId, memberEmail, requestType, subject, description } = payload || {};
    if (!orderId || !memberId) throw new Error('orderId and memberId are required');
    if (!requestType) throw new Error('requestType is required');
    if (!subject || !subject.trim()) throw new Error('subject is required');

    // Verify this order belongs to the member
    const check = await wixData.query(ORDER_IDS_COLLECTION)
      .eq('orderId', orderId)
      .eq('memberId', memberId)
      .limit(1)
      .find({ suppressAuth: true });

    if (check.items.length === 0) {
      throw new Error('Order not found or does not belong to you');
    }

    const item = await wixData.insert('OrderRequests', {
      orderId,
      memberId,
      memberEmail: memberEmail || '',
      requestType: requestType || 'support',
      subject: (subject || '').trim(),
      description: (description || '').trim(),
      status: 'pending',
    }, { suppressAuth: true });

    return { success: true, requestId: item._id };
  }
);
