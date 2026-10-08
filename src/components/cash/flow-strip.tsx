import { ArrowDownLeft, ArrowUpRight, ChevronDown } from "@/components/ui/icons";
import { Money } from "@/components/app/money";
import { formatRupiah } from "@/lib/format";
import type { CashSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Ringkasan kas yang mudah dibaca: saldo, uang masuk, uang keluar.
 * Rincian lengkap (saldo awal, transfer, penyesuaian) ada di bawah tombol "Lihat rincian".
 */
export function FlowStrip({ s, showTransfers, className }: { s: CashSummary; from?: string; to?: string; showTransfers: boolean; className?: string }) {
  const opening = Number(s.opening_before) + Number(s.opening_entries);
  const rows: { label: string; value: number; sign?: "+" | "-" }[] = [
    { label: "Saldo awal", value: opening },
    { label: "Masuk", value: Number(s.income), sign: "+" },
    { label: "Keluar", value: Number(s.expense), sign: "-" },
  ];
  if (showTransfers || s.transfer_in || s.transfer_out) {
    rows.push({ label: "Transfer masuk", value: Number(s.transfer_in), sign: "+" });
    rows.push({ label: "Transfer keluar", value: Number(s.transfer_out), sign: "-" });
  }
  if (Number(s.adjustment) !== 0) rows.push({ label: "Penyesuaian", value: Number(s.adjustment), sign: "+" });

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[13px] text-muted">Saldo akhir</p>
          <p data-label="Saldo akhir" className="mt-0.5 text-2xl font-semibold tracking-tight"><Money value={s.closing} tone="auto" /></p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-[13px] text-muted">
            <span className="inline-flex size-5 items-center justify-center rounded-md bg-accent-soft text-primary"><ArrowDownLeft className="size-3.5" aria-hidden /></span>Masuk
          </p>
          <p className="mt-0.5 text-lg font-semibold"><Money value={s.income} /></p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-[13px] text-muted">
            <span className="inline-flex size-5 items-center justify-center rounded-md bg-[#fbf3b8] text-[#5c4d00]"><ArrowUpRight className="size-3.5" aria-hidden /></span>Keluar
          </p>
          <p className="mt-0.5 text-lg font-semibold"><Money value={s.expense} /></p>
        </div>
      </div>

      <details className="group mt-3 border-t border-line pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-[13px] font-medium text-primary [&::-webkit-details-marker]:hidden">
          Lihat rincian
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <dl className="mt-3 divide-y divide-line text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 py-2">
              <dt className="text-muted">{r.label}</dt>
              <dd className={cn("tnum font-medium", r.value === 0 && "text-faint")}>{r.sign === "-" && r.value !== 0 ? "-" : r.sign === "+" && r.value !== 0 ? "+" : ""}{formatRupiah(r.value)}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="font-medium text-ink">Saldo akhir</dt>
            <dd className="tnum font-semibold"><Money value={s.closing} tone="auto" /></dd>
          </div>
        </dl>
        <p className="mt-1 text-[12px] text-muted">Draft tidak ikut dihitung.</p>
      </details>
    </div>
  );
}
