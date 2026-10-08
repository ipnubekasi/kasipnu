import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { NoWriteAccess } from "@/components/app/no-access";
import { ManualJournalForm } from "@/components/journal/manual-journal-form";
import { getAppContext, getMaster } from "@/lib/context";
import type { Entry } from "@/lib/types";
import { param } from "@/lib/utils";

export const metadata: Metadata = { title: "Jurnal penyesuaian" };

export default async function AdjustmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getAppContext();
  if (!ctx.canWrite) return <NoWriteAccess what="mencatat jurnal penyesuaian" back="/jurnal" />;
  const master = await getMaster();
  const id = param(sp.id);
  const entry = id ? ((await ctx.supabase.from("journal_entries").select("*").eq("id", id).eq("status", "draft").eq("kind", "penyesuaian").maybeSingle()).data as Entry | null) : null;
  const funds = master.funds.filter((f) => f.is_active && (f.kind === "umum" || master.programs.some((p) => p.fund_id === f.id && p.status !== "diarsipkan")));
  return (
    <>
      <PageHeader title={entry ? "Ubah Draft Jurnal Penyesuaian" : "Jurnal Penyesuaian"} description="Jurnal manual untuk pengguna berwenang. Wajib seimbang antara debit dan kredit pada setiap dana; diperiksa juga oleh database." back={{ href: "/jurnal", label: "Jurnal dan Buku Besar" }} />
      <ManualJournalForm orgId={ctx.org.id} accounts={master.accounts} funds={funds} entry={entry} />
    </>
  );
}
