import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { HealthBadge, ProgramStatusBadge } from "@/components/app/badges";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { UrlSelect } from "@/components/app/url-controls";
import { ProgramDialogButton } from "@/components/programs/program-dialog";
import { getAppContext, getMaster } from "@/lib/context";
import { formatDate, formatPercent } from "@/lib/format";
import { fetchHealth, fetchProgramSummary } from "@/lib/queries";
import { param } from "@/lib/utils";

export const metadata: Metadata = { title: "Program" };

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getAppContext();
  const master = await getMaster();
  const filter = param(sp.status) ?? "aktif";
  const [summary, health] = await Promise.all([fetchProgramSummary(ctx.supabase, ctx.org.id), fetchHealth(ctx.supabase, ctx.org.id)]);
  const list = master.programs.filter((p) => filter === "semua" || (filter === "aktif" ? p.status !== "diarsipkan" : p.status === filter));

  return (
    <>
      <PageHeader
        title="Program"
        description="Setiap program memiliki dana, RAB, transaksi, bukti, dan LPJ sendiri. Dana program terpisah dari Kas Umum tanpa memerlukan rekening bank terpisah."
        actions={ctx.canWrite ? <ProgramDialogButton orgId={ctx.org.id} openInitially={param(sp.baru) === "1"} /> : undefined}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <UrlSelect name="status" label="Status program" value={filter} defaultValue="aktif" options={[
            { value: "aktif", label: "Belum diarsipkan" }, { value: "perencanaan", label: "Perencanaan" }, { value: "berjalan", label: "Berjalan" },
            { value: "selesai", label: "Selesai" }, { value: "diarsipkan", label: "Diarsipkan" }, { value: "semua", label: "Semua program" },
          ]} />
        </div>
        {list.length === 0 ? (
          master.programs.length === 0 ? (
            <EmptyState icon={FolderKanban} title="Belum ada program" description="Buat program untuk kegiatan seperti kaderisasi, rapat kerja, atau kegiatan sosial. Anda dapat menyusun RAB, mengalokasikan dana dari Kas Umum, dan mencetak LPJ." action={ctx.canWrite ? <ProgramDialogButton orgId={ctx.org.id} /> : undefined} />
          ) : (
            <EmptyState icon={FolderKanban} title="Tidak ada program dengan status ini" description="Ubah filter status untuk melihat program lain, termasuk arsip." action={<Link href="/program?status=semua" className="text-sm font-medium text-accent underline underline-offset-2">Tampilkan semua program</Link>} />
          )
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead><TR className="hover:bg-transparent"><TH>Program</TH><TH>Pelaksanaan</TH><TH className="text-right">Anggaran</TH><TH className="text-right">Realisasi</TH><TH className="text-right">Sisa anggaran</TH><TH className="text-right">Sisa dana</TH></TR></THead>
                <TBody>
                  {list.map((p) => {
                    const s = summary.find((x) => x.program_id === p.id);
                    const h = health.programs.find((x) => x.program_id === p.id);
                    const pct = s && Number(s.budget_expense) > 0 ? (Number(s.expense) / Number(s.budget_expense)) * 100 : null;
                    return (
                      <TR key={p.id}>
                        <TD>
                          <Link href={`/program/${p.id}`} className="font-medium text-ink hover:underline">{p.name}</Link>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">{p.code}<ProgramStatusBadge status={p.status} />{h && (h.status === "kritis" || h.status === "perlu_perhatian") && <HealthBadge status={h.status} />}</span>
                        </TD>
                        <TD className="text-muted">{p.start_date ? formatDate(p.start_date) : "Belum ditentukan"}{p.pic_name && <span className="block text-[12px]">PJ: {p.pic_name}</span>}</TD>
                        <TD className="num"><Money value={s?.budget_expense} dashZero /></TD>
                        <TD className="num"><Money value={s?.expense} dashZero />{pct !== null && <span className="block text-[12px] text-muted">{formatPercent(pct)}</span>}</TD>
                        <TD className="num"><Money value={Number(s?.budget_expense ?? 0) - Number(s?.expense ?? 0)} tone="auto" /></TD>
                        <TD className="num font-medium"><Money value={s?.fund_balance} tone="auto" /></TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {list.map((p) => {
                const s = summary.find((x) => x.program_id === p.id);
                return (
                  <li key={p.id}>
                    <Link href={`/program/${p.id}`} className="block px-4 py-3">
                      <span className="flex items-start justify-between gap-3"><span className="font-medium text-ink">{p.name}</span><ProgramStatusBadge status={p.status} /></span>
                      <span className="mt-1.5 grid grid-cols-3 gap-2 text-[12px] text-muted">
                        <span>Anggaran<Money value={s?.budget_expense} className="block text-sm text-ink" /></span>
                        <span>Realisasi<Money value={s?.expense} className="block text-sm text-ink" /></span>
                        <span>Sisa dana<Money value={s?.fund_balance} className="block text-sm font-medium text-ink" tone="auto" /></span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">Sisa anggaran adalah rencana yang belum terpakai. Sisa dana adalah uang yang benar-benar tersedia pada dana program. Keduanya dapat berbeda.</p>
      </Card>
    </>
  );
}
