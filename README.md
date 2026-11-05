# Bersinar — Pemusik Natal 2026

Ruang persiapan bersama untuk tim musik pelayanan Natal bertema **Bersinar**.
Target repository: **autodatacraft/pemusiknatal2026-bersinar** (private).

## Fitur

- Lima bagian ibadah: Hai Kota Mungil; medley Hai Siarkan + Dari Pulau dan Benua; Hai Mari Berhimpun (kolekte); Yesus Menginginkan Daku (firman); O Holy Night (lilin).
- Pengaturan nada dasar, tempo, intro, outro, cue dan transisi, serta urutan setlist.
- Pembagian pemain dan peran piano/keyboard, drum, gitar, bass guitar.
- Lima checklist tiap lagu, ringkasan kesiapan, catatan keputusan dan daftar hal terbuka.
- Login melalui tautan email, akses anggota tim melalui allowlist database.
- Data bersama di Supabase, pembaruan dari rekan diperiksa setiap 10 detik ketika detail lagu ditutup.
- Autosave dan pemeriksaan revision: perubahan bersamaan tidak langsung menimpa pekerjaan rekan. Jika ada konflik, ekspor perubahan, muat versi tim, lalu terapkan kembali perubahan yang diperlukan.
- Ekspor/impor JSON untuk cadangan dan migrasi dari versi Sites. Impor mengganti dokumen bersama setelah konfirmasi.

## Deploy ke Vercel

1. Buat proyek Supabase milik sendiri. Jalankan seluruh `supabase/schema.sql` di SQL Editor. Skrip menyertakan setlist awal dan akses koordinator `autodatacraft@gmail.com`; pengulangan tidak menimpa persiapan yang sudah ada.
2. Di Supabase **Authentication → URL Configuration**, set **Site URL** dan **Redirect URLs** ke URL produksi Vercel yang digunakan. Jika belum punya URL, buat deployment awal lalu lengkapi pengaturan ini sebelum mencoba login. Untuk preview deployment, tambahkan redirect URL yang sesuai juga.
3. Aktifkan email authentication. Gunakan template Magic Link default yang berisi `{{ .ConfirmationURL }}`. Pengiriman email produksi memerlukan konfigurasi SMTP milik tim dan sender yang valid. Periksa batas pengiriman dan pembatasan penerima pada proyek Supabase; tanpa SMTP kustom, penerima dapat dibatasi.
4. Di Vercel, **Add New → Project → Import Git Repository**, pilih repo privat ini dan izinkan integrasi Vercel mengakses repo bila diminta. Framework **Other**, build command `npm run build`, output directory `public` (sudah dideklarasikan di `vercel.json`).
5. Tambahkan environment variables berikut ke lingkungan Production (dan Preview jika diperlukan):

   | Nama | Isi |
   | --- | --- |
   | `SUPABASE_URL` | URL proyek Supabase, misalnya `https://PROJECT.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | Publishable key `sb_publishable_...` |

   Alternatif proyek lama: gunakan `SUPABASE_ANON_KEY` berisi anon key. **Jangan gunakan `service_role` atau secret key.** Endpoint konfigurasi menolak jenis secret key yang dikenali.
6. Deploy atau redeploy setelah mengubah variabel. Main branch menjadi sumber deployment produksi; push selanjutnya diproses integrasi Git Vercel.
7. Buka situs, kirim tautan masuk ke email koordinator, dan uji dua akun anggota dari browser berbeda sebelum membagikan ke seluruh tim.

Saat konfigurasi belum lengkap, editor tidak dibuka dan halaman meminta koordinator menyelesaikan pengaturan. Aplikasi tidak menyimpan persiapan tim secara lokal sebagai pengganti database.

## Tambah atau cabut akses anggota

Jalankan melalui SQL Editor Supabase (ganti contoh dengan email anggota sebenarnya):

```sql
insert into public.team_members(email)
values (lower('rekan@example.com'))
on conflict do nothing;
```

Untuk mencabut akses:

```sql
delete from public.team_members where email = lower('rekan@example.com');
```

Anggota mendapat akses setelah login dengan email tersebut. Semua anggota allowlist dapat membaca dan mengubah seluruh persiapan; tidak ada pemisahan viewer/editor dalam versi ini. Daftar anggota hanya dapat dikelola melalui database oleh pengelola proyek. Repository privat membatasi akses kode; akses data aplikasi diatur terpisah oleh Supabase Auth dan RLS.

## Migrasi data dari Sites

Pada situs lama klik **Ekspor**, lalu pada aplikasi baru setelah login pilih **Impor** dan setujui penggantian. Jangan memasukkan cadangan persiapan atau kredensial asli ke repository.

## Pengembangan dan pemeriksaan

Tidak ada dependency runtime tambahan. Gunakan Node.js 22 atau lebih baru.

```sh
npm test
npm run build
```

Untuk preview aplikasi beserta endpoint konfigurasi gunakan Vercel CLI `vercel dev` setelah mengatur environment lokal sesuai `.env.example`. Menyajikan direktori `public` saja tidak menjalankan `/api/config`.

`npm test` memeriksa isi setlist, endpoint konfigurasi, sinkronisasi revision, penanganan konflik, dan penolakan nonanggota dengan mock. Pengujian end-to-end email, kebijakan SQL, dan deployment memerlukan proyek Supabase/Vercel yang dikonfigurasi; belum termasuk dalam pengujian mock.

## Struktur

- `public/index.html`: tampilan responsif
- `public/app.js`: alur ibadah dan editor
- `public/sync.js`: login, sesi, autosave dan konflik
- `api/config.js`: Vercel Function untuk URL dan public key Supabase
- `supabase/schema.sql`: tabel, RLS, fungsi simpan, allowlist dan seed
- `supabase/seed.json`: data awal referensi
- `tests/project.test.mjs`: pengujian utama

## Referensi resmi

- https://vercel.com/docs/deployments/git
- https://vercel.com/docs/environment-variables
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/database/postgres/row-level-security
