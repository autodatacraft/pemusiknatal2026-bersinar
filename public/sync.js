/* Shared document with server-verified team password and HttpOnly session. */
(() => {
  let revision = null, pending = null, generation = 0;
  let saving = false, conflicted = false, timer, polling, ready = false;
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
        try { await fetchDocument(true); pending = null; conflicted = false; generation++; status('Tersinkron dengan tim'); banner(''); }
        catch { banner('Versi tim belum dapat dimuat. Perubahan kamu tetap ada di layar.', true); }
      }; node.append(loadButton);
    }
  }
  function authMessage(text) { $('authstatus').textContent = text; }
  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    if (response.status === 409) { const err = new Error('conflict'); err.conflict = true; throw err; }
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || (response.status === 401 ? 'Sesi berakhir. Ekspor perubahan lalu masuk kembali.' : 'Penyimpanan belum dapat dijangkau. Coba lagi.'));
    }
    return response.json();
  }
  async function fetchDocument(force = false) {
    const row = await request('/api/preparation');
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
      const row = await request('/api/preparation', { method: 'PUT',
        body: JSON.stringify({ revision, payload }) });
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
    event.preventDefault();
    $('signin').disabled = true;
    authMessage('Memeriksa password…');
    try {
      await request('/api/auth', { method: 'POST', body: JSON.stringify({ password: $('password').value }) });
      $('password').value = '';
      await start();
    } catch (e) { authMessage(e.message); }
    finally { $('signin').disabled = false; }
  });
  $('logout').onclick = async () => {
    if ((pending || saving) && !confirm('Ada perubahan yang belum tersimpan. Pilih Batal untuk mengekspor cadangan dahulu, atau OK untuk keluar.')) return;
    try {
      await request('/api/auth', { method: 'DELETE' });
      clearInterval(polling); clearTimeout(timer); ready = false; pending = null;
      location.replace(location.origin + '/');
    } catch { banner('Belum dapat keluar. Periksa koneksi dan coba lagi.'); }
  };
  window.addEventListener('beforeunload', event => {
    if (pending || saving) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('online', () => { if (pending) flush(); });
  window.addEventListener('pagehide', () => clearInterval(polling));
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  async function bootstrap() {
    $('signin').disabled = true;
    // Remove sessions from the retired email authentication flow.
    try { localStorage.removeItem('bersinar.auth.v1'); } catch {}
    if (location.hash) history.replaceState(null, '', location.pathname);
    try {
      const result = await request('/api/auth');
      $('signin').disabled = false;
      if (result.authenticated) await start();
      else authMessage('Gunakan password yang dibagikan koordinator tim.');
    } catch (e) { authMessage(e.message); }
  }
  bootstrap();
})();
