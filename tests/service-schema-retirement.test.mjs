import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

assert.equal(existsSync(new URL('../src/public/seo-map.js', import.meta.url)), false, 'retired runtime SEO map must stay deleted');

const servicePages = [
  'APPOINTMENT.mw1h3.js',
  'SUBMIT REQUEST.drj86.js',
  'TRACK REQUEST.oib6n.js',
  'AMEND REQUEST.fi4p9.js',
  'RX SLOT.tniz2.js',
  'ENTERPRISE ASSIST.fr0jt.js',
];

for (const page of servicePages) {
  const src = readFileSync(new URL(`../src/pages/${page}`, import.meta.url), 'utf8');
  assert.doesNotMatch(src, /serviceSchema|['"]@type['"]\s*:\s*['"]Service['"]|setStructuredData/i, `${page} must not inject custom Service JSON-LD`);
}

console.log('custom Service schema retirement checks passed');
