import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { NoWriteAccess } from "@/components/app/no-access";
import { ImportWizard } from "@/components/import/import-wizard";
import { getAppContext, getMaster } from "@/lib/context";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Impor transaksi" };

export default async function ImportPage() {
  const ctx = await getAppContext();
  if (!ctx.canWrite) return <NoWriteAccess what="mengimpor transaksi" back="/kas" />;
  const master = await getMaster();
  const { data: batches } = await ctx.supabase.from("import_batches").select("*").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(10);
  return (
    <>
      <PageHeader title="Impor Transaksi" description="Masukkan transaksi historis atau mutasi rekening dari CSV atau XLSX. Semua baris masuk sebagai draft, divalidasi, lalu Anda bukukan setelah ditinjau." back={{ href: "/kas", label: "Kas Umum" }} />
      <ImportWizard orgId={ctx.org.id} accounts={master.accounts} funds={master.funds} programs={master.programs} categories={master.categories} />
      {batches && batches.length > 0 && (
        <Card className="mt-6">
          <Table>
            <THead><TR className="hover:bg-transparent"><TH>Riwayat impor</TH><TH>Waktu</TH><TH className="text-right">Diimpor</TH><TH className="text-right">Dilewati</TH><TH /></TR></THead>
            <TBody>
              {batches.map((b) => (
                <TR key={b.id}>
                  <TD className="font-medium">{b.file_name}</TD>
                  <TD className="whitespace-nowrap">{formatDateTime(b.created_at)}</TD>
                  <TD className="num">{b.imported_rows}</TD>
                  <TD className="num">{b.duplicate_rows}</TD>
                  <TD className="text-right"><Link href={`/kas?lingkup=gabungan&batch=${b.id}`} className="text-sm text-accent hover:underline">Lihat transaksi</Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
