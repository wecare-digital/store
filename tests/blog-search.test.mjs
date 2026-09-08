import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Execute the production modules; replace only hosted Wix/UI/timer boundaries.
const source = readFileSync(new URL('../src/public/blog-search.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export function initBlogSearch', 'function initBlogSearch')
  .replace(/^export default .*;\n?/gm, '');
const resolver = readFileSync(new URL('../src/public/blog-search-url.js', import.meta.url), 'utf8')
  .replace('export function resolveBlogPostUrl', 'function resolveBlogPostUrl')
  .replace(/^export default .*;\n?/gm, '');

function pageUI(missing = []) {
  function element() {
    return {
      hidden: false, collapsed: false, text: '', value: '', height: 20, scrolls: 0,
      hide() { this.hidden = true; }, show() { this.hidden = false; },
      collapse() { this.collapsed = true; }, expand() { this.collapsed = false; },
      scrollTo() { this.scrolls++; return Promise.resolve(); },
      onInput(fn) { this.input = fn; }, onKeyPress(fn) { this.key = fn; }, onClick(fn) { this.click = fn; },
    };
  }
  const input = element(), box = element(), noText = element(), rep = element(), rows = new Map();
  rep.onItemReady = fn => { rep.ready = fn; };
  let data = [];
  Object.defineProperty(rep, 'data', {
    get: () => data,
    set(items) {
      assert.ok(items.every(item => typeof item._id === 'string' && /^[a-zA-Z0-9-]+$/.test(item._id)));
      const oldIds = new Set(data.map(x => x._id)); data = items;
      for (const id of rows.keys()) if (!items.some(x => x._id === id)) rows.delete(id);
      for (const item of items) if (!oldIds.has(item._id)) {
        const title = element(), row = element();
        const select = id => {
          if (missing.includes(id)) throw new Error('Missing ' + id);
          return id === '#resultTitle' ? title : id === '#rowBox' ? row : undefined;
        };
        rows.set(item._id, { title, row }); rep.ready?.(select, item);
      }
    },
  });
  const elements = { '#searchInput': input, '#resultsBox': box, '#resultsRepeater': rep, '#noResultsText': noText };
  const select = id => {
    if (missing.includes(id) || !elements[id]) throw new Error('Missing ' + id);
    return elements[id];
  };
  return { input, box, noText, rep, rows, select,
    type(value) { input.value = value; input.input(); },
    enter() { input.key({ key: 'Enter' }); },
  };
}

function fixture({ missing = [], globalSelector = true, mobile = false } = {}) {
  const ui = pageUI(missing), requests = [], visits = [], errors = [], timers = new Map();
  let nextTimer = 0;
  const wixSearch = {
    search(value) {
      const request = { value };
      const chain = {
        documentType(value) { request.documentType = value; return chain; },
        limit(value) { request.limit = value; return chain; },
        find() { return new Promise((resolve, reject) => requests.push({ ...request, resolve, reject })); },
      }; return chain;
    },
  };
  const ctx = vm.createContext({
    wixSearch, wixWindow: { formFactor: mobile ? 'Mobile' : 'Desktop' }, wixLocation: { to: url => visits.push(url) },
    console: { error: (...x) => errors.push(x), warn: (...x) => errors.push(x) },
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id),
    ...(globalSelector ? { $w: ui.select } : {}),
  });
  vm.runInContext(resolver + '\n' + source, ctx);
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
  return { ...ui, requests, visits, errors, init: () => ctx.initBlogSearch(ui.select),
    anotherPage() { const other = pageUI(); ctx.initBlogSearch(other.select); return other; },
    initPage(name) {
      const page = readFileSync(new URL('../src/pages/' + name, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
      const select = ui.select; let ready;
      select.onReady = fn => { ready = fn; };
      vm.runInNewContext(page, { $w: select, initBlogSearch: passed => {
        assert.equal(passed, select, 'Page must supply its own selector'); return ctx.initBlogSearch(passed);
      } });
      assert.equal(typeof ready, 'function'); ready();
    },
    runTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    async resolve(index, documents) { requests[index].resolve({ documents }); await flush(); },
    async reject(index) { requests[index].reject(new Error('Query unavailable')); await flush(); },
    url: item => ctx.resolveBlogPostUrl(item),
  };
}

const resentment = { _id: '5df745e85db76a0017862a59', title: 'Resentment', url: '/post/resentment',
  documentType: 'Blog/Posts', description: 'A post about resentment', image: '', hashtags: [] };
const flame = { ...resentment, _id: '5df745e85db76a0017862a61', title: 'Flame', url: '/post/flame' };

for (const page of ['Blog.e4rsm.js', 'Post.q5tyt.js']) test(page + ' supplies its selector and opens a SearchDocument URL', async () => {
  const f = fixture({ globalSelector: false }); f.initPage(page); f.type('Resentment'); f.enter();
  await f.resolve(0, [resentment]); assert.deepEqual(f.visits, ['/post/resentment']);
});
test('shared module uses caller selector without a page global', () => {
  const f = fixture({ globalSelector: false }); assert.doesNotThrow(() => f.init()); assert.equal(typeof f.input.input, 'function');
});
test('missing optional empty-state label does not disable searching', async () => {
  const f = fixture({ missing: ['#noResultsText'] }); f.init(); f.type('Resentment'); f.runTimers();
  await f.resolve(0, [resentment]); assert.equal(f.rep.data[0].title, 'Resentment');
});
test('clearing input cancels a queued search', () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.type(''); f.runTimers();
  assert.equal(f.requests.length, 0); assert.equal(f.box.collapsed, true);
});
test('clearing input invalidates an in-flight success', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.runTimers(); f.type('');
  await f.resolve(0, [resentment]); assert.equal(f.rep.data.length, 0); assert.equal(f.box.collapsed, true);
});
test('input change invalidates a response before the next debounce fires', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.runTimers(); f.type('Flame');
  await f.resolve(0, [resentment]); assert.equal(f.rep.data.length, 0);
});
test('old successful response cannot replace newer results, even for the same text', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.runTimers(); f.type('Flame'); f.type('Resentment'); f.runTimers();
  await f.resolve(1, [resentment]); await f.resolve(0, [flame]); assert.equal(f.rep.data[0].title, 'Resentment');
});
test('old failure cannot hide newer successful results', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.runTimers(); f.type('Flame'); f.runTimers();
  await f.resolve(1, [flame]); await f.reject(0);
  assert.equal(f.rep.data[0]?.title, 'Flame'); assert.equal(f.box.collapsed, false); assert.equal(f.errors.length, 0);
});
test('Enter during a new pending query never opens old results', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.runTimers(); await f.resolve(0, [resentment]);
  f.type('Flame'); f.runTimers(); f.enter(); assert.deepEqual(f.visits, []);
  await f.resolve(f.requests.length - 1, [flame]); assert.deepEqual(f.visits, ['/post/flame']);
});
test('typing uses Wix Search Blog/Posts and title clicks use its URL', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.runTimers();
  assert.equal(f.requests[0].documentType, 'Blog/Posts'); assert.equal(f.requests[0].value, 'Resentment'); assert.equal(f.requests[0].limit, 10);
  await f.resolve(0, [resentment]); f.rows.get(resentment._id).title.click();
  assert.deepEqual(f.visits, ['/post/resentment']); assert.equal(f.box.collapsed, false);
});
test('current failure is visible and distinguishable from no matches', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.runTimers(); await f.reject(0);
  assert.equal(f.noText.hidden, false); assert.equal(f.box.collapsed, false);
  assert.match(f.noText.text, /unavailable|try again/i); assert.equal(f.errors.length, 1);
});
test('missing optional row still permits a title click', async () => {
  const f = fixture({ missing: ['#rowBox'] }); f.init(); f.type('Resentment'); f.runTimers(); await f.resolve(0, [resentment]);
  f.rows.get(resentment._id).title.click(); assert.deepEqual(f.visits, ['/post/resentment']); assert.equal(f.box.collapsed, false);
});
test('Enter before debounce performs one request and opens its result', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.enter(); f.runTimers();
  assert.equal(f.requests.length, 1); await f.resolve(0, [resentment]); assert.deepEqual(f.visits, ['/post/resentment']);
});
test('Enter on current results navigates without another request', async () => {
  const f = fixture(); f.init(); f.type('Resentment'); f.runTimers(); await f.resolve(0, [resentment]); f.enter();
  assert.equal(f.requests.length, 1); assert.deepEqual(f.visits, ['/post/resentment']);
});
test('no matches shows an empty-state message without navigation', async () => {
  const f = fixture(); f.init(); f.type('unmatched'); f.enter(); await f.resolve(0, []);
  assert.equal(f.noText.hidden, false); assert.match(f.noText.text, /no posts/i); assert.deepEqual(f.visits, []);
});
test('editor-hidden results are explicitly revealed after success', async () => {
  const f = fixture(); f.box.hidden = true; f.rep.hidden = true; f.rep.collapsed = true; f.init();
  f.type('Resentment'); f.runTimers(); await f.resolve(0, [resentment]);
  assert.equal(f.box.hidden, false); assert.equal(f.rep.hidden, false); assert.equal(f.rep.collapsed, false);
});
test('mobile results retain six-result limit, touch rows and scrolling', async () => {
  const f = fixture({ mobile: true }); f.init(); f.type('Resentment'); f.runTimers(); await f.resolve(0, [resentment]);
  assert.equal(f.requests[0].limit, 6); assert.equal(f.rows.get(resentment._id).row.height, 48); assert.equal(f.box.scrolls, 1);
});
test('two page instances do not share debounce or query state', async () => {
  const f = fixture(); f.init(); const second = f.anotherPage();
  f.type('Resentment'); second.type('Flame'); f.runTimers(); assert.equal(f.requests.length, 2);
  await f.resolve(1, [flame]); await f.resolve(0, [resentment]);
  assert.equal(f.rep.data[0].title, 'Resentment'); assert.equal(second.rep.data[0].title, 'Flame');
});
test('resolver prefers SearchDocument URL and preserves legacy slug fallback', () => {
  const f = fixture();
  assert.equal(f.url({ url: '/post/search-result', slug: 'ignored' }), '/post/search-result');
  assert.equal(f.url({ postPageUrl: '/post/legacy' }), '/post/legacy');
  assert.equal(f.url({ slug: 'hello world' }), '/post/hello%20world');
  assert.equal(f.url({}), '');
});
