# Hasil Pengujian dan Keterbatasan

Tanggal pengujian: 8 Oktober 2026.

## 1. Status jujur aplikasi

- Source code, migration, RLS, policy Storage, dan dokumentasi **sudah selesai**.
- Aplikasi **belum terhubung** ke project Supabase milik organisasi dan **belum di-deploy** ke Vercel. Kredensial Supabase dan Vercel untuk Kas IPNU belum diberikan, dan project Supabase baru belum dibuat.
- Semua pengujian di bawah dijalankan pada lingkungan lokal yang meniru Supabase. Pengujian ulang wajib dilakukan setelah migration dijalankan di project Supabase sungguhan (daftar periksa di dokumen 03 bagian 6).

## 2. Lingkungan uji

| Komponen | Versi |
|---|---|
| PostgreSQL | 16.15 (server asli) dan PGlite (Postgres WebAssembly) |
| Supabase Auth | GoTrue, dijalankan lokal |
| PostgREST | 13.0.7 |
| Storage | Tiruan sederhana API Storage di gateway lokal; policy `storage.objects` diuji langsung di database |
| Node.js | 22 |
| Browser | Chromium (Playwright 1.56), profil desktop dan ponsel Pixel 7 |
| Next.js | 16.4, build produksi berhasil |

## 3. Hasil

| Rangkaian | Hasil |
|---|---|
| Uji database di PostgreSQL 16 asli | **66 lulus** dari 66 (termasuk uji konkurensi) |
| Uji database di PGlite | **65 lulus**, 1 dilewati (uji konkurensi memerlukan banyak koneksi) |
| Uji unit ekspor dan impor | **6 lulus** |
| Uji end to end, desktop | **6 lulus** |
| Uji end to end, ponsel | **4 lulus**, 2 sengaja dilewati (uji ekspor dan impor berkas cukup di desktop) |
| TypeScript (`tsc --noEmit`) | Tanpa galat |
| ESLint | Tanpa galat |
| `next build` | Berhasil |

## 4. Kriteria penerimaan yang dibuktikan

**Saldo dan arus kas**: saldo awal Rp1.000.000 ditambah pemasukan Rp500.000 menjadi Rp1.500.000; pengeluaran Rp200.000 menjadi Rp1.300.000; transfer Rp300.000 dari Kas Umum ke dana program menurunkan dana umum, menaikkan dana program, gabungan tetap Rp1.300.000; pengeluaran program Rp100.000 menjadi Rp1.200.000; transfer antarrekening tidak menambah pemasukan maupun beban; rumus saldo awal ditambah masuk dikurangi keluar sama dengan saldo akhir berlaku di setiap lingkup; draft tidak memengaruhi saldo.

**Integritas jurnal**: setiap jurnal seimbang secara total dan per dana; jurnal tidak seimbang ditolak oleh constraint database walaupun disisipkan langsung; transaksi yang dibukukan dan baris jurnalnya tidak bisa diubah atau dihapus, bahkan oleh pemilik database; nominal nol, negatif, atau pecahan ditolak; kategori harus sesuai jenis dan rekening harus akun kas.

**Double-submit dan penomoran**: kunci idempotensi yang sama tidak membuat transaksi ganda, termasuk saat dua permintaan datang bersamaan; nomor referensi unik dan berurutan per awalan dan tahun di bawah beban bersamaan.

**Pembalikan**: riwayat terjaga, saldo kembali, pembuat, pembuku, dan pembalik tercatat di audit log.

**Periode tertutup**: periode berjalan dan periode yang masih memiliki draft tidak bisa ditutup; pembukuan bertanggal di periode tertutup ditolak di database; pembukaan kembali hanya Admin dengan alasan, tercatat di audit log.

**Impor**: hasil impor menjadi draft; impor ulang berkas yang sama tidak menambah satu baris pun (juga dibuktikan end to end lewat browser).

**Akses**: RLS aktif di semua tabel; pengguna tanpa keanggotaan melihat nol baris, tidak bisa membaca laporan, tidak bisa menulis, tidak bisa membaca bukti; anon tidak memiliki hak apa pun; Pembaca bisa membaca laporan tetapi ditolak pada semua fungsi dan tulis langsung (juga dibuktikan lewat browser: tombol pencatatan tidak tampil); pengguna tidak bisa menaikkan role sendiri; organisasi selalu memiliki minimal satu Admin.

**Serah terima**: penerus mendapat akses, akses lama diubah sesuai pilihan, tidak ada satu pun transaksi berubah; periode kepengurusan baru tidak menghapus data.

