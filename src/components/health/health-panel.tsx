import Link from "next/link";
import { ArrowRight } from "@/components/ui/icons";
import { formatDateTime, formatDecimal } from "@/lib/format";
import { HEALTH_LABEL } from "@/lib/labels";
import type { Health } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HEALTH_STYLE } from "@/components/app/badges";
import { Money } from "@/components/app/money";

export function runwayText(h: Health["general"]): string {
  if (h.runway_months === null) return "Belum dapat dihitung";
  return `Sekitar ${formatDecimal(h.runway_months)} bulan`;
}

/** Panel ringkas Kesehatan Keuangan untuk halaman Ringkasan. Angka nyata, tanpa skor. */
export function HealthPanel({ health }: { health: Health }) {
  const g = health.general;
  const style = HEALTH_STYLE[g.status];
  const Icon = style.icon;
  const main = g.reasons[0]?.text ?? (g.status === "data_belum_cukup" ? "Riwayat pengeluaran operasional rutin belum cukup untuk menghitung ketahanan kas." : "Tidak ada kondisi yang perlu ditindaklanjuti.");
  return (
    <Card className="overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className={cn("flex flex-col gap-2 border-b p-4 sm:p-5 lg:border-r lg:border-b-0", style.box)}>
          <p className="text-[13px] font-medium text-muted">Kesehatan Keuangan · Kas Umum</p>
          <p className={cn("flex items-center gap-2 text-lg font-semibold", style.text)}>
            <Icon className="size-5 shrink-0" aria-hidden />
            {HEALTH_LABEL[g.status]}
          </p>
          <p className="text-sm text-ink">{main}</p>
          {g.reasons.length > 1 && <p className="text-[13px] text-muted">dan {g.reasons.length - 1} kondisi lain</p>}
        </div>
        <div className="p-4 sm:p-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <div>
              <dt className="text-[12px] text-muted">Ketahanan kas</dt>
              <dd className="text-[15px] font-semibold text-ink">{runwayText(g)}</dd>
              <dd className="text-[12px] text-muted">{g.avg_basis === "anggaran" ? "Berdasarkan anggaran" : g.avg_basis === "riwayat" ? "Rata-rata 3 bulan" : "Data belum cukup"}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Kebutuhan 30 hari</dt>
              <dd className="text-[15px] font-semibold"><Money value={g.needs30.total} /></dd>
              <dd className="text-[12px] text-muted">{g.needs30.shortfall > 0 ? <>Kurang <Money value={g.needs30.shortfall} tone="out" /></> : "Tercukupi Kas Umum"}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Target tambahan dana</dt>
              <dd className="text-[15px] font-semibold">{g.target_additional === null ? <span className="text-muted">Belum dapat dihitung</span> : <Money value={g.target_additional} />}</dd>
              <dd className="text-[12px] text-muted">Untuk cadangan {formatDecimal(health.thresholds.target_months, 0)} bulan</dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-line pt-3 text-sm text-muted">{g.recommendation}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-faint">Diperbarui {formatDateTime(health.computed_at)}</p>
            <Button asChild size="sm"><Link href="/kesehatan">Lihat Perhitungan<ArrowRight aria-hidden /></Link></Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
