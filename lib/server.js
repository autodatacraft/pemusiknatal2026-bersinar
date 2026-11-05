import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PASSWORD_HASH } from './password.js';
const scrypt = promisify(scryptCallback);
const COOKIE = '__Host-bersinar-session';
const AGE = 7 * 24 * 60 * 60;
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
function signingKey() {
  // Key stays on the server. Rotating the database key or password revokes existing sessions.
  const { key } = configuration();
  return createHmac('sha256', key).update('bersinar-session-v2:' + (process.env.TEAM_PASSWORD || PASSWORD_HASH)).digest();
}
export async function matchesPassword(input) {
  if (typeof input !== 'string' || input.length > 256) return false;
  const [salt, hash] = PASSWORD_HASH.split(':');
  const expected = process.env.TEAM_PASSWORD ? await scrypt(process.env.TEAM_PASSWORD, salt, 64) : Buffer.from(hash, 'hex');
  const actual = await scrypt(input, salt, 64);
  return timingSafeEqual(actual, expected);
}
export function sessionCookie(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + AGE, nonce: randomBytes(16).toString('hex') })).toString('base64url');
  const signature = createHmac('sha256', signingKey()).update(payload).digest('base64url');
  return `${COOKIE}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${AGE}`;
}
export function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; }
export function authenticated(req, now = Date.now()) {
  try {
    const value = (req.headers?.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    if (!value || value.length > 1024) return false;
    const [payload, signature, extra] = value.split('.');
    if (extra || !payload || !signature) return false;
    const expected = createHmac('sha256', signingKey()).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url'));
    return Number.isInteger(decoded.exp) && decoded.exp > now / 1000 && decoded.exp <= now / 1000 + AGE + 60;
  } catch { return false; }
}
export function noCache(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');
}
export function sameOrigin(req) {
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers?.origin;
  if (!origin) return true; // Non-browser clients still need the signed cookie.
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
export async function loginAllowed(req) {
  // Persist the attempt counter in Postgres so it spans serverless instances.
  const address = req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const fingerprint = createHmac('sha256', signingKey()).update('login-ip:' + String(address).split(',')[0].trim()).digest('hex');
  const response = await database('rpc/check_login_limit', { method: 'POST', body: JSON.stringify({ p_fingerprint: fingerprint }) });
  if (!response.ok) throw new Error('Login belum tersedia. Hubungi koordinator.');
  return (await response.json()) === true;
}
