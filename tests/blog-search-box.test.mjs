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
    hidden: false,
    collapsed: false,
    text: '',
    value: '',
    placeholder: '',
    hide() { this.hidden = true; },
    show() { this.hidden = false; },
    collapse() { this.collapsed = true; },
    expand() { this.collapsed = false; },
    onInput(fn) { this.input = fn; },
    onKeyPress(fn) { this.key = fn; },
    onClick(fn) { this.click = fn; },
    ...extra,
  };
}

test('initialization presents a visible Blog search box with the approved placeholder', () => {
  const input = element({ hidden: true, collapsed: true });
  const repeater = element();
  repeater.onItemReady = fn => { repeater.ready = fn; };
  Object.defineProperty(repeater, 'data', { get: () => [], set: () => {} });
  const resultsBox = element();
  const emptyState = element();

  const select = selector => ({
    '#searchInput': input,
    '#resultsRepeater': repeater,
    '#resultsBox': resultsBox,
    '#noResultsText': emptyState,
  }[selector]);

  const ctx = vm.createContext({
    wixSearch: { search: () => { throw new Error('not used'); } },
    wixWindow: { formFactor: 'Desktop' },
    wixLocation: { to: () => {} },
    resolveBlogPostUrl,
    console: { error: () => {} },
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(source, ctx);

  ctx.initBlogSearch(select);

  assert.equal(input.placeholder, 'Search posts…');
  assert.equal(input.hidden, false);
  assert.equal(input.collapsed, false);
});
