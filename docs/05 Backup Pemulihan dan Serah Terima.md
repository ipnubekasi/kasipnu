# Backup, Pemulihan, dan Serah Terima

Ada tiga hal berbeda yang sering tertukar:

| Jenis | Isi | Untuk apa | Siapa |
|---|---|---|---|
| **Backup database** | Seluruh tabel, fungsi, policy, dan akun | Memulihkan aplikasi bila data rusak atau project hilang | Admin teknis |
| **Backup Storage** | Semua berkas bukti di bucket `bukti` | Melengkapi backup database | Admin teknis |
| **Paket serah terima (ZIP)** | Data dalam JSON dan CSV, laporan PDF/XLSX/CSV, salinan bukti | Arsip dan serah terima antarbendahara | Bendahara atau Admin dari aplikasi |

Paket serah terima mudah dibaca manusia tetapi **bukan** pengganti backup database. Pemulihan penuh memerlukan backup database ditambah backup Storage.

## 1. Backup database

Project Supabase paket gratis tidak memiliki backup harian otomatis yang bisa dipulihkan. Paket Pro menyimpan backup harian 7 hari terakhir yang bisa dipulihkan dari Dashboard. Apa pun paketnya, lakukan backup manual minimal sebulan sekali dan setiap sebelum tutup periode kepengurusan.

Siapkan connection string di **Project Settings > Database > Connection string** (mode Session pooler), lalu di komputer yang terpasang Node.js:

```bash
npx supabase db dump --db-url "<CONNECTION_STRING>" -f roles.sql --role-only
npx supabase db dump --db-url "<CONNECTION_STRING>" -f schema.sql
npx supabase db dump --db-url "<CONNECTION_STRING>" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

Perintah `supabase db dump` memerlukan Docker terpasang di komputer. Alternatif tanpa Docker adalah `pg_dump` versi yang sama dengan Postgres project:

```bash
pg_dump "<CONNECTION_STRING>" --format=custom --no-owner --no-privileges -f "kas-ipnu-$(date +%F).dump"
```

Simpan ketiga berkas (atau berkas `.dump`) di dua tempat terpisah, misalnya Google Drive organisasi dan diska eksternal. Berkas berisi data keuangan dan email anggota, jadi batasi aksesnya.

## 2. Backup Storage (berkas bukti)

```bash
cd kas-ipnu
npm install
SUPABASE_URL=https://<PROJECT_REF>.supabase.co SUPABASE_SECRET_KEY=sb_secret_xxx \
  npm run backup:storage -- "./backup-bukti-2026-10"
```

Skrip mengunduh semua berkas bucket `bukti` beserta `manifest.json` berisi ukuran dan checksum SHA-256 setiap berkas. Jalankan bersamaan dengan backup database agar keduanya sesuai.

## 3. Pemulihan

Pemulihan dilakukan ke project Supabase **baru** agar project lama tetap utuh sebagai pembanding.

1. Buat project baru (dokumen 02 langkah 1). Jangan jalankan migration; skema ikut dipulihkan dari `schema.sql`.
2. Pulihkan database:
   ```bash
   psql \
     --single-transaction \
     --variable ON_ERROR_STOP=1 \
     --file roles.sql \
     --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql \
     --dbname "<CONNECTION_STRING_PROJECT_BARU>"
   ```
   `session_replication_role = replica` menonaktifkan trigger selama pemuatan data. Ini perlu karena Kas IPNU memasang trigger yang menolak perubahan transaksi yang sudah dibukukan dan audit log. Trigger aktif kembali begitu sesi selesai.
3. Pulihkan berkas bukti:
   ```bash
   SUPABASE_URL=https://<REF_BARU>.supabase.co SUPABASE_SECRET_KEY=sb_secret_baru \
     npm run restore:storage -- "./backup-bukti-2026-10"
   ```
   Skrip memeriksa checksum (berkas yang tidak cocok dilewati dan dilaporkan), melewati berkas yang sudah ada, dan memakai path yang sama sehingga tautan bukti di database tetap cocok.
4. Ulangi pengaturan Auth (Site URL, Redirect URLs, template email, SMTP) dan aktifkan pg_cron (dokumen 02 langkah 3 sampai 5). Pengaturan ini tidak ikut di dump database.
5. Ganti `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, dan `SUPABASE_SECRET_KEY` di Vercel ke project baru, lalu Redeploy.
6. Verifikasi: bandingkan saldo per rekening, saldo per dana, dan Neraca Saldo di project baru dengan laporan terakhir dari project lama. Neraca Saldo harus seimbang dan angka harus sama.

