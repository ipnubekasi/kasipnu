# Panduan Bendahara Kas IPNU

Panduan ini untuk Bendahara dan pengurus yang memakai aplikasi sehari-hari. Tidak perlu pengetahuan akuntansi; aplikasi menyusun jurnal secara otomatis.

## 1. Istilah yang perlu dipahami

| Istilah | Arti |
|---|---|
| **Rekening** | Tempat uang berada: Kas Tunai, rekening bank, e-wallet. Menjawab "uangnya ada di mana". |
| **Dana** | Peruntukan uang. **Kas Umum** untuk operasional organisasi; setiap **Program** (misalnya MAKESTA) memiliki dana sendiri. Menjawab "uangnya milik kegiatan apa". |
| **Draft** | Catatan yang belum dibukukan. Belum memengaruhi saldo, masih boleh diubah atau dihapus. |
| **Dibukukan** | Catatan resmi dengan nomor referensi. Mengubah saldo dan tidak bisa diedit. |
| **Dibalik** | Transaksi yang dibatalkan lewat transaksi pembalik. Jejak aslinya tetap tersimpan. |
| **Transfer** | Perpindahan uang antarrekening atau antardana. Transfer bukan pemasukan dan bukan pengeluaran. |

Satu uang bisa berada di rekening bank (rekening) sekaligus milik MAKESTA (dana). Karena itu saldo dilihat dari dua sisi dan jumlah keduanya selalu sama.

## 2. Memulai (sekali saja)

Di menu **Pengaturan**, berurutan:

1. **Profil dan logo**: nama organisasi, alamat, logo, nama penandatangan laporan.
2. **Periode kepengurusan**: tanggal mulai dan selesai masa khidmat.
3. **Rekening dan kas**: tambahkan rekening bank atau e-wallet. Kas Tunai sudah tersedia.
4. **Saldo awal**: isi saldo setiap rekening pada tanggal mulai memakai aplikasi. Boleh dilewati bila belum ada uang.
5. **Kategori dan pemetaan akun**: periksa daftar kategori pemasukan dan pengeluaran; tambah sesuai kebiasaan organisasi.
6. **Anggota dan hak akses**: tambahkan pengurus lain. **Pembaca** hanya bisa melihat dan mengunduh laporan.

## 3. Mencatat transaksi

Klik **Catat Transaksi** (di ponsel: tombol bulat di tengah bawah).

1. Pilih jenis: **Pemasukan**, **Pengeluaran**, atau **Transfer**.
2. Isi tanggal, nominal, uraian, kategori, rekening, dan dana. Bila kegiatan memakai dana program, pilih program tersebut di kolom dana.
3. Lampirkan bukti: foto nota, kuitansi, atau PDF (JPG, PNG, PDF). Di ponsel, kamera bisa langsung dipakai. Bila bukti memang tidak ada, centang **Bukti tidak tersedia untuk transaksi ini** dan tulis alasannya.
4. Panel samping menunjukkan saldo sebelum dan sesudah transaksi.
5. Klik **Simpan dan Bukukan** bila sudah yakin, atau **Simpan sebagai Draft** bila masih perlu diperiksa.

Aplikasi menolak pengeluaran yang membuat saldo rekening atau dana menjadi minus, tanggal di masa depan, dan tanggal pada bulan yang sudah ditutup.

### Transfer

- **Antarrekening**: misalnya setor tunai ke bank. Saldo rekening berpindah, dana tidak berubah.
- **Antardana**: misalnya alokasi Kas Umum ke MAKESTA, atau pengembalian sisa dana program ke Kas Umum. Uang tetap di rekening yang sama, peruntukannya berubah.
- **Keduanya**: pindah rekening sekaligus pindah dana.

### Memperbaiki kesalahan

Transaksi yang sudah dibukukan tidak diedit. Buka transaksinya, klik **Balik transaksi**, isi alasan, dan biarkan pilihan **Buat transaksi pengganti sebagai draft** tercentang bila ingin mencatat versi yang benar. Saldo kembali seperti sebelum transaksi salah, dan kedua catatan tetap tampil di riwayat untuk pemeriksa.

## 4. Draft dan impor

