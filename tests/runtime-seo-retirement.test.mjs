import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const master = readFileSync(new URL('../src/pages/masterPage.js', import.meta.url), 'utf8');
const hygiene = readFileSync(new URL('../src/public/site-hygiene.js', import.meta.url), 'utf8');

assert.doesNotMatch(master, /seo-controller|applySeo\s*\(/, 'master page must not invoke runtime SEO');
assert.doesNotMatch(hygiene, /canonicalize|setDefaultImageAlts|ensureAltObserver/, 'site hygiene must not mutate SEO/canonical/alt metadata');
assert.match(hygiene, /compId/, 'component-id cleanup stays until editor labels are verified');
assert.match(master, /initButtonNormalize/, 'button workaround stays until editor styling is verified');
console.log('runtime SEO retirement static checks passed');
