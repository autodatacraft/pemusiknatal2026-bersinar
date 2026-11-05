import { authenticated, clearCookie, configuration, loginAllowed, matchesPassword, noCache, readBody, sameOrigin, sessionCookie } from '../lib/server.js';
export default async function handler(req, res) {
  noCache(res);
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({ error: 'Permintaan ditolak.' });
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearCookie()); return res.status(200).json({ authenticated: false });
  }
  try { configuration(); } catch { return res.status(503).json({ error: 'Ruang persiapan belum diaktifkan. Hubungi koordinator.' }); }
  if (req.method === 'GET') return res.status(200).json({ authenticated: authenticated(req) });
  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ error: 'Permintaan tidak valid.' }); }
  if (typeof body.password !== 'string' || body.password.length > 256) return res.status(400).json({ error: 'Masukkan password tim.' });
  try {
    if (!await loginAllowed(req)) {
      res.setHeader('Retry-After', '900');
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
    }
    if (!await matchesPassword(body.password)) return res.status(401).json({ error: 'Password salah. Coba lagi.' });
    res.setHeader('Set-Cookie', sessionCookie());
    return res.status(200).json({ authenticated: true });
  } catch { return res.status(503).json({ error: 'Login belum tersedia. Hubungi koordinator untuk menyelesaikan pengaturan.' }); }
}
