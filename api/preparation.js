import { database, noCache, readBody, sameOrigin } from '../lib/server.js';
import { validPreparation } from '../lib/validation.js';
import initialPreparation from '../supabase/seed.json' with { type: 'json' };
const READ_PATH = 'preparations?id=eq.natal2026&select=payload,revision';
function issue(code, message) { return Object.assign(new Error(message), { code }); }
async function requireDatabase(response, operation) {
  if (response.ok) return;
  const detail = await response.json().catch(() => ({}));
  const code = typeof detail?.code === 'string' && /^[A-Z0-9_]{1,30}$/.test(detail.code) ? detail.code : 'DATABASE_ERROR';
  // Do not log response bodies, payloads, keys or request headers.
  console.error('preparation_database_error', { operation, status: response.status, code });
  if (code === '42P01' || code === 'PGRST205') throw issue('DATABASE_SETUP_REQUIRED', 'Tabel persiapan belum tersedia. Minta koordinator menyelesaikan pengaturan database.');
  if (code === 'PGRST202' || code === '42883') throw issue('DATABASE_SETUP_REQUIRED', 'Fungsi penyimpanan belum tersedia. Minta koordinator menyelesaikan pengaturan database.');
  if (code === '42501' || response.status === 401 || response.status === 403) throw issue('DATABASE_PERMISSION_DENIED', 'Izin akses database belum lengkap. Minta koordinator memeriksa pengaturan server.');
  throw issue('DATABASE_UNAVAILABLE', 'Data tim belum dapat dijangkau. Coba lagi atau hubungi koordinator.');
}
async function readPreparation() {
  let response = await database(READ_PATH);
  await requireDatabase(response, 'read');
  let rows = await response.json();
  if (!Array.isArray(rows)) throw issue('PREPARATION_INVALID', 'Data persiapan tidak dapat dibaca. Hubungi koordinator.');
  if (!rows.length) {
    // A fresh database may have been created without its seed.
    // Ignore duplicates and read again: a concurrent user's document must never be overwritten.
    response = await database('preparations?on_conflict=id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ id: 'natal2026', payload: initialPreparation, revision: 0 })
    });
    await requireDatabase(response, 'initialize');
    response = await database(READ_PATH);
    await requireDatabase(response, 'read_after_initialize');
    rows = await response.json();
  }
  if (!Array.isArray(rows) || !rows.length) throw issue('PREPARATION_NOT_INITIALIZED', 'Data persiapan awal belum tersedia. Minta koordinator menyelesaikan pengaturan database.');
  if (!validPreparation(rows[0].payload) || !Number.isSafeInteger(rows[0].revision) || rows[0].revision < 0) {
    throw issue('PREPARATION_INVALID', 'Data persiapan tidak valid. Hubungi koordinator; data yang ada tetap dipertahankan.');
  }
  return rows[0];
}
export default async function handler(req, res) {
  noCache(res);
  if (!['GET','PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (req.method === 'PUT' && !sameOrigin(req)) return res.status(403).json({ error: 'Permintaan ditolak.' });
  let body;
  if (req.method === 'PUT') {
    try { body = readBody(req); } catch { return res.status(400).json({ error: 'Data tidak valid atau terlalu besar.' }); }
    if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !validPreparation(body.payload)) return res.status(400).json({ error: 'Data persiapan tidak valid.' });
  }
  try {
    if (req.method === 'GET') return res.status(200).json(await readPreparation());
    const response = await database('rpc/save_preparation_server', { method: 'POST', body: JSON.stringify({ p_revision: body.revision, p_payload: body.payload }) });
    if (response.status === 409) return res.status(409).json({ error: 'Rekan tim telah menyimpan versi baru.' });
    await requireDatabase(response, 'save');
    return res.status(200).json(await response.json());
  } catch (error) {
    const known = ['DATABASE_SETUP_REQUIRED','DATABASE_PERMISSION_DENIED','DATABASE_UNAVAILABLE','PREPARATION_NOT_INITIALIZED','PREPARATION_INVALID'].includes(error?.code);
    const code = known ? error.code : 'DATABASE_UNAVAILABLE';
    const message = known ? error.message : 'Data tim belum dapat dijangkau. Periksa koneksi atau hubungi koordinator.';
    return res.status(503).json({ error: message, code });
  }
}

