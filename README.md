# Kas IPNU

Sistem keuangan PC IPNU Kabupaten Bekasi: buku kas umum, dana program, RAB dan LPJ, bukti transaksi, rekonsiliasi, tutup periode, laporan PDF/XLSX/CSV, kesehatan keuangan, dan serah terima bendahara.

Dibangun dengan Next.js 16, TypeScript, Tailwind CSS 4, dan Supabase (Postgres, Auth, Storage). Disiapkan untuk deployment di Vercel.

## Prinsip

- **Satu sumber kebenaran**: setiap angka berasal dari jurnal double-entry di database. Saldo, laporan, ekspor, dan indikator dihitung dari jurnal yang sama.
- **Dana dan rekening dipisah**: rekening menjawab di mana uang berada; dana menjawab milik kegiatan apa.
- **Tidak ada yang hilang**: transaksi yang dibukukan tidak bisa diedit atau dihapus, hanya dibalik. Semua perubahan tercatat di audit log.
- **Keamanan di database**: Row Level Security di semua tabel, penulisan lewat fungsi yang memeriksa role, bukti di bucket privat dengan signed URL.

## Struktur

```
src/app/                Halaman (App Router) dan route handler
src/components/         Komponen UI dan fitur
src/lib/                Klien Supabase, format, laporan, impor, integrasi
supabase/migrations/    11 migration SQL berurutan
scripts/                Backup dan pemulihan bucket bukti
tests/db/               Uji database (PGlite atau PostgreSQL asli)
tests/unit/             Uji ekspor dan impor
tests/e2e/              Uji browser (Playwright), desktop dan ponsel
docs/                   Rancangan dan panduan
```

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local     # isi URL dan publishable key Supabase
npm run dev                    # http://localhost:3000
```

## Pengujian

```bash
npm run typecheck && npm run lint
npm test                       # unit + database (PGlite, tanpa server)
```

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [01 Rancangan Sistem](docs/01%20Rancangan%20Sistem.md) | Keputusan teknis, model data, aturan posting |
| [02 Setup Supabase](docs/02%20Setup%20Supabase.md) | Project, migration, Auth, Storage, pg_cron, pengguna pertama |
| [03 Deployment Vercel](docs/03%20Deployment%20Vercel.md) | Environment variables, redirect Auth, cron |
| [04 Panduan Bendahara](docs/04%20Panduan%20Bendahara.md) | Pemakaian sehari-hari |
| [05 Backup Pemulihan dan Serah Terima](docs/05%20Backup%20Pemulihan%20dan%20Serah%20Terima.md) | Backup, restore, prosedur serah terima |
| [06 Hasil Pengujian dan Keterbatasan](docs/06%20Hasil%20Pengujian%20dan%20Keterbatasan.md) | Hasil uji dan batasan yang diketahui |
| [07 Integrasi Bank dan QRIS](docs/07%20Integrasi%20Bank%20dan%20QRIS.md) | Fondasi integrasi (Coming Soon) |
