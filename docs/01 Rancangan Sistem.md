# Rancangan Sistem Kas IPNU

Sistem Keuangan PC IPNU Kabupaten Bekasi. Dokumen ini adalah hasil Tahap 1: struktur halaman, aturan pembukuan, skema data, dan design system. Seluruh implementasi di repositori ini mengikuti dokumen ini.

## 1. Keputusan teknologi

| Komponen | Pilihan | Alasan |
| --- | --- | --- |
| Framework | Next.js 16.4 (App Router) dengan TypeScript 5 | Versi stabil saat implementasi. Berkas `proxy.ts` menggantikan `middleware.ts` sejak Next.js 16. |
| Rendering | Dinamis penuh, `cacheComponents` dimatikan | Semua halaman bersifat privat dan angka keuangan harus selalu terbaru. Cache komponen tidak memberi manfaat dan berisiko menampilkan saldo basi. |
| Gaya | Tailwind CSS 4, komponen bergaya shadcn/ui di atas Radix UI | Komponen disalin ke `src/components/ui` dan disesuaikan dengan identitas IPNU. |
| Database | Supabase PostgreSQL | Seluruh aturan pembukuan dijalankan di database (fungsi RPC dan trigger), bukan di browser. |
| Autentikasi | Supabase Auth melalui `@supabase/ssr` | Sesi berbasis cookie, diverifikasi dengan `getClaims()` di server. Tidak ada pendaftaran publik. |
| Berkas | Supabase Storage, bucket privat `bukti` | Akses hanya melalui signed URL berumur pendek. |
| Grafik | Recharts 3 | Terawat dan kompatibel dengan React 19. |
| Ekspor | jsPDF + jspdf-autotable (PDF teks), ExcelJS (XLSX), PapaParse (CSV), fflate (ZIP) | PDF berupa teks yang dapat dipilih, bukan tangkapan layar. |
| Font | Geist Sans, satu keluarga font | Dibundel lokal lewat paket `geist`, tanpa unduhan saat build. |
| Uji | Vitest. Uji database memakai PGlite (PostgreSQL dalam proses) atau PostgreSQL asli | Skenario kriteria penerimaan dibuktikan langsung terhadap migration yang sama dengan produksi. |

`localStorage` tidak dipakai sebagai penyimpanan data. Satu-satunya penyimpanan utama adalah PostgreSQL dan Storage.

## 2. Desain sumber data tunggal

Prinsipnya: **satu buku besar, banyak tampilan.**

1. Setiap transaksi adalah satu baris `journal_entries`. Baris ini menyimpan metadata transaksi (tanggal, jenis, dana, rekening, kategori, nominal, uraian, status) sekaligus menjadi kepala jurnal. Tidak ada tabel transaksi terpisah yang bisa berbeda dari jurnalnya.
2. Saat transaksi **dibukukan**, database membuat baris `journal_lines` (debit dan kredit) dalam satu database transaction. Draft tidak memiliki baris jurnal, sehingga draft tidak mungkin memengaruhi saldo.
3. Semua saldo, ringkasan, laporan, indikator kesehatan, dan ekspor dihitung dari `journal_lines`. Tidak ada kolom saldo yang disimpan dan tidak ada salinan angka di tabel lain.
4. `journal_lines` tidak dapat diubah atau dihapus (dijaga trigger). Koreksi dilakukan dengan jurnal pembalikan dan transaksi pengganti.
5. Jurnal otomatis dan jurnal penyesuaian manual masuk ke tabel yang sama dan melewati validasi yang sama.

Setiap baris jurnal membawa dua dimensi:

| Dimensi | Kolom | Menjawab pertanyaan |
| --- | --- | --- |
| Akun | `account_id` | Uang ada di mana (Kas Tunai, Bank) atau dicatat sebagai apa (pendapatan, beban) |
| Dana | `fund_id` | Uang itu milik siapa: Kas Umum atau dana program tertentu |

Rekening (kas tunai, bank, dompet digital) adalah akun bertipe aset dengan tanda `is_cash`. Dana program tidak memerlukan rekening bank sendiri; satu rekening dapat berisi uang beberapa dana.

- Saldo rekening = jumlah (debit - kredit) semua baris pada akun itu.
- Saldo dana = jumlah (debit - kredit) baris akun kas dengan `fund_id` dana tersebut.
- Saldo gabungan = jumlah (debit - kredit) semua baris akun kas.

## 3. Aturan pembukuan

### 3.1 Jurnal otomatis

