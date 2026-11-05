# Bersinar — Pemusik Natal 2026

Persiapan bersama pelayanan Natal bertema **Bersinar**. Login menggunakan **satu password tim**. Email, akun anggota, magic link dan SMTP tidak diperlukan.

## Fitur

- Setlist: Hai Kota Mungil; medley Hai Siarkan + Dari Pulau dan Benua; Hai Mari Berhimpun (kolekte); Yesus Menginginkan Daku (firman); O Holy Night (lilin).
- Nada dasar, tempo, intro, outro, transisi, urutan ibadah, peran piano/keyboard, drum, gitar dan bass.
- Checklist latihan, ringkasan kesiapan, catatan keputusan dan daftar hal terbuka.
- Data bersama di Supabase melalui API server Vercel; autosave dan pengecekan versi tiap 10 detik saat detail lagu ditutup.
- Konflik penyimpanan tidak langsung menimpa perubahan rekan. Ekspor perubahan sendiri, muat versi tim, lalu terapkan ulang bagian yang diperlukan.
- Ekspor/impor cadangan JSON. Impor mengganti dokumen bersama setelah konfirmasi.

## Deploy baru ke Vercel

1. Buat proyek Supabase, lalu jalankan seluruh `supabase/schema.sql` di SQL Editor. Ini membuat database, pembatasan percobaan login dan setlist awal. Pengulangan tidak menimpa data persiapan yang sudah ada.
2. Impor repo privat `autodatacraft/pemusiknatal2026-bersinar` di Vercel. Framework **Other**, build command `npm run build`, output directory `public` (sudah diatur dalam `vercel.json`).
3. Tambahkan environment variables server di Vercel:

   | Nama | Isi |
   | --- | --- |
   | `SUPABASE_URL` | URL proyek, misalnya `https://PROJECT.supabase.co` |
   | `SUPABASE_SECRET_KEY` | Secret key Supabase `sb_secret_...` |

   Untuk proyek Supabase lama, gunakan `SUPABASE_SERVICE_ROLE_KEY` berisi legacy service-role JWT sebagai pengganti `SUPABASE_SECRET_KEY`. Kunci ini hanya digunakan server; jangan menggunakan prefix `NEXT_PUBLIC_`, memasukkannya ke HTML/JavaScript browser, atau melakukan commit file `.env`.
4. Deploy. Buka situs dan masukkan password tim yang telah disepakati. Kode menyimpan hash scrypt dengan salt di modul server, bukan password asli. Tidak ada pengaturan Supabase Auth atau email yang diperlukan.
5. Bagikan URL situs dan password melalui saluran tim. Setiap orang yang mengetahui password dapat membaca dan mengubah seluruh persiapan.

## Upgrade dari login email

1. Jalankan **`supabase/migrations/002_password_auth.sql`** di Supabase SQL Editor. Data persiapan dan revision tetap dipertahankan. Migrasi mencabut akses browser lama dan RPC login email.
2. Di Vercel, tambahkan `SUPABASE_SECRET_KEY` (atau legacy `SUPABASE_SERVICE_ROLE_KEY`), pertahankan `SUPABASE_URL`, dan hapus variabel `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_ANON_KEY` yang tidak digunakan lagi.
3. Deploy ulang branch `main`. Seluruh anggota masuk menggunakan password tim; akun dan daftar email lama tidak digunakan aplikasi lagi. Akun Auth lama tidak dihapus oleh migrasi.

Tidak ada perubahan pada situs Sites lama; repo ini mengatur aplikasi Vercel.

## Sesi dan password

- Password diverifikasi di server. Browser hanya menerima cookie sesi bertanda tangan **HttpOnly, Secure, SameSite=Strict** selama 7 hari; password tidak disimpan di browser oleh aplikasi.
- Tombol **Keluar** menghapus cookie. Mengganti password atau secret key database membatalkan sesi yang sudah diterbitkan.
- Password default adalah password tim yang disepakati pada pengembangan. Untuk menggantinya, atur environment variable server **`TEAM_PASSWORD`** lalu redeploy. Jangan memasukkan password asli ke repo.
- Percobaan login dibatasi menjadi 20 per alamat jaringan dalam 15 menit. Counter disimpan di Postgres untuk bekerja lintas instance serverless; alamat jaringan disimpan sebagai fingerprint HMAC.
- Akses database langsung oleh `anon` dan `authenticated` dicabut. API server memeriksa sesi sebelum membaca/menulis database; secret key Supabase tidak pernah diberikan kepada browser.

## Pengembangan dan pengujian

Gunakan Node.js 22 atau lebih baru. Tidak ada dependency runtime tambahan.

```sh
npm test
npm run build
```

Untuk preview beserta endpoint server, gunakan Vercel CLI `vercel dev` dengan environment lokal mengikuti `.env.example`. Cookie sesi memerlukan HTTPS; gunakan preview HTTPS Vercel untuk pengujian browser login lengkap. Menyajikan direktori `public` saja tidak menjalankan API server.

Pengujian otomatis mencakup login password, penolakan password salah, sesi kedaluwarsa/tamper, cookie logout, penolakan akses data tanpa sesi, konflik revision, serta penolakan permintaan lintas origin. Pengujian memakai mock database. Eksekusi SQL, pembatasan lintas instance, dan deployment nyata harus diperiksa setelah konfigurasi Supabase/Vercel tersedia.

## Struktur

- `public/`: tampilan dan sinkronisasi frontend
- `api/auth.js`: login password, pemeriksaan sesi dan logout
- `api/preparation.js`: baca/simpan dokumen tim dengan pemeriksaan sesi
- `lib/`: validasi dan kode autentikasi server
- `supabase/schema.sql`: instalasi baru termasuk seed
- `supabase/migrations/002_password_auth.sql`: upgrade dari autentikasi email
- `tests/`: pemeriksaan aplikasi dan endpoint

## Referensi resmi

- https://vercel.com/docs/functions/runtimes/node-js
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/database/secure-data
