import wixData from 'wix-data';
import wixWindow from 'wix-window-frontend';
import wixLocation from 'wix-location-frontend';
import { resolveBlogPostUrl } from 'public/blog-search-url.js';

const COLLECTION = 'Blog/Posts';
const DEBOUNCE = 150;

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function linkHtml(label) { return '<p style="margin:0"><span style="font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#000;text-decoration:underline;cursor:pointer">' + esc(label) + '</span></p>'; }

function optionalElement(select, id) {
  try { return select(id); } catch (_) { return null; }
}

// The caller supplies its page-scoped selector; this module has no page global.
export function initBlogSearch(select) {
  const input = optionalElement(select, '#searchInput');
  const rep = optionalElement(select, '#resultsRepeater');
  if (!input || typeof input.onInput !== 'function' || !rep || typeof rep.onItemReady !== 'function') {
    console.error('[blog-search] Missing searchInput or resultsRepeater; check the page element IDs.');
    return;
  }
  const box = optionalElement(select, '#resultsBox') || rep;
  const noText = optionalElement(select, '#noResultsText');
  const isMobile = wixWindow.formFactor === 'Mobile';
  let timer = null, version = 0, resolvedQuery = '', results = [];

  function reset() {
    results = []; resolvedQuery = ''; rep.data = [];
    if (noText) noText.hide();
    box.collapse();
  }

  function reveal() {
    const wasCollapsed = box.collapsed;
    box.show(); box.expand(); rep.show(); rep.expand();
    if (isMobile && wasCollapsed) {
      try { box.scrollTo().catch(() => {}); } catch (_) { /* Optional mobile scroll. */ }
    }
  }

  function navigate(item) {
    const url = resolveBlogPostUrl(item);
    if (url) { input.value = item.title || ''; wixLocation.to(url); }
  }

  function showMessage(message) {
    if (noText) { noText.text = message; noText.show(); noText.expand(); }
    reveal();
  }

  async function search(query, requestVersion, goFirst) {
    try {
      const response = await wixData.query(COLLECTION).contains('title', query)
        .ascending('title').limit(isMobile ? 6 : 10).find();
      if (requestVersion !== version || input.value.trim() !== query) return;
      results = response.items || [];
      resolvedQuery = query;
      rep.data = results;
      if (results.length) {
        if (noText) noText.hide();
        reveal();
        if (goFirst) navigate(results[0]);
      } else {
        showMessage('No posts found');
      }
    } catch (error) {
      if (requestVersion !== version || input.value.trim() !== query) return;
      reset();
      console.error('[blog-search] Search failed', error);
      showMessage('Search is temporarily unavailable. Please try again.');
    }
  }

  rep.onItemReady(($item, data) => {
    const t = data.title || '';
    const title = optionalElement($item, '#resultTitle');
    const row = optionalElement($item, '#rowBox');
    if (!title) {
      console.error('[blog-search] Missing resultTitle inside resultsRepeater.');
      return;
    }
    try { title.html = linkHtml(t); } catch (_) { title.text = t; }
    if (isMobile && row) {
      try { row.height = Math.max(row.height, 48); } catch (_) { /* Editor may fix row height. */ }
    }
    const go = () => navigate(data);
    title.onClick(go);
    if (row && typeof row.onClick === 'function') row.onClick(go);
  });
  reset();

  input.onInput(() => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    const requestVersion = ++version;
    const q = input.value.trim();
    reset();
    if (!q) return;
    timer = setTimeout(() => { timer = null; search(q, requestVersion, false); }, DEBOUNCE);
  });

  input.onKeyPress(e => {
    if (e.key === 'Enter') {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      const q = input.value.trim();
      if (!q) return;
      const requestVersion = ++version;
      if (results.length && q === resolvedQuery) navigate(results[0]);
      else search(q, requestVersion, true);
    }
  });
}

export default { initBlogSearch };
