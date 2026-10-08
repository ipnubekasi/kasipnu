import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck, FileQuestion, FlaskConical, Landmark, PencilLine, Plus, Scale, Wallet } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { HealthBadge, KindBadge, ProgramStatusBadge } from "@/components/app/badges";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { PeriodSelect, ScopeSelect } from "@/components/app/url-controls";
import { FlowStrip } from "@/components/cash/flow-strip";
import { CombinedNotice } from "@/components/cash/scope-notice";
import { CashFlowChart } from "@/components/charts/cash-flow-chart";
import { HealthPanel } from "@/components/health/health-panel";
import { getAppContext, getMaster } from "@/lib/context";
import { addMonths, formatDate, startOfMonth } from "@/lib/format";
import { fetchCashMonthly, fetchCashSummary, fetchHealth, fetchPendingTasks, fetchProgramSummary, fetchTransactions } from "@/lib/queries";
import { resolvePeriod, resolveScope } from "@/lib/scope";
import { cn, param, qs } from "@/lib/utils";

export const metadata: Metadata = { title: "Ringkasan" };

function Stat({ label, sub, href, children }: { label: string; sub: string; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong sm:p-5">
      <p className="flex items-center justify-between text-[13px] text-muted">
        {label}
        <ArrowRight className="size-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
      </p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">{children}</p>
      <p className="mt-1 text-[12px] text-muted">{sub}</p>
    </Link>
  );
}