**Kesehatan keuangan (bagian 20)**: ketahanan kas dihitung dari dana umum tersedia dibagi rata-rata pengeluaran rutin tiga bulan lengkap; dana program terikat tidak menaikkan ketahanan Kas Umum; transfer internal dan saldo awal bukan pemasukan eksternal; kewajiban yang sudah dibayar tidak dihitung ganda; pemasukan yang baru direncanakan tidak dianggap kas tersedia; data kurang menghasilkan status Data Belum Cukup, bukan Aman; saldo negatif selalu Kritis; ambang bisa diatur; defisit dua bulan berturut-turut memicu Perlu Perhatian; realisasi program 80% memicu peringatan dan di atas 100% Kritis; notifikasi tidak berulang untuk kondisi yang sama, naik tingkat saat memburuk, dan selesai saat teratasi; pemeriksaan dihitung ulang setelah pembukuan, pembalikan, perubahan kebutuhan kas, dan perubahan anggaran.

**Ekspor**: CSV, XLSX, dan PDF memakai objek laporan yang sama dengan layar. Uji end to end membandingkan total CSV Buku Kas Umum dengan angka di layar; PDF memuat teks yang bisa dipilih, identitas, total, nomor halaman, dan blok tanda tangan; XLSX menyimpan nominal sebagai angka.

**Alur bendahara di browser**: mencatat pengeluaran dengan unggahan foto bukti, membukukan, melihat pratinjau bukti, membalik transaksi, validasi inline formulir kosong, dan pembukaan semua halaman utama tanpa galat, di desktop dan ponsel.

**Mode demo**: organisasi baru kosong tanpa data contoh; data contoh hanya dimuat lewat tombol Admin, buku besarnya seimbang, dan bisa dihapus tanpa menghapus audit log.

**Integrasi bank dan QRIS**: flag server bawaan nonaktif, tabel integrasi menolak tulisan, endpoint webhook menjawab 503.

## 5. Menjalankan pengujian sendiri

```bash
npm install
npm run typecheck && npm run lint
npm test                                   # unit + database di PGlite, tanpa server
TEST_DATABASE_URL=postgres://postgres:password@localhost:5432/postgres npm run test:db   # PostgreSQL asli
```

Uji end to end memerlukan aplikasi yang berjalan dan terhubung ke Supabase berisi akun uji:

```bash
E2E_BASE_URL=http://localhost:3000 E2E_EMAIL=bendahara@contoh.id E2E_PASSWORD=... \
E2E_READER_EMAIL=pembaca@contoh.id E2E_READER_PASSWORD=... npx playwright test
```

Uji end to end membuat transaksi sungguhan. Jalankan hanya pada project percobaan, jangan pada data produksi.

## 6. Keterbatasan

1. **Belum diuji di Supabase sungguhan.** Storage diuji dengan tiruan lokal; perilaku Storage asli (signed URL, batas ukuran bucket, MIME) diharapkan sama karena policy-nya standar, tetapi tetap perlu dibuktikan setelah setup. Project Supabase baru memakai Postgres 17, sedangkan uji database dijalankan di Postgres 16 dan PGlite; fitur SQL yang dipakai tersedia di kedua versi.
2. **Email dan push notification belum aktif.** Notifikasi hanya di dalam aplikasi. Undangan anggota lewat email memerlukan `SUPABASE_SECRET_KEY` dan SMTP sendiri; tanpa itu akun dibuat lewat Dashboard Supabase.
3. **OCR nota belum ada.** Bukti disimpan sebagai berkas; isi nota tidak dibaca otomatis.
4. **Integrasi bank dan QRIS hanya fondasi** (dokumen 07). Tidak ada koneksi ke bank, payment gateway, atau QRIS.
5. **Bukan klaim kepatuhan standar akuntansi.** Pembukuan memakai prinsip double-entry dan pemisahan dana terikat yang lazim untuk organisasi nirlaba, tetapi aplikasi tidak diklaim sesuai ISAK 35 atau standar audit tertentu. Laporan untuk pihak eksternal sebaiknya ditinjau oleh pihak yang kompeten.
6. **Satu organisasi per instalasi.** Skema mendukung banyak organisasi, tetapi halaman penyiapan sengaja hanya mengizinkan satu organisasi. PAC atau PR membutuhkan instalasi terpisah atau pengembangan lanjutan.
7. **Format input tanggal** mengikuti browser dan bahasa perangkat (misalnya tampil `mm/dd/yyyy` pada perangkat berbahasa Inggris). Data tetap tersimpan benar; tampilan di luar input selalu format Indonesia.
8. **Paket serah terima dibuat di browser.** Dengan ribuan bukti berukuran besar, pembuatan ZIP bisa lambat atau memakan banyak memori di ponsel; gunakan komputer.
9. **Pemeriksaan harian** bergantung pada pg_cron atau Vercel Cron. Tanpa keduanya, pemeriksaan terjadi saat aplikasi dibuka.
10. **Aksesibilitas** dirancang dengan label formulir, fokus keyboard, kontras warna yang diperiksa, dan tabel alternatif untuk grafik, tetapi belum diaudit dengan pembaca layar oleh pengguna sungguhan.
