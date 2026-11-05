import { authenticated, database, noCache, readBody, sameOrigin } from '../lib/server.js';
import { validPreparation } from '../lib/validation.js';
export default async function handler(req, res) {
  noCache(res);
  if (!['GET','PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!authenticated(req)) return res.status(401).json({ error: 'Masuk dengan password tim terlebih dahulu.' });
  if (req.method === 'PUT' && !sameOrigin(req)) return res.status(403).json({ error: 'Permintaan ditolak.' });
  let body;
  if (req.method === 'PUT') {
    try { body = readBody(req); } catch { return res.status(400).json({ error: 'Data tidak valid atau terlalu besar.' }); }
    if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !validPreparation(body.payload)) return res.status(400).json({ error: 'Data persiapan tidak valid.' });
  }
  try {
    const response = req.method === 'GET'
      ? await database('preparations?id=eq.natal2026&select=payload,revision')
      : await database('rpc/save_preparation_server', { method: 'POST', body: JSON.stringify({ p_revision: body.revision, p_payload: body.payload }) });
    if (response.status === 409) return res.status(409).json({ error: 'Rekan tim telah menyimpan versi baru.' });
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (req.method === 'GET') {
      if (!result.length || !validPreparation(result[0].payload)) throw new Error();
      return res.status(200).json(result[0]);
    }
    return res.status(200).json(result);
  } catch { return res.status(503).json({ error: 'Data tim belum dapat dijangkau. Periksa koneksi atau hubungi koordinator.' }); }
}
