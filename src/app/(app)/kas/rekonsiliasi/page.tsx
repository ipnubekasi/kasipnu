import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { StartReconciliation } from "@/components/reconcile/start-form";
import { getAppContext, getMaster } from "@/lib/context";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Rekonsiliasi" };

export default async function ReconciliationsPage() {
  const ctx = await getAppContext();
  const master = await getMaster();
  const { data } = await ctx.supabase.from("reconciliations").select("*").eq("organization_id", ctx.org.id).order("statement_date", { ascending: false }).order("created_at", { ascending: false });
  const accName = (id: string) => master.accounts.find((a) => a.id === id)?.name ?? "";
  return (
    <>
      <PageHeader title="Rekonsiliasi" description="Cocokkan Saldo Buku dengan hasil hitung kas tunai atau rekening koran. Selisih tidak pernah disesuaikan otomatis; koreksi dicatat sebagai transaksi." back={{ href: "/kas", label: "Kas Umum" }} />
      {ctx.canWrite && (
        <Card className="mb-5">
          <CardHeader><CardTitle>Mulai rekonsiliasi baru</CardTitle></CardHeader>
          <CardContent><StartReconciliation orgId={ctx.org.id} accounts={master.cashAccounts.filter((a) => a.is_active)} /></CardContent>
        </Card>
      )}
      <Card>
        {!data?.length ? (
          <EmptyState title="Belum ada rekonsiliasi" description="Lakukan rekonsiliasi minimal sebulan sekali untuk setiap rekening, sebelum menutup periode." />
        ) : (
          <Table>
            <THead><TR className="hover:bg-transparent"><TH>Rekening</TH><TH>Per tanggal</TH><TH className="text-right">Saldo pembanding</TH><TH className="text-right">Saldo buku</TH><TH className="text-right">Selisih</TH><TH>Status</TH><TH /></TR></THead>
            <TBody>
              {data.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{accName(r.account_id)}</TD>
                  <TD className="whitespace-nowrap">{formatDate(r.statement_date)}</TD>
                  <TD className="num"><Money value={r.statement_balance} /></TD>
                  <TD className="num">{r.status === "selesai" ? <Money value={r.book_balance} /> : <span className="text-muted">Saat selesai</span>}</TD>
                  <TD className="num">{r.status === "selesai" ? <Money value={r.difference} tone={Number(r.difference) !== 0 ? "out" : undefined} /> : "-"}</TD>
                  <TD>{r.status === "selesai" ? <Badge tone="ok">Selesai</Badge> : <Badge tone="warn">Belum selesai</Badge>}{r.notes && <span className="mt-0.5 block text-[12px] text-muted">{r.notes}</span>}</TD>
                  <TD className="text-right"><Link href={`/kas/rekonsiliasi/${r.id}`} className="text-sm text-accent hover:underline">{r.status === "draft" ? "Lanjutkan" : "Lihat"}</Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
