import Link from "next/link";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, BookOpenText, ChevronRight, CircleCheck, FileBarChart, FileQuestion,
  FolderKanban, PencilLine, Scale, Upload,
} from "@/components/ui/icons";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { HEALTH_STYLE, HealthBadge, ProgramStatusBadge } from "@/components/app/badges";
import { Money } from "@/components/app/money";
import { PeriodSelect, ScopeSelect } from "@/components/app/url-controls";
import { CashFlowChart } from "@/components/charts/cash-flow-chart";
import { runwayText } from "@/components/health/health-panel";
import { formatDate, formatRupiah } from "@/lib/format";
import { HEALTH_LABEL } from "@/lib/labels";
import type { CashSummary, Health, Program, TxRow } from "@/lib/types";
import { cn, qs } from "@/lib/utils";

type Tasks = { drafts: number; missing_evidence: number; open_reconciliations: number; accounts_to_reconcile: { account_id: string; name: string; last_date: string | null }[] };
type ProgramSum = { program_id: string; budget_expense: number | string | null; expense: number | string | null; fund_balance: number | string | null };

/**
 * Ringkasan khusus ponsel. Urutan mengikuti kebiasaan aplikasi keuangan di ponsel:
 * saldo besar di atas, aksi cepat satu ketukan, lalu hal yang perlu perhatian, grafik, dan daftar.
 * Hanya tampil di bawah lebar lg; versi desktop dirender terpisah di halaman.
 */
