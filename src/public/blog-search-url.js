export function resolveBlogPostUrl(item = {}) {
  const direct = item.postPageUrl || item.postPageURL;
  if (direct) return String(direct);
  const slug = String(item.slug || '').trim();
  return slug ? '/post/' + encodeURIComponent(slug) : '';
}

export default { resolveBlogPostUrl };
