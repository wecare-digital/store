/**
 * Thank You Page — WECARE.DIGITAL
 *
 * Generates WD-ORD number and displays order confirmation.
 * Shows the normalized short format (#A3F7B2C1 · 22 Feb 2026)
 * with full ID available on hover/expand.
 */

import { createOrGetOrderId, parseOrderId } from 'backend/orderId.web';
import { currentMember } from 'wix-members-frontend';

// Build amount text from official Velo fields
function buildAmountText(order) {
  if (!order || !order.totals) return '';

  const currency = typeof order.currency === 'string'
    ? order.currency.trim()
    : '';

  const totals = order.totals || {};
  const rawTotal = totals.total;
  let base = '';

  if (typeof rawTotal === 'number' && !isNaN(rawTotal)) {
    base = rawTotal.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  } else if (typeof rawTotal === 'string') {
    base = rawTotal.trim();
  } else if (rawTotal && typeof rawTotal === 'object') {
    if (typeof rawTotal.formattedAmount === 'string') {
      base = rawTotal.formattedAmount.trim();
    } else if (typeof rawTotal.amount === 'number' && !isNaN(rawTotal.amount)) {
      base = rawTotal.amount.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else if (typeof rawTotal.amount === 'string') {
      base = rawTotal.amount.trim();
    }
  }

  if (!base) return '';
  if (currency && !base.includes(currency)) {
    return `${base} ${currency}`;
  }
  return base;
}

$w.onReady(async function () {
  $w('#orderContainer').expand();

  const thankYouWidget = $w('#thankYouPage1');

  let order;
  try {
    order = await thankYouWidget.getOrder();
  } catch (err) {
    console.error('getOrder error:', err);
    $w('#orderIdText').text = 'Order is being processed.';
    return;
  }

  if (!order || !order._id) {
    $w('#orderIdText').text = 'Order is being processed.';
    return;
  }

  // Member
  let memberId = null;
  try {
    const member = await currentMember.getMember();
    memberId = member?._id || null;
  } catch (e) {
    console.warn('No member found at checkout');
  }

  const wixOrderId = order._id;
  const orderNumber = order.number ? String(order.number) : null;

  let buyerEmail = null;
  let buyerPhone = null;
  if (order.buyerInfo) {
    buyerEmail = order.buyerInfo.email || null;
    buyerPhone = order.buyerInfo.phone || null;
  }

  // Products summary
  let productsSummary = '';
  if (Array.isArray(order.lineItems)) {
    productsSummary = order.lineItems
      .map(li => li.name)
      .filter(Boolean)
      .join(', ');
  }

  // Order date
  const orderDateObj = order._createdDate || order._dateCreated || new Date();

  // Amount
  const amountText = buildAmountText(order);
  const currency = typeof order.currency === 'string'
    ? order.currency.trim()
    : null;

  // Generate WD-ORD
  let fullOrderId;
  try {
    fullOrderId = await createOrGetOrderId({
      wixOrderId,
      memberId,
      orderNumber,
      buyerEmail,
      buyerPhone,
      totalAmount: amountText,
      currency,
      productsSummary,
      orderDate: orderDateObj
    });
  } catch (err) {
    console.error('createOrGetOrderId error:', err);
    $w('#orderIdText').text = 'Order is being processed.';
    return;
  }

  // Parse into display parts
  let parsed;
  try {
    parsed = await parseOrderId(fullOrderId);
  } catch {
    parsed = { shortId: '', friendlyDate: '', friendlyTime: '', displayLabel: fullOrderId, fullId: fullOrderId };
  }

  // Display — normalized format
  $w('#orderIdText').text = parsed.displayLabel;
  $w('#orderDateText').text = parsed.friendlyDateTime || '';
  $w('#orderProductsText').text = productsSummary || '';
  $w('#orderAmountText').text = amountText || 'Amount not available';

  // Show full ID in a secondary element if it exists
  try { $w('#orderIdFull').text = fullOrderId; } catch {}
});
