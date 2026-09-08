/**
 * Custom Order ID Web Module — WECARE.DIGITAL
 *
 * Web method wrappers for frontend → backend calls.
 * Delegates to orderId-helpers.js for the actual logic.
 *
 * Exports member-owned custom ID lookup/creation and format helpers so pages can
 * display the normalized short/friendly format.
 *
 * Docs: https://dev.wix.com/docs/velo/apis/wix-web-module
 */

import { Permissions, webMethod } from 'wix-web-module';
import { orders } from 'wix-ecom-backend';
import {
  createOrGetOrderId as _createOrGetOrderId,
  getMemberOrdersPaged as _getMemberOrdersPaged,
  extractShortId,
  extractFriendlyDate,
  extractFriendlyTime,
  buildDisplayLabel,
  buildFriendlyDateTime,
  requireMemberId,
} from 'backend/orderId-helpers';

/**
 * Create or fetch ORDER ID for order (called from Thank You page / frontend).
 */
export const createOrGetOrderId = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const memberId = await requireMemberId();
    const wixOrderId = typeof payload?.wixOrderId === 'string' ? payload.wixOrderId.trim() : '';
    if (!wixOrderId) throw new Error('A Wix order ID is required.');
    // No elevation: Wix checks caller access; also verify ownership explicitly.
    const order = await orders.getOrder(wixOrderId);
    if (order?._id !== wixOrderId || order?.buyerInfo?.memberId !== memberId) {
      throw new Error('Order not found or not owned by this member.');
    }
    if (order.status !== 'APPROVED') throw new Error('Order is awaiting approval.');
    return _createOrGetOrderId(order);
  }
);

/**
 * Paged list of orders for a member (called from My Orders page / frontend).
 * Each item now includes shortId and displayLabel for normalized display.
 */
export const getMemberOrdersPaged = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const result = await _getMemberOrdersPaged(payload);
    // Enrich each item with display-friendly fields
    if (result.items && result.items.length > 0) {
      result.items = result.items.map(item => ({
        ...item,
        shortId: extractShortId(item.orderId),
        displayLabel: buildDisplayLabel(item.orderId),
        friendlyDateTime: buildFriendlyDateTime(item.orderId),
        friendlyDate: extractFriendlyDate(item.orderId),
        friendlyTime: extractFriendlyTime(item.orderId),
      }));
    }
    return result;
  }
);

/**
 * Parse a full WD-ORD string into display parts.
 * Called from frontend pages that need to format an order ID.
 *
 * @param {string} wdOrd - Full WD-ORD string
 * @returns {{ shortId, friendlyDate, friendlyTime, displayLabel, fullId }}
 */
export const parseOrderId = webMethod(
  Permissions.Anyone,
  async (wdOrd) => ({
    fullId: wdOrd,
    shortId: extractShortId(wdOrd),
    friendlyDateTime: buildFriendlyDateTime(wdOrd),
    friendlyDate: extractFriendlyDate(wdOrd),
    friendlyTime: extractFriendlyTime(wdOrd),
    displayLabel: buildDisplayLabel(wdOrd),
  })
);
