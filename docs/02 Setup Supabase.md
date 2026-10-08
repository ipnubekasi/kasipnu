# Panduan Setup Supabase

Panduan ini menyiapkan database, Auth, dan Storage untuk Kas IPNU. Kerjakan berurutan. Semua langkah dilakukan oleh Admin teknis, bukan oleh bendahara.

## 1. Membuat project

1. Masuk ke https://supabase.com/dashboard lalu pilih organisasi.
2. Klik **New project**. Isi nama `kas-ipnu`, buat password database yang kuat lalu simpan di pengelola password, dan pilih region **Southeast Asia (Singapore)** agar dekat dengan pengguna dan dengan region Vercel `sin1`.
3. Catatan paket gratis: satu organisasi Supabase paket gratis hanya boleh memiliki dua project aktif. Bila sudah penuh, jeda (pause) project lain, gunakan organisasi Supabase terpisah khusus PC IPNU, atau naikkan paket. Project paket gratis juga dijeda otomatis bila tidak dipakai sekitar satu minggu dan tidak memiliki backup harian otomatis, sehingga backup manual (lihat dokumen 05) wajib dijalankan rutin.

## 2. Menjalankan migration database

Folder `supabase/migrations` berisi 11 berkas SQL berurutan. Urutan nama berkas adalah urutan eksekusi. Jangan melewati satu pun.

| No | Berkas | Isi |
|---|---|---|
| 1 | `..._skema_inti.sql` | Tabel inti, relasi, constraint |
| 2 | `..._akses_audit_organisasi.sql` | Fungsi akses, audit log, setup organisasi, anggota, serah terima |
| 3 | `..._pembukuan.sql` | Draft, posting, jurnal, reversal, bukti, impor |
| 4 | `..._laporan.sql` | Query laporan (BKU, arus kas, neraca saldo, program) |
| 5 | `..._program_rekonsiliasi_periode.sql` | Program, rekonsiliasi, tutup periode |
| 6 | `..._kesehatan_notifikasi.sql` | Indikator kesehatan dan notifikasi |
| 7 | `..._integrasi_coming_soon.sql` | Fondasi integrasi bank dan QRIS (nonaktif) |
| 8 | `..._rls_dan_hak_akses.sql` | Row Level Security dan grant |
| 9 | `..._storage_bukti.sql` | Bucket privat `bukti` dan policy Storage |
| 10 | `..._penjadwalan_harian.sql` | Jadwal pg_cron harian (aman dilewati bila pg_cron belum aktif) |
| 11 | `..._mode_demo.sql` | Fungsi data contoh (hanya berjalan bila Admin menekan tombolnya) |

### Cara A, Supabase CLI (disarankan)

```bash
cd kas-ipnu
npm install
npx supabase init            # hanya sekali, membuat supabase/config.toml; folder migrations tetap
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push         # menjalankan seluruh migration berurutan
```

`<PROJECT_REF>` adalah kode 20 huruf pada URL project (`https://<PROJECT_REF>.supabase.co`). Bila `supabase init` menanyakan pengaturan VS Code atau Deno, jawab `N`.

### Cara B, SQL Editor di Dashboard

Buka **SQL Editor**, lalu untuk setiap berkas sesuai urutan tabel di atas: buka berkas, salin seluruh isinya, tempel, klik **Run**, pastikan hasilnya `Success`. Jangan menjalankan satu berkas dua kali; berkas 6 tidak dirancang untuk diulang.

### Pemeriksaan setelah migration

Jalankan di SQL Editor:

```sql
select count(*) as tabel_tanpa_rls
from pg_tables
where schemaname = 'public' and rowsecurity = false;   -- harus 0

select id, public from storage.buckets where id = 'bukti';  -- public harus false

select key, enabled from public.app_feature_flags;          -- integrasi_bank_qris = false
```

Buka juga **Advisors > Security Advisor**. Temuan tentang tabel tanpa RLS harus nol. Peringatan tentang fungsi `SECURITY DEFINER` di schema `public` memang disengaja: semua penulisan data keuangan lewat fungsi tersebut, dan setiap fungsi memeriksa keanggotaan serta role pemanggil serta memakai `search_path` tetap. Laporkan temuan lain kepada pengembang sebelum dipakai.

## 3. Penjadwal harian (pg_cron)

Indikator kesehatan dihitung ulang setiap kali transaksi dibukukan. Pemeriksaan harian tetap dibutuhkan untuk hal yang berubah karena waktu, misalnya jatuh tempo kebutuhan kas, draft yang terlalu lama, dan rekonsiliasi yang terlambat.

1. Buka **Database > Extensions**, cari `pg_cron`, aktifkan.
2. Bila migration 10 dijalankan sebelum pg_cron aktif, jalankan ulang isi berkas `20261008001000_penjadwalan_harian.sql` di SQL Editor. Berkas ini aman diulang.
3. Periksa: `select jobname, schedule from cron.job;` harus menampilkan `kas-ipnu-pemeriksaan-harian` dengan jadwal `5 17 * * *` (00.05 WIB).

