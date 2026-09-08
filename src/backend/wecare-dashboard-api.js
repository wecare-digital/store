import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';
import { listProducts, normalizeProduct, setVariantSkus, getProductWithVariants } from 'backend/catalog-v3.js';
import { getWhatsAppOrderNotificationStatus } from 'backend/whatsapp-order-notifications.js';

const SITE_ID = 'c17b0e20-d96d-4fa1-b05c-bc97c04b4ac5';
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SKU_LENGTH = 8;
const READ_OPTIONS = { suppressAuth: true, suppressHooks: true, consistentRead: true };

async function siteApi(method, path, body) {
  const key = await getSecret('api');
  if (!key || typeof key !== 'string') throw new Error('Wix API secret is unavailable.');
  const options = { method, headers: { Authorization: key, 'Content-Type': 'application/json', 'wix-site-id': SITE_ID } };
  if (body !== undefined) options.body = JSON.stringify(body);
  const response = await fetch('https://www.wixapis.com' + path, options);
  const text = await response.text();
  let data = {};
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  if (!response.ok) throw new Error(data.message || `Wix API request failed (${response.status}).`);
  return data;
}

function randomSku() {
  let sku = '';
  for (let i = 0; i < SKU_LENGTH; i++) sku += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
  return sku;
}

function uniqueCandidates(used, variants, overwrite, prefix) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const base = (prefix ? prefix + '-' : '') + randomSku();
    const candidates = variants.map((variant, index) => {
      if ((variant.sku || '').trim() && !overwrite) return null;
      return variants.length === 1 ? base : base + '-' + String(index + 1).padStart(2, '0');
    });
    if (candidates.every(sku => sku === null || !used.has(sku.toUpperCase()))) {
      candidates.filter(Boolean).forEach(sku => used.add(sku.toUpperCase()));
      return candidates;
    }
  }
  throw new Error('Failed to generate unique SKU after 50 attempts.');
}

async function collectExistingSkus(products) {
  const used = new Set();
  for (const p of products) {
    const full = await getProductWithVariants(p.id);
    for (const variant of full.variantsInfo?.variants || []) {
      if (variant.sku && variant.sku.trim()) used.add(variant.sku.trim().toUpperCase());
    }
  }
  return used;
}

async function assignMissingSkus({ prefix = 'WD', dryRun = true } = {}) {
  dryRun = dryRun !== false;
  const products = (await listProducts()).map(normalizeProduct);
  const used = await collectExistingSkus(products);
  const cleanPrefix = String(prefix || '').trim().toUpperCase().slice(0, 12);
  const updated = [], skipped = [], errors = [];
  let variantsUpdated = 0;
  for (const product of products) {
    try {
      let candidates;
      const result = await setVariantSkus(product.id, (variant, index, variants) => {
        if ((variant.sku || '').trim()) return null;
        if (!candidates) {
          for (const v of variants) if ((v.sku || '').trim()) used.add(v.sku.trim().toUpperCase());
          candidates = uniqueCandidates(used, variants, false, cleanPrefix);
        }
        return candidates[index];
      }, dryRun);
      if (result.changed) {
        variantsUpdated += result.changed;
        updated.push({ id: product.id, name: product.name, changed: result.changed, variants: result.variants });
      } else skipped.push({ id: product.id, name: product.name, reason: 'all variants already have SKUs' });
    } catch (error) { errors.push({ id: product.id, name: product.name, error: error?.message || String(error) }); }
  }
  return { dryRun, catalogVersion: 'V3', prefix: cleanPrefix || null, totalProducts: products.length, variantsUpdated, updated, skipped, errors };
}

async function reprefixSkus({ oldPrefix = '', newPrefix = 'WD', dryRun = true } = {}) {
  dryRun = dryRun !== false;
  const products = (await listProducts()).map(normalizeProduct);
  const used = await collectExistingSkus(products);
  const oldP = String(oldPrefix || '').trim().toUpperCase().slice(0, 12);
  const newP = String(newPrefix || '').trim().toUpperCase().slice(0, 12);
  const updated = [], skipped = [], errors = [];
  for (const product of products) {
    try {
      const result = await setVariantSkus(product.id, (variant) => {
        const current = String(variant.sku || '').trim();
        if (!current) return null;
        const upper = current.toUpperCase();
        if (oldP && upper !== oldP && !upper.startsWith(oldP + '-')) return null;
        let base = current;
        if (oldP && upper.startsWith(oldP)) {
          base = current.slice(oldP.length);
          if (base.startsWith('-')) base = base.slice(1);
        }
        const next = newP ? newP + '-' + base : base;
        if (next.toUpperCase() === upper) return null;
        if (used.has(next.toUpperCase())) throw new Error('SKU collision: ' + next);
        used.add(next.toUpperCase());
        return next;
      }, dryRun);
      if (result.changed) updated.push({ id: product.id, name: product.name, changed: result.changed, variants: result.variants });
      else skipped.push({ id: product.id, name: product.name, reason: 'no matching prefix or already correct' });
    } catch (error) { errors.push({ id: product.id, name: product.name, error: error?.message || String(error) }); }
  }
  return { dryRun, catalogVersion: 'V3', oldPrefix: oldP || null, newPrefix: newP || null, updated, skipped, errors };
}

