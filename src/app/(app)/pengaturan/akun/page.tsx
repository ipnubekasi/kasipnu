import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { AccountsManager } from "@/components/settings/accounts-manager";
import { getAppContext, getMaster } from "@/lib/context";
import { todayJakarta } from "@/lib/format";

export const metadata: Metadata = { title: "Daftar akun" };

export default async function ChartPage() {
  const ctx = await getAppContext();
  const master = await getMaster();
  const { data } = await ctx.supabase.rpc("trial_balance", { p_org: ctx.org.id, p_from: "2000-01-01", p_to: todayJakarta(), p_fund: null });
  const used = [...((data ?? []) as { account_id: string }[]).map((r) => r.account_id), ...master.categories.map((c) => c.account_id)];
  return (
    <>
      <PageHeader title="Daftar Akun" description="Akun buku besar. Pencatatan harian tidak perlu memilih akun; jurnal dibuat otomatis dari kategori." />
      <AccountsManager orgId={ctx.org.id} accounts={master.accounts} mode="akun" canWrite={ctx.canWrite || ctx.isAdmin} used={used} />
    </>
  );
}
