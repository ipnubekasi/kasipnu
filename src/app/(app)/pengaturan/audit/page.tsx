import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { Pagination, UrlSearch, UrlSelect } from "@/components/app/url-controls";
import { getAppContext } from "@/lib/context";
import { formatDateTime } from "@/lib/format";
import { param } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log" };

const ENTITIES = [
  { value: "", label: "Semua jenis data" }, { value: "journal_entries", label: "Transaksi dan jurnal" }, { value: "attachments", label: "Bukti" },
  { value: "organization_members", label: "Anggota dan akses" }, { value: "closed_periods", label: "Tutup periode" }, { value: "reconciliations", label: "Cocokkan Kas" },
  { value: "import_batches", label: "Impor" }, { value: "programs", label: "Program" }, { value: "budget_items", label: "RAB" }, { value: "cash_needs", label: "Kebutuhan kas" },
  { value: "accounts", label: "Akun dan rekening" }, { value: "categories", label: "Kategori" }, { value: "organizations", label: "Organisasi dan pengaturan" }, { value: "management_terms", label: "Periode kepengurusan" },
];
const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getAppContext();
  const page = Math.max(1, Number(param(sp.hal)) || 1);
  const entity = param(sp.data) ?? "";
  const search = param(sp.cari) ?? "";
  let q = ctx.supabase.from("audit_logs").select("id, actor_name, action, entity_type, summary, created_at", { count: "exact" }).eq("organization_id", ctx.org.id);
  if (entity) q = q.eq("entity_type", entity);
  if (search) q = q.or(`summary.ilike.%${search.replace(/[%,()]/g, " ")}%,actor_name.ilike.%${search.replace(/[%,()]/g, " ")}%`);
  const { data, count } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  return (
    <>
      <PageHeader title="Audit Log" description="Siapa melakukan apa, dan kapan." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <UrlSelect name="data" label="Jenis data" value={entity} options={ENTITIES} />
          <div className="w-full sm:ml-auto sm:w-auto"><UrlSearch value={search} placeholder="Cari ringkasan atau nama" /></div>
        </div>
        {!data?.length ? (
          <EmptyState title="Tidak ada catatan yang cocok" description="Ubah filter atau kata pencarian." />
        ) : (
          <>
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>Waktu</TH><TH>Pelaku</TH><TH>Tindakan</TH></TR></THead>
              <TBody>
                {data.map((l) => (
                  <TR key={l.id}>
                    <TD className="tnum whitespace-nowrap text-muted">{formatDateTime(l.created_at)}</TD>
                    <TD className="whitespace-nowrap">{l.actor_name ?? "Sistem"}</TD>
                    <TD>{l.summary}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
          </>
        )}
      </Card>
    </>
  );
}
