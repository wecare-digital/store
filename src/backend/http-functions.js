import { ok, badRequest, serverError } from 'wix-http-functions';
import { buildDashboardHtml, isAuthorizedTokenInfo } from 'backend/wecare-dashboard-core.js';
import { runWeCareAction } from 'backend/wecare-dashboard-api.js';

const TOKEN_INFO_URL = 'https://www.wixapis.com/oauth2/token-info';

function json(statusFn, value) {
  return statusFn({ headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(value) });
}

function instanceFrom(request) {
  try { return new URL(request.url).searchParams.get('instance') || ''; }
  catch { return ''; }
}

async function authorize(request) {
  const token = instanceFrom(request);
  if (!token) return false;
  const response = await fetch(TOKEN_INFO_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
  });
  if (!response.ok) return false;
  return isAuthorizedTokenInfo(await response.json());
}

export async function get_wecareDashboard(request) {
  try {
    if (!(await authorize(request))) return badRequest({ headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: 'WECARE dashboard authorization failed.' });
    return ok({
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors https://manage.wix.com https://www.wix.com https://editor.wix.com"
      },
      body: buildDashboardHtml()
    });
  } catch (error) {
    return serverError({ headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: error?.message || 'WECARE dashboard error.' });
  }
}

export async function post_wecareApi(request) {
  try {
    if (!(await authorize(request))) return json(badRequest, { ok: false, error: 'WECARE API authorization failed.' });
    const body = await request.body.json();
    const result = await runWeCareAction(body || {});
    return json(ok, { ok: true, ...result });
  } catch (error) {
    return json(serverError, { ok: false, error: error?.message || 'WECARE API error.' });
  }
}
