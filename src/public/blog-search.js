import wixData from 'wix-data';
import wixWindow from 'wix-window-frontend';
import wixLocation from 'wix-location-frontend';

const COLLECTION = 'Blog/Posts';
const DEBOUNCE = 150;

let timer = null, lastQ = '', isMobile = false, results = [];

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function linkHtml(label) { return '<p style="margin:0"><span style="font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#000;text-decoration:underline;cursor:pointer">' + esc(label) + '</span></p>'; }

function search(query, repeater, box, noText, goFirst) {
  lastQ = query;
  const limit = isMobile ? 6 : 10;
  wixData.query(COLLECTION).contains('title', query).ascending('title').limit(limit).find()
    .then(r => {
      if (query !== lastQ) return;
      results = r.items || [];
      if (results.length) {
        repeater.data = results;
        noText.hide();
        if (box.collapsed) { box.expand(); if (isMobile) box.scrollTo().catch(() => {}); }
        if (goFirst) { const url = results[0].postPageUrl || results[0].postPageURL; if (url) { $w('#searchInput').value = results[0].title; wixLocation.to(url); } }
      } else {
        repeater.data = [];
        if (query) { noText.show(); box.expand(); } else { noText.hide(); box.collapse(); }
      }
    })
    .catch(() => { results = []; repeater.data = []; noText.hide(); box.collapse(); });
}

export function initBlogSearch() {
  isMobile = wixWindow.formFactor === 'Mobile';
  if (!($w('#searchInput') && $w('#resultsBox') && $w('#resultsRepeater') && $w('#noResultsText'))) return;
  const input = $w('#searchInput'), box = $w('#resultsBox'), rep = $w('#resultsRepeater'), noText = $w('#noResultsText');
  box.collapse(); rep.data = []; results = []; noText.hide();

  rep.onItemReady(($item, data) => {
    const t = data.title || '';
    try { $item('#resultTitle').html = linkHtml(t); } catch (_) { $item('#resultTitle').text = t; }
    if (isMobile) try { $item('#rowBox').height = Math.max($item('#rowBox').height, 48); } catch (_) {}
    const go = () => { const url = data.postPageUrl || data.postPageURL; if (url) { input.value = t; wixLocation.to(url); } };
    $item('#resultTitle').onClick(go);
    $item('#rowBox').onClick(go);
  });

  input.onInput(() => {
    const q = input.value.trim();
    if (!q) { lastQ = ''; results = []; rep.data = []; noText.hide(); box.collapse(); return; }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => search(q, rep, box, noText, false), DEBOUNCE);
  });

  input.onKeyPress(e => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (!q) return;
      if (results.length && q === lastQ) { const url = results[0].postPageUrl || results[0].postPageURL; if (url) { input.value = results[0].title; wixLocation.to(url); } }
      else search(q, rep, box, noText, true);
    }
  });
}

export default { initBlogSearch };
