import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { HEALTH_STYLE, HealthBadge } from "@/components/app/badges";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { LinkTabs } from "@/components/app/url-controls";
import { NeedsManager } from "@/components/health/needs-manager";
import { RecheckButton } from "@/components/health/recheck-button";
import { runwayText } from "@/components/health/health-panel";
import { getAppContext, getMaster } from "@/lib/context";
import { endOfMonth, formatDate, formatDateTime, formatDecimal, formatMonth, formatPercent } from "@/lib/format";
import { HEALTH_LABEL } from "@/lib/labels";
import { fetchHealth } from "@/lib/queries";
import type { CashNeed } from "@/lib/types";
import { cn, param } from "@/lib/utils";

export const metadata: Metadata = { title: "Kesehatan keuangan" };

function Formula({ children }: { children: React.ReactNode }) {
  return <p className="rounded-control bg-subtle px-3 py-2 text-[13px] text-ink">{children}</p>;
}

export default async function HealthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getAppContext();
  const tab = param(sp.tab) === "kebutuhan" ? "kebutuhan" : param(sp.tab) === "program" ? "program" : "perhitungan";
  const health = await fetchHealth(ctx.supabase, ctx.org.id);
  const g = health.general;
  const t = health.thresholds;
  const style = HEALTH_STYLE[g.status];
  const Icon = style.icon;

  return (
    <>
      <PageHeader
        title="Kesehatan Keuangan"
        description="Alat bantu memantau kemampuan Kas Umum membiayai operasional dan kapan perlu mencari dana tambahan. Bukan penilaian audit atau jaminan kesehatan organisasi."
        actions={<RecheckButton orgId={ctx.org.id} />}
      />
      <LinkTabs active={tab} tabs={[
        { key: "perhitungan", label: "Perhitungan", href: "/kesehatan" },
        { key: "kebutuhan", label: "Kebutuhan kas", href: "/kesehatan?tab=kebutuhan", count: g.needs30.items.length },
        { key: "program", label: "Program", href: "/kesehatan?tab=program" },
      ]} />

      {tab === "kebutuhan" && <NeedsTab orgId={ctx.org.id} canWrite={ctx.canWrite} />}

      {tab === "program" && (
        <Card>
          <Table>
            <THead><TR className="hover:bg-transparent"><TH>Program</TH><TH className="text-right">Anggaran</TH><TH className="text-right">Realisasi</TH><TH className="text-right">Terpakai</TH><TH className="text-right">Sisa anggaran</TH><TH className="text-right">Sisa dana</TH><TH className="text-right">Belum dibayar</TH><TH className="text-right">Kekurangan</TH><TH>Status</TH></TR></THead>
            <TBody>
              {health.programs.map((p) => (
                <TR key={p.program_id}>
                  <TD><Link href={`/program/${p.program_id}`} className="font-medium hover:underline">{p.name}</Link>{p.reasons.map((r) => <span key={r.code} className="block text-[12px] text-muted">{r.text}</span>)}</TD>
                  <TD className="num"><Money value={p.budget_expense} dashZero /></TD>
                  <TD className="num"><Money value={p.realized_expense} dashZero /></TD>
                  <TD className="num">{p.pct_used === null ? "-" : formatPercent(p.pct_used)}</TD>
                  <TD className="num"><Money value={p.budget_remaining} tone="auto" /></TD>
                  <TD className="num font-medium"><Money value={p.fund_balance} tone="auto" /></TD>
                  <TD className="num"><Money value={p.open_needs} dashZero /></TD>
                  <TD className="num"><Money value={p.shortfall} dashZero tone={p.shortfall > 0 ? "out" : undefined} /></TD>
                  <TD><HealthBadge status={p.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {health.programs.length === 0 && <p className="px-5 py-6 text-sm text-muted">Belum ada program aktif.</p>}
          <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">Ambang: perlu perhatian pada {formatDecimal(t.budget_warn_pct, 0)}% anggaran, kritis bila realisasi melebihi {formatDecimal(t.budget_over_pct, 0)}% atau saldo dana negatif. Sisa anggaran tidak sama dengan uang yang tersedia.</p>
        </Card>
      )}

      {tab === "perhitungan" && (
        <div className="space-y-5">
          <Card className={cn("border p-4 sm:p-5", style.box)}>
            <p className={cn("flex items-center gap-2 text-lg font-semibold", style.text)}><Icon className="size-5" aria-hidden />Kas Umum: {HEALTH_LABEL[g.status]}</p>
            {g.reasons.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink">{g.reasons.map((r) => <li key={r.code}>{r.text} <span className="text-muted">({r.severity === "kritis" ? "kritis" : "perlu perhatian"})</span></li>)}</ul>
            ) : (
              <p className="mt-1 text-sm text-ink">{g.status === "data_belum_cukup" ? "Belum ada kondisi yang dapat dibuktikan bermasalah, tetapi ketahanan kas belum dapat dihitung sehingga status tidak dinyatakan Aman." : "Tidak ada kondisi yang perlu ditindaklanjuti."}</p>
            )}
            <p className="mt-3 text-sm text-ink">{g.recommendation}</p>
            {g.actions.length > 0 && <ul className="mt-2 flex flex-wrap gap-2">{g.actions.map((a) => <li key={a} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-ink">{a}</li>)}</ul>}
            <p className="mt-3 text-[12px] text-muted">Status memakai kondisi terburuk yang dapat dihitung. Aplikasi hanya menampilkan saran; tidak ada pesan yang dikirim kepada anggota, donatur, atau sponsor. Dihitung {formatDateTime(health.computed_at)}, aturan versi {health.rule_version}.</p>
          </Card>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>A. Dana umum tersedia</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="space-y-1.5">
                  <div className="flex justify-between"><dt className="text-muted">Saldo Kas Umum</dt><dd><Money value={g.cash_balance} tone="auto" /></dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Kewajiban yang belum dibayar</dt><dd><Money value={-g.open_obligations} tone="auto" /></dd></div>
                  <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>Dana umum tersedia</dt><dd><Money value={g.available} tone="auto" /></dd></div>
                  <div className="flex justify-between pt-2 text-muted"><dt>Dana terikat program (tidak dihitung)</dt><dd><Money value={g.restricted_balance} tone="muted" /></dd></div>
                </dl>
                <Formula>Dana umum tersedia = saldo Kas Umum - kewajiban yang belum dibayar. Pengeluaran yang sudah dibukukan tidak dikurangkan lagi.</Formula>
                <p className="text-[13px]"><Link href="/kas" className="text-accent hover:underline">Lihat transaksi Kas Umum</Link> · <Link href="/kesehatan?tab=kebutuhan" className="text-accent hover:underline">Lihat kewajiban</Link></p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>B1. Ketahanan kas</CardTitle><span className="text-[15px] font-semibold">{runwayText(g)}</span></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {g.avg_basis === "tidak_ada" ? (
                  <Alert tone="info" title="Data belum cukup">
                    {g.history_sufficient ? "Tidak ada pengeluaran operasional rutin pada tiga bulan lengkap terakhir, sehingga ketahanan kas tidak dihitung (bukan berarti tak terbatas)." : `Riwayat transaksi baru dimulai ${g.first_entry_date ? formatDate(g.first_entry_date) : "belum ada"}; diperlukan tiga bulan lengkap.`} Isi anggaran operasional bulanan di <Link href="/pengaturan/kesehatan" className="font-medium text-accent underline">Pengaturan</Link> untuk perkiraan berdasarkan anggaran.
                  </Alert>
                ) : (
                  <>
                    <Table>
                      <THead><TR className="hover:bg-transparent"><TH>Bulan</TH><TH className="text-right">Pengeluaran operasional rutin</TH></TR></THead>
                      <TBody>
                        {g.months_used.map((m) => (
                          <TR key={m.month}><TD><Link href={`/kas?jenis=pengeluaran&periode=khusus&dari=${m.month}&sampai=${endOfMonth(m.month)}`} className="hover:underline">{formatMonth(m.month)}</Link></TD><TD className="num"><Money value={m.amount} /></TD></TR>
                        ))}
                      </TBody>
                      <TFoot><TR className="hover:bg-transparent"><TD>{g.avg_basis === "anggaran" ? "Berdasarkan anggaran" : "Rata-rata per bulan"}</TD><TD className="num"><Money value={g.avg_monthly} /></TD></TR></TFoot>
                    </Table>
                    <Formula>Ketahanan kas = <Money value={g.available} /> ÷ <Money value={g.avg_monthly} /> = {g.runway_months === null ? "-" : `${formatDecimal(g.runway_months)} bulan`}. Target {formatDecimal(t.target_months)} bulan, kritis di bawah {formatDecimal(t.critical_months)} bulan.</Formula>
                    {g.avg_basis === "anggaran" && <p className="text-[13px] text-warn">Berdasarkan anggaran operasional, karena riwayat tiga bulan lengkap belum tersedia.</p>}
                  </>
                )}
                <p className="text-[12px] text-muted">Dihitung dari pengeluaran Kas Umum berkategori operasional rutin, di luar pengeluaran besar yang ditandai sekali terjadi. Pengeluaran program tidak termasuk.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>B2. Surplus dan defisit Kas Umum</CardTitle>{g.deficit_streak > 0 && <span className="text-[13px] text-warn">Defisit {g.deficit_streak} bulan berturut-turut</span>}</CardHeader>
              <Table>
                <THead><TR className="hover:bg-transparent"><TH>Bulan</TH><TH className="text-right">Pemasukan</TH><TH className="text-right">Pengeluaran</TH><TH className="text-right">Selisih</TH></TR></THead>
                <TBody>
                  {g.flow.map((m) => (
                    <TR key={m.month}>
                      <TD>{formatMonth(m.month)}{!m.complete && <span className="text-[12px] text-muted"> (berjalan)</span>}</TD>
                      <TD className="num"><Money value={m.income} dashZero /></TD>
                      <TD className="num"><Money value={m.expense} dashZero /></TD>
                      <TD className="num font-medium"><Money value={m.net} tone="auto" />{m.net < 0 && <span className="sr-only"> defisit</span>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <p className="border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">Transfer internal dan saldo awal tidak dihitung sebagai pemasukan. Batas defisit berturut-turut: {t.deficit_streak} bulan.</p>
            </Card>

            <Card>
              <CardHeader><CardTitle>B3. Kebutuhan 30 hari</CardTitle><span className="text-[13px] text-muted">sampai {formatDate(g.needs30.until)}</span></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {g.needs30.items.length === 0 ? (
                  <p className="text-muted">Tidak ada kebutuhan yang jatuh tempo dalam 30 hari. <Link href="/kesehatan?tab=kebutuhan" className="text-accent hover:underline">Catat kebutuhan kas</Link></p>
                ) : (
                  <ul className="divide-y divide-line">
                    {g.needs30.items.map((i) => (
                      <li key={i.id} className="flex justify-between gap-3 py-1.5">
                        <span>{i.name}<span className="block text-[12px] text-muted">{formatDate(i.due_date)} · {i.direction === "masuk" ? "pemasukan rencana" : i.kind}{i.overdue ? " · lewat jatuh tempo" : ""}</span></span>
                        <Money value={i.direction === "masuk" ? i.amount : -i.amount} tone={i.direction === "masuk" ? "in" : undefined} sign={i.direction === "masuk"} />
                      </li>
                    ))}
                  </ul>
                )}
                <dl className="space-y-1.5 border-t border-line pt-2">
                  <div className="flex justify-between"><dt className="text-muted">Kewajiban 30 hari</dt><dd><Money value={g.needs30.obligations} /></dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Rencana pengeluaran 30 hari</dt><dd><Money value={g.needs30.plans} /></dd></div>
                  <div className="flex justify-between font-medium"><dt>Kebutuhan 30 hari</dt><dd><Money value={g.needs30.total} /></dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Saldo Kas Umum</dt><dd><Money value={g.cash_balance} /></dd></div>
                  <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>Kekurangan</dt><dd><Money value={g.needs30.shortfall} tone={g.needs30.shortfall > 0 ? "out" : undefined} /></dd></div>
                </dl>
                {g.needs30.planned_income > 0 && (
                  <p className="rounded-control border border-info-line bg-info-soft px-3 py-2 text-[13px]">Skenario <strong>jika pemasukan rencana diterima</strong> (<Money value={g.needs30.planned_income} />): kekurangan menjadi <Money value={g.needs30.shortfall_if_income} className="font-medium" />. Pemasukan rencana tidak dihitung sebagai kas tersedia.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Target tambahan dana</CardTitle><span className="text-[15px] font-semibold">{g.target_additional === null ? "Belum dapat dihitung" : <Money value={g.target_additional} />}</span></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Formula>Target tambahan = maksimum dari 0 dan ({formatDecimal(t.target_months)} bulan × <Money value={g.avg_monthly} />) - <Money value={g.available} />.</Formula>
              <p className="text-muted">Kekurangan untuk kebutuhan 30 hari (<Money value={g.needs30.shortfall} />) ditampilkan terpisah dan tidak dijumlahkan dengan target ini karena keduanya tumpang tindih.</p>
              <p className="text-[12px] text-muted">Ambang adalah kebijakan awal aplikasi yang dapat diubah di <Link href="/pengaturan/kesehatan" className="text-accent hover:underline">Pengaturan, Kesehatan dan notifikasi</Link>, bukan standar universal.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

async function NeedsTab({ orgId, canWrite }: { orgId: string; canWrite: boolean }) {
  const ctx = await getAppContext();
  const master = await getMaster();
  const { data } = await ctx.supabase.from("cash_needs").select("*").eq("organization_id", orgId).order("status").order("due_date");
  const needs = (data ?? []) as CashNeed[];
  const ids = needs.map((n) => n.paid_entry_id).filter(Boolean) as string[];
  const refs: Record<string, string> = {};
  if (ids.length) for (const e of (await ctx.supabase.from("journal_entries").select("id, ref_no").in("id", ids)).data ?? []) refs[e.id] = e.ref_no ?? "";
  const funds = master.funds.filter((f) => f.kind === "umum" || master.programs.some((p) => p.fund_id === f.id && p.status !== "diarsipkan"));
  return <NeedsManager orgId={orgId} needs={needs} funds={funds} canWrite={canWrite} refs={refs} />;
}
