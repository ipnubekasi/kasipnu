import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { CategoriesManager } from "@/components/settings/categories-manager";
import { getAppContext, getMaster } from "@/lib/context";
import { todayJakarta } from "@/lib/format";

export const metadata: Metadata = { title: "Kategori" };

export default async function CategoriesPage() {
  const ctx = await getAppContext();
  const master = await getMaster();
  const [a, b] = await Promise.all([
    ctx.supabase.rpc("category_summary", { p_org: ctx.org.id, p_from: "2000-01-01", p_to: todayJakarta(), p_fund: null, p_account: null }),
    ctx.supabase.from("journal_entries").select("category_id").eq("organization_id", ctx.org.id).eq("status", "draft").not("category_id", "is", null),
  ]);
  const used = [...((a.data ?? []) as { category_id: string }[]).map((r) => r.category_id), ...(b.data ?? []).map((r) => r.category_id as string)];
  return (
    <>
      <PageHeader title="Kategori dan Pemetaan Akun" description="Kategori dipakai saat mencatat transaksi. Setiap kategori dipetakan ke satu akun sehingga jurnal dibuat otomatis." />
      <CategoriesManager orgId={ctx.org.id} categories={master.categories} accounts={master.accounts} canWrite={ctx.canWrite || ctx.isAdmin} used={used} />
    </>
  );
}
