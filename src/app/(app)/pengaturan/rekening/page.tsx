import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { AccountsManager } from "@/components/settings/accounts-manager";
import { getAppContext, getMaster } from "@/lib/context";
import { todayJakarta } from "@/lib/format";
import { fetchPositions } from "@/lib/queries";

export const metadata: Metadata = { title: "Rekening dan kas" };

export default async function CashAccountsPage() {
  const ctx = await getAppContext();
  const master = await getMaster();
  const [positions, recon] = await Promise.all([
    fetchPositions(ctx.supabase, ctx.org.id, todayJakarta()),
    ctx.supabase.from("reconciliations").select("account_id, statement_date").eq("organization_id", ctx.org.id).eq("status", "selesai").order("statement_date", { ascending: false }),
  ]);
  const balances: Record<string, number> = {};
  for (const p of positions) balances[p.account_id] = (balances[p.account_id] ?? 0) + Number(p.balance);
  const last: Record<string, string> = {};
  for (const r of recon.data ?? []) last[r.account_id] ??= r.statement_date;
  return (
    <>
      <PageHeader title="Rekening dan Kas" description="Tempat uang organisasi disimpan: kas tunai, rekening bank, dan dompet digital." />
      <AccountsManager orgId={ctx.org.id} accounts={master.accounts} mode="rekening" canWrite={ctx.canWrite || ctx.isAdmin} balances={balances} lastReconciled={last} used={positions.map((p) => p.account_id)} />
    </>
  );
}
