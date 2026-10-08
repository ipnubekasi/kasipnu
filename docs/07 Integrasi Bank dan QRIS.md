# Integrasi Bank dan QRIS (Coming Soon)

Fitur ini **belum aktif**. Yang tersedia hanya fondasi agar integrasi bisa ditambahkan nanti tanpa mengubah cara pembukuan.

## 1. Yang sudah ada

| Bagian | Lokasi | Keadaan |
|---|---|---|
| Halaman informasi | Pengaturan > Integrasi Bank & QRIS | Menampilkan label Coming Soon; semua tombol nonaktif |
| Feature flag ganda | Variabel `INTEGRASI_BANK_QRIS_AKTIF` dan tabel `app_feature_flags` | Keduanya `false`. Integrasi hanya aktif bila keduanya `true` |
| Tabel data | `integration_connections`, `payment_requests`, `payment_transactions`, `settlements`, `webhook_events`, `bank_sync_runs`, `bank_statement_entries` | Dengan RLS; trigger menolak semua penulisan selama flag mati |
| Kontrak adapter | `src/lib/integrations/types.ts` | `BankAdapter` (hanya baca saldo dan mutasi) dan `PaymentAdapter` (QRIS) |
| Endpoint webhook | `/api/integrasi/webhook/[provider]` | Menjawab 503 dan tidak menyimpan apa pun |

Tidak ada kredensial bank, tidak ada koneksi ke penyedia, dan aplikasi tidak pernah memindahkan uang.

## 2. Prinsip pembukuan yang sudah dikunci

1. **Pembayaran QRIS berhasil** dicatat sebagai pemasukan ke rekening jenis dompet atau saldo penyedia, sebesar nilai bruto.
2. **Biaya layanan (MDR)** dicatat sebagai beban terpisah, bukan dikurangkan diam-diam dari pemasukan.
3. **Pencairan** dari penyedia ke rekening bank dicatat sebagai **transfer antarrekening**, bukan pemasukan kedua.
4. **Mutasi bank** yang ditarik otomatis masuk sebagai **draft** dan dicocokkan lewat rekonsiliasi, bukan langsung dibukukan.
5. Webhook diverifikasi tanda tangannya dan disimpan dengan ID kejadian unik agar kejadian yang sama tidak dibukukan dua kali.

## 3. Syarat sebelum diaktifkan

1. **Legalitas dan rekening**: rekening atas nama organisasi, dokumen legalitas (SK, NPWP organisasi) sesuai syarat penyedia.
2. **Pilihan penyedia**: bank dengan layanan API (umumnya mengikuti standar SNAP Bank Indonesia) atau penyedia pembayaran berizin Bank Indonesia yang melayani QRIS. Bandingkan biaya, syarat entitas nirlaba, dan dokumentasi API.
3. **Kredensial** disimpan hanya di Environment Variables server, tidak di database tanpa enkripsi.
4. **Pengembangan adapter** sesuai kontrak di `types.ts`, uji di sandbox penyedia, lalu uji rekonsiliasi minimal satu bulan.
5. **Persetujuan pengurus** tertulis sebelum flag diubah, karena perubahan ini menyangkut uang masuk organisasi.

## 4. Cara mengaktifkan (setelah adapter selesai dan diuji)

1. Set `INTEGRASI_BANK_QRIS_AKTIF=true` di Vercel, Redeploy.
2. Di SQL Editor (oleh pengelola sistem): `update public.app_feature_flags set enabled = true where key = 'integrasi_bank_qris';`
3. Untuk mematikan darurat cukup salah satu kembali ke `false`.
