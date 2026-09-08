import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../src');
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

test('custom modules expose only the approved order-ID, SKU and blog-search subsystems', () => {
  const actual = files(root).filter(path => path.endsWith('.js') && !path.includes('/pages/'))
    .map(path => relative(root, path)).sort();
  assert.deepEqual(actual, [
    'backend/catalog-v3.js', 'backend/events.js', 'backend/member-orders.web.js',
    'backend/orderId-helpers.js', 'backend/orderId.web.js', 'backend/sku-batch.web.js',
    'public/blog-search-url.js', 'public/blog-search.js',
  ]);
});

test('pages outside order-ID display and blog search execute no custom behavior', () => {
  const keep = new Set(['masterPage.js', 'My Orders.vznnd.js', 'Thank You Page.f0at2.js', 'Blog.e4rsm.js', 'Post.q5tyt.js']);
  for (const file of files(resolve(root, 'pages')).filter(path => path.endsWith('.js'))) {
    if (keep.has(file.split('/').at(-1))) continue;
    // A context with no Wix, browser, network or timer globals makes any retained
    // page initialization/import fail. Empty page files keep native Wix content.
    assert.doesNotThrow(() => vm.runInNewContext(readFileSync(file, 'utf8'), {}, { timeout: 100 }), relative(root, file));
  }
});

test('every local import in the retained runtime resolves to an existing file', () => {
  const runtime = files(root).filter(path => path.endsWith('.js'));
  const existing = new Set(runtime);
  for (const path of runtime) {
    for (const match of readFileSync(path, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!/^(backend\/|public\/|\.\.?\/)/.test(specifier)) continue;
      const target = specifier.startsWith('.') ? resolve(dirname(path), specifier) : resolve(root, specifier);
      assert.ok(existing.has(target) || existing.has(target + '.js'), `${relative(root, path)} imports missing ${specifier}`);
    }
  }
});

test('no scheduled custom jobs remain enabled', () => {
  const config = resolve(root, 'backend/jobs.config');
  const jobs = existsSync(config) ? JSON.parse(readFileSync(config, 'utf8')).jobs : [];
  assert.deepEqual(jobs, []);
});
