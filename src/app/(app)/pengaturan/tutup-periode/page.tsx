import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { PeriodsManager, type PeriodRow } from "@/components/settings/simple-forms";
import { getAppContext } from "@/lib/context";
import { addMonths, startOfMonth, todayJakarta } from "@/lib/format";
import { fetchAll } from "@/lib/queries";

export const metadata: Metadata = { title: "Tutup periode" };

export default async function ClosePeriodPage() {
  const ctx = await getAppContext();
  const today = todayJakarta();
  const thisMonth = startOfMonth(today);
  const [entries, closedRes, firstRes] = await Promise.all([
    fetchAll<{ entry_date: string; status: string }>((from, to) => ctx.supabase.from("journal_entries").select("entry_date, status").eq("organization_id", ctx.org.id).gte("entry_date", addMonths(thisMonth, -23)).range(from, to)),
    ctx.supabase.from("closed_periods").select("*").eq("organization_id", ctx.org.id),
    ctx.supabase.from("journal_entries").select("entry_date").eq("organization_id", ctx.org.id).order("entry_date").limit(1),
  ]);
  const first = firstRes.data?.[0]?.entry_date ? startOfMonth(firstRes.data[0].entry_date) : addMonths(thisMonth, -2);
  const start = first < addMonths(thisMonth, -23) ? addMonths(thisMonth, -23) : first;
  const rows: PeriodRow[] = [];
  for (let m = thisMonth; m >= start; m = addMonths(m, -1)) {
    const y = Number(m.slice(0, 4));
    const mo = Number(m.slice(5, 7));
    const inMonth = entries.filter((e) => e.entry_date.slice(0, 7) === m.slice(0, 7));
    const c = (closedRes.data ?? []).find((x) => x.year === y && x.month === mo);
    rows.push({
      year: y, month: mo,
      posted: inMonth.filter((e) => e.status !== "draft").length,
      drafts: inMonth.filter((e) => e.status === "draft").length,
      status: c ? c.status : "terbuka",
      closed_at: c?.closed_at ?? null,
      reopen_reason: c?.reopen_reason ?? null,
      ended: m < thisMonth,
    });
  }
  return (
    <>
      <PageHeader title="Tutup Periode" description="Kunci pembukuan bulan yang sudah selesai agar laporan yang sudah dilaporkan tidak berubah." />
      <PeriodsManager orgId={ctx.org.id} rows={rows} canClose={ctx.canWrite || ctx.isAdmin} isAdmin={ctx.isAdmin} />
    </>
  );
}
