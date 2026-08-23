/**
 * My Orders Page — WECARE.DIGITAL
 *
 * Displays order history using the normalized short format.
 * Shows: #A3F7B2C1 · 22 Feb 2026 instead of the full WD-ORD string.
 */

import { getMemberOrdersPaged } from 'backend/orderId.web';
import { currentMember } from 'wix-members-frontend';

const PAGE_SIZE = 20;

let currentPage = 0;
let hasMore = false;
let allOrders = [];
let currentMemberId = null;

function mapOrdersToRepeaterData(orders) {
  return orders.map((o, index) => ({
    _id: o._id,
    slNo: index + 1,
    // Use normalized display fields from enriched backend response
    orderId: o.displayLabel || o.shortId || o.orderId || '',
    shortId: o.shortId || '',
    fullOrderId: o.orderId || '',
    dateTime: o.friendlyDateTime || '',
    products: o.productsSummary || '',
    amount: o.totalAmount || '',
  }));
}

function bindOrdersToRepeater() {
  if (!allOrders || allOrders.length === 0) {
    $w('#ordersRepeater').data = [];
    $w('#ordersRepeater').hide();
    return;
  }

  const repeaterData = mapOrdersToRepeaterData(allOrders);

  $w('#ordersRepeater').data = repeaterData;
  $w('#ordersRepeater').onItemReady(($item, itemData) => {
    $item('#slNoText').text = String(itemData.slNo);
    $item('#shopIdText').text = itemData.orderId;
    $item('#dateText').text = itemData.dateTime;
    $item('#productText').text = itemData.products;
    $item('#amountText').text = itemData.amount;
  });

  $w('#ordersRepeater').show();
}

async function loadPage(pageIndex) {
  if (!currentMemberId) return;

  $w('#loadMoreButton').disable();
  $w('#emptyStateText').text = pageIndex === 0
    ? 'Loading your orders...'
    : 'Loading more orders...';
  $w('#emptyStateText').show();

  try {
    const res = await getMemberOrdersPaged({
      memberId: currentMemberId,
      page: pageIndex,
      pageSize: PAGE_SIZE
    });

    if (pageIndex === 0) {
      allOrders = res.items || [];
    } else {
      allOrders = allOrders.concat(res.items || []);
    }

    hasMore = !!res.hasMore;
    currentPage = res.page;

    if (!allOrders || allOrders.length === 0) {
      $w('#ordersRepeater').hide();
      $w('#emptyStateText').text =
        "You haven't placed any orders yet. Once you place an order, it will appear here.";
      $w('#loadMoreButton').hide();
      return;
    }

    bindOrdersToRepeater();
    $w('#emptyStateText').hide();

    if (hasMore) {
      $w('#loadMoreButton').show();
      $w('#loadMoreButton').enable();
    } else {
      $w('#loadMoreButton').hide();
    }
  } catch (err) {
    console.error('Error loading orders:', err);
    $w('#ordersRepeater').hide();
    $w('#emptyStateText').text =
      'We could not load your orders right now. Please refresh the page.';
    $w('#loadMoreButton').hide();
  }
}

$w.onReady(async function () {
  $w('#ordersContainer').expand();
  $w('#ordersRepeater').hide();
  $w('#loadMoreButton').hide();
  $w('#emptyStateText').text = 'Loading your orders...';
  $w('#emptyStateText').show();

  try {
    const member = await currentMember.getMember();
    currentMemberId = member?._id || null;
  } catch (err) {
    console.error('currentMember error:', err);
  }

  if (!currentMemberId) {
    $w('#emptyStateText').text = 'Please log in to view your orders.';
    return;
  }

  await loadPage(0);

  $w('#loadMoreButton').onClick(async () => {
    if (!hasMore) {
      $w('#loadMoreButton').hide();
      return;
    }
    await loadPage(currentPage + 1);
  });
});
