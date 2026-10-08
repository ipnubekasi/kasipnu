# Panduan Deployment Vercel

Prasyarat: setup Supabase (dokumen 02) sudah selesai dan migration sudah berjalan.

## 1. Menyimpan source code di GitHub

1. Buat repository privat, misalnya `pc-ipnu-bekasi/kas-ipnu`.
2. Unggah isi folder source code. Pastikan `.env.local` tidak ikut (sudah tercantum di `.gitignore`).

## 2. Membuat project di Vercel

1. Masuk ke https://vercel.com, klik **Add New > Project**, pilih repository tadi.
2. Framework terdeteksi otomatis sebagai **Next.js**. Build command `next build`, output default. Node.js 20 atau lebih baru.
3. Sebelum klik **Deploy**, isi Environment Variables (langkah 3).

`vercel.json` sudah mengatur region fungsi ke `sin1` (Singapura), sama dengan region Supabase yang disarankan, sehingga setiap permintaan ke database tidak menyeberang benua.

## 3. Environment Variables

**Project Settings > Environment Variables**. Isi untuk Production, dan untuk Preview bila preview juga dipakai.

| Variabel | Wajib | Nilai |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Ya | `https://<PROJECT_REF>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Ya | `sb_publishable_...` |
| `NEXT_PUBLIC_SITE_URL` | Ya | Alamat produksi, misalnya `https://kas-ipnu.vercel.app` |
| `SUPABASE_SECRET_KEY` | Opsional | `sb_secret_...`, untuk undangan email dan Vercel Cron. Tandai **Sensitive** |
| `CRON_SECRET` | Opsional | String acak minimal 32 karakter, untuk Vercel Cron. Tandai **Sensitive** |
| `INTEGRASI_BANK_QRIS_AKTIF` | Tidak | Biarkan `false` |

Membuat `CRON_SECRET` acak: `openssl rand -hex 32`.

Bila variabel wajib belum diisi, aplikasi tidak rusak: semua halaman mengarah ke halaman **Aplikasi belum terhubung ke Supabase** yang menyebut variabel yang perlu diisi. Setelah mengubah variabel, lakukan **Redeploy** karena variabel `NEXT_PUBLIC_` dibaca saat build.

## 4. Menghubungkan Auth dengan domain

Setelah deploy pertama berhasil:

1. Catat domain produksi dari Vercel (atau domain sendiri, misalnya `kas.ipnubekasi.or.id`, lewat **Settings > Domains**).
2. Di Supabase **Authentication > URL Configuration**, isi Site URL dengan domain itu dan tambahkan `https://<domain>/**` ke Redirect URLs.
3. Samakan `NEXT_PUBLIC_SITE_URL` di Vercel dengan domain itu, lalu Redeploy.
4. Uji: buka `/lupa-password`, kirim tautan ke email Anda, klik tautan, pastikan sampai di halaman **Atur password** pada domain produksi.

## 5. Pemeriksaan harian lewat Vercel Cron (opsional)

`vercel.json` sudah mendaftarkan cron `/api/cron/pemeriksaan-harian` dengan jadwal `10 17 * * *` (00.10 WIB). Cron hanya berjalan di deployment Production dan hanya bila `CRON_SECRET` dan `SUPABASE_SECRET_KEY` terisi. Vercel mengirim header `Authorization: Bearer <CRON_SECRET>`; permintaan tanpa header itu ditolak.

Pada paket Hobby, Vercel membatasi cron sekali sehari dan waktu eksekusinya bisa meleset hingga satu jam dalam jam yang dijadwalkan. Itu cukup untuk keperluan ini. Bila pg_cron di Supabase sudah aktif, Vercel Cron boleh dibiarkan tanpa `CRON_SECRET`; dua penjadwal sekaligus juga aman karena notifikasi tidak dibuat ganda.

## 6. Daftar periksa setelah deploy

1. Halaman `/login` terbuka lewat HTTPS.
2. Masuk dengan akun pertama, selesaikan **Siapkan Kas IPNU**.
3. Catat satu transaksi uji dengan bukti foto, bukukan, lalu balik (reversal). Pastikan saldo kembali seperti semula dan bukti terbuka.
4. Ekspor Buku Kas Umum ke PDF dan XLSX; angkanya harus sama dengan layar.
5. Buka **Pengaturan > Kesehatan dan notifikasi**. Setelah penjadwal berjalan pertama kali (keesokan harinya), muncul keterangan hijau **Pemeriksaan berkala harian aktif**.
6. Tambahkan satu akun Pembaca, masuk dengan akun itu, pastikan tombol pencatatan tidak muncul.

## 7. Keamanan

1. Secret key hanya di Environment Variables Vercel, tidak di kode, tidak di chat.
2. Aktifkan **Deployment Protection** untuk deployment Preview bila preview memakai database produksi. Lebih baik lagi, gunakan project Supabase terpisah untuk preview.
3. Header keamanan `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, dan `Permissions-Policy` sudah diatur di `next.config.ts`. Content Security Policy belum dipasang; tambahkan bila organisasi memerlukannya.
