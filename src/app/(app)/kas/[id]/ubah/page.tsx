import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { NoWriteAccess } from "@/components/app/no-access";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { getAppContext, getMaster } from "@/lib/context";
import { todayJakarta } from "@/lib/format";
import { fetchPositions } from "@/lib/queries";
import type { Entry } from "@/lib/types";

export const metadata: Metadata = { title: "Ubah draft" };

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAppContext();
  if (!ctx.canWrite) return <NoWriteAccess what="mengubah transaksi" back={`/kas/${id}`} />;
  const { data: entry } = await ctx.supabase.from("journal_entries").select("*").eq("id", id).maybeSingle();
  if (!entry) notFound();
  if (entry.status !== "draft") redirect(`/kas/${id}`);
  if (entry.kind === "penyesuaian") redirect(`/jurnal/penyesuaian?id=${id}`);
  const master = await getMaster();
  const [positions, att] = await Promise.all([
    fetchPositions(ctx.supabase, ctx.org.id, todayJakarta()),
    ctx.supabase.from("attachments").select("id", { count: "exact", head: true }).eq("entry_id", id).eq("status", "aktif"),
  ]);
  return (
    <>
      <PageHeader title="Ubah Draft" description="Draft belum mengubah saldo." back={{ href: `/kas/${id}`, label: "Kembali ke detail" }} />
      <TransactionForm
        orgId={ctx.org.id}
        accounts={master.accounts}
        funds={master.funds}
        programs={master.programs}
        categories={master.categories}
        positions={positions}
        maxMb={ctx.org.settings?.attachment?.max_mb ?? 10}
        entry={entry as Entry}
        existingAttachments={att.count ?? 0}
        returnTo={`/kas/${id}`}
      />
    </>
  );
}
