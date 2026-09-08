import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WECARE_OPS_SECTIONS, WECARE_OPS_REGISTRATION } from '../apps/wecare-ops/dashboard/sections.mjs';

test('WECARE Ops exposes only the approved initial dashboard sections', () => {
  assert.deepEqual(WECARE_OPS_SECTIONS.map(section => section.label), [
    'Overview', 'Orders', 'Order IDs', 'SKU Manager', 'System Tools',
  ]);
});

test('dashboard scaffold is explicit about the Wix registration boundary', () => {
  assert.equal(WECARE_OPS_REGISTRATION.installed, false);
  assert.match(WECARE_OPS_REGISTRATION.reason, /editor|cli/i);
});

test('dashboard component is private-admin oriented and keeps SKU apply disabled before registration', () => {
  const source = readFileSync(new URL('../apps/wecare-ops/dashboard/wecare-ops.tsx', import.meta.url), 'utf8');
  assert.match(source, /WECARE Ops/);
  assert.match(source, /SKU Manager/);
  assert.match(source, /disabled=\{!WECARE_OPS_REGISTRATION\.installed\}/);
});
