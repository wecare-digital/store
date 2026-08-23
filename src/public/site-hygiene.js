import wixLocation from 'wix-location-frontend';
import wixWindow from 'wix-window-frontend';

const STRIP = [
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id',
  'utm_source_platform','utm_creative_format','utm_marketing_tactic',
  'fbclid','gclid','msclkid','wbraid','gbraid','ttclid','twclid','yclid',
  'mc_eid','irclickid',
  'wixCodeMetaId','wixCodePageId','wixCodeInstance',
  'instance','compId','viewerCompId','siteRevision',
  'ref','src','appSectionParams'
];

async function fetchJSON(url) {
  try { const r = await fetch(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store' }); if (!r.ok) return null; return await r.json().catch(() => null); } catch { return null; }
}

function cleanUrl() {
  try {
    const url = new URL(location.href);
    let changed = false;
    STRIP.forEach(k => { if (url.searchParams.has(k)) { url.searchParams.delete(k); changed = true; } });
    const asp = url.searchParams.get('appSectionParams');
    if (asp) {
      try {
        const obj = JSON.parse(asp);
        if (obj && obj.origin === 'wixcode') { url.searchParams.delete('appSectionParams'); changed = true; }
      } catch {
        url.searchParams.delete('appSectionParams');
        changed = true;
      }
    }
    if (changed) history.replaceState({}, document.title, url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash);
  } catch {}
}

async function normalizeWithCanonicalizer() {
  try {
    const res = await fetchJSON('/_functions/canonicalize?url=' + encodeURIComponent(location.href));
    if (res && res.ok && res.changed && res.canonical) {
      const u = new URL(res.canonical);
      history.replaceState({}, document.title, u.pathname + (u.search || '') + (u.hash || ''));
    }
  } catch {}
}

function setDefaultImageAlts(scope, defaultAlt) {
  (scope || document).querySelectorAll('img').forEach(img => {
    try { if (!img.hasAttribute('alt') || !img.getAttribute('alt')) img.setAttribute('alt', defaultAlt); } catch {}
  });
}

let altObserver;
function ensureAltObserver(defaultAlt) {
  if (altObserver) return;
  try {
    altObserver = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach(n => { if (n.nodeType === 1) setDefaultImageAlts(n.tagName === 'IMG' ? n.parentNode : n, defaultAlt); });
        else if (m.type === 'attributes' && m.target.tagName === 'IMG' && !m.target.getAttribute('alt')) m.target.setAttribute('alt', defaultAlt);
      }
    });
    altObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['alt'] });
  } catch {}
}

async function runOnce(opts) {
  cleanUrl();
  setTimeout(cleanUrl, 300);
  setTimeout(cleanUrl, 800);
  setTimeout(cleanUrl, 1500);
  setTimeout(cleanUrl, 3000);
  if (opts.useCanonicalize) await normalizeWithCanonicalizer();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { setDefaultImageAlts(document, opts.defaultAlt); ensureAltObserver(opts.defaultAlt); });
  else { setDefaultImageAlts(document, opts.defaultAlt); ensureAltObserver(opts.defaultAlt); }
}

let started = false;
export function initHygiene(options = { useCanonicalize: true, defaultAlt: 'WECARE.DIGITAL' }) {
  if (started) return;
  started = true;
  if (wixWindow.rendering.env !== 'browser') return;
  runOnce(options).catch(() => {});
  try { wixLocation.onChange(() => { started = false; runOnce(options).catch(() => {}); }); } catch {}
  try { window.addEventListener('popstate', cleanUrl); } catch {}
}

export default { initHygiene };
