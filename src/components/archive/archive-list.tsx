"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Eye, FileImage, FileText } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { signedUrl } from "@/lib/attachments";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type ArchiveItem = {
  id: string;
  title: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  status: "aktif" | "diganti" | "dihapus";
  uploaded_at: string;
  uploaded_by_name: string | null;
  entry: { id: string; ref_no: string | null; description: string; entry_date: string } | null;
};

/** Daftar berkas arsip. Berkas dibuka dengan signed URL berumur pendek yang dibuat saat diminta. */
export function ArchiveList({ items, backHref, showEntry = true }: { items: ArchiveItem[]; backHref: string; showEntry?: boolean }) {
  const supabase = createClient();
  const [preview, setPreview] = React.useState<{ a: ArchiveItem; url: string } | null>(null);

  async function open(a: ArchiveItem, download: boolean) {
    const url = await signedUrl(supabase, a.storage_path, download ? a.file_name : undefined);
    if (!url) {
      toast.error("Berkas tidak dapat dibuka.", { description: "Anda mungkin tidak memiliki akses, atau berkas tidak ditemukan di penyimpanan." });
      return;
    }
    if (!download) return setPreview({ a, url });
    const link = document.createElement("a");
    link.href = url;
    link.download = a.file_name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <THead><TR className="hover:bg-transparent"><TH>Berkas</TH>{showEntry && <TH>Transaksi</TH>}<TH>Diunggah</TH><TH className="text-right">Ukuran</TH><TH /></TR></THead>
          <TBody>
            {items.map((a) => (
              <TR key={a.id} className={a.status !== "aktif" ? "text-muted" : ""}>
                <TD>
                  <span className="flex items-center gap-2.5">
                    {a.mime_type === "application/pdf" ? <FileText className="size-4 shrink-0 text-muted" aria-hidden /> : <FileImage className="size-4 shrink-0 text-muted" aria-hidden />}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{a.title || a.file_name}</span>
                      {a.title && <span className="block truncate text-[12px] text-muted">{a.file_name}</span>}
                    </span>
                    {a.status !== "aktif" && <Badge>{a.status === "diganti" ? "Diganti" : "Dihapus"}</Badge>}
                  </span>
                </TD>
                {showEntry && (
                  <TD>
                    {a.entry ? (
                      <>
                        <Link href={`/kas/${a.entry.id}?kembali=${encodeURIComponent(backHref)}`} className="font-medium text-primary hover:underline">{a.entry.ref_no ?? "Draft"}</Link>
                        <span className="block max-w-xs truncate text-[12px] text-muted">{formatDate(a.entry.entry_date)} · {a.entry.description}</span>
                      </>
                    ) : <span className="text-muted">Dokumen arsip</span>}
                  </TD>
                )}
                <TD className="whitespace-nowrap">{formatDateTime(a.uploaded_at)}<span className="block text-[12px] text-muted">{a.uploaded_by_name ?? ""}</span></TD>
                <TD className="num">{formatBytes(a.size_bytes)}</TD>
                <TD className="text-right whitespace-nowrap">
                  <Button size="iconSm" variant="ghost" aria-label={`Lihat ${a.file_name}`} onClick={() => open(a, false)}><Eye aria-hidden /></Button>
                  <Button size="iconSm" variant="ghost" aria-label={`Unduh ${a.file_name}`} onClick={() => open(a, true)}><Download aria-hidden /></Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded bg-subtle text-muted">{a.mime_type === "application/pdf" ? <FileText className="size-4" aria-hidden /> : <FileImage className="size-4" aria-hidden />}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{a.title || a.file_name}</span>
              <span className="block truncate text-[12px] text-muted">
                {a.entry ? <Link href={`/kas/${a.entry.id}?kembali=${encodeURIComponent(backHref)}`} className="text-primary">{a.entry.ref_no ?? "Draft"}</Link> : "Dokumen arsip"} · {formatDate(a.uploaded_at.slice(0, 10))} · {formatBytes(a.size_bytes)}
              </span>
            </span>
            <Button size="iconSm" variant="ghost" aria-label={`Lihat ${a.file_name}`} onClick={() => open(a, false)}><Eye aria-hidden /></Button>
            <Button size="iconSm" variant="ghost" aria-label={`Unduh ${a.file_name}`} onClick={() => open(a, true)}><Download aria-hidden /></Button>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(preview)} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent size="xl" className="sm:h-[88dvh]">
          <DialogHeader><DialogTitle className="truncate">{preview?.a.title || preview?.a.file_name}</DialogTitle></DialogHeader>
          <DialogBody className="flex min-h-[50dvh] items-center justify-center bg-subtle p-2">
            {preview && (preview.a.mime_type === "application/pdf" ? (
              <iframe src={preview.url} title={preview.a.file_name} className="h-full min-h-[60dvh] w-full rounded bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={`Berkas ${preview.a.file_name}`} className="max-h-full max-w-full object-contain" />
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
