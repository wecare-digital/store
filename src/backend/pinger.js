const B = 'https://www.wecare.digital';
const CONCURRENCY = 5;
const RETRIES = 2;
const BACKOFF = 800;
const STAGGER = 80;

function targets() {
  return [
    B + '/_functions/canonicalize?url=' + encodeURIComponent(B + '/?utm_source=x'),
    B + '/_functions/faq', B + '/_functions/contact',
    B + '/_functions/llms', B + '/_functions/llmstxt', B + '/_functions/llmslong',
    B + '/_functions/aiindex', B + '/_functions/siteinfo', B + '/_functions/discovery',
    B + '/_functions/robots', B + '/_functions/smindex', B + '/_functions/sitemap',
    B + '/_functions/smtxt', B + '/_functions/stats',
    B + '/_functions/rss', B + '/_functions/rssblog', B + '/_functions/rssproducts',
    B + '/_functions/products?limit=1', B + '/_functions/collections?limit=1', B + '/_functions/health',
    B + '/pages-sitemap.xml', B + '/blog-posts-sitemap.xml', B + '/store-products-sitemap.xml',
  ];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ping(url) {
  try { const r = await fetch(url, { method: 'get', headers: { 'X-WeCare-Job': 'pinger' } }); await r.text().catch(() => null); return { url, ok: r.ok, status: r.status }; }
  catch (e) { return { url, ok: false, status: 0, error: String(e?.message || e) }; }
}

async function pingRetry(url) {
  let last, attempt = 0;
  while (attempt <= RETRIES) {
    last = await ping(url);
    if (last.ok) return last;
    if (last.status >= 400 && last.status < 500 && last.status !== 429) break;
    attempt++;
    if (attempt <= RETRIES) await sleep(BACKOFF * attempt);
  }
  return last;
}

async function pool(urls) {
  const out = new Array(urls.length);
  let i = 0;
  async function worker() { while (i < urls.length) { const idx = i++; if (idx > 0) await sleep(STAGGER); out[idx] = await pingRetry(urls[idx]); } }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return out;
}

export async function pingSeoSurfaces() {
  const t0 = Date.now(), urls = targets(), results = await pool(urls), ms = Date.now() - t0;
  const errors = results.filter(r => !r.ok);
  if (errors.length) console.warn('[pinger] ' + errors.length + '/' + results.length + ' failures in ' + ms + 'ms');
  else console.log('[pinger] ok — ' + results.length + ' targets in ' + ms + 'ms');
  return { ok: !errors.length, count: results.length, tookMs: ms, failures: errors.length, results };
}

export async function pingSeoNow() { return pingSeoSurfaces(); }
export async function dailySelfHit() { return pingSeoSurfaces(); }
