import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/app/page-header";
import { ReconcileWorkbench } from "@/components/reconcile/reconcile-workbench";
import { getAppContext, getMaster } from "@/lib/context";
import { formatDate, formatDateTime } from "@/lib/format";
import { fetchAll } from "@/lib/queries";

export const metadata: Metadata = { title: "Cocokkan Kas" };

export default async function ReconciliationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAppContext();
  const master = await getMaster();
  const { data: r } = await ctx.supabase.from("reconciliations").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const account = master.accounts.find((a) => a.id === r.account_id);
  const lines = await fetchAll<{ id: string; entry_id: string; entry_date: string; ref_no: string; description: string; debit: number; credit: number; reconciliation_id: string | null }>((from, to) =>
    ctx.supabase.from("v_ledger").select("id, entry_id, entry_date, ref_no, description, debit, credit, reconciliation_id")
      .eq("account_id", r.account_id).lte("entry_date", r.statement_date)
      .or(`reconciliation_id.is.null,reconciliation_id.eq.${id}`)
      .order("entry_date").order("ref_no").range(from, to));
  const { data: pos } = await ctx.supabase.rpc("cash_positions", { p_org: ctx.org.id, p_as_of: r.statement_date });
  const book = r.status === "selesai" ? Number(r.book_balance) : ((pos ?? []) as { account_id: string; balance: number }[]).filter((p) => p.account_id === r.account_id).reduce((t, p) => t + Number(p.balance), 0);
  return (
    <>
      <PageHeader title={`Cocokkan Kas ${account?.name ?? ""}`} description={`Per ${formatDate(r.statement_date)}${r.notes ? ` · ${r.notes}` : ""}`} back={{ href: "/kas/rekonsiliasi", label: "Semua pencocokan kas" }} />
      {r.status === "selesai" && <Alert tone="ok" className="mb-4" title={`Selesai ${formatDateTime(r.completed_at)}`}>Hasil pencocokan kas sudah dikunci.{Number(r.difference) !== 0 ? ` Selisih tercatat beserta penjelasannya: ${r.notes}` : ""}</Alert>}
      <ReconcileWorkbench reconId={id} accountId={r.account_id} statementBalance={Number(r.statement_balance)} bookBalance={book} lines={lines} status={r.status} canWrite={ctx.canWrite} statementDate={r.statement_date} />
    </>
  );
}
