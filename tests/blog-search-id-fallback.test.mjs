import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { resolveBlogPostUrl } from '../src/public/blog-search-url.js';

const source = readFileSync(new URL('../src/public/blog-search.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export function initBlogSearch', 'function initBlogSearch')
  .replace(/^export default .*;\n?/gm, '');

function element(extra = {}) {
  return {
    id: '', hidden: false, collapsed: false, text: '', value: '', placeholder: '', height: 20,
    hide() { this.hidden = true; }, show() { this.hidden = false; },
    collapse() { this.collapsed = true; }, expand() { this.collapsed = false; },
    scrollTo() { return Promise.resolve(); },
    onInput(fn) { this.input = fn; }, onKeyPress(fn) { this.key = fn; },
    onClick(fn) { this.click = fn; },
    ...extra,
  };
}

test('binds Blog search by element type when editor IDs differ', async () => {
  const requests = [], visits = [], timers = new Map();
  let timerId = 0;
  const input = element({ id: 'input17', placeholder: 'Search posts' });
  const rep = element({ id: 'repeater6' });
  rep.onItemReady = fn => { rep.ready = fn; };
  const rowTitles = new Map();
  let data = [];
  Object.defineProperty(rep, 'data', {
    get: () => data,
    set(items) {
      data = items;
      for (const item of items) {
        const title = element({ id: 'text42' });
        rowTitles.set(item._id, title);
        rep.ready?.(selector => {
          if (selector.startsWith('#')) throw new Error('Different repeated ID');
          return selector === 'Text' ? [title] : [];
        }, item);
      }
    },
  });

  const select = selector => {
    if (selector.startsWith('#')) throw new Error('Different editor ID');
    if (selector === 'TextInput,TextBox') return [input];
    if (selector === 'Repeater') return [rep];
    if (selector === 'Text') return [];
    return [];
  };
  const wixSearch = {
    search(expression) {
      const request = { expression };
      const chain = {
        documentType(v) { request.documentType = v; return chain; },
        limit(v) { request.limit = v; return chain; },
        find() { return new Promise((resolve, reject) => requests.push({ ...request, resolve, reject })); },
      };
      return chain;
    },
  };
  const ctx = vm.createContext({
    wixSearch,
    wixWindow: { formFactor: 'Desktop' },
    wixLocation: { to: url => visits.push(url) },
    resolveBlogPostUrl,
    console: { error: () => {} },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(source, ctx);

  ctx.initBlogSearch(select);
  assert.equal(typeof input.input, 'function');

  input.value = 'Transformation';
  input.input();
  [...timers.values()].forEach(fn => fn());
  assert.equal(requests.length, 1);
  requests[0].resolve({ documents: [{ _id: 'p1', title: 'Transformation', url: '/post/transformation' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rep.data[0].title, 'Transformation');
  assert.equal(typeof rowTitles.get('p1').click, 'function');
  rowTitles.get('p1').click();
  assert.deepEqual(visits, ['/post/transformation']);
});
