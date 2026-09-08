import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ORDER = {
  _id: '67668940-527d-4465-94c6-5475d8c7a412', number: '10124',
  _createdDate: '2026-02-22T12:13:01.000Z', status: 'APPROVED', currency: 'INR',
  buyerInfo: { memberId: 'member-a', email: 'real@example.test', contactId: 'contact-a' },
  lineItems: [{ _id: 'line-1', productName: { original: 'Consultation', translated: 'Consultation' }, quantity: 1 }],
  priceSummary: { total: { amount: '1299.00', formattedAmount: '₹1,299.00' } },
};
const FULL = 'WD-ORD - A3F7B2C1 - 22-02-2026 - 17:43:01 - IST';

// Only Wix-hosted boundaries are replaced. The actual application modules run
// unchanged in a VM; the in-memory data boundary preserves uniqueness/paging.
async function app({ member = { _id: 'member-a' }, order = ORDER, seed = [], insertError, beforeInsert, ui } = {}) {
  const rows = structuredClone(seed);
  const context = vm.createContext({ console, Date, Math, setTimeout, ...(ui || {}) });
  const data = {
    query(collection) {
      assert.equal(collection, 'OrderIds');
      const predicates = []; let offset = 0; let limit = 50; let sort;
      const query = {
        eq(key, value) { predicates.push(row => row[key] === value); return query; },
        descending(key) { sort = key; return query; },
        skip(value) { assert.ok(Number.isInteger(value) && value >= 0); offset = value; return query; },
        limit(value) { assert.ok(Number.isInteger(value) && value > 0 && value <= 1000); limit = value; return query; },
        async find() {
          let selected = rows.filter(row => predicates.every(p => p(row)));
          if (sort) selected.sort((a, b) => String(b[sort]).localeCompare(String(a[sort])));
          const page = start => ({ items: structuredClone(selected.slice(start, start + limit)), totalCount: selected.length,
            hasNext: () => start + limit < selected.length, next: async () => page(start + limit) });
          return page(offset);
        },
      }; return query;
    },
    async get(collection, id, options) {
      assert.equal(collection, 'OrderIds'); assert.equal(options.consistentRead, true);
      return structuredClone(rows.find(row => row._id === id) || null);
    },
    async insert(collection, row) {
      assert.equal(collection, 'OrderIds');
      assert.ok(row.customOrderId, 'Live schema requires customOrderId');
      assert.ok(row.wixOrderId, 'Live schema requires wixOrderId');
      assert.equal(Object.prototype.toString.call(row.orderCreatedDate), '[object Date]');
      if (beforeInsert) await beforeInsert(rows, row);
      if (insertError) throw insertError;
      if (rows.some(existing => existing._id === row._id)) throw Object.assign(new Error('Duplicate ID'), { code: 'WDE0074' });
      const saved = { ...structuredClone(row), _id: row._id || `random-${rows.length}` }; rows.push(saved); return saved;
    },
    async update(collection, row) { assert.equal(collection, 'OrderIds'); rows[rows.findIndex(r => r._id === row._id)] = row; return row; },
  };
  const currentMember = { getMember: async () => member };
  const external = {
    'wix-data': { default: data },
    'wix-web-module': { Permissions: { Anyone: 'Anyone', SiteMember: 'SiteMember' }, webMethod: (permission, fn) => Object.assign(fn, { permission }) },
    'wix-members-backend': { currentMember }, 'wix-members-frontend': { currentMember },
    'wix-ecom-backend': { orders: { getOrder: async id => { assert.equal(id, ORDER._id); return structuredClone(order); } } },
    'wix-secrets-backend': { getSecret: async () => { throw new Error('Unexpected secrets access'); } },
    'wix-location-frontend': { default: { path: ['submit-request'], query: { orderId: 'forged-id' } } },
    'public/site-hygiene.js': { initHygiene() {} }, 'public/button-normalize.js': { initButtonNormalize() {} }, 'public/wecare-language.js': { initLanguage() {} },
  };
  const cache = new Map();
  async function load(name) {
    if (cache.has(name)) return cache.get(name);
    let module;
    if (external[name]) {
      const values = external[name]; module = new vm.SyntheticModule(Object.keys(values), function () { for (const [k, v] of Object.entries(values)) this.setExport(k, v); }, { context });
    } else {
      const file = name.endsWith('.js') ? name : `${name}.js`;
      module = new vm.SourceTextModule(await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'), { context, identifier: file });
    }
    cache.set(name, module); await module.link(load); return module;
  }
  return { rows, async module(name) { const module = await load(name); await module.evaluate(); return module.namespace; } };
}

test('member mapping rejects another owner even with forged caller memberId', async () => {
  const a = await app({ member: { _id: 'attacker' } }); const api = await a.module('backend/orderId.web');
  await assert.rejects(api.createOrGetOrderId({ wixOrderId: ORDER._id, memberId: 'attacker' })); assert.equal(a.rows.length, 0);
});
test('anonymous mapping creation is unavailable and fails closed', async () => {
  const a = await app({ member: null }); const api = await a.module('backend/orderId.web');
  assert.equal(api.createOrGetOrderId.permission, 'SiteMember');
  await assert.rejects(api.createOrGetOrderId({ wixOrderId: ORDER._id })); assert.equal(a.rows.length, 0);
});
test('mapping fields come from the fetched order, never caller supplied metadata', async () => {
  const a = await app(); const api = await a.module('backend/orderId.web');
  await api.createOrGetOrderId({ wixOrderId: ORDER._id, memberId: 'forged', totalAmount: '0.00', productsSummary: 'fake', orderDate: '2000-01-01' });
  assert.equal(a.rows[0].memberId, 'member-a'); assert.equal(a.rows[0].totalAmount, '₹1,299.00'); assert.equal(a.rows[0].productsSummary, 'Consultation');
  assert.match(a.rows[0].orderId, /^WD-ORD - [A-Z2-9]{8} - 22-02-2026 - 17:43:01 - IST$/);
});
test('concurrent approved events create one mapping using actual order fields', async () => {
  const a = await app(); const events = await a.module('backend/events');
  await Promise.all(Array.from({ length: 6 }, () => events.wixEcom_onOrderApproved({ entity: structuredClone(ORDER) })));
  assert.equal(a.rows.length, 1); assert.equal(a.rows[0]._id, ORDER._id); assert.equal(a.rows[0].totalAmount, '₹1,299.00');
});
test('guest event does not promote visitor identity to member ownership', async () => {
  const a = await app(); const events = await a.module('backend/events');
  await events.wixEcom_onOrderApproved({ entity: { ...ORDER, buyerInfo: { visitorId: 'visitor-1' } } });
  assert.ok(!a.rows[0].memberId); assert.equal(a.rows[0].wixOrderId, ORDER._id);
});
test('documented Velo approval event reads data.order and older totalPrice money shape', async () => {
  const a = await app(); const events = await a.module('backend/events');
  const order = { ...ORDER, priceSummary: { totalPrice: { amount: '1299.00', formattedAmount: '₹1,299.00' } } };
  await events.wixEcom_onOrderApproved({ metadata: { entityId: ORDER._id, id: 'event-1' }, data: { order } });
  assert.equal(a.rows[0].wixOrderId, ORDER._id); assert.equal(a.rows[0].totalAmount, '₹1,299.00');
  assert.equal(a.rows[0].customOrderId, a.rows[0].orderId);
});
test('unapproved member orders cannot allocate IDs', async () => {
  const a = await app({ order: { ...ORDER, status: 'INITIALIZED' } }); const api = await a.module('backend/orderId.web');
  await assert.rejects(api.createOrGetOrderId({ wixOrderId: ORDER._id }), /approval/); assert.equal(a.rows.length, 0);
});
test('anonymous paged reads and dropdown cannot use a supplied identity', async () => {
  const a = await app({ member: null }); const api = await a.module('backend/orderId.web'); const dropdown = await a.module('backend/member-orders.web');
  await assert.rejects(api.getMemberOrdersPaged({ memberId: 'victim' }));
  await assert.rejects(dropdown.getMyOrderIdList('victim@example.test'));
});
test('canonical customOrderId wins over a legacy alias without rewriting existing mappings', async () => {
  const a = await app({ seed: [{ _id: 'legacy', wixOrderId: ORDER._id, memberId: 'member-a', customOrderId: FULL, orderId: 'older-alias' }] });
  const api = await a.module('backend/orderId.web');
  assert.equal(await api.createOrGetOrderId({ wixOrderId: ORDER._id }), FULL);
  assert.equal((await api.getMemberOrdersPaged()).items[0].orderId, FULL); assert.equal(a.rows[0].orderId, 'older-alias');
});
test('duplicate insert conflict with a mismatched winner is not accepted', async () => {
  const a = await app({ insertError: Object.assign(new Error('Conflict'), { code: 'WDE0074' }), beforeInsert(rows, row) { rows.push({ ...row, wixOrderId: 'another-order' }); } });
  const events = await a.module('backend/events'); await assert.rejects(events.wixEcom_onOrderApproved({ entity: ORDER }), /Conflict/);
});
test('IST ID date crosses midnight and year boundary correctly', async () => {
  const a = await app({ order: { ...ORDER, _createdDate: '2025-12-31T20:45:00.000Z' } }); const api = await a.module('backend/orderId.web');
  assert.match(await api.createOrGetOrderId({ wixOrderId: ORDER._id }), /01-01-2026 - 02:15:00 - IST$/);
});
test('legacy mapping is reused without changing its ID', async () => {
  const a = await app({ seed: [{ _id: 'legacy-id', wixOrderId: ORDER._id, orderId: FULL }] }); const events = await a.module('backend/events');
  await events.wixEcom_onOrderApproved({ entity: ORDER }); assert.equal(a.rows.length, 1); assert.equal(a.rows[0].orderId, FULL); assert.equal(a.rows[0]._id, 'legacy-id');
});
test('non-duplicate insert failures are not swallowed even when another row appears', async () => {
  const failure = Object.assign(new Error('Quota reached'), { code: 'WDE0014' });
  const a = await app({ insertError: failure, beforeInsert(rows, row) { rows.push({ ...row, orderId: FULL }); } }); const events = await a.module('backend/events');
  await assert.rejects(events.wixEcom_onOrderApproved({ entity: ORDER }), /Quota reached/);
});
test('member reads ignore supplied identities and keep paging within own rows', async () => {
  const seed = Array.from({ length: 53 }, (_, i) => ({ _id: `own-${i}`, memberId: 'member-a', orderId: FULL, orderDate: `2026-${String(i).padStart(3, '0')}` }));
  seed.push({ _id: 'private', memberId: 'victim', orderId: 'PRIVATE', buyerEmail: 'victim@example.test' });
  const a = await app({ seed }); const api = await a.module('backend/orderId.web');
  const first = await api.getMemberOrdersPaged({ memberId: 'victim', page: 0, pageSize: 50 });
  assert.equal(first.totalCount, 53); assert.equal(first.items.length, 50); assert.equal(first.hasMore, true); assert.ok(first.items.every(row => row.orderId !== 'PRIVATE'));
  const second = await api.getMemberOrdersPaged({ page: 1, pageSize: 50 }); assert.equal(second.items.length, 3); assert.equal(second.hasMore, false);
  const dropdown = await a.module('backend/member-orders.web'); const list = await dropdown.getMyOrderIdList('victim@example.test'); assert.equal(list.length, 53); assert.ok(list.every(item => item.value === FULL));
});
test('paging normalizes fractional and nonfinite values', async () => {
  const a = await app(); const api = await a.module('backend/orderId.web');
  const result = await api.getMemberOrdersPaged({ page: Infinity, pageSize: 2.9 }); assert.equal(result.page, 0); assert.equal(result.pageSize, 2);
});
test('WD-ORD display retains IST date and 12-hour formatting', async () => {
  const a = await app(); const api = await a.module('backend/orderId.web'); const result = await api.parseOrderId(FULL);
  assert.equal(result.displayLabel, 'WD-ORD — A3F7B2C1 — 22 Feb 2026, 5:43 PM'); assert.equal(result.shortId, 'A3F7B2C1');
});

function pageUI() {
  const elements = new Map(); let ready; const rendered = [];
  const $w = id => {
    if (!elements.has(id)) {
      let callback; let data = [];
      elements.set(id, { text: '', hide() {}, show() {}, expand() {}, disable() {}, enable() {}, onClick() {},
        onItemReady(fn) { callback = fn; }, get data() { return data; }, set data(value) { data = value; for (const row of value) { const item = {}; if (callback) callback(key => item[key] ||= {}, row); rendered.push(item); } },
      });
    } return elements.get(id);
  };
  $w.onReady = fn => { ready = fn; }; return { $w, elements, rendered, run: () => ready() };
}
test('My Orders binds the first repeater row when data is assigned', async () => {
  const ui = pageUI(); const a = await app({ seed: [{ _id: 'own', memberId: 'member-a', orderId: FULL }], ui: { $w: ui.$w } });
  await a.module('pages/My Orders.vznnd.js'); await ui.run();
  assert.equal(ui.rendered[0]['#shopIdText']?.text, 'WD-ORD — A3F7B2C1 — 22 Feb 2026, 5:43 PM');
});
test('guest thank-you keeps the native confirmation and does not create mapping', async () => {
  const ui = pageUI(); ui.$w('#thankYouPage1').getOrder = async () => ORDER;
  const a = await app({ member: null, ui: { $w: ui.$w } }); await a.module('pages/Thank You Page.f0at2.js'); await ui.run();
  assert.equal(a.rows.length, 0); assert.equal(ui.$w('#orderIdText').text, 'Order #10124');
});
test('submit-request selection cannot inject a query-string order outside the member list', async () => {
  const ui = pageUI(); ui.$w('#dropdown_sr').onChange = () => {};
  const a = await app({ seed: [{ _id: 'own', memberId: 'member-a', buyerEmail: 'real@example.test', orderId: FULL }], ui: { $w: ui.$w } });
  await a.module('pages/masterPage.js'); await ui.run(); assert.equal(ui.$w('#dropdown_sr').value, FULL);
});
