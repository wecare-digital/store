import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WECARE_OPS_SECTIONS, WECARE_OPS_REGISTRATION } from '../apps/wecare-ops/dashboard/sections.mjs';

const expected = [
  'Overview', 'Orders', 'Order IDs', 'SKU Manager', 'Invoices', 'Payment Links',
  'Forms', 'SEO', 'Automations', 'WhatsApp', 'System Tools'
];

const corePath = new URL('../apps/wecare-ops/dashboard/wecare-dashboard-core.js', import.meta.url);
const coreSource = fs.existsSync(corePath) ? fs.readFileSync(corePath, 'utf8') : '';
const httpPath = new URL('../src/backend/http-functions.js', import.meta.url);
const apiPath = new URL('../src/backend/wecare-dashboard-api.js', import.meta.url);
const httpSource = fs.existsSync(httpPath) ? fs.readFileSync(httpPath, 'utf8') : '';
const apiSource = fs.existsSync(apiPath) ? fs.readFileSync(apiPath, 'utf8') : '';

test('WECARE exposes every approved internal module', () => {
  assert.deepEqual(WECARE_OPS_SECTIONS.map(x => x.label), expected);
});

test('dashboard registration source no longer reports itself uninstalled', () => {
  assert.equal(WECARE_OPS_REGISTRATION.installed, true);
});

test('dashboard core locks authorization to the WECARE site and installed app instance', () => {
  assert.match(coreSource, /c17b0e20-d96d-4fa1-b05c-bc97c04b4ac5/);
  assert.match(coreSource, /774311e1-05a1-4cc8-9ece-3093c30c6543/);
  assert.match(coreSource, /active/);
});

test('dashboard core contains all internal modules but no embedded credentials', () => {
  for (const label of expected) assert.match(coreSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(coreSource, /APP_SECRET|access[_-]?token\s*[:=]\s*['\"][^'\"]+/i);
});

test('HTTP gateway validates the signed Wix instance through token-info before serving UI or API', () => {
  assert.match(httpSource, /https:\/\/www\.wixapis\.com\/oauth2\/token-info/);
  assert.match(httpSource, /isAuthorizedTokenInfo/);
  assert.match(httpSource, /get_wecareDashboard/);
  assert.match(httpSource, /post_wecareApi/);
});

test('dashboard API exposes the approved live actions and keeps SKU writes dry-run-first', () => {
  for (const action of ['status','orders','orderIds','skuMissing','skuReprefix','seoStatus','automations']) assert.match(apiSource, new RegExp(action));
  assert.match(apiSource, /dryRun\s*=\s*dryRun\s*!==\s*false/);
  assert.match(apiSource, /WHATSAPP_ACCESS_TOKEN/);
  assert.match(apiSource, /WHATSAPP_PHONE_NUMBER_ID/);
  assert.match(apiSource, /WHATSAPP_WABA_ID/);
});
