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

function runOnce() {
  cleanUrl();
  setTimeout(cleanUrl, 300);
  setTimeout(cleanUrl, 800);
  setTimeout(cleanUrl, 1500);
  setTimeout(cleanUrl, 3000);
}

let started = false;
export function initHygiene() {
  if (started) return;
  started = true;
  if (wixWindow.rendering.env !== 'browser') return;
  runOnce();
  try { wixLocation.onChange(() => { started = false; runOnce(); }); } catch {}
  try { window.addEventListener('popstate', cleanUrl); } catch {}
}

export default { initHygiene };
