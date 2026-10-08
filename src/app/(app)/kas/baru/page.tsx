import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { NoWriteAccess } from "@/components/app/no-access";
import { TransactionForm, type TransactionDefaults } from "@/components/transactions/transaction-form";
import { getAppContext, getMaster } from "@/lib/context";
import { todayJakarta } from "@/lib/format";
import { fetchPositions } from "@/lib/queries";
import { param } from "@/lib/utils";

export const metadata: Metadata = { title: "Catat transaksi" };

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getAppContext();
  const back = param(sp.kembali)?.startsWith("/") ? param(sp.kembali)! : "/kas";
  if (!ctx.canWrite) return <NoWriteAccess what="mencatat transaksi" back={back} />;
  const master = await getMaster();
  const positions = await fetchPositions(ctx.supabase, ctx.org.id, todayJakarta());

  const defaults: TransactionDefaults = {};
  const jenis = param(sp.jenis);
  if (jenis === "pemasukan" || jenis === "pengeluaran" || jenis === "transfer") defaults.kind = jenis;
  const fundOf = (key: string | undefined) =>
    key === "umum" ? master.generalFund.id : master.programs.find((p) => p.id === key && p.status !== "diarsipkan")?.fund_id;
  defaults.fundId = fundOf(param(sp.dana));
  defaults.toFundId = fundOf(param(sp.ke));
  const acc = master.cashAccounts.find((a) => a.id === param(sp.rekening) && a.is_active);
  if (acc) defaults.accountId = acc.id;
  const nominal = Number(param(sp.nominal));
  if (Number.isInteger(nominal) && nominal > 0) defaults.amount = nominal;
  if (param(sp.uraian)) defaults.description = param(sp.uraian)!.slice(0, 200);
  const catKey = param(sp.kategori);
  const cat = master.categories.find((c) => c.id === catKey || (catKey && c.system_key === catKey));
  if (cat) {
    defaults.categoryId = cat.id;
    defaults.kind = cat.kind;
  }
  const needId = param(sp.kebutuhan);
  if (needId) {
    const { data: need } = await ctx.supabase.from("cash_needs").select("id, name, amount, fund_id, direction, status").eq("id", needId).maybeSingle();
    if (need && need.status === "terbuka") {
      defaults.kind = need.direction === "masuk" ? "pemasukan" : "pengeluaran";
      defaults.fundId = need.fund_id;
      defaults.amount = Number(need.amount);
      defaults.description = need.name;
      defaults.needId = need.id;
      defaults.needName = need.name;
    }
  }

  return (
    <>
      <PageHeader title="Catat Transaksi" description="Simpan langsung, atau simpan sebagai draft dulu." back={{ href: back, label: "Kembali" }} />
      {master.cashAccounts.filter((a) => a.is_active).length === 0 ? (
        <NoWriteAccess what="mencatat transaksi sebelum ada rekening atau kas aktif" need="Bendahara untuk menambah rekening di Pengaturan" back="/pengaturan/rekening" />
      ) : (
        <TransactionForm
          orgId={ctx.org.id}
          accounts={master.accounts}
          funds={master.funds}
          programs={master.programs}
          categories={master.categories}
          positions={positions}
          maxMb={ctx.org.settings?.attachment?.max_mb ?? 10}
          defaults={defaults}
          returnTo={back}
        />
      )}
    </>
  );
}
