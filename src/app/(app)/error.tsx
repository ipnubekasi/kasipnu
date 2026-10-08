"use client";

import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const offline = /fetch failed|network|ECONN|ENOTFOUND|timeout/i.test(error.message);
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-card border border-danger-line bg-surface p-6 text-center">
      <span className="mx-auto mb-3 inline-flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-5" aria-hidden />
      </span>
      <h1 className="text-base font-semibold text-ink">Halaman tidak dapat dimuat</h1>
      <p className="mt-1 text-sm text-muted">
        {offline
          ? "Aplikasi tidak dapat terhubung ke database. Periksa koneksi internet Anda, lalu coba lagi."
          : "Terjadi gangguan saat mengambil data. Data Anda aman; tidak ada yang berubah."}
      </p>
      <ul className="mt-3 space-y-1 text-left text-[13px] text-muted">
        <li>1. Tekan Coba lagi.</li>
        <li>2. Jika masih gagal, muat ulang halaman atau masuk kembali.</li>
        <li>3. Jika berulang, sampaikan kode berikut kepada Admin Organisasi{error.digest ? `: ${error.digest}` : "."}</li>
      </ul>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="primary" onClick={() => retry()}><RefreshCw aria-hidden />Coba lagi</Button>
        <Button asChild><Link href="/ringkasan">Ke Ringkasan</Link></Button>
      </div>
    </div>
  );
}
