import { formatDate } from "@/lib/format";
import type { CashSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Money } from "@/components/app/money";

/**
 * Rekonsiliasi saldo dalam satu baris:
 * saldo awal + pemasukan - pengeluaran + transfer masuk - transfer keluar (+ penyesuaian) = saldo akhir.
 */
export function FlowStrip({ s, from, to, showTransfers, className }: { s: CashSummary; from: string; to: string; showTransfers: boolean; className?: string }) {
  const opening = Number(s.opening_before) + Number(s.opening_entries);
  const items: { label: string; value: number; op: string; tone?: "in" | "out" }[] = [
    { label: `Saldo awal`, value: opening, op: "" },
    { label: "Pemasukan", value: Number(s.income), op: "+", tone: "in" },
    { label: "Pengeluaran", value: Number(s.expense), op: "−", tone: "out" },
  ];
  if (showTransfers || s.transfer_in || s.transfer_out) {
    items.push({ label: "Transfer masuk", value: Number(s.transfer_in), op: "+" });
    items.push({ label: "Transfer keluar", value: Number(s.transfer_out), op: "−" });
  }
  if (Number(s.adjustment) !== 0) items.push({ label: "Penyesuaian kas", value: Number(s.adjustment), op: "+" });
  return (
    <div className={cn("overflow-x-auto", className)}>
      <dl className="flex min-w-max items-stretch gap-0 text-sm" aria-label={`Rekonsiliasi saldo ${formatDate(from)} sampai ${formatDate(to)}`}>
        {items.map((i) => (
          <div key={i.label} className="flex items-center">
            {i.op && <span className="px-2.5 text-base text-faint" aria-hidden>{i.op}</span>}
            <div>
              <dt className="text-[12px] text-muted">{i.label}</dt>
              <dd><Money value={i.value} className="font-medium" tone={i.value === 0 ? "muted" : undefined} /></dd>
            </div>
          </div>
        ))}
        <div className="flex items-center">
          <span className="px-2.5 text-base text-faint" aria-hidden>=</span>
          <div>
            <dt className="text-[12px] text-muted">Saldo akhir</dt>
            <dd><Money value={s.closing} className="font-semibold" tone="auto" /></dd>
          </div>
        </div>
      </dl>
    </div>
  );
}