- Daftar draft ada di **Kas Umum** dengan filter status **Draft**. Centang beberapa draft lalu **Bukukan terpilih**.
- **Impor** (di halaman Kas Umum) menerima CSV atau XLSX, misalnya dari catatan Excel lama atau mutasi bank. Petakan kolom tanggal, uraian, dan nominal. Hasil impor selalu menjadi draft, baris yang sama persis tidak masuk dua kali, dan baris yang mirip ditandai sebagai kemungkinan duplikat.

## 5. Program, RAB, dan LPJ

1. **Program > Tambah Program**: isi nama, kode (misalnya MAKESTA), tanggal, dan penanggung jawab. Aplikasi otomatis membuat dana program.
2. Tab **RAB**: susun rencana pemasukan dan pengeluaran per pos.
3. Alokasikan uang dari Kas Umum lewat **Transfer antardana**, atau catat pemasukan sponsor langsung ke dana program.
4. Catat pengeluaran kegiatan dengan memilih dana program tersebut. Tab **Ringkasan** menunjukkan realisasi terhadap RAB.
5. Setelah kegiatan selesai, kembalikan sisa dana ke Kas Umum, ubah status program menjadi selesai, lalu unduh **LPJ** dari tab LPJ atau menu Laporan.

## 6. Rekonsiliasi

Rekonsiliasi mencocokkan saldo buku dengan saldo nyata (uang di laci atau saldo di rekening koran).

1. **Kas Umum > Rekonsiliasi**. Pilih rekening, tanggal, masukkan saldo nyata, lalu klik **Mulai Rekonsiliasi**.
2. Centang transaksi yang sudah muncul di rekening koran.
3. Bila ada selisih, cari penyebabnya. Selisih yang tidak bisa ditemukan dicatat sebagai selisih lebih atau selisih kurang dengan keterangan.
4. Klik **Selesaikan Rekonsiliasi**. Lakukan minimal sebulan sekali; aplikasi mengingatkan bila terlambat.

## 7. Tutup periode

Setelah laporan bulan tertentu diperiksa, buka **Pengaturan > Tutup periode** dan tutup bulan tersebut. Transaksi pada bulan yang ditutup tidak bisa ditambah, dibukukan, atau dibalik. Pembukaan kembali hanya oleh Admin dengan alasan tertulis yang tercatat di audit log.

## 8. Laporan

Menu **Laporan** menyediakan: Buku Kas Umum, Pemasukan dan Pengeluaran, Arus Kas, Rekap Bulanan, Saldo per Rekening, Saldo per Dana dan Program, Jurnal Umum, Buku Besar, Neraca Saldo, Anggaran dan Realisasi Program, LPJ Program, dan Laporan Akhir Kepengurusan.

Pilih jenis laporan, lingkup (Kas Umum, program, atau gabungan), dan periode. Tombol **PDF**, **XLSX**, dan **CSV** mengunduh angka yang sama persis dengan yang tampil di layar. Draft tidak pernah ikut dihitung.

## 9. Ringkasan dan kesehatan keuangan

Halaman **Ringkasan** menampilkan saldo, pemasukan dan pengeluaran bulan berjalan, grafik enam bulan, dan tugas yang menunggu. Halaman **Kesehatan** menilai kondisi keuangan dengan indikator seperti cadangan kas, kebutuhan kas yang akan jatuh tempo, bukti yang belum lengkap, draft yang tertunda, dan rekonsiliasi. Setiap peringatan menjelaskan penyebab dan langkah yang disarankan, lengkap dengan tombol menuju tempat perbaikannya. Ambang peringatan bisa disesuaikan di **Pengaturan > Kesehatan dan notifikasi**.

Notifikasi muncul di ikon lonceng. Notifikasi hanya untuk pengurus di dalam aplikasi; aplikasi tidak mengirim pesan ke donatur, sponsor, atau anggota.

## 10. Kebiasaan yang disarankan

1. Catat transaksi di hari yang sama dan langsung lampirkan foto bukti.
2. Jangan biarkan draft lebih dari beberapa hari.
3. Rekonsiliasi setiap akhir bulan, lalu tutup periode.
4. Unduh backup bulanan (lihat dokumen 05).
5. Jangan berbagi akun. Setiap pengurus memakai akun sendiri agar audit log jelas.
