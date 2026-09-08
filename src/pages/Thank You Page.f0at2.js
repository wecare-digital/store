import { createOrGetOrderId, parseOrderId } from 'backend/orderId.web';
import { currentMember } from 'wix-members-frontend';

$w.onReady(async function () {
  $w('#orderContainer').expand();
  // Never hide or replace the native Wix confirmation widget.
  let order;
  try { order = await $w('#thankYouPage1').getOrder(); }
  catch { $w('#orderIdText').text = 'Order is being processed.'; return; }
  $w('#orderIdText').text = order?.number != null ? `Order #${order.number}` : 'Order is being processed.';
  if (!order?._id) return;
  let member;
  try { member = await currentMember.getMember(); } catch { return; }
  // Guests retain native confirmation. The trusted event creates their custom ID.
  if (!member?._id) return;
  try {
    const fullId = await createOrGetOrderId({ wixOrderId: order._id });
    const parsed = await parseOrderId(fullId);
    $w('#orderIdText').text = parsed.displayLabel;
    $w('#orderDateText').text = parsed.friendlyDateTime || '';
    try { $w('#orderIdFull').text = fullId; } catch { /* Optional element. */ }
  } catch {
    // Pending approval or unavailable CMS must not break native confirmation.
    console.warn('[order-id] Custom ID is not available yet.');
  }
});
