/**
 * Order ID Helpers — WECARE.DIGITAL
 *
 * Pure backend module (NOT a web module). Can be safely imported
 * from events.js, data.js, routers.js, and other backend files.
 *
 * The .web.js file delegates to these functions for frontend calls.
 *
 * Full format (DB key):
 *   WD-ORD - {UUID8} - {DD-MM-YYYY} - {HH:MM:SS} - IST
 *   e.g. WD-ORD - A3F7B2C1 - 22-02-2026 - 17:43:01 - IST
 *
 * Wix display format:
 *   WD-ORD — A3F7B2C1 — 22 Feb 2026, 5:43 PM
 *
 * WhatsApp Flow display format:
 *   A3F7B2C1 — 22 Feb 2026, 5:43 PM
 *
 * Date-time format (used everywhere):
 *   22 Feb 2026, 5:43 PM
 */

import wixData from 'wix-data';

const ID_PREFIX = 'WD-ORD';
const COLLECTION = 'OrderIds';
const DATA_OPTIONS = { suppressAuth: true, suppressHooks: true };
const IST_OFFSET_MINUTES = 330; // UTC+5:30
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ---------- format parsing ----------

/**
 * Extract the 8-char UUID from a full WD-ORD string.
 * "WD-ORD - A3F7B2C1 - 22-02-2026 - 17:43:01 - IST" → "A3F7B2C1"
 */
export function extractShortId(wdOrd) {
  if (!wdOrd || typeof wdOrd !== 'string') return '';
  const parts = wdOrd.split(' - ');
  return parts.length >= 2 ? parts[1].trim() : '';
}

/**
 * Extract date part from WD-ORD and return friendly format.
 * "WD-ORD - A3F7B2C1 - 22-02-2026 - 17:43:01 - IST" → "22 Feb 2026"
 */
export function extractFriendlyDate(wdOrd) {
  if (!wdOrd || typeof wdOrd !== 'string') return '';
  const parts = wdOrd.split(' - ');
  if (parts.length < 3) return '';
  const datePart = parts[2].trim(); // "22-02-2026"
  const [dd, mm, yyyy] = datePart.split('-');
  if (!dd || !mm || !yyyy) return datePart;
  const monthName = MONTH_NAMES[parseInt(mm, 10) - 1] || mm;
  return `${parseInt(dd, 10)} ${monthName} ${yyyy}`;
}

/**
 * Extract time part from WD-ORD and return 12h format.
 * "WD-ORD - A3F7B2C1 - 22-02-2026 - 17:43:01 - IST" → "5:43 PM"
 */
export function extractFriendlyTime(wdOrd) {
  if (!wdOrd || typeof wdOrd !== 'string') return '';
  const parts = wdOrd.split(' - ');
  if (parts.length < 4) return '';
  const timePart = parts[3].trim(); // "17:43:01"
  const [hh, mi] = timePart.split(':');
  if (!hh || !mi) return timePart;
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
  return `${h12}:${mi} ${ampm}`;
}

/**
 * Build the standard date-time string used everywhere.
 * "22 Feb 2026, 5:43 PM"
 */
export function buildFriendlyDateTime(wdOrd) {
  const date = extractFriendlyDate(wdOrd);
  const time = extractFriendlyTime(wdOrd);
  if (!date) return '';
  return time ? `${date}, ${time}` : date;
}

/**
 * Build Wix display label (with WD-ORD prefix).
 * "WD-ORD — A3F7B2C1 — 22 Feb 2026, 5:43 PM"
 */
export function buildDisplayLabel(wdOrd) {
  const shortId = extractShortId(wdOrd);
  const dateTime = buildFriendlyDateTime(wdOrd);
  if (!shortId) return wdOrd || '';
  return dateTime
    ? `WD-ORD — ${shortId} — ${dateTime}`
    : `WD-ORD — ${shortId}`;
}

/**
 * Build WhatsApp Flow label (no prefix, short ID + amount + date).
 * With amount: "A3F7B2C1 · ₹1,299 · 22 Feb 2026"
 * Without amount: "A3F7B2C1 — 22 Feb 2026, 5:43 PM"
 */
export function buildWhatsAppLabel(wdOrd, amount) {
  const shortId = extractShortId(wdOrd);
  if (!shortId) return wdOrd || '';
  if (amount) {
    // Compact format for WhatsApp Flow dropdowns (~40 char limit)
    const date = extractFriendlyDate(wdOrd);
    return date ? `${shortId} · ${amount} · ${date}` : `${shortId} · ${amount}`;
  }
  const dateTime = buildFriendlyDateTime(wdOrd);
  return dateTime ? `${shortId} — ${dateTime}` : shortId;
}

/**
 * Normalize an Indian phone number to multiple search variants.
 * Handles +91, 91, 0 prefixes. Returns array of variants to try.
 */
export function normalizePhone(raw) {
  if (!raw) return [];
  const digits = raw.replace(/[^0-9]/g, '');
  const variants = new Set();
  variants.add(digits);
  if (digits.startsWith('91') && digits.length > 10) {
    variants.add(digits.slice(2));
  }
  if (digits.startsWith('0') && digits.length > 10) {
    variants.add(digits.slice(1));
  }
  const last10 = digits.slice(-10);
  if (last10.length === 10) {
    variants.add(last10);
    variants.add('91' + last10);
    variants.add('+91' + last10);
    variants.add('0' + last10);
  }
  return [...variants];
}

