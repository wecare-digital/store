import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(new URL('../src/backend/whatsapp-order-notifications.js', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/backend/events.js', import.meta.url), 'utf8');

test('WhatsApp integration is server-only and uses the current Meta Graph API message endpoint', () => {
  assert.match(helper, /const GRAPH_VERSION = 'v26\.0'/);
  assert.match(helper, /https:\/\/graph\.facebook\.com\/\$\{GRAPH_VERSION\}/);
  assert.match(helper, /\/messages/);
  assert.match(helper, /WHATSAPP_ACCESS_TOKEN/);
  assert.match(helper, /WHATSAPP_PHONE_NUMBER_ID/);
  assert.match(helper, /2238810740192680/);
  assert.doesNotMatch(helper, /Bearer\s+[A-Za-z0-9._-]{20,}/);
});

test('WhatsApp sends approved utility templates only when credentials, phone, and template are configured', () => {
  for (const secret of [
    'WHATSAPP_TEMPLATE_ORDER_APPROVED',
    'WHATSAPP_TEMPLATE_PAYMENT_UPDATED',
    'WHATSAPP_TEMPLATE_ORDER_FULFILLED',
    'WHATSAPP_TEMPLATE_REFUND_COMPLETED',
  ]) assert.match(helper, new RegExp(secret));
  assert.match(helper, /type:\s*'template'/);
  assert.match(helper, /messaging_product:\s*'whatsapp'/);
  assert.match(helper, /template-not-configured/);
  assert.match(helper, /phone-not-available/);
});

test('order-approved keeps custom Order ID authoritative and WhatsApp non-blocking', () => {
  assert.match(events, /createOrGetOrderId/);
  assert.match(events, /notifyWhatsAppOrderActivity/);
  assert.match(events, /wixEcom_onOrderApproved/);
  assert.match(events, /\.catch\(\(\)\s*=>\s*undefined\)/);
});

test('payment, fulfillment, and refund Wix events are wired to WhatsApp activity mapping', () => {
  assert.match(events, /wixEcom_onPaymentStatusUpdated/);
  assert.match(events, /payment-updated/);
  assert.match(events, /wixEcom_onOrderFulfilled/);
  assert.match(events, /order-fulfilled/);
  assert.match(events, /wixEcom_onOrderTransactionsRefundCompleted/);
  assert.match(events, /refund-completed/);
});