export function MobileSummary(props: {
  scopeKey: string;
  scopeKind: string;
  scopeLabel: string;
  programs: { id: string; name: string; status: string }[];
  periodKey: string;
  from: string;
  to: string;
  summary: CashSummary;
  net: number;
  canWrite: boolean;
  tasks: Tasks;
  health: Health;
  monthly: { month: string; income: number; expense: number }[];
  latest: TxRow[];
  activePrograms: Program[];
  programSummary: ProgramSum[];
  categoryName: (id: string | null) => string | undefined;
  fundName: (id: string | null) => string;
  returnTo: string;
}) {
  const { summary, net, tasks, health } = props;
  const g = health.general;
  const hs = HEALTH_STYLE[g.status];
  const HIcon = hs.icon;
  const taskCount = tasks.drafts + tasks.missing_evidence + tasks.open_reconciliations + tasks.accounts_to_reconcile.length;
  const dana = props.scopeKind === "gabungan" ? null : props.scopeKey;
  const newTx = (jenis: string) => `/kas/baru${qs({ jenis, dana, kembali: "/ringkasan" })}`;

  const actions = props.canWrite
    ? [
        { href: newTx("pemasukan"), label: "Pemasukan", icon: ArrowDownLeft, chip: "bg-accent-soft text-primary" },
        { href: newTx("pengeluaran"), label: "Pengeluaran", icon: ArrowUpRight, chip: "bg-[#fbf3b8] text-[#5c4d00]" },
        { href: newTx("transfer"), label: "Transfer", icon: ArrowLeftRight, chip: "bg-subtle text-primary" },
        { href: "/kas/impor", label: "Impor", icon: Upload, chip: "bg-subtle text-primary" },
      ]
    : [
        { href: "/kas", label: "Kas", icon: ArrowLeftRight, chip: "bg-accent-soft text-primary" },
        { href: "/program", label: "Program", icon: FolderKanban, chip: "bg-[#fbf3b8] text-[#5c4d00]" },
        { href: "/laporan", label: "Laporan", icon: FileBarChart, chip: "bg-subtle text-primary" },
        { href: "/jurnal", label: "Jurnal", icon: BookOpenText, chip: "bg-subtle text-primary" },
      ];

  return (
    <div className="space-y-4">
      {/* Filter: dua kolom sama lebar, tidak saling menumpuk */}
      <div className="grid grid-cols-2 gap-2">
        <ScopeSelect value={props.scopeKey} programs={props.programs} className="h-10 w-full min-w-0 text-[14px]" />
        <PeriodSelect value={props.periodKey} from={props.from} to={props.to} className="h-10 w-full min-w-0 text-[14px]" wrapClassName="min-w-0 [&>div]:w-full" />
      </div>

      {/* Kartu saldo */}
      <Link
        href={`/kas${qs({ lingkup: props.scopeKey, periode: "semua" })}`}
        className="relative block overflow-hidden rounded-[20px] p-5 text-white"
        style={{ background: "linear-gradient(160deg, #14503a 0%, #0e3a28 100%)" }}
      >
        <svg aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-56 text-white/[0.07]" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="100" cy="100" r="95" /><circle cx="100" cy="100" r="70" /><circle cx="100" cy="100" r="45" />
        </svg>
        <div className="relative flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-side-ink">Saldo akhir · {props.scopeLabel}</p>
          <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[12px] font-semibold", net > 0 ? "bg-pill text-pill-ink" : net < 0 ? "bg-white text-danger" : "bg-white/15 text-white")}>
            {net > 0 ? "Surplus" : net < 0 ? "Defisit" : "Seimbang"}
          </span>
        </div>
        <p className="tnum relative mt-2 text-[32px] leading-tight font-semibold tracking-tight">{formatRupiah(summary.closing)}</p>
        <p className="relative mt-0.5 text-[12px] text-side-ink">Per {formatDate(props.to)}</p>
        <div className="relative mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12px] text-side-ink">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-white/15"><ArrowDownLeft className="size-3" aria-hidden /></span>Pemasukan
            </p>
            <p className="tnum mt-1 truncate text-[15px] font-semibold">{formatRupiah(summary.income)}</p>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12px] text-side-ink">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-white/15"><ArrowUpRight className="size-3" aria-hidden /></span>Pengeluaran
            </p>
            <p className="tnum mt-1 truncate text-[15px] font-semibold">{formatRupiah(summary.expense)}</p>
          </div>
        </div>
        <p className="relative mt-3 text-[12px] text-side-ink">
          Arus kas bersih <span className="tnum font-semibold text-white">{net > 0 ? "+" : ""}{formatRupiah(net)}</span>
        </p>
      </Link>

      {/* Aksi cepat */}
      <div className="grid grid-cols-4 gap-2">
        {actions.map((a) => (
          <Link key={a.label} href={a.href} className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface px-1 py-3 text-center active:bg-subtle">
            <span className={cn("inline-flex size-10 items-center justify-center rounded-xl", a.chip)}><a.icon className="size-5" aria-hidden /></span>
            <span className="text-[12px] leading-tight font-medium text-ink">{a.label}</span>
          </Link>
        ))}
      </div>

      {/* Kesehatan keuangan */}
      {props.scopeKind !== "program" && (
        <Link href="/kesehatan" className="block rounded-card border border-line bg-surface p-4 active:bg-subtle">
          <div className="flex items-start gap-3">
            <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl border", hs.box, hs.text)}><HIcon className="size-5" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted">Kesehatan Keuangan · Kas Umum</p>
              <p className={cn("text-[16px] font-semibold", hs.text)}>{HEALTH_LABEL[g.status]}</p>
              <p className="mt-0.5 line-clamp-2 text-[13px] text-ink">{g.reasons[0]?.text ?? "Tidak ada kondisi yang perlu ditindaklanjuti."}</p>
            </div>
            <ChevronRight className="mt-1 size-5 shrink-0 text-faint" aria-hidden />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
            <div className="min-w-0"><dt className="text-[12px] text-muted">Ketahanan kas</dt><dd className="truncate text-[14px] font-semibold text-ink">{runwayText(g)}</dd></div>
            <div className="min-w-0"><dt className="text-[12px] text-muted">Kebutuhan 30 hari</dt><dd className="truncate text-[14px] font-semibold"><Money value={g.needs30.total} /></dd></div>
          </dl>
        </Link>
      )}

      {/* Perlu diselesaikan */}
      <Card className="overflow-hidden">
        <CardHeader className="py-3">
          <CardTitle>Perlu diselesaikan</CardTitle>
          {taskCount > 0 && <span className="tnum rounded-md bg-pill px-2 text-[12px] font-semibold text-pill-ink">{taskCount}</span>}
        </CardHeader>
        {taskCount === 0 ? (
          <p className="flex items-center gap-2 px-4 py-3.5 text-[13px] text-muted"><CircleCheck className="size-4 shrink-0 text-accent" aria-hidden />Tidak ada pekerjaan tertunda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {tasks.drafts > 0 && <TaskRow href="/kas?lingkup=gabungan&status=draft" icon={PencilLine} text={<><b className="tnum">{tasks.drafts}</b> transaksi masih draft</>} cta="Bukukan" />}
            {tasks.missing_evidence > 0 && <TaskRow href="/kas?lingkup=gabungan&bukti=belum_ada&status=dibukukan" icon={FileQuestion} text={<><b className="tnum">{tasks.missing_evidence}</b> transaksi belum ada bukti</>} cta="Lengkapi" />}
            {tasks.open_reconciliations > 0 && <TaskRow href="/kas/rekonsiliasi" icon={Scale} text={<><b className="tnum">{tasks.open_reconciliations}</b> pencocokan kas belum selesai</>} cta="Lanjutkan" />}
            {tasks.accounts_to_reconcile.map((a) => (
              <TaskRow key={a.account_id} href="/kas/rekonsiliasi" icon={Scale} text={<>{a.name} belum dicocokkan {a.last_date ? `sejak ${formatDate(a.last_date)}` : "sama sekali"}</>} />
            ))}
          </ul>
        )}
      </Card>

      {/* Grafik */}
      <Card className="overflow-hidden">
        <CardHeader className="py-3"><CardTitle>Arus kas 6 bulan</CardTitle><span className="truncate text-[12px] text-muted">{props.scopeLabel}</span></CardHeader>
        <div className="min-w-0 p-3"><CashFlowChart data={props.monthly} /></div>
      </Card>

      {/* Transaksi terbaru */}
      <Card className="overflow-hidden">
        <CardHeader className="py-3">
          <CardTitle>Transaksi terbaru</CardTitle>
          <Link href={`/kas${qs({ lingkup: props.scopeKey })}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary">Semua<ArrowRight className="size-3.5" aria-hidden /></Link>
        </CardHeader>
        {props.latest.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-muted">Belum ada transaksi tercatat pada {props.scopeLabel}.</p>
        ) : (
          <ul className="divide-y divide-line">
            {props.latest.map((r) => {
              const isIn = r.cash_in > 0;
              const isOut = r.cash_out > 0;
              const Icon = isIn ? ArrowDownLeft : isOut ? ArrowUpRight : ArrowLeftRight;
              const meta = props.categoryName(r.category_id) ?? (r.kind === "transfer" ? `${props.fundName(r.fund_id)} → ${props.fundName(r.to_fund_id)}` : "");
              return (
                <li key={r.id}>
                  <Link href={`/kas/${r.id}?kembali=${encodeURIComponent(props.returnTo)}`} className="flex items-center gap-3 px-4 py-3 active:bg-subtle">
                    <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", isIn ? "bg-accent-soft text-primary" : isOut ? "bg-[#fbf3b8] text-[#5c4d00]" : "bg-subtle text-muted")}><Icon className="size-[18px]" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[14px] leading-snug text-ink">{r.description}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-muted"><span className="tnum">{formatDate(r.entry_date)}</span>{meta ? ` · ${meta}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-right text-[14px] font-semibold">
                      {isIn ? <Money value={r.cash_in} tone="in" sign /> : isOut ? <Money value={-r.cash_out} tone="out" /> : <Money value={r.amount} tone="muted" />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Program aktif */}
      <section aria-label="Program aktif" className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-[15px] font-semibold text-ink">Program aktif</h2>
          <Link href="/program" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary">Semua<ArrowRight className="size-3.5" aria-hidden /></Link>
        </div>
        {props.activePrograms.length === 0 ? (
          <Card className="p-4 text-[13px] text-muted">
            Belum ada program aktif. Buat program untuk memisahkan dana kegiatan dari Kas Umum.
            {props.canWrite && <Link href="/program?baru=1" className="mt-3 flex h-11 items-center justify-center rounded-control bg-primary text-sm font-medium text-white">Tambah Program</Link>}
          </Card>
        ) : (
          props.activePrograms.map((p) => {
            const s = props.programSummary.find((x) => x.program_id === p.id);
            const budget = Number(s?.budget_expense ?? 0);
            const spent = Number(s?.expense ?? 0);
            const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
            const h = props.health.programs.find((x) => x.program_id === p.id);
            return (
              <Link key={p.id} href={`/program/${p.id}`} className="block rounded-card border border-line bg-surface p-4 active:bg-subtle">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 text-[15px] leading-snug font-semibold text-ink">{p.name}</p>
                  <ProgramStatusBadge status={p.status} />
                </div>
                {h && h.status !== "aman" && h.status !== "data_belum_cukup" && <div className="mt-1.5"><HealthBadge status={h.status} /></div>}
                {budget > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-subtle"><div className={cn("h-full rounded-full", spent > budget ? "bg-danger" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
                    <p className="mt-1 text-[12px] text-muted">Realisasi {pct}% dari anggaran <span className="tnum">{formatRupiah(budget)}</span></p>
                  </div>
                )}
                <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
                  <div><p className="text-[12px] text-muted">Realisasi</p><p className="text-[14px] font-semibold"><Money value={Number(s?.expense ?? 0)} dashZero /></p></div>
                  <div className="text-right"><p className="text-[12px] text-muted">Sisa dana</p><p className="text-[14px] font-semibold"><Money value={Number(s?.fund_balance ?? 0)} tone="auto" /></p></div>
                </div>
              </Link>
            );
          })
        )}
      </section>
    </div>
  );
}

function TaskRow({ href, icon: Icon, text, cta }: { href: string; icon: React.ComponentType<{ className?: string }>; text: React.ReactNode; cta?: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-3 text-[13px] text-ink active:bg-subtle">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-primary"><Icon className="size-4" aria-hidden /></span>
        <span className="min-w-0 flex-1 leading-snug">{text}</span>
        {cta && <span className="shrink-0 text-[12px] font-medium text-primary">{cta}</span>}
        <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
      </Link>
    </li>
  );
}