export default async function SummaryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, param(v)])) as Record<string, string | undefined>;
  const ctx = await getAppContext();
  const { supabase, org } = ctx;
  const master = await getMaster();
  const scope = resolveScope(sp.lingkup, master);
  const period = resolvePeriod(sp, ctx.activeTerm);
  const chartFrom = addMonths(startOfMonth(period.to), -5);

  const { count: postedCount } = await supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", org.id).neq("status", "draft");
  const tasks = await fetchPendingTasks(supabase, org.id);

  // Tanpa data: panduan mulai mencatat, bukan angka contoh.
  if (!postedCount) {
    const hasBank = master.cashAccounts.length > 1;
    return (
      <>
        <PageHeader title="Ringkasan Keuangan" description={`Selamat datang di Kas IPNU, ${ctx.member.full_name}.`} />
        <Card>
          <EmptyState
            icon={Wallet}
            title="Belum ada transaksi yang dibukukan"
            description="Ringkasan saldo, arus kas, dan kesehatan keuangan akan tampil setelah transaksi pertama dibukukan. Ikuti tiga langkah berikut untuk memulai."
          />
          <ol className="mx-auto grid max-w-3xl gap-3 px-4 pb-8 sm:grid-cols-3 sm:px-6">
            {[
              { n: 1, icon: Landmark, title: "Daftarkan rekening", text: hasBank ? "Rekening sudah tersedia. Tambahkan lagi bila perlu." : "Kas Tunai sudah tersedia. Tambahkan rekening bank atau dompet digital.", href: "/pengaturan/rekening", cta: "Kelola rekening" },
              { n: 2, icon: Scale, title: "Isi saldo awal", text: "Masukkan uang yang sudah dimiliki organisasi saat mulai memakai aplikasi.", href: "/pengaturan/saldo-awal", cta: "Isi saldo awal" },
              { n: 3, icon: Plus, title: "Catat transaksi", text: "Catat pemasukan dan pengeluaran, lengkap dengan bukti.", href: "/kas/baru", cta: "Catat Transaksi" },
            ].map((s) => (
              <li key={s.n} className="flex flex-col rounded-control border border-line p-4">
                <span className="mb-2 inline-flex size-7 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-primary">{s.n}</span>
                <p className="text-sm font-medium text-ink">{s.title}</p>
                <p className="mt-1 flex-1 text-[13px] text-muted">{s.text}</p>
                {ctx.canWrite && <Button asChild size="sm" variant={s.n === 3 ? "primary" : "secondary"} className="mt-3 self-start"><Link href={s.href}>{s.cta}</Link></Button>}
              </li>
            ))}
          </ol>
          {tasks.drafts > 0 && (
            <p className="border-t border-line px-5 py-3 text-sm text-muted">
              Ada <strong className="text-ink">{tasks.drafts} draft</strong> yang belum dibukukan. <Link href="/kas?status=draft" className="font-medium text-accent underline underline-offset-2">Tinjau draft</Link>
            </p>
          )}
          {ctx.isAdmin && ctx.canWrite && (
            <p className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 text-[13px] text-muted">
              <FlaskConical className="size-4" aria-hidden />
              Ingin mencoba dulu? Anda dapat memuat data contoh dari <Link href="/pengaturan/backup" className="font-medium text-accent underline underline-offset-2">Pengaturan, Backup dan Serah Terima</Link>. Data contoh tidak dimuat tanpa tindakan Anda.
            </p>
          )}
        </Card>
      </>
    );
  }

  const [summary, generalSummary, monthly, latest, programSummary, health] = await Promise.all([
    fetchCashSummary(supabase, org.id, period.from, period.to, scope.fundId),
    scope.kind === "gabungan" ? fetchCashSummary(supabase, org.id, period.from, period.to, master.generalFund.id) : null,
    fetchCashMonthly(supabase, org.id, chartFrom, period.to, scope.fundId),
    fetchTransactions(supabase, org.id, { fundId: scope.fundId, statuses: ["dibukukan"], to: period.to, limit: 6 }),
    fetchProgramSummary(supabase, org.id),
    fetchHealth(supabase, org.id),
  ]);

  const net = Number(summary.income) - Number(summary.expense);
  const base = { lingkup: sp.lingkup, periode: sp.periode, dari: sp.dari, sampai: sp.sampai };
  const activePrograms = master.programs.filter((p) => p.status === "berjalan" || p.status === "perencanaan");
  const fundName = (id: string | null) => master.funds.find((f) => f.id === id)?.name ?? "";
  const category = (id: string | null) => master.categories.find((c) => c.id === id)?.name;
  const scopeHealth = scope.kind === "program" ? health.programs.find((p) => p.program_id === scope.programId) : null;
  const taskCount = tasks.drafts + tasks.missing_evidence + tasks.open_reconciliations + tasks.accounts_to_reconcile.length;

  return (
    <>
      <PageHeader
        title="Ringkasan Keuangan"
        description={`${scope.label} · ${period.label}`}
        actions={ctx.canWrite ? <Button asChild variant="primary" className="hidden lg:inline-flex"><Link href={`/kas/baru${qs({ dana: scope.kind === "gabungan" ? null : scope.key, kembali: "/ringkasan" })}`}><Plus aria-hidden />Catat Transaksi</Link></Button> : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ScopeSelect value={scope.key} programs={master.programs} />
          <PeriodSelect value={period.key} from={period.from} to={period.to} />
        </div>
      </PageHeader>

      {scope.kind === "gabungan" && <CombinedNotice general={generalSummary?.closing} restricted={Number(summary.closing) - Number(generalSummary?.closing ?? 0)} />}
      {scopeHealth && scopeHealth.reasons.length > 0 && (
        <Alert tone={scopeHealth.status === "kritis" ? "danger" : "warn"} title={`${scope.label}: ${scopeHealth.reasons.map((r) => r.text).join(" ")}`} className="mb-4" action={<Button asChild size="sm"><Link href={`/program/${scope.programId}`}>Lihat Program</Link></Button>} />
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Saldo akhir" sub={`Per ${formatDate(period.to)}`} href={`/kas${qs({ ...base, periode: "semua", dari: null, sampai: null })}`}>
          <Money value={summary.closing} tone="auto" />
        </Stat>
        <Stat label="Pemasukan eksternal" sub="Tanpa transfer dan saldo awal" href={`/kas${qs({ ...base, jenis: "pemasukan" })}`}>
          <Money value={summary.income} />
        </Stat>
        <Stat label="Pengeluaran eksternal" sub="Tanpa transfer internal" href={`/kas${qs({ ...base, jenis: "pengeluaran" })}`}>
          <Money value={summary.expense} />
        </Stat>
        <Stat label="Arus kas bersih" sub={net < 0 ? "Defisit pada periode ini" : net > 0 ? "Surplus pada periode ini" : "Seimbang"} href={`/kas${qs(base)}`}>
          <Money value={net} tone={net < 0 ? "out" : undefined} sign />
        </Stat>
      </div>

      <Card className="mt-3 px-4 py-3 sm:px-5">
        <FlowStrip s={summary} from={period.from} to={period.to} showTransfers={scope.kind !== "gabungan"} />
      </Card>

      {scope.kind !== "program" && <div className="mt-5"><HealthPanel health={health} /></div>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader><CardTitle>Arus kas 6 bulan terakhir</CardTitle><span className="text-[13px] text-muted">{scope.label}</span></CardHeader>
          <CardContent>
            <CashFlowChart data={monthly.map((m) => ({ month: m.month, income: Number(m.income), expense: Number(m.expense) }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Perlu diselesaikan</CardTitle>{taskCount > 0 && <span className="tnum rounded-full bg-warn-soft px-2 text-[12px] font-medium text-warn">{taskCount}</span>}</CardHeader>
          {taskCount === 0 ? (
            <CardContent className="flex items-center gap-2 text-sm text-muted"><CircleCheck className="size-4 text-accent" aria-hidden />Tidak ada pekerjaan tertunda. Semua draft sudah dibukukan dan bukti sudah lengkap.</CardContent>
          ) : (
            <ul className="divide-y divide-line">
              {tasks.drafts > 0 && (
                <li><Link href="/kas?lingkup=gabungan&status=draft" className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-subtle/60 sm:px-5">
                  <PencilLine className="size-4 shrink-0 text-warn" aria-hidden /><span className="flex-1"><strong className="tnum font-medium">{tasks.drafts}</strong> transaksi masih draft</span><span className="text-[13px] text-muted">Tinjau dan bukukan</span><ArrowRight className="size-4 text-faint" aria-hidden />
                </Link></li>
              )}
              {tasks.missing_evidence > 0 && (
                <li><Link href="/kas?lingkup=gabungan&bukti=belum_ada&status=dibukukan" className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-subtle/60 sm:px-5">
                  <FileQuestion className="size-4 shrink-0 text-warn" aria-hidden /><span className="flex-1"><strong className="tnum font-medium">{tasks.missing_evidence}</strong> transaksi belum memiliki bukti</span><span className="text-[13px] text-muted">Lengkapi bukti</span><ArrowRight className="size-4 text-faint" aria-hidden />
                </Link></li>
              )}
              {tasks.open_reconciliations > 0 && (
                <li><Link href="/kas/rekonsiliasi" className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-subtle/60 sm:px-5">
                  <Scale className="size-4 shrink-0 text-warn" aria-hidden /><span className="flex-1"><strong className="tnum font-medium">{tasks.open_reconciliations}</strong> rekonsiliasi belum selesai</span><span className="text-[13px] text-muted">Lanjutkan</span><ArrowRight className="size-4 text-faint" aria-hidden />
                </Link></li>
              )}
              {tasks.accounts_to_reconcile.map((a) => (
                <li key={a.account_id}><Link href="/kas/rekonsiliasi" className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-subtle/60 sm:px-5">
                  <Scale className="size-4 shrink-0 text-muted" aria-hidden /><span className="flex-1">{a.name} belum direkonsiliasi {a.last_date ? `sejak ${formatDate(a.last_date)}` : "sama sekali"}</span><ArrowRight className="size-4 text-faint" aria-hidden />
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Transaksi terbaru</CardTitle><Button asChild size="sm" variant="ghost"><Link href={`/kas${qs({ lingkup: sp.lingkup })}`}>Lihat semua<ArrowRight aria-hidden /></Link></Button></CardHeader>
          {latest.length === 0 ? (
            <CardContent className="text-sm text-muted">Belum ada transaksi dibukukan pada {scope.label}.</CardContent>
          ) : (
            <ul className="divide-y divide-line">
              {latest.map((r) => (
                <li key={r.id}>
                  <Link href={`/kas/${r.id}?kembali=${encodeURIComponent("/ringkasan" + qs(sp))}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-subtle/60 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{r.description}</span>
                      <span className="block truncate text-[12px] text-muted"><span className="tnum">{formatDate(r.entry_date)}</span> · {r.ref_no} · {category(r.category_id) ?? (r.kind === "transfer" ? `${fundName(r.fund_id)} → ${fundName(r.to_fund_id)}` : "")}</span>
                    </span>
                    {r.kind !== "pemasukan" && r.kind !== "pengeluaran" && <span className="hidden sm:block"><KindBadge kind={r.kind} /></span>}
                    <span className="shrink-0 text-sm font-medium">
                      {r.cash_in > 0 ? <Money value={r.cash_in} tone="in" sign /> : r.cash_out > 0 ? <Money value={-r.cash_out} tone="out" /> : <Money value={r.amount} tone="muted" />}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader><CardTitle>Program aktif</CardTitle><Button asChild size="sm" variant="ghost"><Link href="/program">Semua program<ArrowRight aria-hidden /></Link></Button></CardHeader>
          {activePrograms.length === 0 ? (
            <EmptyState className="py-8" title="Belum ada program aktif" description="Buat program untuk memisahkan dana kegiatan dari Kas Umum dan memantau RAB." action={ctx.canWrite ? <Button asChild size="sm"><Link href="/program?baru=1">Tambah Program</Link></Button> : undefined} />
          ) : (
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>Program</TH><TH className="text-right">Anggaran</TH><TH className="text-right">Realisasi</TH><TH className="text-right">Sisa dana</TH></TR></THead>
              <TBody>
                {activePrograms.map((p) => {
                  const s = programSummary.find((x) => x.program_id === p.id);
                  const h = health.programs.find((x) => x.program_id === p.id);
                  return (
                    <TR key={p.id}>
                      <TD>
                        <Link href={`/program/${p.id}`} className="font-medium text-ink hover:underline">{p.name}</Link>
                        <span className="mt-0.5 flex flex-wrap gap-1.5"><ProgramStatusBadge status={p.status} />{h && h.status !== "aman" && h.status !== "data_belum_cukup" && <HealthBadge status={h.status} />}</span>
                      </TD>
                      <TD className="num"><Money value={s?.budget_expense} dashZero /></TD>
                      <TD className="num"><Money value={s?.expense} dashZero /></TD>
                      <TD className={cn("num font-medium")}><Money value={s?.fund_balance} tone="auto" /></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
          {activePrograms.length > 0 && <p className="border-t border-line px-4 py-2.5 text-[12px] text-muted sm:px-5">Anggaran adalah rencana. Sisa dana adalah uang yang benar-benar tersedia pada dana program.</p>}
        </Card>
      </div>
    </>
  );
}
