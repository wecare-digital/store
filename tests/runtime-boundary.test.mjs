import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../src');
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

test('live custom modules expose only approved order-ID and Blog-search subsystems', () => {
  const actual = files(root).filter(path => path.endsWith('.js') && !path.includes('/pages/'))
    .map(path => relative(root, path)).sort();
  assert.deepEqual(actual, [
    'backend/events.js',
    'backend/member-orders.web.js',
    'backend/orderId-helpers.js',
    'backend/orderId.web.js',
    'public/blog-search-url.js',
    'public/blog-search.js',
  ]);
});

test('page code contains only the five functional customer/runtime files', () => {
  const actual = files(resolve(root, 'pages')).filter(path => path.endsWith('.js'))
    .map(path => relative(resolve(root, 'pages'), path)).sort();
  assert.deepEqual(actual, [
    'Blog.e4rsm.js',
    'My Orders.vznnd.js',
    'Post.q5tyt.js',
    'Thank You Page.f0at2.js',
    'masterPage.js',
  ]);
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
