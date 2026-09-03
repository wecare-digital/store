import assert from 'node:assert/strict';
import { resolveBlogPostUrl } from '../src/public/blog-search-url.js';

assert.equal(resolveBlogPostUrl({ postPageURL: '/post/from-wix', slug: 'ignored' }), '/post/from-wix');
assert.equal(resolveBlogPostUrl({ postPageUrl: '/post/legacy-case', slug: 'ignored' }), '/post/legacy-case');
assert.equal(resolveBlogPostUrl({ slug: 'resentment' }), '/post/resentment');
assert.equal(resolveBlogPostUrl({ slug: 'hello world' }), '/post/hello%20world');
assert.equal(resolveBlogPostUrl({}), '');
console.log('blog-search URL resolver tests passed');
