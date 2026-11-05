/* Shared document, email authentication and optimistic concurrency. No service key. */
(() => {
  const SESSION_KEY = 'bersinar.auth.v1';
  let config, session, revision = null, pending = null, generation = 0;
  let saving = false, conflicted = false, timer, refreshing, polling, ready = false;
  const $ = id => document.getElementById(id);
  const api = window.bersinarSync = { status: 'Menghubungkan…', queue };
  function status(text) { api.status = text; $('savemsg').textContent = text; }
  function banner(text, reload = false) {
    const node = $('syncbanner'); node.hidden = !text; node.replaceChildren();
    if (!text) return;
    node.append(document.createTextNode(text));
    if (reload) {
      const exportButton = document.createElement('button');
      exportButton.className = 'btn secondary'; exportButton.textContent = 'Ekspor perubahan saya';
      exportButton.onclick = () => $('export').click(); node.append(document.createElement('br'), exportButton);
      const loadButton = document.createElement('button');
      loadButton.className = 'btn'; loadButton.textContent = 'Muat versi tim';
      loadButton.onclick = async () => {
        if (!confirm('Ganti perubahan yang belum tersimpan dengan versi terbaru tim? Ekspor dahulu bila perlu.')) return;
        try { await fetchDocument(true); pending = null; conflicted = false; generation++; banner(''); }
        catch { banner('Versi tim belum dapat dimuat. Perubahan kamu tetap ada di layar.', true); }
      }; node.append(loadButton);
    }
  }
  function authMessage(text) { $('authstatus').textContent = text; }
  function keepSession(value) {
    session = value;
    try { if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value)); else localStorage.removeItem(SESSION_KEY); }
    catch { /* Current tab still works if browser storage is unavailable. */ }
  }
  async function token() {
    if (!session) throw new Error('Masuk kembali untuk melanjutkan.');
    if (session.expires_at > Date.now() + 60000) return session.access_token;
    if (!refreshing) refreshing = (async () => {
      const res = await fetch(config.url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!res.ok) throw new Error('Sesi berakhir. Ekspor perubahan lalu masuk kembali.');
      const next = await res.json(); keepSession({ ...next, expires_at: Date.now() + next.expires_in * 1000 });
      return next.access_token;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  async function request(path, options = {}) {
    const access = await token();
    const response = await fetch(config.url + '/rest/v1/' + path, {
      ...options, headers: { apikey: config.key, Authorization: 'Bearer ' + access,
        'Content-Type': 'application/json', ...options.headers }
    });
    if (response.status === 409) { const err = new Error('conflict'); err.conflict = true; throw err; }
    if (!response.ok) throw new Error(response.status === 401 ? 'Sesi berakhir. Ekspor lalu masuk kembali.' : 'Penyimpanan belum dapat dijangkau. Periksa koneksi dan akses tim.');
    return response.json();
  }
  async function fetchDocument(force = false) {
    const rows = await request('preparations?id=eq.natal2026&select=payload,revision');
    if (!rows.length) throw new Error('Email ini belum mendapat akses. Hubungi koordinator tim.');
    const row = rows[0];
    if (!valid(row.payload)) throw new Error('Data tim tidak dapat dibaca. Hubungi koordinator.');
    if (force || (pending === null && !saving && !selected && revision !== row.revision)) {
      if (selected) closeModal();
      data = row.payload; revision = row.revision; render();
    }
    if (pending === null && !saving && !conflicted) status('Tersinkron dengan tim');
  }
  function queue(payload) {
    if (!ready) return;
    pending = JSON.parse(JSON.stringify(payload)); generation++;
    status(conflicted ? 'Perlu menyelaraskan perubahan' : 'Menyimpan perubahan…');
    clearTimeout(timer); timer = setTimeout(flush, 600);
  }
  async function flush() {
    if (saving || conflicted || pending === null || !ready) return;
    saving = true;
    const payload = pending, startedGeneration = generation;
    try {
      const row = await request('rpc/save_preparation', { method: 'POST',
        body: JSON.stringify({ p_revision: revision, p_payload: payload }) });
      revision = row.revision;
      if (generation === startedGeneration) pending = null;
      status(pending ? 'Menyimpan perubahan…' : 'Tersinkron dengan tim'); banner('');
    } catch (e) {
      if (e.conflict) { conflicted = true; status('Ada perubahan dari rekan tim');
        banner('Rekan tim telah menyimpan versi baru. Ekspor perubahanmu sebelum memuat versi tim, lalu terapkan kembali bagian yang diperlukan.', true);
      } else { status('Belum tersinkron'); banner(e.message + ' Perubahan masih ada di tab ini; simpan cadangan lewat Ekspor.'); }
    } finally {
      saving = false;
      if (pending && !conflicted) { clearTimeout(timer); timer = setTimeout(flush, 4000); }
    }
  }
  async function start() {
    await fetchDocument(true); ready = true;
    $('authgate').hidden = true; document.body.classList.remove('auth-pending');
    clearInterval(polling);
    polling = setInterval(async () => {
      if (document.hidden || pending || saving || conflicted || selected) return;
      try { await fetchDocument(); banner(''); }
      catch (e) { status('Koneksi tim terputus'); banner(e.message); }
    }, 10000);
  }
  $('loginform').addEventListener('submit', async event => {
    event.preventDefault(); if (!config) return;
    $('sendlink').disabled = true;
    try {
      const res = await fetch(config.url + '/auth/v1/otp?redirect_to=' + encodeURIComponent(location.origin + '/'), {
        method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('email').value.trim(), create_user: true })
      });
      if (!res.ok) throw new Error('Tautan belum dapat dikirim. Coba beberapa saat lagi atau hubungi koordinator.');
      authMessage('Periksa email untuk tautan masuk. Gunakan tautan terbaru dan cek folder spam jika perlu.');
    } catch (e) { authMessage(e.message); }
    finally { $('sendlink').disabled = false; }
  });
  $('logout').onclick = async () => {
    if ((pending || saving) && !confirm('Ada perubahan yang belum tersimpan. Pilih Batal untuk mengekspor cadangan dahulu, atau OK untuk keluar.')) return;
    clearInterval(polling); clearTimeout(timer); ready = false;
    try { const access = await token(); await fetch(config.url + '/auth/v1/logout?scope=local', {
      method: 'POST', headers: { apikey: config.key, Authorization: 'Bearer ' + access }
    }); } catch { /* Clear this device even when disconnected. */ }
    keepSession(null); location.replace(location.origin + '/');
  };
  window.addEventListener('beforeunload', event => {
    if (pending || saving) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('online', () => { if (pending) flush(); });
  window.addEventListener('pagehide', () => clearInterval(polling));
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  async function bootstrap() {
    $('sendlink').disabled = true;
    try {
      const res = await fetch('/api/config', { cache: 'no-store' });
      if (!res.ok) throw new Error('Ruang persiapan tim belum diaktifkan. Hubungi koordinator untuk menyelesaikan pengaturan.');
      config = await res.json();
      const hash = new URLSearchParams(location.hash.slice(1));
      // Clear credentials from the address bar immediately, even on malformed responses.
      if (location.hash) history.replaceState(null, '', location.pathname);
      if (hash.get('error_description')) throw new Error('Tautan masuk sudah tidak berlaku. Minta tautan baru.');
      if (hash.get('access_token') && hash.get('refresh_token')) {
        keepSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token'),
          expires_at: Date.now() + Number(hash.get('expires_in') || 3600) * 1000 });
      } else {
        try { const saved = JSON.parse(localStorage.getItem(SESSION_KEY)); if (saved?.access_token && saved?.refresh_token) session = saved; }
        catch { keepSession(null); }
      }
      $('sendlink').disabled = false;
      if (session) {
        try { await start(); }
        catch (e) { keepSession(null); authMessage(e.message); }
      } else authMessage('Masuk dengan tautan email, tanpa kata sandi.');
    } catch (e) { authMessage(e.message); }
  }
  bootstrap();
})();
