import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { resolveBlogPostUrl } from '../src/public/blog-search-url.js';

const source = readFileSync(new URL('../src/public/blog-search.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export function initBlogSearch', 'function initBlogSearch')
  .replace(/^export default .*;\n?/gm, '');

function fixture({ missing = [], globalSelector = true, mobile = false } = {}) {
  const requests = [], visits = [], errors = [], timers = new Map();
  let nextTimer = 0;

  function element() {
    return {
      hidden: false, collapsed: false, text: '', value: '', height: 20, scrolls: 0,
      hide() { this.hidden = true; }, show() { this.hidden = false; },
      collapse() { this.collapsed = true; }, expand() { this.collapsed = false; },
      scrollTo() { this.scrolls++; return Promise.resolve(); },
      onInput(fn) { this.input = fn; }, onKeyPress(fn) { this.key = fn; },
      onClick(fn) { this.click = fn; },
    };
  }

  const input = element(), box = element(), noText = element(), rep = element();
  const rows = new Map();
  rep.onItemReady = fn => { rep.ready = fn; };
  let data = [];
  Object.defineProperty(rep, 'data', {
    get: () => data,
    set(items) {
      const oldIds = new Set(data.map(x => x._id));
      data = items;
      for (const id of rows.keys()) if (!items.some(x => x._id === id)) rows.delete(id);
      for (const item of items) if (!oldIds.has(item._id)) {
        const title = element(), row = element();
        const select = id => {
          if (missing.includes(id)) throw new Error('Missing ' + id);
          return id === '#resultTitle' ? title : id === '#rowBox' ? row : undefined;
        };
        rows.set(item._id, { title, row, select });
        rep.ready?.(select, item);
      }
    },
  });

  const elements = { '#searchInput': input, '#resultsBox': box, '#resultsRepeater': rep, '#noResultsText': noText };
  const select = id => {
    if (missing.includes(id) || !elements[id]) throw new Error('Missing ' + id);
    return elements[id];
  };

  const wixSearch = {
    search(expression) {
      const request = { expression };
      const chain = {
        documentType(value) { request.documentType = value; return chain; },
        limit(value) { request.limit = value; return chain; },
        find() { return new Promise((resolve, reject) => requests.push({ ...request, resolve, reject })); },
      };
      return chain;
    },
  };

  const ctx = vm.createContext({
    wixSearch,
    wixWindow: { formFactor: mobile ? 'Mobile' : 'Desktop' },
    wixLocation: { to: url => visits.push(url) },
    resolveBlogPostUrl,
    console: { error: (...x) => errors.push(x), warn: (...x) => errors.push(x) },
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    ...(globalSelector ? { $w: select } : {}),
  });
  vm.runInContext(source, ctx);
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

  return {
    input, box, noText, rep, rows, requests, visits, errors,
    init: () => ctx.initBlogSearch(select),
    type(value) { input.value = value; input.input(); },
    enter() { input.key({ key: 'Enter' }); },
    runTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    async resolve(index, documents) { requests[index].resolve({ documents }); await flush(); },
    async reject(index) { requests[index].reject(new Error('Search unavailable')); await flush(); },
  };
}

const resentment = { _id: 'resentment-id', title: 'Resentment', url: '/post/resentment' };
const flame = { _id: 'flame-id', title: 'Flame', url: '/post/flame' };

test('uses the caller page selector without a public-module global', () => {
  const f = fixture({ globalSelector: false });
  assert.doesNotThrow(() => f.init());
  assert.equal(typeof f.input.input, 'function');
});

test('a missing optional empty-state label does not disable search', async () => {
  const f = fixture({ missing: ['#noResultsText'] });
  assert.doesNotThrow(() => f.init());
  f.type('Resentment'); f.runTimers(); await f.resolve(0, [resentment]);
  assert.equal(f.rep.data[0].title, 'Resentment');
});

test('clearing input cancels a queued search', () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.type(''); f.runTimers();
  assert.equal(f.requests.length, 0);
  assert.equal(f.box.collapsed, true);
});

test('input changes invalidate an in-flight response before debounce fires', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.runTimers(); f.type('Flame');
  await f.resolve(0, [resentment]);
  assert.equal(f.rep.data.length, 0);
});

test('an old failed request cannot hide newer successful results', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.runTimers(); f.type('Flame'); f.runTimers();
  await f.resolve(1, [flame]); await f.reject(0);
  assert.equal(f.rep.data[0]?.title, 'Flame');
  assert.equal(f.box.collapsed, false);
});

test('typing uses Wix Search Blog documents and creates clickable results', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.runTimers();
  assert.equal(f.requests[0].expression, 'Resentment');
  assert.equal(f.requests[0].documentType, 'Blog/Posts');
  await f.resolve(0, [resentment]);
  f.rows.get('resentment-id').title.click();
  assert.deepEqual(f.visits, ['/post/resentment']);
  assert.equal(f.box.collapsed, false);
});

test('a current search failure is visible and distinguishable from no matches', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.runTimers(); await f.reject(0);
  assert.equal(f.noText.hidden, false);
  assert.equal(f.box.collapsed, false);
  assert.match(f.noText.text, /unavailable|try again/i);
  assert.equal(f.errors.length, 1);
});

test('a missing optional row container does not prevent title clicks', async () => {
  const f = fixture({ missing: ['#rowBox'] }); f.init(); f.type('Resentment'); f.runTimers();
  await f.resolve(0, [resentment]);
  assert.equal(f.box.collapsed, false);
  f.rows.get('resentment-id').title.click();
  assert.deepEqual(f.visits, ['/post/resentment']);
});

test('Enter before debounce performs one search and opens its result', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.enter(); f.runTimers();
  assert.equal(f.requests.length, 1);
  await f.resolve(0, [resentment]);
  assert.deepEqual(f.visits, ['/post/resentment']);
});

test('no matches shows an empty-state message without navigation', async () => {
  const f = fixture(); f.init(); f.type('zzzz-no-matching-post'); f.enter();
  await f.resolve(0, []);
  assert.equal(f.noText.hidden, false);
  assert.match(f.noText.text, /no posts/i);
  assert.equal(f.box.collapsed, false);
  assert.deepEqual(f.visits, []);
});

test('results hidden in the editor are shown when a search succeeds', async () => {
  const f = fixture(); f.box.hidden = true; f.rep.hidden = true; f.rep.collapsed = true;
  f.init(); f.type('Resentment'); f.runTimers(); await f.resolve(0, [resentment]);
  assert.equal(f.box.hidden, false);
  assert.equal(f.rep.hidden, false);
  assert.equal(f.rep.collapsed, false);
});

test('mobile results preserve touch-row sizing and scroll into view', async () => {
  const f = fixture({ mobile: true }); f.init(); f.type('Resentment'); f.runTimers();
  await f.resolve(0, [resentment]);
  assert.equal(f.requests[0].limit, 6);
  assert.equal(f.rows.get('resentment-id').row.height, 48);
  assert.equal(f.box.scrolls, 1);
});

test('keeps previous results visible while a new typed query is waiting', async () => {
  const f = fixture(); f.init();
  f.type('Resentment'); f.runTimers(); await f.resolve(0, [resentment]);
  f.type('Flame');
  assert.equal(f.rep.data[0]?.title, 'Resentment');
  f.runTimers(); await f.resolve(1, [flame]);
  assert.equal(f.rep.data[0]?.title, 'Flame');
});

test('uses a near-immediate 50 ms typing debounce', () => {
  assert.match(source, /const DEBOUNCE = 50;/);
});