// ---------- helpers ----------

export function safeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function mergeOrderFields(existingItem, fields) {
  let changed = false;
  const updated = { ...existingItem };
  Object.keys(fields).forEach((key) => {
    const incoming = fields[key];
    if (incoming === undefined || incoming === null) return;
    if (updated[key] === undefined || updated[key] === null || updated[key] === '') {
      updated[key] = incoming;
      changed = true;
    }
  });
  return { changed, updated };
}

export function toIsoString(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function getIstParts(date) {
  const base = date instanceof Date ? date : new Date();
  const istMs = base.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const ist = new Date(istMs);
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = ist.getUTCFullYear();
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mi = String(ist.getUTCMinutes()).padStart(2, '0');
  const ss = String(ist.getUTCSeconds()).padStart(2, '0');
  return { dd, mm, yyyy, hh, mi, ss };
}

function formatIstDateTimeParts(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  const { dd, mm, yyyy, hh, mi, ss } = getIstParts(d);
  return {
    dateStr: `${dd}-${mm}-${yyyy}`,
    timeStr: `${hh}:${mi}:${ss}`
  };
}

/**
 * Generate WD-ORD - {UUID8} - {DD-MM-YYYY} - {HH:MM:SS} - IST
 */
function createOrderId(orderDateIso) {
  const { dateStr, timeStr } = formatIstDateTimeParts(orderDateIso);
  const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const uid = Array.from({ length: 8 }, () =>
    CHARSET[Math.floor(Math.random() * CHARSET.length)]
  ).join('');
  return `${ID_PREFIX} - ${uid} - ${dateStr} - ${timeStr} - IST`;
}

async function generateUniqueOrderId(orderDateIso) {
  let attempts = 0;
  while (attempts < 20) {
    attempts++;
    const id = createOrderId(orderDateIso);
    const existing = await wixData.query(COLLECTION)
      .eq('orderId', id)
      .limit(1)
      .find(DATA_OPTIONS);
    if (existing.totalCount === 0) {
      return id;
    }
  }
  throw new Error('Failed to generate unique ORDER ID after 20 attempts');
}

// ---------- main functions ----------

/**
 * Create or fetch ORDER ID for an order.
 * This is the raw function — no webMethod wrapper.
 * Safe to call from events.js and other backend files.
 */
export async function createOrGetOrderId(payload) {
  const {
    wixOrderId,
    memberId,
    orderNumber,
    buyerEmail,
    buyerPhone,
    totalAmount,
    currency,
    productsSummary,
    orderDate
  } = payload || {};

  const cleanWixOrderId = safeText(wixOrderId);
  if (!cleanWixOrderId) {
    throw new Error('wixOrderId is required');
  }

  const orderDateIso = toIsoString(orderDate) || new Date().toISOString();

  const baseFields = {
    wixOrderId: cleanWixOrderId,
    memberId: safeText(memberId),
    orderNumber: safeText(orderNumber),
    buyerEmail: safeText(buyerEmail),
    buyerPhone: safeText(buyerPhone),
    currency: safeText(currency),
    productsSummary: safeText(productsSummary),
    orderDate: orderDateIso
  };

  const cleanTotalAmount = safeText(totalAmount);
  if (cleanTotalAmount) {
    baseFields.totalAmount = cleanTotalAmount;
  }

  // Check if record already exists for this Wix order
  const existingRes = await wixData.query(COLLECTION)
    .eq('wixOrderId', cleanWixOrderId)
    .limit(1)
    .find(DATA_OPTIONS);

  if (existingRes.totalCount > 0) {
    const existing = existingRes.items[0];
    const { changed, updated } = mergeOrderFields(existing, baseFields);
    if (changed) {
      await wixData.update(COLLECTION, updated, DATA_OPTIONS);
    }
    return existing.orderId;
  }

  // Create new ORDER ID
  const orderId = await generateUniqueOrderId(orderDateIso);
  const itemToInsert = { ...baseFields, orderId };

  await wixData.insert(COLLECTION, itemToInsert, DATA_OPTIONS);

  return orderId;
}

/**
 * Paged list of orders for a member.
 */
export async function getMemberOrdersPaged(payload) {
  const {
    memberId,
    page = 0,
    pageSize = 20
  } = payload || {};

  const cleanMemberId = safeText(memberId);
  if (!cleanMemberId) {
    return { items: [], page: 0, pageSize, totalCount: 0, hasMore: false };
  }

  const safePage = Math.max(0, Number(page) || 0);
  let safePageSize = Number(pageSize) || 20;
  if (safePageSize < 1) safePageSize = 1;
  if (safePageSize > 50) safePageSize = 50;

  const query = wixData.query(COLLECTION)
    .eq('memberId', cleanMemberId)
    .descending('orderDate')
    .skip(safePage * safePageSize)
    .limit(safePageSize);

  const result = await query.find(DATA_OPTIONS);
  const totalCount = result.totalCount;
  const hasMore = (safePage + 1) * safePageSize < totalCount;

  return { items: result.items, page: safePage, pageSize: safePageSize, totalCount, hasMore };
}