Bila memakai berkas `.dump` dari `pg_dump`, ganti langkah 2 dengan `pg_restore --no-owner --no-privileges --disable-triggers -d "<CONNECTION_STRING_PROJECT_BARU>" kas-ipnu-YYYY-MM-DD.dump` memakai pengguna `postgres`.

**Uji pemulihan** minimal sekali setiap periode kepengurusan ke project percobaan. Backup yang belum pernah diuji belum terbukti bisa dipakai.

## 4. Paket serah terima (dari aplikasi)

**Pengaturan > Backup dan serah terima**, bagian **Paket serah terima**, tombol **Unduh Paket Serah Terima**. Pilih apakah berkas bukti ikut disertakan. Isi ZIP:

| Folder | Isi |
|---|---|
| `data/` | Setiap tabel organisasi dalam JSON (lengkap) dan CSV (pemisah titik koma, terbuka di Excel) |
| `laporan/` | Buku Kas Umum, Neraca Saldo, Saldo per Rekening, Saldo per Dana, Laporan Akhir Kepengurusan dalam PDF, XLSX, CSV |
| `lampiran/` | Berkas bukti per nomor transaksi; subfolder `riwayat/` untuk berkas yang diganti atau dihapus |
| `BACA SAYA.txt` | Ringkasan isi dan jumlah baris tiap tabel |

Paket dibuat di browser pengguna. Untuk organisasi dengan ribuan bukti, gunakan koneksi stabil dan komputer, bukan ponsel.

## 5. Prosedur serah terima bendahara

Lakukan dalam rapat serah terima yang disaksikan Ketua.

1. **Bendahara lama**: pastikan tidak ada draft, semua bukti lengkap atau diberi keterangan, rekonsiliasi semua rekening terkini, lalu tutup periode sampai bulan terakhir yang sudah lengkap.
2. **Admin teknis**: jalankan backup database dan backup Storage (bagian 1 dan 2).
3. **Bendahara lama**: unduh **Paket serah terima** dan **Laporan Akhir Kepengurusan** (PDF), tandatangani, serahkan bersama uang tunai, buku tabungan, dan akses e-wallet.
4. **Admin**: bila bendahara baru belum punya akun, tambahkan di **Pengaturan > Anggota dan hak akses**.
5. **Admin**: di **Pengaturan > Backup dan serah terima**, bagian **Pengalihan akses bendahara**, pilih bendahara baru dan tentukan akses bendahara lama: tetap, turun menjadi Pembaca, atau dicabut. Isi catatan serah terima (misalnya rapat tempat serah terima dilakukan). Semua tercatat di audit log.
6. Bila pergantian bersamaan dengan masa khidmat baru, buat periode baru di **Pengaturan > Periode kepengurusan**. Saldo tidak perlu dipindahkan manual karena buku berlanjut; laporan periode baru dimulai dari saldo akhir periode lama.
7. **Bendahara baru**: lakukan rekonsiliasi pertama terhadap uang dan rekening yang diterima. Selisih langsung dicatat dengan keterangan "selisih serah terima" agar tanggung jawab tiap periode jelas.

## 6. Akun dan akses

- Akun pengurus yang tidak lagi menjabat dicabut aksesnya, bukan dihapus, agar audit log tetap menunjuk orang yang benar.
- Setidaknya dua orang memiliki role Admin (misalnya Ketua dan Bendahara) agar organisasi tidak terkunci bila satu akun hilang.
- Akun Supabase dan Vercel sebaiknya milik email organisasi, bukan email pribadi pengurus, dan diserahterimakan bersama.
