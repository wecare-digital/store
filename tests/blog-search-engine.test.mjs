import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveBlogPostUrl } from '../src/public/blog-search-url.js';

const source = readFileSync(new URL('../src/public/blog-search.js', import.meta.url), 'utf8');

assert.match(source, /import\s+wixSearch\s+from\s+['\"]wix-search['\"]/, 'blog search must use Wix Search');
assert.doesNotMatch(source, /wixData\.query\s*\(/, 'blog search must not query Blog\/Posts through wix-data');
assert.match(source, /\.documentType\(['\"]Blog\/Posts['\"]\)/, 'blog search must target Blog/Posts documents');
assert.match(source, /results\s*=\s*r\.documents\s*\|\|\s*\[\]/, 'blog search must render Wix Search documents');
assert.equal(resolveBlogPostUrl({ url: '/post/from-search' }), '/post/from-search');

console.log('blog-search engine tests passed');