| Peristiwa | Debit | Kredit |
| --- | --- | --- |
| Pemasukan | Rekening [dana] | Akun pendapatan sesuai kategori [dana] |
| Pengeluaran | Akun beban sesuai kategori [dana] | Rekening [dana] |
| Saldo awal | Rekening [dana] | Saldo Dana Awal [dana] |
| Transfer antarrekening, dana sama | Rekening tujuan [dana] | Rekening asal [dana] |
| Transfer antardana, rekening sama | Rekening [dana tujuan] dan Transfer Antardana [dana asal] | Rekening [dana asal] dan Transfer Antardana [dana tujuan] |
| Transfer rekening sekaligus dana | Rekening tujuan [dana tujuan] dan Transfer Antardana [dana asal] | Rekening asal [dana asal] dan Transfer Antardana [dana tujuan] |
| Pembalikan | Kebalikan persis dari jurnal asal | |

Akibatnya:

- Setiap jurnal seimbang secara total **dan** seimbang per dana. Keduanya diperiksa constraint trigger di database saat commit.
- Transfer antardana dalam rekening yang sama tidak mengubah saldo rekening (debit dan kredit pada akun yang sama saling menghapus), tetapi memindahkan saldo antardana.
- Akun Transfer Antardana selalu bernilai nol pada laporan gabungan, sehingga transfer internal tereliminasi dengan sendirinya dan tidak pernah menjadi pendapatan atau beban.
- Saldo awal dikreditkan ke Saldo Dana Awal, bukan ke pendapatan, sehingga tidak dihitung sebagai pemasukan periode berjalan.

### 3.2 Status dan koreksi

| Status | Arti | Pengaruh ke saldo |
| --- | --- | --- |
| Draft | Belum resmi, masih dapat diubah atau dihapus | Tidak ada |
| Dibukukan | Resmi, bernomor, memiliki jurnal | Ada |
| Dibalik | Sudah dibatalkan oleh jurnal pembalikan; riwayat tetap ada | Nol (asal + pembalikan) |

Transaksi yang sudah dibukukan tidak ditimpa. Koreksi: **Balik** (membuat jurnal pembalikan bernomor JB) lalu, bila perlu, buat **transaksi pengganti** sebagai draft yang merujuk transaksi asal.

### 3.3 Penomoran

Nomor referensi diberikan database saat pembukuan melalui tabel penghitung `ref_counters` dengan `INSERT ... ON CONFLICT DO UPDATE`, sehingga aman dari penyimpanan bersamaan dan tidak meninggalkan celah akibat draft yang dihapus. Format bawaan: `KM-2026-0001` (kas masuk), `KK-2026-0001` (kas keluar), `TR-2026-0001` (transfer), `SA` (saldo awal), `JU` (jurnal penyesuaian), `JB` (jurnal balik). Awalan dan jumlah digit dapat diatur.

### 3.4 Pengaman di database

- Pembukuan, pembalikan, transfer, impor, tutup periode, dan rekonsiliasi berjalan sebagai fungsi RPC dalam satu transaction.
- Nominal harus positif (`CHECK`), uang disimpan sebagai `bigint` rupiah utuh, tidak pernah floating point.
- Kunci idempotensi unik per organisasi mencegah transaksi ganda akibat klik ganda atau koneksi ulang. Fungsi pembukuan mengunci baris dan mengembalikan hasil yang sama bila dipanggil ulang.
- Periode yang ditutup menolak pembukuan bertanggal di dalamnya. Pemeriksaan ada di fungsi database, bukan di antarmuka.
- Tanggal akuntansi bertipe `date`. Stempel waktu audit bertipe `timestamptz` dan ditampilkan dalam Asia/Jakarta.

### 3.5 Arus kas pada laporan

Setiap jurnal memiliki `flow_class`: pemasukan, pengeluaran, transfer, saldo_awal, atau penyesuaian. Jurnal pembalikan mewarisi kelas jurnal asalnya, sehingga pembalikan pemasukan mengurangi pemasukan, bukan menambah pengeluaran.

Rumus rekonsiliasi yang ditampilkan di Ringkasan dan semua laporan kas:

```
Saldo awal + pemasukan - pengeluaran + transfer masuk - transfer keluar (+ penyesuaian kas) = saldo akhir
```

Pada lingkup dana tertentu, transfer tampil sebagai Transfer Masuk atau Transfer Keluar. Pada lingkup Gabungan, transfer antardana bernilai nol dan transfer antarrekening saling menghapus. Jurnal tanpa baris akun kas ditandai nonkas dan tidak masuk laporan arus kas.

## 4. Skema data

Semua tabel memiliki `organization_id`, foreign key, dan Row Level Security.

