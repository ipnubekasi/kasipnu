import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { EntryStatusBadge } from "@/components/app/badges";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { OpeningBalanceForm } from "@/components/settings/opening-balance-form";
import { getAppContext, getMaster } from "@/lib/context";
import { formatDate, todayJakarta } from "@/lib/format";

export const metadata: Metadata = { title: "Saldo awal" };

export default async function OpeningBalancePage() {
  const ctx = await getAppContext();
  const master = await getMaster();
  const { data: rows } = await ctx.supabase.from("journal_entries").select("id, entry_date, ref_no, amount, fund_id, account_id, status").eq("organization_id", ctx.org.id).eq("kind", "saldo_awal").order("entry_date").order("created_at");
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? "";
  const usableFunds = master.funds.filter((f) => f.is_active && (f.kind === "umum" || master.programs.some((p) => p.fund_id === f.id && p.status !== "diarsipkan")));
  const total = (rows ?? []).filter((r) => r.status === "dibukukan").reduce((t, r) => t + Number(r.amount), 0);
  return (
    <>
      <PageHeader title="Saldo Awal" description="Uang yang sudah dimiliki organisasi saat mulai memakai aplikasi. Saldo awal bukan pemasukan periode berjalan dan tidak dihitung sebagai pendapatan." />
      {ctx.canWrite ? (
        <Card className="mb-5">
          <CardHeader><CardTitle>Tambah saldo awal</CardTitle></CardHeader>
          <CardContent>
            <OpeningBalanceForm orgId={ctx.org.id} accounts={master.cashAccounts.filter((a) => a.is_active)} funds={usableFunds} defaultDate={ctx.activeTerm?.start_date ?? todayJakarta()} />
            <p className="mt-3 text-[13px] text-muted">Isi satu baris untuk setiap rekening. Bila sebagian uang di rekening adalah dana program, catat bagian itu dengan memilih dana programnya.</p>
          </CardContent>
        </Card>
      ) : (
        <Alert tone="info" className="mb-5">Saldo awal hanya dapat dibukukan oleh Bendahara.</Alert>
      )}
      <Card>
        <CardHeader><CardTitle>Saldo awal yang sudah dibukukan</CardTitle></CardHeader>
        {!rows?.length ? (
          <EmptyState title="Belum ada saldo awal" description="Bila organisasi belum memiliki uang saat mulai memakai aplikasi, bagian ini boleh dilewati." />
        ) : (
          <Table>
            <THead><TR className="hover:bg-transparent"><TH>Tanggal</TH><TH>Nomor</TH><TH>Rekening</TH><TH>Dana</TH><TH className="text-right">Nominal</TH><TH>Status</TH></TR></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id} className={r.status === "dibalik" ? "text-muted" : ""}>
                  <TD className="tnum whitespace-nowrap">{formatDate(r.entry_date)}</TD>
                  <TD><Link href={`/kas/${r.id}?kembali=/pengaturan/saldo-awal`} className="font-medium text-primary hover:underline">{r.ref_no}</Link></TD>
                  <TD>{name(master.accounts, r.account_id)}</TD>
                  <TD>{name(master.funds, r.fund_id)}</TD>
                  <TD className="num"><Money value={r.amount} /></TD>
                  <TD><EntryStatusBadge status={r.status} /></TD>
                </TR>
              ))}
            </TBody>
            <TFoot><TR className="hover:bg-transparent"><TD colSpan={4}>Jumlah saldo awal (tidak termasuk yang dibalik)</TD><TD className="num"><Money value={total} /></TD><TD /></TR></TFoot>
          </Table>
        )}
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">Saldo awal yang salah dikoreksi dengan membuka transaksinya lalu menekan Balik, kemudian dibukukan ulang dengan nominal yang benar.</p>
      </Card>
    </>
  );
}
