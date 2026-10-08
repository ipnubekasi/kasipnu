import type { Metadata } from "next";
import Link from "next/link";
import { PencilLine } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/page-header";
import { LinkTabs, PeriodSelect, ScopeSelect, UrlSelect } from "@/components/app/url-controls";
import { ExportButtons, ReportView } from "@/components/reports/report-view";
import { getAppContext, getMaster } from "@/lib/context";
import { ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import { buildReport } from "@/lib/reports/build";
import type { ReportKey } from "@/lib/reports/types";
import { resolvePeriod, resolveScope } from "@/lib/scope";
import { param, qs } from "@/lib/utils";

export const metadata: Metadata = { title: "Jurnal dan buku besar" };

const TABS = [
  { key: "jurnal-umum", label: "Jurnal Umum" },
  { key: "buku-besar", label: "Buku Besar" },
  { key: "neraca-saldo", label: "Neraca Saldo" },
  { key: "akun", label: "Daftar Akun" },
] as const;

export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, param(v)])) as Record<string, string | undefined>;
  const ctx = await getAppContext();
  const master = await getMaster();
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "jurnal-umum";
  const scope = resolveScope(sp.lingkup ?? "gabungan", master);
  const period = resolvePeriod(sp, ctx.activeTerm);
  const ledgerAccount = master.accounts.find((a) => a.id === sp.akun);
  const keep = { lingkup: sp.lingkup, periode: sp.periode, dari: sp.dari, sampai: sp.sampai };

  const report = tab === "akun" ? null : await buildReport(tab as ReportKey, {
    from: period.from, to: period.to, periodLabel: period.label,
    scope: { kind: scope.kind, fundId: scope.fundId, label: scope.label, programId: scope.programId },
    ledgerAccountId: tab === "buku-besar" ? ledgerAccount?.id : null,
  }, { supabase: ctx.supabase, org: ctx.org, master, term: ctx.activeTerm });

  return (
    <>
      <PageHeader
        title="Jurnal dan Buku Besar"
        description="Catatan debit dan kredit dari semua transaksi."
        actions={
          <>
            {report && <ExportButtons report={report} />}
            {ctx.canWrite && <Button asChild><Link href="/jurnal/penyesuaian"><PencilLine aria-hidden />Jurnal Penyesuaian</Link></Button>}
          </>
        }
      />
      <LinkTabs active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/jurnal${qs({ ...keep, tab: t.key === "jurnal-umum" ? null : t.key })}` }))} />
      {tab !== "akun" && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ScopeSelect value={scope.key} programs={master.programs} />
          <PeriodSelect value={period.key} from={period.from} to={period.to} />
          {tab === "buku-besar" && <UrlSelect name="akun" label="Akun" value={ledgerAccount?.id ?? ""} options={[{ value: "", label: "Semua akun bermutasi" }, ...master.accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))]} />}
        </div>
      )}
      {report ? (
        <ReportView report={report} />
      ) : (
        <Card>
          <Table>
            <THead><TR className="hover:bg-transparent"><TH>Kode</TH><TH>Nama akun</TH><TH>Jenis</TH><TH>Keterangan</TH><TH>Status</TH></TR></THead>
            <TBody>
              {master.accounts.map((a) => (
                <TR key={a.id}>
                  <TD className="tnum">{a.code}</TD>
                  <TD className="font-medium">{a.name}{a.is_cash && <Badge tone="info" className="ml-2">Rekening</Badge>}{a.system_key && <Badge className="ml-2">Sistem</Badge>}</TD>
                  <TD>{ACCOUNT_TYPE_LABEL[a.type]}</TD>
                  <TD className="text-muted">{a.system_key === "saldo_dana_awal" ? "Lawan pencatatan saldo awal" : a.system_key === "transfer_antardana" ? "Penghubung transfer antardana; bernilai nol pada laporan gabungan" : a.description ?? ""}</TD>
                  <TD>{a.is_active ? <Badge tone="ok">Aktif</Badge> : <Badge>Nonaktif</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">Akun dikelola di <Link href="/pengaturan/akun" className="text-accent underline underline-offset-2">Pengaturan, Daftar akun</Link>. Pemetaan kategori ke akun di <Link href="/pengaturan/kategori" className="text-accent underline underline-offset-2">Kategori dan pemetaan akun</Link>.</p>
        </Card>
      )}
    </>
  );
}
