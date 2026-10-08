import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { UrlSelect } from "@/components/app/url-controls";
import { ProgramCard } from "@/components/programs/program-card";
import { ProgramDialogButton } from "@/components/programs/program-dialog";
import { getAppContext, getMaster } from "@/lib/context";
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
        description="Dana, anggaran, transaksi, dan bukti tiap kegiatan."
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
            <EmptyState icon={FolderKanban} title="Belum ada program" description="Buat program untuk tiap kegiatan, misalnya kaderisasi atau rapat kerja." action={ctx.canWrite ? <ProgramDialogButton orgId={ctx.org.id} /> : undefined} />
          ) : (
            <EmptyState icon={FolderKanban} title="Tidak ada program dengan status ini" description="Coba pilih status lain." action={<Link href="/program?status=semua" className="text-sm font-medium text-accent underline underline-offset-2">Tampilkan semua program</Link>} />
          )
        ) : (
          <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((p) => {
              const s = summary.find((x) => x.program_id === p.id);
              const h = health.programs.find((x) => x.program_id === p.id);
              return <ProgramCard key={p.id} program={p} budget={Number(s?.budget_expense ?? 0)} expense={Number(s?.expense ?? 0)} balance={Number(s?.fund_balance ?? 0)} health={h?.status} />;
            })}
          </div>
        )}
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">Anggaran adalah rencana. Sisa dana adalah uang yang tersedia.</p>
      </Card>
    </>
  );
}
