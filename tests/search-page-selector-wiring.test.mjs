import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

for (const page of ['Blog.e4rsm.js', 'Post.q5tyt.js']) {
  test(`${page} passes its page selector into shared search`, () => {
    const source = readFileSync(new URL(`../src/pages/${page}`, import.meta.url), 'utf8');
    assert.match(source, /initBlogSearch\(\$w\)/);
  });
}
