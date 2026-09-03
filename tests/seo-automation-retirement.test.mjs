import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const events = readFileSync(new URL('../src/backend/events.js', import.meta.url), 'utf8');
const jobs = readFileSync(new URL('../src/backend/jobs.config', import.meta.url), 'utf8');

assert.doesNotMatch(events, /triggerSeoAudit|AI_AUDIT_URL|LEGACY_WEBHOOK_URL|blogseoapply|wixBlog_onPostPublished|wixBlog_onPostUpdated/, 'blog publish/update events must not write or trigger SEO');
assert.doesNotMatch(jobs, /seo-sweep|nightlySeoSweep/i, 'scheduled SEO sweep must be retired');
assert.match(events, /wixEcom_onOrderApproved/, 'order notification event must be preserved');
assert.match(jobs, /dailySelfHit/, 'non-SEO pinger job must be preserved');
console.log('SEO automation retirement static checks passed');
