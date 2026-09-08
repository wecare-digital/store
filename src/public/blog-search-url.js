// Release sync marker: 2026-09-07. Wix Search returns `url` directly.
export function resolveBlogPostUrl(item = {}) {
  const direct = item.url || item.postPageUrl || item.postPageURL;
  if (direct) return String(direct);
  const slug = String(item.slug || '').trim();
  return slug ? '/post/' + encodeURIComponent(slug) : '';
}

export default { resolveBlogPostUrl };
