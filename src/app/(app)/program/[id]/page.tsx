import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Plus, Undo2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { HealthBadge, ProgramStatusBadge } from "@/components/app/badges";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { LinkTabs, Pagination } from "@/components/app/url-controls";
import { ArchiveList, type ArchiveItem } from "@/components/archive/archive-list";
import { BudgetEditor } from "@/components/programs/budget-editor";
import { ProgramDialogButton } from "@/components/programs/program-dialog";
import { ExportButtons, ReportView } from "@/components/reports/report-view";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { getAppContext, getMaster } from "@/lib/context";
import { formatDate, formatPercent, todayJakarta } from "@/lib/format";
import { fetchHealth, fetchProgramSummary, fetchTransactions } from "@/lib/queries";
import { buildReport } from "@/lib/reports/build";
import type { BudgetItem } from "@/lib/types";
import { param } from "@/lib/utils";

export const metadata: Metadata = { title: "Detail program" };

const TABS = ["ringkasan", "rab", "transaksi", "bukti", "lpj"] as const;

export default async function ProgramDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await getAppContext();
  const master = await getMaster();
  const program = master.programs.find((p) => p.id === id);
  if (!program) notFound();
  const tab = (TABS.find((t) => t === param(sp.tab)) ?? "ringkasan") as (typeof TABS)[number];
  const base = `/program/${id}`;
  const [summaryAll, health, budgetRes] = await Promise.all([
    fetchProgramSummary(ctx.supabase, ctx.org.id),
    fetchHealth(ctx.supabase, ctx.org.id),
    ctx.supabase.from("budgets").select("id").eq("program_id", id).maybeSingle(),
  ]);
  const s = summaryAll.find((x) => x.program_id === id);
  const h = health.programs.find((x) => x.program_id === id);
  const archived = program.status === "diarsipkan";
  const canAct = ctx.canWrite && !archived;
  const pct = s && Number(s.budget_expense) > 0 ? (Number(s.expense) / Number(s.budget_expense)) * 100 : null;

  return (
    <>
      <PageHeader
        title={program.name}
        back={{ href: "/program", label: "Semua program" }}
        description={`${program.code}${program.start_date ? ` · ${formatDate(program.start_date)}${program.end_date ? " sampai " + formatDate(program.end_date) : ""}` : ""}${program.pic_name ? ` · Penanggung jawab: ${program.pic_name}` : ""}`}
        actions={ctx.canWrite ? (
          <>
            <ProgramDialogButton orgId={ctx.org.id} program={program} />
            {canAct && <Button asChild><Link href={`/kas/baru?jenis=transfer&dana=umum&ke=${id}&kembali=${encodeURIComponent(base)}`}><ArrowLeftRight aria-hidden />Alokasikan Dana</Link></Button>}
            {canAct && <Button asChild variant="primary"><Link href={`/kas/baru?dana=${id}&kembali=${encodeURIComponent(base)}`}><Plus aria-hidden />Catat Transaksi</Link></Button>}
          </>
        ) : undefined}
      >
        <div className="flex flex-wrap gap-2"><ProgramStatusBadge status={program.status} />{h && <HealthBadge status={h.status} />}</div>
      </PageHeader>

      {archived && <Alert tone="info" className="mb-4" title="Program sudah diarsipkan">Program dapat dilihat, tetapi tidak menerima transaksi baru. Ubah statusnya bila perlu dibuka kembali.</Alert>}
      {h && h.reasons.length > 0 && (
        <Alert tone={h.status === "kritis" ? "danger" : "warn"} className="mb-4" title="Perlu perhatian">
          <ul className="list-disc pl-4">{h.reasons.map((r) => <li key={r.code}>{r.text}</li>)}</ul>
        </Alert>
      )}

      <LinkTabs active={tab} tabs={[
        { key: "ringkasan", label: "Ringkasan", href: base },
        { key: "rab", label: "RAB", href: `${base}?tab=rab` },
        { key: "transaksi", label: "Transaksi", href: `${base}?tab=transaksi` },
        { key: "bukti", label: "Bukti", href: `${base}?tab=bukti`, count: s?.attachment_count },
        { key: "lpj", label: "LPJ", href: `${base}?tab=lpj` },
      ]} />

      {tab === "ringkasan" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: "Dana tersedia", value: s?.fund_balance, sub: "Saldo kas dana program", strong: true },
              { label: "Anggaran pengeluaran", value: s?.budget_expense, sub: "Rencana pada RAB" },
              { label: "Realisasi pengeluaran", value: s?.expense, sub: pct !== null ? `${formatPercent(pct)} dari anggaran` : "Anggaran belum diisi" },
              { label: "Sisa anggaran", value: Number(s?.budget_expense ?? 0) - Number(s?.expense ?? 0), sub: "Bukan uang yang tersedia" },
            ].map((x) => (
              <Card key={x.label} className="p-4 sm:p-5">
                <p className="text-[13px] text-muted">{x.label}</p>
                <p className="mt-1.5 text-xl font-semibold tracking-tight"><Money value={x.value} tone="auto" /></p>
                <p className="mt-1 text-[12px] text-muted">{x.sub}</p>
              </Card>
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Asal dan penggunaan dana</CardTitle><Link href={`/kas?lingkup=${id}&periode=semua`} className="text-sm text-accent hover:underline">Lihat transaksi</Link></CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  {[
                    ["Transfer masuk (alokasi)", s?.transfer_in, ""],
                    ["Penerimaan dari pihak luar", s?.income, ""],
                    ["Pengeluaran", -Number(s?.expense ?? 0), ""],
                    ["Transfer keluar (pengembalian)", -Number(s?.transfer_out ?? 0), ""],
                  ].map(([l, v]) => (
                    <div key={String(l)} className="flex justify-between gap-4"><dt className="text-muted">{l}</dt><dd><Money value={Number(v)} tone="auto" /></dd></div>
                  ))}
                  <div className="flex justify-between gap-4 border-t border-line pt-2 font-semibold"><dt>Dana tersedia</dt><dd><Money value={s?.fund_balance} tone="auto" /></dd></div>
                </dl>
                <p className="mt-3 text-[12px] text-muted">Transfer dari Kas Umum menambah dana tersedia program, tetapi bukan pendapatan organisasi.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Rencana dan kebutuhan</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-4"><span className="text-muted">Rencana pemasukan (RAB)</span><Money value={s?.budget_income} /></div>
                <div className="flex justify-between gap-4"><span className="text-muted">Kebutuhan belum dibayar</span><Money value={s?.open_needs} /></div>
                <div className="flex justify-between gap-4"><span className="text-muted">Kekurangan dana untuk kebutuhan</span><Money value={h?.shortfall ?? 0} tone={(h?.shortfall ?? 0) > 0 ? "out" : undefined} /></div>
                <div className="flex justify-between gap-4"><span className="text-muted">Transaksi tanpa bukti</span><span className="tnum">{s?.missing_evidence ?? 0}</span></div>
                {program.description && <p className="border-t border-line pt-2 text-muted">{program.description}</p>}
                {ctx.canWrite && Number(s?.fund_balance ?? 0) > 0 && (program.status === "selesai" || program.status === "berjalan") && (
                  <Button asChild size="sm" className="mt-2"><Link href={`/kas/baru?jenis=transfer&dana=${id}&ke=umum&kembali=${encodeURIComponent(base)}`}><Undo2 aria-hidden />Kembalikan sisa dana ke Kas Umum</Link></Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === "rab" && (budgetRes.data ? (
        <RabTab orgId={ctx.org.id} budgetId={budgetRes.data.id} fundId={program.fund_id} canWrite={ctx.canWrite && !archived} />
      ) : <Alert tone="danger">RAB program ini tidak ditemukan.</Alert>)}

      {tab === "transaksi" && <TxTab programId={id} fundId={program.fund_id} page={Math.max(1, Number(param(sp.hal)) || 1)} canWrite={ctx.canWrite} />}
      {tab === "bukti" && <EvidenceTab fundId={program.fund_id} programId={id} />}
      {tab === "lpj" && <LpjTab programId={id} fundId={program.fund_id} name={program.name} />}
    </>
  );
}

async function RabTab({ orgId, budgetId, fundId, canWrite }: { orgId: string; budgetId: string; fundId: string; canWrite: boolean }) {
  const ctx = await getAppContext();
  const master = await getMaster();
  const [itemsRes, catsRes] = await Promise.all([
    ctx.supabase.from("budget_items").select("*").eq("budget_id", budgetId).order("kind").order("sort_order"),
    ctx.supabase.rpc("category_summary", { p_org: orgId, p_from: "2000-01-01", p_to: todayJakarta(), p_fund: fundId, p_account: null }),
  ]);
  const items = (itemsRes.data ?? []) as BudgetItem[];
  const realized = ((catsRes.data ?? []) as { category_id: string | null; flow_class: string; amount: number }[]);
  const byCat = new Map<string, { budget: number; realized: number; kind: string }>();
  for (const i of items) {
    const k = `${i.kind}:${i.category_id ?? ""}`;
    const e = byCat.get(k) ?? { budget: 0, realized: 0, kind: i.kind };
    e.budget += Number(i.amount);
    byCat.set(k, e);
  }
  for (const r of realized) {
    const k = `${r.flow_class}:${r.category_id ?? ""}`;
    const e = byCat.get(k) ?? { budget: 0, realized: 0, kind: r.flow_class };
    e.realized += Number(r.amount);
    byCat.set(k, e);
  }
  const catName = (k: string) => master.categories.find((c) => c.id === k.split(":")[1])?.name ?? "Tanpa kategori";
  return (
    <div className="space-y-5">
      <BudgetEditor orgId={orgId} budgetId={budgetId} items={items} categories={master.categories} canWrite={canWrite} />
      <Card>
        <CardHeader><CardTitle>Anggaran dibandingkan realisasi per kategori</CardTitle></CardHeader>
        {byCat.size === 0 ? (
          <CardContent className="text-sm text-muted">Isi RAB atau catat transaksi program untuk melihat perbandingan.</CardContent>
        ) : (
          <Table>
            <THead><TR className="hover:bg-transparent"><TH>Kategori</TH><TH>Jenis</TH><TH className="text-right">Anggaran</TH><TH className="text-right">Realisasi</TH><TH className="text-right">Selisih</TH><TH className="text-right">Terpakai</TH></TR></THead>
            <TBody>
              {Array.from(byCat.entries()).sort((a, b) => a[1].kind.localeCompare(b[1].kind) || catName(a[0]).localeCompare(catName(b[0]))).map(([k, v]) => (
                <TR key={k}>
                  <TD className="font-medium">{catName(k)}{v.budget === 0 && v.realized > 0 && <span className="block text-[12px] font-normal text-warn">Tidak dianggarkan</span>}</TD>
                  <TD className="text-muted">{v.kind === "pemasukan" ? "Pemasukan" : "Pengeluaran"}</TD>
                  <TD className="num"><Money value={v.budget} dashZero /></TD>
                  <TD className="num"><Money value={v.realized} dashZero /></TD>
                  <TD className="num"><Money value={v.budget - v.realized} tone={v.kind === "pengeluaran" && v.realized > v.budget ? "out" : undefined} /></TD>
                  <TD className="num">{v.budget > 0 ? formatPercent((v.realized / v.budget) * 100) : "-"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

async function TxTab({ programId, fundId, page, canWrite }: { programId: string; fundId: string; page: number; canWrite: boolean }) {
  const ctx = await getAppContext();
  const master = await getMaster();
  const rows = await fetchTransactions(ctx.supabase, ctx.org.id, { fundId, limit: 25, offset: (page - 1) * 25 });
  const names = (list: { id: string; name: string }[]) => Object.fromEntries(list.map((x) => [x.id, x.name]));
  if (!rows.length) {
    return <Card><EmptyState title="Belum ada transaksi program" description="Alokasikan dana dari Kas Umum, catat penerimaan sponsor, atau catat pengeluaran kegiatan." action={canWrite ? <Button asChild variant="primary"><Link href={`/kas/baru?dana=${programId}`}>Catat Transaksi</Link></Button> : undefined} /></Card>;
  }
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm sm:px-5">
        <span className="text-muted">Semua transaksi pada dana program, terbaru di atas.</span>
        <Link href={`/kas?lingkup=${programId}&periode=semua`} className="font-medium text-accent hover:underline">Filter lengkap</Link>
      </div>
      <TransactionTable rows={rows} funds={names(master.funds)} accounts={names(master.accounts)} categories={names(master.categories)} sort="tanggal_desc" backHref={`/program/${programId}?tab=transaksi`} canWrite={canWrite} scopeNote="dana program" />
      <Pagination page={page} pageSize={25} total={Number(rows[0]?.total_count ?? 0)} />
    </Card>
  );
}

async function EvidenceTab({ fundId, programId }: { fundId: string; programId: string }) {
  const ctx = await getAppContext();
  const { data } = await ctx.supabase
    .from("attachments")
    .select("id, title, file_name, mime_type, size_bytes, storage_path, status, uploaded_at, uploaded_by_name, entry:journal_entries!inner(id, ref_no, description, entry_date, fund_id, to_fund_id)")
    .eq("status", "aktif")
    .or(`fund_id.eq.${fundId},to_fund_id.eq.${fundId}`, { referencedTable: "journal_entries" })
    .order("uploaded_at", { ascending: false });
  const items = (data ?? []) as unknown as ArchiveItem[];
  return (
    <Card>
      {items.length === 0 ? (
        <EmptyState title="Belum ada bukti" description="Bukti diunggah dari halaman detail setiap transaksi program." action={<Link href={`/kas?lingkup=${programId}&periode=semua&bukti=belum_ada`} className="text-sm font-medium text-accent underline underline-offset-2">Lihat transaksi tanpa bukti</Link>} />
      ) : (
        <ArchiveList items={items} backHref={`/program/${programId}?tab=bukti`} />
      )}
    </Card>
  );
}

async function LpjTab({ programId, fundId, name }: { programId: string; fundId: string; name: string }) {
  const ctx = await getAppContext();
  const master = await getMaster();
  const report = await buildReport("lpj-program", {
    from: "2000-01-01", to: todayJakarta(), periodLabel: "Seluruh umur program",
    scope: { kind: "program", fundId, label: name, programId },
  }, { supabase: ctx.supabase, org: ctx.org, master, term: ctx.activeTerm });
  report.periodLabel = `Sampai ${formatDate(todayJakarta())}`;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <p className="text-sm text-muted">LPJ disusun otomatis dari transaksi, RAB, dan bukti program ini. Unduh PDF untuk dicetak dan ditandatangani.</p>
        <ExportButtons report={report} size="sm" />
      </Card>
      <ReportView report={report} />
    </div>
  );
}
