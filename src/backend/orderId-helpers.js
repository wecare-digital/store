/** Backend-only custom mappings. OrderIds is the sole source of WD-ORD IDs. */
import wixData from 'wix-data';
import { currentMember } from 'wix-members-backend';

const COLLECTION = 'OrderIds';
const WRITE_OPTIONS = { suppressAuth: true, suppressHooks: true };
const READ_OPTIONS = { ...WRITE_OPTIONS, consistentRead: true };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function parts(value) { return typeof value === 'string' ? value.split(' - ') : []; }
export function extractShortId(value) { return text(parts(value)[1]); }
export function extractFriendlyDate(value) {
  const [day, month, year] = text(parts(value)[2]).split('-');
  return day && MONTHS[Number(month) - 1] && year ? `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}` : '';
}
export function extractFriendlyTime(value) {
  const [hour, minute] = text(parts(value)[3]).split(':');
  if (!hour || !minute) return '';
  const h = Number(hour); return `${h % 12 || 12}:${minute} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function buildFriendlyDateTime(value) {
  const date = extractFriendlyDate(value); const time = extractFriendlyTime(value);
  return date ? `${date}${time ? `, ${time}` : ''}` : '';
}
export function buildDisplayLabel(value) {
  const short = extractShortId(value); const date = buildFriendlyDateTime(value);
  return short ? `WD-ORD — ${short}${date ? ` — ${date}` : ''}` : text(value);
}
export async function requireMemberId() {
  const member = await currentMember.getMember();
  if (!text(member?._id)) throw new Error('Please log in to view your orders.');
  return member._id;
}
function orderFields(order) {
  const wixOrderId = text(order?._id);
  if (!wixOrderId) throw new Error('A Wix order ID is required.');
  const date = new Date(order._createdDate);
  if (!order._createdDate || !Number.isFinite(date.getTime())) throw new Error('A valid Wix order creation date is required.');
  const total = order.priceSummary?.total || order.priceSummary?.totalPrice;
  const currency = text(order.currency);
  return {
    wixOrderId,
    memberId: text(order.buyerInfo?.memberId), // Never use visitor or contact IDs.
    wixOrderNumber: order.number == null ? '' : String(order.number),
    orderCreatedDate: date,
    totalAmount: text(total?.formattedAmount) || (text(total?.amount) ? `${total.amount}${currency ? ` ${currency}` : ''}` : ''),
    currency,
    productsSummary: (order.lineItems || []).map(item => text(item.productName?.original)).filter(Boolean).join(', '),
    source: 'wix-ecom',
  };
}
function newOrderId(orderDate) {
  const date = new Date(orderDate.getTime() + 330 * 60000);
  const pad = value => String(value).padStart(2, '0');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const short = Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `WD-ORD - ${short} - ${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()} - ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} - IST`;
}
function mappingId(item) { return text(item?.customOrderId) || text(item?.orderId); }

/** Only accepts a Wix backend event entity or fetched/owner-checked order. */
export async function createOrGetOrderId(order) {
  const fields = orderFields(order);
  // Preserve previously issued IDs, including mappings with random database IDs.
  const existing = await wixData.query(COLLECTION).eq('wixOrderId', fields.wixOrderId).limit(1).find(READ_OPTIONS);
  if (existing.items.length) {
    const id = mappingId(existing.items[0]);
    if (!id) throw new Error('Existing order mapping has no custom ID.');
    return id;
  }
  let orderId;
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = newOrderId(fields.orderCreatedDate);
    const canonical = await wixData.query(COLLECTION).eq('customOrderId', candidate).limit(1).find(READ_OPTIONS);
    const legacy = await wixData.query(COLLECTION).eq('orderId', candidate).limit(1).find(READ_OPTIONS);
    if (!canonical.items.length && !legacy.items.length) { orderId = candidate; break; }
  }
  if (!orderId) throw new Error('Could not allocate a unique custom order ID.');
  try {
    // Actual Wix order GUID is the atomic uniqueness boundary across event retries.
    await wixData.insert(COLLECTION, { _id: fields.wixOrderId, ...fields, customOrderId: orderId, orderId }, WRITE_OPTIONS);
    return orderId;
  } catch (error) {
    const code = error?.code || error?.details?.applicationError?.code;
    // WDE0074 is specifically duplicate _id; never swallow permission/quota failures.
    if (code !== 'WDE0074' && code !== 'WD_ITEM_ALREADY_EXISTS') throw error;
    const winner = await wixData.get(COLLECTION, fields.wixOrderId, READ_OPTIONS);
    if (winner?.wixOrderId !== fields.wixOrderId || !mappingId(winner)) throw error;
    return mappingId(winner);
  }
}

/** Identity is obtained from the backend session, never from caller parameters. */
export async function getMemberOrdersPaged({ page = 0, pageSize = 20 } = {}) {
  const memberId = await requireMemberId();
  const finiteInt = (value, fallback) => Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
  const safePage = Math.max(0, Math.min(100000, finiteInt(page, 0)));
  const safePageSize = Math.max(1, Math.min(50, finiteInt(pageSize, 20)));
  const result = await wixData.query(COLLECTION).eq('memberId', memberId)
    .descending('orderCreatedDate').skip(safePage * safePageSize).limit(safePageSize).find(READ_OPTIONS);
  const items = result.items.map(item => ({
    _id: item._id, orderId: mappingId(item), orderDate: item.orderCreatedDate || item.orderDate,
    productsSummary: item.productsSummary || '', totalAmount: item.totalAmount || '', currency: item.currency || '',
  }));
  return { items, page: safePage, pageSize: safePageSize, totalCount: result.totalCount, hasMore: (safePage + 1) * safePageSize < result.totalCount };
}
