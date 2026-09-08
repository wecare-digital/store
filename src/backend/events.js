import { createOrGetOrderId } from 'backend/orderId-helpers';
import { notifyWhatsAppOrderActivity } from 'backend/whatsapp-order-notifications';

function eventOrder(event) {
  const raw = event?.data?.order || event?.entity || event?.actionEvent?.body?.order || null;
  if (raw && !raw._id && raw.id) return { ...raw, _id: raw.id };
  return raw;
}

function eventOrderId(event) {
  return event?.data?.orderId ||
    event?.actionEvent?.body?.orderId ||
    event?.entityId ||
    event?.data?.order?._id ||
    event?.data?.order?.id ||
    event?.entity?._id ||
    event?.entity?.id ||
    null;
}

/** Trusted Wix approval event. Custom Order ID creation remains authoritative. */
export async function wixEcom_onOrderApproved(event) {
  const order = eventOrder(event);
  if (!order?._id) throw new Error('Approved order event is missing its order.');

  const orderIdRecord = await createOrGetOrderId(order);
  await notifyWhatsAppOrderActivity({
    activity: 'order-approved',
    order,
    orderId: order._id,
  }).catch(() => undefined);
  return orderIdRecord;
}

/** Wix eCommerce Order Payment Status Updated → WhatsApp payment utility template. */
export async function wixEcom_onOrderPaymentStatusUpdated(event) {
  const order = eventOrder(event);
  const status = String(order?.paymentStatus || event?.data?.paymentStatus || '').toUpperCase();
  if (!['PAID', 'PARTIALLY_PAID'].includes(status)) return { sent: false, reason: 'payment-status-not-notifiable' };
  return notifyWhatsAppOrderActivity({
    activity: 'payment-updated',
    order,
    orderId: eventOrderId(event),
  }).catch(() => undefined);
}

/** Wix eCommerce fulfillment event → WhatsApp delivery/fulfillment utility template. */
export async function wixEcom_onOrderFulfilled(event) {
  return notifyWhatsAppOrderActivity({
    activity: 'order-fulfilled',
    order: eventOrder(event),
    orderId: eventOrderId(event),
  }).catch(() => undefined);
}

/** Completed Wix order refund → WhatsApp refund utility template. */
export async function wixEcom_onOrderTransactionsRefundCompleted(event) {
  return notifyWhatsAppOrderActivity({
    activity: 'refund-completed',
    order: eventOrder(event),
    orderId: eventOrderId(event),
  }).catch(() => undefined);
}
