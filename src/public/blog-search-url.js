// Release sync marker: 2026-09-04. No runtime behavior change.
export function resolveBlogPostUrl(item = {}) {
  const direct = item.postPageUrl || item.postPageURL;
  if (direct) return String(direct);
  const slug = String(item.slug || '').trim();
  return slug ? '/post/' + encodeURIComponent(slug) : '';
}

export default { resolveBlogPostUrl };
