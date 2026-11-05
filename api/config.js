// These two values are public. Authorization is enforced by Supabase Auth and RLS.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Penyimpanan tim belum dikonfigurasi.' });
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || key.startsWith('sb_secret_')) throw new Error();
    // Legacy service-role JWTs must never be delivered to a browser.
    if (key.split('.').length === 3) {
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (claims.role !== 'anon') throw new Error();
    } else if (!key.startsWith('sb_publishable_')) throw new Error();
  } catch {
    return res.status(503).json({ error: 'Konfigurasi penyimpanan tim tidak valid.' });
  }
  return res.status(200).json({ url: url.replace(/\/$/, ''), key });
}
