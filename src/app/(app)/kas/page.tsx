import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ReceiptText } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { MoreFilters, Pagination, PeriodSelect, ScopeSelect, UrlSearch, UrlSelect } from "@/components/app/url-controls";
import { CombinedNotice } from "@/components/cash/scope-notice";
import { FlowStrip } from "@/components/cash/flow-strip";
import { KasActions } from "@/components/cash/kas-actions";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { getAppContext, getMaster } from "@/lib/context";
import { fetchCashSummary, fetchTransactions } from "@/lib/queries";
import { resolvePeriod, resolveScope } from "@/lib/scope";
import { param, qs } from "@/lib/utils";

export const metadata: Metadata = { title: "Kas Umum" };

const PAGE_SIZE = 25;
const SORTS = ["tanggal_desc", "tanggal_asc", "nominal_desc", "nominal_asc", "nomor_desc", "nomor_asc"];

export default async function CashPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, param(v)])) as Record<string, string | undefined>;
  const ctx = await getAppContext();
  const master = await getMaster();
  const scope = resolveScope(sp.lingkup, master);
  // Saat meninjau draft atau hasil impor, bawaan periode adalah semua waktu agar tidak ada yang tersembunyi.
  const reviewing = sp.status === "draft" || Boolean(sp.batch) || sp.bukti === "belum_ada";
  const period = resolvePeriod(sp, ctx.activeTerm, reviewing ? "semua" : "bulan-ini");
  const page = Math.max(1, Number(sp.hal) || 1);
  const sort = SORTS.includes(sp.urut ?? "") ? sp.urut! : "tanggal_desc";
  const account = master.cashAccounts.find((a) => a.id === sp.rekening);
  const category = master.categories.find((c) => c.id === sp.kategori);
  const kinds = ["pemasukan", "pengeluaran", "transfer", "saldo_awal", "penyesuaian", "pembalikan"].includes(sp.jenis ?? "") ? [sp.jenis!] : null;
  const statuses = ["draft", "dibukukan", "dibalik"].includes(sp.status ?? "") ? [sp.status!] : null;
  const evidence = ["lengkap", "belum_ada", "tidak_tersedia"].includes(sp.bukti ?? "") ? sp.bukti! : null;

  const [rows, summary, generalNow] = await Promise.all([
    fetchTransactions(ctx.supabase, ctx.org.id, {
      fundId: scope.fundId, accountId: account?.id, from: period.from, to: period.to, kinds, statuses,
      categoryId: category?.id, evidence, search: sp.cari, batchId: sp.batch, sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
    }),
    fetchCashSummary(ctx.supabase, ctx.org.id, period.from, period.to, scope.fundId, account?.id ?? null),
    scope.kind === "gabungan" ? fetchCashSummary(ctx.supabase, ctx.org.id, period.from, period.to, master.generalFund.id, account?.id ?? null) : null,
  ]);

  const total = Number(rows[0]?.total_count ?? 0);
  const backHref = `/kas${qs(sp)}`;
  const hasFilter = Boolean(kinds || statuses || evidence || category || account || sp.cari || sp.batch);
  const names = (list: { id: string; name: string }[]) => Object.fromEntries(list.map((x) => [x.id, x.name]));
  const title = scope.kind === "umum" ? "Kas Umum" : scope.kind === "gabungan" ? "Transaksi Gabungan" : `Transaksi ${scope.label}`;
  const newHref = `/kas/baru${qs({ dana: scope.kind === "gabungan" ? null : scope.key, kembali: backHref })}`;

  const exportHref = `/laporan${qs({ jenis: "buku-kas", lingkup: sp.lingkup, periode: sp.periode, dari: sp.dari, sampai: sp.sampai, rekening: sp.rekening })}`;
  const wide = "w-full md:w-auto";

  return (
    <>
      <PageHeader
        title={title}
        actions={
          <>
            <KasActions canWrite={ctx.canWrite} exportHref={exportHref} />
            {ctx.canWrite && <Button asChild variant="primary" className="hidden lg:inline-flex"><Link href={newHref}><Plus aria-hidden />Catat Transaksi</Link></Button>}
          </>
        }
      />

      {scope.kind === "gabungan" && <CombinedNotice general={generalNow?.closing} restricted={Number(summary.closing) - Number(generalNow?.closing ?? 0)} />}

      <Card className="mb-4 p-4 sm:p-5">
        <FlowStrip s={summary} showTransfers={scope.kind !== "gabungan" || Boolean(account)} />
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-2 border-b border-line px-4 py-3 sm:px-5 md:flex md:flex-wrap md:items-center">
          <ScopeSelect value={scope.key} programs={master.programs} className={wide} />
          <PeriodSelect value={period.key} from={period.from} to={period.to} defaultKey={reviewing ? "semua" : "bulan-ini"} className={wide} wrapClassName="min-w-0 [&>div]:w-full" />
          <UrlSelect className={wide} name="jenis" label="Jenis" value={sp.jenis ?? ""} options={[
            { value: "", label: "Semua jenis" }, { value: "pemasukan", label: "Pemasukan" }, { value: "pengeluaran", label: "Pengeluaran" },
            { value: "transfer", label: "Transfer" }, { value: "saldo_awal", label: "Saldo awal" }, { value: "penyesuaian", label: "Penyesuaian" }, { value: "pembalikan", label: "Pembatalan" },
          ]} />
          <UrlSelect className={wide} name="status" label="Status" value={sp.status ?? ""} options={[
            { value: "", label: "Semua status" }, { value: "draft", label: "Draft" }, { value: "dibukukan", label: "Tercatat" }, { value: "dibalik", label: "Dibatalkan" },
          ]} />
          <MoreFilters active={[category, account, evidence].filter(Boolean).length}>
            <UrlSelect className={wide} name="kategori" label="Kategori" value={category?.id ?? ""} options={[
              { value: "", label: "Semua kategori" },
              ...master.categories.map((c) => ({ value: c.id, label: c.name, group: c.kind === "pemasukan" ? "Pemasukan" : "Pengeluaran" })),
            ]} />
            <UrlSelect className={wide} name="rekening" label="Rekening" value={account?.id ?? ""} options={[{ value: "", label: "Semua rekening" }, ...master.cashAccounts.map((a) => ({ value: a.id, label: a.name }))]} />
            <UrlSelect className={wide} name="bukti" label="Bukti" value={evidence ?? ""} options={[
              { value: "", label: "Semua bukti" }, { value: "lengkap", label: "Ada bukti" }, { value: "belum_ada", label: "Belum ada bukti" }, { value: "tidak_tersedia", label: "Tanpa bukti" },
            ]} />
          </MoreFilters>
          <div className="col-span-2 md:ml-auto md:w-64"><UrlSearch value={sp.cari ?? ""} placeholder="Cari transaksi" /></div>
        </div>

        {sp.batch && (
          <p className="border-b border-line bg-info-soft px-4 py-2 text-[13px] text-ink sm:px-5">
            Hasil impor. Periksa, lalu pilih dan catat. <Link href="/kas" className="font-medium text-info underline underline-offset-2">Lihat semua</Link>
          </p>
        )}

        {rows.length === 0 ? (
          hasFilter || period.key !== "bulan-ini" ? (
            <EmptyState
              icon={ReceiptText}
              title="Tidak ada transaksi"
              description="Coba ubah periode atau hapus filter."
              action={<Button asChild><Link href={`/kas${qs({ lingkup: sp.lingkup })}`}>Hapus filter</Link></Button>}
            />
          ) : (
            <EmptyState
              icon={ReceiptText}
              title="Belum ada transaksi bulan ini"
              description="Mulai dengan mencatat pemasukan atau pengeluaran."
              action={
                ctx.canWrite ? (
                  <>
                    <Button asChild variant="primary"><Link href={newHref}><Plus aria-hidden />Catat Transaksi</Link></Button>
                    <Button asChild><Link href="/pengaturan/saldo-awal">Isi saldo awal</Link></Button>
                    <Button asChild><Link href={`/kas${qs({ lingkup: sp.lingkup, periode: "semua" })}`}>Lihat semua waktu</Link></Button>
                  </>
                ) : (
                  <Button asChild><Link href={`/kas${qs({ lingkup: sp.lingkup, periode: "semua" })}`}>Lihat semua waktu</Link></Button>
                )
              }
            />
          )
        ) : (
          <>
            <TransactionTable
              rows={rows}
              funds={names(master.funds)}
              accounts={names(master.accounts)}
              categories={names(master.categories)}
              sort={sort}
              backHref={backHref}
              canWrite={ctx.canWrite}
              showFund
              scopeNote={scope.label}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
          </>
        )}
      </Card>
    </>
  );
}
