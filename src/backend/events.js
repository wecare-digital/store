import { createOrGetOrderId } from 'backend/orderId-helpers';

/** Trusted Wix approval event. No messages or writes to Wix app collections. */
export async function wixEcom_onOrderApproved(event) {
  // Velo documents data.order; entity also supports the existing event envelope.
  const order = event?.data?.order || event?.entity;
  if (!order?._id) throw new Error('Approved order event is missing its order.');
  // Failures remain visible to the Wix event runtime.
  return createOrGetOrderId(order);
}
