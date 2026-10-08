import type { Metadata } from "next";
import Link from "next/link";
import { FileBarChart } from "@/components/ui/icons";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { PeriodSelect, ScopeSelect, UrlSelect } from "@/components/app/url-controls";
import { CombinedNotice } from "@/components/cash/scope-notice";
import { ExportButtons, ReportView } from "@/components/reports/report-view";
import { getAppContext, getMaster } from "@/lib/context";
import { buildReport } from "@/lib/reports/build";
import { REPORTS, type ReportData, type ReportKey } from "@/lib/reports/types";
import { resolvePeriod, resolveScope } from "@/lib/scope";
import { param, qs } from "@/lib/utils";

export const metadata: Metadata = { title: "Laporan" };

const DEFAULT_PERIOD: Partial<Record<ReportKey, string>> = {
  "lpj-program": "semua", "anggaran-realisasi": "semua", "akhir-kepengurusan": "kepengurusan", "saldo-rekening": "semua", "saldo-dana": "semua", "rekap-bulanan": "tahun-ini",
};
const AS_OF: ReportKey[] = ["saldo-rekening", "saldo-dana"];
const WITH_ACCOUNT: ReportKey[] = ["buku-kas", "pemasukan-pengeluaran", "arus-kas", "rekap-bulanan"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, param(v)])) as Record<string, string | undefined>;
  const ctx = await getAppContext();
  const master = await getMaster();
  const key = (REPORTS.find((r) => r.key === sp.jenis)?.key ?? null) as ReportKey | null;

  if (!key) {
    const groups = Array.from(new Set(REPORTS.map((r) => r.group)));
    return (
      <>
        <PageHeader title="Laporan" description="Pilih laporan, atur periode dan lingkup, lalu ekspor ke PDF, XLSX, atau CSV. Angka ekspor selalu sama dengan angka di layar." />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <Card key={g} className="p-4 sm:p-5">
              <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-faint uppercase">{g}</h2>
              <ul className="space-y-1">
                {REPORTS.filter((r) => r.group === g).map((r) => (
                  <li key={r.key}>
                    <Link href={`/laporan?jenis=${r.key}`} className="flex items-center gap-2.5 rounded-control px-2 py-2 text-sm text-ink hover:bg-subtle">
                      <FileBarChart className="size-4 shrink-0 text-muted" aria-hidden />
                      {r.label}
                      {r.needs === "program" && <span className="text-[12px] text-muted">(per program)</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-[13px] text-muted">Laporan disusun dari jurnal yang sudah dibukukan. Aplikasi ini tidak mengklaim kepatuhan pada standar akuntansi tertentu; mintalah telaah profesional bila laporan dipakai untuk keperluan resmi di luar organisasi.</p>
      </>
    );
  }

  const def = REPORTS.find((r) => r.key === key)!;
  const scope = resolveScope(sp.lingkup ?? (key === "akhir-kepengurusan" || key === "saldo-dana" || key === "anggaran-realisasi" ? "gabungan" : undefined), master);
  const period = resolvePeriod(sp, ctx.activeTerm, DEFAULT_PERIOD[key] ?? "bulan-ini");
  const account = WITH_ACCOUNT.includes(key) ? master.cashAccounts.find((a) => a.id === sp.rekening) : undefined;
  const category = key === "buku-kas" ? master.categories.find((c) => c.id === sp.kategori) : undefined;
  const ledgerAccount = key === "buku-besar" ? master.accounts.find((a) => a.id === sp.akun) : undefined;

  let report: ReportData | null = null;
  let problem: string | null = null;
  if (def.needs === "program" && scope.kind !== "program") {
    problem = "Pilih satu program pada Lingkup untuk membuat laporan ini.";
  } else {
    try {
      report = await buildReport(key, {
        from: AS_OF.includes(key) ? "2000-01-01" : period.from, to: period.to, periodLabel: period.label,
        scope: { kind: scope.kind, fundId: scope.fundId, label: scope.label, programId: scope.programId },
        accountId: account?.id, categoryId: category?.id, ledgerAccountId: ledgerAccount?.id,
      }, { supabase: ctx.supabase, org: ctx.org, master, term: ctx.activeTerm });
    } catch (e) {
      problem = e instanceof Error ? e.message : "Laporan tidak dapat disusun.";
    }
  }

  return (
    <>
      <PageHeader title={def.label} back={{ href: "/laporan", label: "Semua laporan" }} actions={report ? <ExportButtons report={report} /> : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <UrlSelect name="jenis" label="Jenis laporan" value={key} options={REPORTS.map((r) => ({ value: r.key, label: r.label, group: r.group }))} />
          {key !== "saldo-dana" && <ScopeSelect value={scope.key} programs={master.programs} />}
          <PeriodSelect value={period.key} from={period.from} to={period.to} defaultKey={DEFAULT_PERIOD[key] ?? "bulan-ini"} />
          {WITH_ACCOUNT.includes(key) && <UrlSelect name="rekening" label="Rekening" value={account?.id ?? ""} options={[{ value: "", label: "Semua rekening" }, ...master.cashAccounts.map((a) => ({ value: a.id, label: a.name }))]} />}
          {key === "buku-kas" && <UrlSelect name="kategori" label="Kategori" value={category?.id ?? ""} options={[{ value: "", label: "Semua kategori" }, ...master.categories.map((c) => ({ value: c.id, label: c.name, group: c.kind === "pemasukan" ? "Pemasukan" : "Pengeluaran" }))]} />}
          {key === "buku-besar" && <UrlSelect name="akun" label="Akun" value={ledgerAccount?.id ?? ""} options={[{ value: "", label: "Semua akun bermutasi" }, ...master.accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))]} />}
        </div>
        {AS_OF.includes(key) && <p className="text-[13px] text-muted">Laporan saldo memakai tanggal akhir periode sebagai tanggal posisi.</p>}
      </PageHeader>

      {scope.kind === "gabungan" && key !== "saldo-dana" && key !== "anggaran-realisasi" && <CombinedNotice />}

      {problem ? (
        <Card>
          <EmptyState
            icon={FileBarChart}
            title={def.needs === "program" && scope.kind !== "program" ? "Pilih program terlebih dahulu" : "Laporan tidak dapat disusun"}
            description={problem}
            action={def.needs === "program" && master.programs.length === 0 ? <Link href="/program" className="text-sm font-medium text-accent underline underline-offset-2">Buat program</Link> : undefined}
          />
          {def.needs === "program" && master.programs.length > 0 && (
            <ul className="mx-auto mb-8 max-w-sm space-y-1 px-4">
              {master.programs.map((p) => (
                <li key={p.id}><Link href={`/laporan${qs({ ...sp, lingkup: p.id })}`} className="block rounded-control border border-line px-3 py-2 text-sm hover:bg-subtle">{p.name}</Link></li>
              ))}
            </ul>
          )}
        </Card>
      ) : report ? (
        <ReportView report={report} />
      ) : (
        <Alert tone="danger">Laporan tidak dapat disusun.</Alert>
      )}
    </>
  );
}
