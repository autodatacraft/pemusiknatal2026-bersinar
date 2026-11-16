export function configuration() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server belum dikonfigurasi. Hubungi koordinator.');
  if (new URL(url).protocol !== 'https:') throw new Error('Konfigurasi server tidak valid.');
  if (!key.startsWith('sb_secret_')) {
    try { if (JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role !== 'service_role') throw new Error(); }
    catch { throw new Error('Server memerlukan secret key Supabase.'); }
  }
  return { url: url.replace(/\/$/, ''), key };
}
export function noCache(res) {
  res.setHeader('Cache-Control', 'private, no-store');
}
export function sameOrigin(req) {
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers?.origin;
  if (!origin) return true; // Allow non-browser clients.
  try { const u = new URL(origin); return u.protocol === 'https:' && u.host === req.headers?.host; }
  catch { return false; }
}
export function readBody(req) {
  if (!(req.headers?.['content-type'] || '').startsWith('application/json')) throw new Error('JSON required');
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 500000) throw new Error('Invalid body');
  return body;
}
export async function database(path, options = {}) {
  const { url, key } = configuration();
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  return fetch(url + '/rest/v1/' + path, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(10000) });
}
