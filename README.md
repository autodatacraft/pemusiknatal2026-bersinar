# Bersinar — Pemusik Natal 2026

Persiapan bersama pelayanan Natal bertema **Bersinar**. Ruang persiapan terbuka langsung tanpa login. Siapa pun yang memiliki URL situs dapat membaca dan mengubah seluruh persiapan.

## Fitur

- Setlist: Hai Kota Mungil; medley Hai Siarkan + Dari Pulau dan Benua; Hai Mari Berhimpun (kolekte); Yesus Menginginkan Daku (firman); O Holy Night (lilin).
- Nada dasar, tempo, intro, outro, transisi, urutan ibadah, peran piano/keyboard, drum, gitar dan bass.
- Checklist latihan, ringkasan kesiapan, catatan keputusan dan daftar hal terbuka.
- Data bersama di Supabase melalui API server Vercel; autosave dan pengecekan versi tiap 10 detik saat detail lagu ditutup.
- Konflik penyimpanan tidak langsung menimpa perubahan rekan. Ekspor perubahan sendiri, muat versi tim, lalu terapkan ulang bagian yang diperlukan.
- Ekspor/impor cadangan JSON. Impor mengganti dokumen bersama setelah konfirmasi.
- Jika tabel persiapan masih kosong, API membuat setlist awal otomatis saat pertama dibuka. Penyisipan memakai `ON CONFLICT DO NOTHING`, sehingga data yang sudah ada tetap dipertahankan meski dua pengguna masuk bersamaan.

## Deploy baru ke Vercel

1. Buat proyek Supabase, lalu jalankan seluruh `supabase/schema.sql` di SQL Editor. Ini membuat database dan setlist awal. Pengulangan tidak menimpa data persiapan yang sudah ada.
2. Impor repo privat `autodatacraft/pemusiknatal2026-bersinar` di Vercel. Framework **Other**, build command `npm run build`, output directory `public` (sudah diatur dalam `vercel.json`).
3. Tambahkan environment variables server di Vercel:

   | Nama | Isi |
   | --- | --- |
   | `SUPABASE_URL` | URL proyek, misalnya `https://PROJECT.supabase.co` |
   | `SUPABASE_SECRET_KEY` | Secret key Supabase `sb_secret_...` |

   Untuk proyek Supabase lama, gunakan `SUPABASE_SERVICE_ROLE_KEY` berisi legacy service-role JWT sebagai pengganti `SUPABASE_SECRET_KEY`. Kunci ini hanya digunakan server; jangan menggunakan prefix `NEXT_PUBLIC_`, memasukkannya ke HTML/JavaScript browser, atau melakukan commit file `.env`.
4. Deploy dan buka situs. Editor memuat data tim langsung tanpa password atau akun.
5. Bagikan URL situs melalui saluran tim.

## Upgrade dari versi password

Deploy ulang kode terbaru. Tidak diperlukan migrasi database untuk menghapus login; data dan revision tetap dipertahankan. Variabel `TEAM_PASSWORD` dapat dihapus dari Vercel. Tabel/fungsi pembatasan login lama tidak digunakan lagi dan boleh dibiarkan.

Tidak ada perubahan pada situs Sites lama; repo ini mengatur aplikasi Vercel.

## Jika data belum terbuka

Versi terbaru mengisi setlist awal otomatis bila tabel `preparations` sudah ada tetapi belum mempunyai dokumen `natal2026`. Redeploy commit terbaru lalu muat ulang situs.

Jika masalah tetap ada, periksa pesan spesifik pada halaman dan log Function `api/preparation` di Vercel. Pesan membedakan tabel belum tersedia, izin database belum lengkap, data tidak valid, dan koneksi yang gagal. Log hanya mencatat operasi, status HTTP dan kode error database; tidak mencatat kredensial atau isi persiapan.

Untuk melengkapi tabel, fungsi, izin dan data awal sekaligus, jalankan ulang **`supabase/schema.sql`** di proyek Supabase yang URL-nya digunakan Vercel. Skrip tidak mengganti payload/revision persiapan yang sudah ada. Jangan menghapus tabel atau menonaktifkan RLS.

## Akses data

- Semua pengunjung dapat membaca dan menyimpan dokumen melalui API server tanpa sesi.
- Secret key Supabase tetap hanya di server. Akses database langsung oleh `anon` dan `authenticated` tetap dicabut.
- Validasi payload, pemeriksaan origin untuk penyimpanan, dan deteksi konflik revision tetap aktif.

## Pengembangan dan pengujian

Gunakan Node.js 22 atau lebih baru. Tidak ada dependency runtime tambahan.

```sh
npm test
npm run build
```

Untuk preview beserta endpoint server, gunakan Vercel CLI `vercel dev` dengan environment lokal mengikuti `.env.example`. Menyajikan direktori `public` saja tidak menjalankan API server.

Pengujian otomatis mencakup baca/simpan tanpa sesi, validasi data, konflik revision, inisialisasi dokumen, dan penolakan permintaan lintas origin. Database dimock; deployment dan database nyata tidak diuji.

## Struktur

- `public/`: tampilan dan sinkronisasi frontend
- `api/preparation.js`: baca/simpan dokumen tim tanpa login
- `lib/`: validasi dan akses database server
- `supabase/schema.sql`: instalasi baru termasuk seed
- `supabase/migrations/002_password_auth.sql`: upgrade dari autentikasi email
- `tests/`: pemeriksaan aplikasi dan endpoint

## Referensi resmi

- https://vercel.com/docs/functions/runtimes/node-js
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/database/secure-data