Alternatif tanpa pg_cron: Vercel Cron (lihat dokumen 03). Bila keduanya tidak ada, aplikasi tetap menjalankan pemeriksaan saat pertama dibuka setiap hari dan halaman Kesehatan menampilkan keterangan bahwa penjadwal belum aktif.

## 4. API keys

Buka **Project Settings > API Keys**.

| Nilai | Variabel | Keterangan |
|---|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` |
| Publishable key (`sb_publishable_...`) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Aman di browser, akses tetap dibatasi RLS |
| Secret key (`sb_secret_...`) | `SUPABASE_SECRET_KEY` | Opsional, hanya server. Dipakai untuk undangan email dan Vercel Cron |

Bila project lama hanya memiliki legacy key, aplikasi juga menerima `NEXT_PUBLIC_SUPABASE_ANON_KEY` dan `SUPABASE_SERVICE_ROLE_KEY`. Secret atau service role key tidak boleh diberi awalan `NEXT_PUBLIC_` dan tidak boleh dibagikan lewat chat.

## 5. Pengaturan Auth

Buka **Authentication**.

1. **Sign In / Providers > Email**: aktif. Matikan **Allow new users to sign up** agar orang luar tidak bisa mendaftar sendiri. Anggota hanya masuk lewat undangan Admin atau dibuat dari Dashboard.
2. **URL Configuration**:
   - Site URL: alamat produksi, misalnya `https://kas-ipnu.vercel.app`.
   - Redirect URLs: tambahkan `https://kas-ipnu.vercel.app/**` dan, untuk pengembangan, `http://localhost:3000/**`. Untuk preview Vercel tambahkan pola `https://*-<nama-tim>.vercel.app/**`.
3. **Emails > Templates**. Ubah tautan agar diarahkan ke route konfirmasi aplikasi (alur token hash, aman untuk render di server):
   - **Reset Password**:
     ```html
     <h2>Atur ulang password Kas IPNU</h2>
     <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/atur-password">Atur password baru</a></p>
     <p>Abaikan email ini bila Anda tidak memintanya.</p>
     ```
   - **Invite user**:
     ```html
     <h2>Undangan Kas IPNU</h2>
     <p>Anda diundang mengelola kas PC IPNU Kabupaten Bekasi.</p>
     <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/atur-password">Terima undangan dan buat password</a></p>
     ```
4. **SMTP**. Layanan email bawaan Supabase hanya mengirim ke alamat anggota tim project Supabase dan dibatasi sekitar 2 email per jam. Untuk undangan dan reset password anggota pengurus, isi **Authentication > Emails > SMTP Settings** dengan penyedia SMTP (misalnya Resend, Brevo, atau SMTP Google Workspace organisasi). Tanpa SMTP, akun tetap bisa dibuat manual (langkah 6).

## 6. Pengguna pertama

1. **Authentication > Users > Add user > Create new user**. Isi email bendahara, password sementara, centang **Auto Confirm User**.
2. Buka aplikasi, masuk dengan akun itu. Aplikasi mengarahkan ke halaman **Siapkan Kas IPNU**.
3. Isi nama organisasi, periode kepengurusan, dan nama lengkap. Akun pertama otomatis menjadi **Admin Organisasi** dan **Bendahara**. Halaman ini terkunci setelah organisasi dibuat, sehingga pengguna berikutnya tidak bisa membuat organisasi kedua.
4. Lanjutkan di **Pengaturan**: rekening, saldo awal, kategori, penomoran, lalu anggota.

Anggota berikutnya ditambahkan dari **Pengaturan > Anggota**. Bila `SUPABASE_SECRET_KEY` dan SMTP sudah diisi, aplikasi mengirim undangan. Bila belum, buat akun di Dashboard seperti langkah 1, lalu tambahkan emailnya di halaman **Anggota dan hak akses**.

## 7. Storage

Migration 9 membuat bucket privat `bukti` dengan batas 10 MB per berkas dan tipe JPG, PNG, PDF. Bukti hanya bisa dibuka lewat signed URL berumur pendek. Berkas tidak bisa ditimpa atau dihapus dari aplikasi; penghapusan bukti dicatat sebagai penghapusan logis beserta alasannya.

Batas ukuran yang dipakai aplikasi diatur di **Pengaturan > Profil dan logo > Batas ukuran bukti** dan tidak bisa melebihi batas bucket. Untuk menaikkan batas bucket:

```sql
update storage.buckets set file_size_limit = 20971520 where id = 'bukti';  -- 20 MB
```

Pastikan batas global di **Project Settings > Storage** juga tidak lebih kecil.

## 8. Mode demo

Data contoh tidak pernah dimuat otomatis. Admin yang juga Bendahara dapat memuatnya dari **Pengaturan > Backup dan serah terima** hanya bila organisasi masih kosong, dan menghapusnya lagi dari halaman yang sama sebelum mulai mencatat data asli.