async function listOrders() {
  const data = await siteApi('POST', '/ecom/v1/orders/search', { search: { cursorPaging: { limit: 25 } } });
  return (data.orders || []).map(order => ({
    id: order.id || order._id || '',
    number: order.number == null ? '' : String(order.number),
    createdDate: order.createdDate || order._createdDate || '',
    paymentStatus: order.paymentStatus || '',
    fulfillmentStatus: order.fulfillmentStatus || '',
    total: order.priceSummary?.total?.formattedAmount || order.priceSummary?.totalPrice?.formattedAmount || order.priceSummary?.total?.amount || ''
  }));
}

async function listOrderIds() {
  const result = await wixData.query('OrderIds').descending('orderCreatedDate').limit(50).find(READ_OPTIONS);
  return result.items.map(item => ({
    id: item._id,
    customOrderId: item.customOrderId || item.orderId || '',
    wixOrderNumber: item.wixOrderNumber || '',
    orderCreatedDate: item.orderCreatedDate || '',
    productsSummary: item.productsSummary || '',
    totalAmount: item.totalAmount || ''
  }));
}

async function listInvoices() {
  const data = await siteApi('POST', '/invoices/v4/invoices/query', { query: { cursorPaging: { limit: 25 } } });
  return (data.invoices || []).map(invoice => ({
    id: invoice.id || '',
    number: invoice.numbering?.displayNumber || '',
    title: invoice.title || '',
    status: invoice.status || '',
    createdDate: invoice.createdDate || '',
    dueDate: invoice.dueDate || '',
    total: invoice.totals?.total?.formattedAmount || invoice.totals?.total?.amount || ''
  }));
}

async function listPaymentLinks() {
  const data = await siteApi('POST', '/payment-links/v1/payment-links/query', { query: { cursorPaging: { limit: 25 } } });
  return (data.paymentLinks || []).map(link => ({
    id: link.id || '',
    title: link.title || '',
    status: link.status || '',
    type: link.type || '',
    currency: link.currency || '',
    createdDate: link.createdDate || '',
    url: link.links?.url || link.links?.paymentLink || link.links?.checkoutUrl || ''
  }));
}

async function listForms() {
  const data = await siteApi('GET', '/form-schema-service/v4/forms?namespace=wix.form_app.form&order=UPDATED_DATE_DESC&fieldsets=METADATA');
  return (data.forms || []).map(form => ({
    id: form.id || '',
    name: form.name || '',
    enabled: form.enabled !== false,
    createdDate: form.createdDate || '',
    updatedDate: form.updatedDate || '',
    namespace: form.namespace || ''
  }));
}

async function seoStatus() {
  const [patterns, siteTags] = await Promise.all([
    siteApi('GET', '/promote/seo/v1/seo-patterns'),
    siteApi('GET', '/promote/seo/v1/site-seo-tags')
  ]);
  const stored = patterns.seoPatterns || [];
  const userPatterns = stored.filter(p => p.source === 'PATTERN_SOURCE_USER').map(p => p.pageType);
  const verificationNames = (siteTags.siteSeoTags?.tags || []).filter(t => t.type === 'meta' && /verification/i.test(t.props?.name || '')).map(t => t.props.name);
  return { userPatterns, clean: userPatterns.length === 0, verificationTagsPreserved: verificationNames };
}

async function automationsStatus() {
  const data = await siteApi('POST', '/automations-service/v2/automations/query', { query: {} });
  return { count: (data.automations || []).length, automations: (data.automations || []).slice(0, 20).map(a => ({ id: a.id, name: a.name, status: a.configuration?.status || '' })) };
}

export async function runWeCareAction(input = {}) {
  switch (input.action) {
    case 'status': {
      const whatsapp = await getWhatsAppOrderNotificationStatus();
      return {
        siteId: SITE_ID,
        catalogVersion: 'V3',
        whatsapp: {
          ...whatsapp,
          connected: whatsapp.enabled && whatsapp.credentialsConfigured && Object.values(whatsapp.templates || {}).every(Boolean),
        },
      };
    }
    case 'orders': return { orders: await listOrders() };
    case 'orderIds': return { items: await listOrderIds() };
    case 'skuMissing': return assignMissingSkus({ prefix: input.prefix, dryRun: input.dryRun });
    case 'skuReprefix': return reprefixSkus({ oldPrefix: input.oldPrefix, newPrefix: input.newPrefix, dryRun: input.dryRun });
    case 'invoices': return { invoices: await listInvoices() };
    case 'paymentLinks': return { paymentLinks: await listPaymentLinks() };
    case 'forms': return { forms: await listForms() };
    case 'seoStatus': return seoStatus();
    case 'automations': return automationsStatus();
    default: throw new Error('Unknown WECARE action.');
  }
}
