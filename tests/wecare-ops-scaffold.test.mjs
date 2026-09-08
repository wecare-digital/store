import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WECARE_OPS_SECTIONS, WECARE_OPS_REGISTRATION } from '../apps/wecare-ops/dashboard/sections.mjs';

const approved = [
  'Overview', 'Orders', 'Order IDs', 'SKU Manager', 'Invoices', 'Payment Links',
  'Forms', 'SEO', 'Automations', 'WhatsApp', 'System Tools',
];

test('WECARE exposes the approved internal dashboard sections', () => {
  assert.deepEqual(WECARE_OPS_SECTIONS.map(section => section.label), approved);
});

test('dashboard registration reflects the registered private WECARE extension', () => {
  assert.equal(WECARE_OPS_REGISTRATION.installed, true);
  assert.equal(WECARE_OPS_REGISTRATION.title, 'WECARE');
  assert.equal(WECARE_OPS_REGISTRATION.routePath, 'wecare');
});

test('dashboard component is private-admin oriented and branded WECARE', () => {
  const source = readFileSync(new URL('../apps/wecare-ops/dashboard/wecare-ops.tsx', import.meta.url), 'utf8');
  assert.match(source, /title="WECARE"/);
  assert.match(source, /SKU Manager/);
  assert.match(source, /disabled=\{!WECARE_OPS_REGISTRATION\.installed\}/);
});
