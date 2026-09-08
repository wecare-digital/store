import { getSecret } from 'wix-secrets-backend';

const SITE_ID = 'c17b0e20-d96d-4fa1-b05c-bc97c04b4ac5';
const META_APP_ID = '2238810740192680';
const GRAPH_VERSION = 'v26.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const SECRET_ACCESS_TOKEN = 'WHATSAPP_ACCESS_TOKEN';
const SECRET_PHONE_NUMBER_ID = 'WHATSAPP_PHONE_NUMBER_ID';
const SECRET_WABA_ID = 'WHATSAPP_WABA_ID';
const SECRET_ENABLED = 'WHATSAPP_ORDER_NOTIFICATIONS_ENABLED';
const SECRET_LANGUAGE = 'WHATSAPP_TEMPLATE_LANGUAGE';

const TEMPLATE_SECRETS = Object.freeze({
  'order-approved': 'WHATSAPP_TEMPLATE_ORDER_APPROVED',
  'payment-updated': 'WHATSAPP_TEMPLATE_PAYMENT_UPDATED',
  'order-fulfilled': 'WHATSAPP_TEMPLATE_ORDER_FULFILLED',
  'refund-completed': 'WHATSAPP_TEMPLATE_REFUND_COMPLETED',
});

async function secretOrNull(name) {
  try {
    const value = await getSecret(name);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

function orderPhone(order) {
  return normalizePhone(
    order?.recipientInfo?.contactDetails?.phone ||
    order?.billingInfo?.contactDetails?.phone ||
    order?.shippingInfo?.logistics?.shippingDestination?.contactDetails?.phone ||
    order?.shippingInfo?.logistics?.pickupDetails?.buyerDetails?.phone ||
    ''
  );
}

async function getWixOrder(orderId) {
  if (!orderId) return null;
  const apiKey = await secretOrNull('api');
  if (!apiKey) return null;
  const response = await fetch(`https://www.wixapis.com/ecom/v1/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      'wix-site-id': SITE_ID,
    },
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data?.order || null;
}

async function configuration(activity) {
  const templateSecret = TEMPLATE_SECRETS[activity];
  if (!templateSecret) return { ready: false, reason: 'activity-not-supported' };

  const [enabled, accessToken, phoneNumberId, wabaId, templateName, language] = await Promise.all([
    secretOrNull(SECRET_ENABLED),
    secretOrNull(SECRET_ACCESS_TOKEN),
    secretOrNull(SECRET_PHONE_NUMBER_ID),
    secretOrNull(SECRET_WABA_ID),
    secretOrNull(templateSecret),
    secretOrNull(SECRET_LANGUAGE),
  ]);

  if (String(enabled).toLowerCase() !== 'true') return { ready: false, reason: 'notifications-disabled' };
  if (!accessToken || !phoneNumberId || !wabaId) return { ready: false, reason: 'credentials-not-configured' };
  if (!templateName) return { ready: false, reason: 'template-not-configured' };
  return { ready: true, accessToken, phoneNumberId, templateName, language: language || 'en_US' };
}

export async function getWhatsAppOrderNotificationStatus() {
  const [enabled, accessToken, phoneNumberId, wabaId] = await Promise.all([
    secretOrNull(SECRET_ENABLED),
    secretOrNull(SECRET_ACCESS_TOKEN),
    secretOrNull(SECRET_PHONE_NUMBER_ID),
    secretOrNull(SECRET_WABA_ID),
  ]);
  const templates = {};
  for (const [activity, secretName] of Object.entries(TEMPLATE_SECRETS)) {
    templates[activity] = Boolean(await secretOrNull(secretName));
  }
  return {
    metaAppId: META_APP_ID,
    graphVersion: GRAPH_VERSION,
    enabled: String(enabled).toLowerCase() === 'true',
    credentialsConfigured: Boolean(accessToken && phoneNumberId && wabaId),
    templates,
  };
}

export async function notifyWhatsAppOrderActivity({ activity, order, orderId } = {}) {
  const config = await configuration(activity);
  if (!config.ready) return { sent: false, reason: config.reason, activity };

  let resolvedOrder = order || null;
  const resolvedOrderId = orderId || resolvedOrder?.id || resolvedOrder?._id || null;
  if (!orderPhone(resolvedOrder) && resolvedOrderId) resolvedOrder = await getWixOrder(resolvedOrderId);

  const phone = orderPhone(resolvedOrder);
  if (!phone) return { sent: false, reason: 'phone-not-available', activity };

  const response = await fetch(`${GRAPH_BASE}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'template',
      template: {
        name: config.templateName,
        language: { code: config.language },
      },
    }),
  });

  const text = await response.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = {}; }
  }
  if (!response.ok) {
    return { sent: false, reason: 'meta-api-error', activity, status: response.status };
  }

  return {
    sent: true,
    activity,
    messageId: data?.messages?.[0]?.id || null,
  };
}
