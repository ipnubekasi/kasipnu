import type { Metadata } from "next";
import { Landmark, QrCode } from "@/components/ui/icons";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Integrasi Bank & QRIS" };

const SECTIONS = [
  { icon: Landmark, title: "Koneksi Bank", text: "Sinkronisasi saldo dan mutasi rekening." },
  { icon: QrCode, title: "Penerimaan QRIS", text: "Penerimaan iuran, donasi, dan pembayaran program." },
];

export default function IntegrationPage() {
  return (
    <>
      <PageHeader title="Integrasi Bank & QRIS" description="Fitur lanjutan yang sedang dipersiapkan.">
        <Badge tone="neutral">Coming Soon</Badge>
      </PageHeader>
      <Alert tone="info" className="mb-5">
        Integrasi sedang dipersiapkan. Pencatatan keuangan tetap dapat dilakukan melalui input transaksi dan impor mutasi rekening.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.title}>
            <CardContent>
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex size-10 items-center justify-center rounded-control bg-subtle text-muted"><s.icon className="size-5" aria-hidden /></span>
                <Badge tone="neutral">Coming Soon</Badge>
              </div>
              <h2 className="text-[15px] font-semibold text-ink">{s.title}</h2>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
              <p className="mt-3 text-[13px] text-faint">Belum aktif. Tidak ada koneksi, kredensial, atau pembayaran yang diproses.</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-5">
        <CardContent className="space-y-2 text-sm text-muted">
          <h2 className="text-[15px] font-semibold text-ink">Yang tetap berjalan sekarang</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Pencatatan rekening bank dan input saldo awal.</li>
            <li>Input transaksi manual dan impor mutasi rekening dari CSV atau XLSX.</li>
            <li>Rekonsiliasi Saldo Buku dengan rekening koran.</li>
          </ul>
          <p className="pt-1 text-[13px]">Saldo yang tampil di aplikasi adalah Saldo Buku menurut pencatatan, bukan saldo bank waktu nyata. Persiapan aktivasi dijelaskan di <code className="rounded bg-subtle px-1">docs/07 Integrasi Bank dan QRIS.md</code>.</p>
        </CardContent>
      </Card>
    </>
  );
}
