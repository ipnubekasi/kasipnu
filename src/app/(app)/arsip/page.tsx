import type { Metadata } from "next";
import Link from "next/link";
import { Archive } from "@/components/ui/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { LinkTabs, Pagination, PeriodSelect, UrlSearch } from "@/components/app/url-controls";
import { ArchiveList, type ArchiveItem } from "@/components/archive/archive-list";
import { DocumentUpload } from "@/components/archive/document-upload";
import { getAppContext, getMaster } from "@/lib/context";
import { fetchPendingTasks } from "@/lib/queries";
import { resolvePeriod } from "@/lib/scope";
import { param, qs } from "@/lib/utils";

export const metadata: Metadata = { title: "Arsip bukti" };
const PAGE_SIZE = 30;

export default async function ArchivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, param(v)])) as Record<string, string | undefined>;
  const ctx = await getAppContext();
  const master = await getMaster();
  const tab = sp.tab === "dokumen" ? "dokumen" : sp.tab === "riwayat" ? "riwayat" : "bukti";
  const period = resolvePeriod(sp, ctx.activeTerm, "semua");
  const page = Math.max(1, Number(sp.hal) || 1);
  const search = (sp.cari ?? "").replace(/[%,()]/g, " ").trim();
  const tasks = await fetchPendingTasks(ctx.supabase, ctx.org.id);

  let q = ctx.supabase
    .from("attachments")
    .select("id, title, file_name, mime_type, size_bytes, storage_path, status, uploaded_at, uploaded_by_name, entry:journal_entries(id, ref_no, description, entry_date)", { count: "exact" })
    .eq("organization_id", ctx.org.id)
    .gte("uploaded_at", `${period.from}T00:00:00+07:00`)
    .lte("uploaded_at", `${period.to}T23:59:59+07:00`);
  if (tab === "bukti") q = q.eq("kind", "bukti").eq("status", "aktif");
  if (tab === "dokumen") q = q.eq("kind", "dokumen").eq("status", "aktif");
  if (tab === "riwayat") q = q.neq("status", "aktif");
  if (search) q = q.or(`file_name.ilike.%${search}%,title.ilike.%${search}%`);
  const { data, count } = await q.order("uploaded_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const items = (data ?? []) as unknown as ArchiveItem[];
  const backHref = `/arsip${qs(sp)}`;

  return (
    <>
      <PageHeader title="Arsip Bukti" description="Bukti dan dokumen yang tersimpan." />
      {tasks.missing_evidence > 0 && (
        <p className="mb-4 text-sm text-muted">
          <strong className="text-ink">{tasks.missing_evidence} transaksi</strong> yang sudah tercatat belum memiliki bukti.{" "}
          <Link href="/kas?lingkup=gabungan&bukti=belum_ada&status=dibukukan" className="font-medium text-accent underline underline-offset-2">Lengkapi sekarang</Link>
        </p>
      )}
      <LinkTabs active={tab} tabs={[
        { key: "bukti", label: "Bukti transaksi", href: "/arsip" },
        { key: "dokumen", label: "Dokumen arsip", href: "/arsip?tab=dokumen" },
        { key: "riwayat", label: "Diganti atau dihapus", href: "/arsip?tab=riwayat" },
      ]} />
      {tab === "dokumen" && ctx.canWrite && (
        <Card className="mb-5">
          <CardHeader><CardTitle>Unggah dokumen arsip</CardTitle></CardHeader>
          <CardContent><DocumentUpload orgId={ctx.org.id} programs={master.programs} maxMb={ctx.org.settings?.attachment?.max_mb ?? 10} /></CardContent>
        </Card>
      )}
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <PeriodSelect value={period.key} from={period.from} to={period.to} defaultKey="semua" />
          <div className="w-full sm:ml-auto sm:w-auto"><UrlSearch value={sp.cari ?? ""} placeholder="Cari nama berkas atau judul" /></div>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tab === "dokumen" ? "Belum ada dokumen arsip" : tab === "riwayat" ? "Tidak ada lampiran yang diganti atau dihapus" : "Belum ada bukti pada periode ini"}
            description={tab === "bukti" ? "Bukti diunggah saat mencatat transaksi atau dari halaman detail transaksi." : tab === "riwayat" ? "Lampiran yang diganti atau dihapus tetap disimpan dan akan tampil di sini." : "Unggah laporan lama atau dokumen pendukung keuangan untuk disimpan bersama arsip organisasi."}
          />
        ) : (
          <>
            <ArchiveList items={items} backHref={backHref} showEntry={tab !== "dokumen"} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
          </>
        )}
      </Card>
    </>
  );
}