| Kelompok | Tabel | Isi |
| --- | --- | --- |
| Organisasi | `organizations`, `organization_members`, `management_terms` | Profil, anggota dan role, periode kepengurusan |
| Master | `accounts`, `funds`, `programs`, `categories` | Daftar akun termasuk rekening, dana, program, kategori dan pemetaan akun |
| Anggaran | `budgets`, `budget_items` | RAB per pos untuk tiap program |
| Buku besar | `journal_entries`, `journal_lines`, `ref_counters` | Transaksi, baris jurnal, penghitung nomor |
| Bukti | `attachments` | Metadata berkas di bucket privat, dengan riwayat penggantian |
| Proses | `import_batches`, `reconciliations`, `closed_periods` | Impor, rekonsiliasi, tutup periode |
| Pengawasan | `audit_logs` | Jejak tindakan, hanya dapat ditambah |
| Kesehatan | `cash_needs`, `notifications`, `notification_reads`, `health_checks` | Kebutuhan kas, notifikasi, riwayat pemeriksaan |
| Integrasi (belum aktif) | `integration_connections`, `payment_requests`, `payment_transactions`, `webhook_events`, `settlements`, `bank_sync_runs`, `bank_statement_entries` | Fondasi bank dan QRIS |

### Hak akses

| Role | Hak |
| --- | --- |
| Admin Organisasi | Pengaturan, akun pengguna, periode kepengurusan, buka kembali periode, serah terima |
| Bendahara | Mencatat, membukukan, membalik, mengelola program, impor, rekonsiliasi, tutup periode |
| Pembaca | Melihat semua data dan laporan tanpa mengubah |

Satu pengguna dapat memegang lebih dari satu role (pengguna pertama menjadi Admin sekaligus Bendahara). Role disimpan di `organization_members` yang tidak memiliki policy tulis untuk pengguna; perubahan role hanya lewat fungsi yang memeriksa role Admin, sehingga pengguna tidak dapat menaikkan role sendiri. Pengguna yang login tanpa keanggotaan tidak dapat membaca satu baris pun.

Data dimiliki organisasi. Pergantian bendahara hanya mengubah `organization_members`; transaksi, jurnal, dan bukti tidak berpindah.

## 5. Struktur halaman

| Menu | Rute | Aksi utama |
| --- | --- | --- |
| Masuk | `/login`, `/lupa-password`, `/atur-password` | Masuk |
| Ringkasan | `/ringkasan` | Catat Transaksi |
| Kas Umum | `/kas`, `/kas/baru`, `/kas/[id]`, `/kas/[id]/ubah`, `/kas/impor`, `/kas/rekonsiliasi` | Catat Transaksi |
| Program | `/program`, `/program/[id]` dengan tab Ringkasan, RAB, Transaksi, Bukti, LPJ | Tambah Program |
| Jurnal & Buku Besar | `/jurnal` dengan tab Jurnal Umum, Buku Besar, Neraca Saldo, Daftar Akun; `/jurnal/penyesuaian` | Jurnal Penyesuaian |
| Laporan | `/laporan` | Ekspor |
| Arsip Bukti | `/arsip` | Unggah Dokumen Arsip |
| Kesehatan Keuangan | `/kesehatan` | Tambah Kebutuhan Kas |
| Notifikasi | `/notifikasi` | Tandai Dibaca |
| Pengaturan | `/pengaturan/...` | Simpan |

Lingkup data dipilih dengan satu kontrol yang sama di semua halaman: **Kas Umum** (bawaan), **Program tertentu**, atau **Gabungan organisasi**. Tampilan Gabungan selalu diberi keterangan bahwa di dalamnya ada dana program yang terikat.

Filter disimpan di URL, sehingga kembali dari halaman detail mempertahankan filter.

## 6. Design system

| Token | Nilai |
| --- | --- |
| Latar | `#F7F8FA`, permukaan kartu `#FFFFFF` |
| Utama | `#14532D` |
| Aksen | `#15803D` |
| Teks utama | `#17211B`, teks sekunder `#5B665F` |
| Garis | `#E5E7EB` |
| Peringatan | Amber `#B45309` di atas `#FEF3C7` |
| Bahaya dan pengeluaran | Merah `#B91C1C` |
| Radius | 8 px (kontrol), 12 px (kartu) |
| Bayangan | Satu tingkat, sangat tipis |
| Font | Geist Sans. Nominal memakai angka tabular dan rata kanan |

Aturan pemakaian:

- Tabel adalah pusat pengelolaan transaksi. Kartu statistik di Ringkasan dibatasi empat.
- Warna tidak pernah menjadi satu-satunya pembawa makna: status selalu disertai ikon dan label teks.
- Setiap halaman memiliki satu aksi utama berwarna hijau gelap. Aksi lain bergaya sekunder.
- Setiap halaman memiliki keadaan memuat (skeleton), kosong (dengan langkah berikutnya), dan galat (dengan cara memperbaiki).
- Formulir memiliki label jelas, validasi inline, umpan balik setelah tersimpan, dan peringatan saat ditinggalkan sebelum disimpan.
- Desktop: sidebar kiri 240 px, header berisi judul, periode aktif, lonceng notifikasi, menu pengguna.
- Ponsel: bilah navigasi bawah dengan tombol Catat di tengah, daftar transaksi berbentuk baris ringkas, unggah bukti dapat langsung dari kamera.
- Tidak ada gradient, glassmorphism, ornamen, skor 0 sampai 100, ataupun fitur AI.
