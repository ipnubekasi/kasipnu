"use client";

import * as React from "react";
import { Download, Eye, FileImage, FileText, History, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ACCEPT, signedUrl, uploadAttachment, validateFile } from "@/lib/attachments";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { Attachment, EvidenceStatus } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useAction } from "@/components/app/hooks";
import { AttachmentPicker } from "./attachment-picker";

/**
 * Bukti transaksi yang sudah tersimpan: lihat, unduh, ganti, hapus, dan tambah.
 * Berkas dibuka lewat signed URL berumur pendek yang dibuat saat tombol ditekan.
 * Lampiran yang diganti atau dihapus tetap tampil di riwayat.
 */
export function AttachmentManager({
  orgId, entryId, attachments, canWrite, maxMb, evidenceStatus, evidenceReason, entryPosted, showEvidenceControl = true,
}: {
  orgId: string;
  entryId: string;
  attachments: Attachment[];
  canWrite: boolean;
  maxMb: number;
  evidenceStatus: EvidenceStatus;
  evidenceReason: string | null;
  entryPosted: boolean;
  showEvidenceControl?: boolean;
}) {
  const supabase = createClient();
  const active = attachments.filter((a) => a.status === "aktif");
  const history = attachments.filter((a) => a.status !== "aktif");
  const [queue, setQueue] = React.useState<File[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [preview, setPreview] = React.useState<{ a: Attachment; url: string } | null>(null);
  const [removing, setRemoving] = React.useState<Attachment | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const replaceRef = React.useRef<HTMLInputElement>(null);
  const replaceTarget = React.useRef<Attachment | null>(null);
  const { run, pending } = useAction();

  async function open(a: Attachment, download = false) {
    const url = await signedUrl(supabase, a.storage_path, download ? a.file_name : undefined);
    if (!url) {
      toast.error("Berkas tidak dapat dibuka.", { description: "Anda mungkin tidak memiliki akses, atau berkas tidak ditemukan di penyimpanan." });
      return;
    }
    if (download) {
      const link = document.createElement("a");
      link.href = url;
      link.download = a.file_name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else {
      setPreview({ a, url });
    }
  }

  async function uploadAll(files: File[], replaces?: Attachment | null) {
    setUploading(true);
    let ok = 0;
    for (const file of files) {
      const res = await uploadAttachment(supabase, { orgId, kind: "bukti", entryId, file, replacesId: replaces?.id ?? null });
      if (res.error) toast.error(res.error.message, { description: res.error.hint ?? undefined });
      else ok += 1;
    }
    setUploading(false);
    setQueue([]);
    if (ok) {
      toast.success(replaces ? "Bukti diganti" : `${ok} bukti diunggah`, { description: replaces ? "Berkas lama tetap tersimpan di riwayat lampiran." : undefined });
      await run(async () => ({ data: true }), {});
    }
  }

  return (
    <div className="space-y-3">
      {active.length === 0 ? (
        <div className="rounded-control border border-line bg-subtle/50 px-3 py-2.5 text-sm">
          {evidenceStatus === "tidak_tersedia" ? (
            <p><Badge tone="neutral" className="mr-2">Tidak Tersedia</Badge><span className="text-muted">Alasan: {evidenceReason}</span></p>
          ) : (
            <p className="text-muted">Belum ada bukti untuk transaksi ini.</p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {active.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-control border border-line p-2.5">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded bg-subtle text-muted">
                {a.mime_type === "application/pdf" ? <FileText className="size-5" aria-hidden /> : <FileImage className="size-5" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{a.file_name}</span>
                <span className="block text-[12px] text-muted">
                  <span className="tnum">{formatBytes(a.size_bytes)}</span> · diunggah {a.uploaded_by_name ?? "pengguna"} · {formatDateTime(a.uploaded_at)}
                  {a.replaces_id && " · pengganti berkas sebelumnya"}
                </span>
              </span>
              <span className="flex gap-1">
                <Button size="iconSm" variant="ghost" aria-label={`Lihat ${a.file_name}`} onClick={() => open(a)}><Eye aria-hidden /></Button>
                <Button size="iconSm" variant="ghost" aria-label={`Unduh ${a.file_name}`} onClick={() => open(a, true)}><Download aria-hidden /></Button>
                {canWrite && (
                  <>
                    <Button size="iconSm" variant="ghost" aria-label={`Ganti ${a.file_name}`} disabled={uploading} onClick={() => { replaceTarget.current = a; replaceRef.current?.click(); }}><RefreshCw aria-hidden /></Button>
                    <Button size="iconSm" variant="ghost" aria-label={`Hapus ${a.file_name}`} onClick={() => setRemoving(a)}><Trash2 aria-hidden /></Button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <>
          <AttachmentPicker files={queue} onChange={setQueue} maxMb={maxMb} disabled={uploading} compact />
          {queue.length > 0 && <Button variant="primary" loading={uploading} onClick={() => uploadAll(queue)}>Unggah {queue.length} bukti</Button>}
          <input
            ref={replaceRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f || !replaceTarget.current) return;
              const err = validateFile(f, maxMb);
              if (err) {
                toast.error(err);
                return;
              }
              void uploadAll([f], replaceTarget.current);
            }}
          />
          {showEvidenceControl && active.length === 0 && queue.length === 0 && (
            evidenceStatus === "tidak_tersedia" ? (
              <Button size="sm" loading={pending} onClick={() => run(() => supabase.rpc("set_evidence_status", { p_entry_id: entryId, p_status: "belum_ada", p_reason: null }), { success: "Status bukti dikembalikan ke Belum Ada" })}>
                Tandai Belum Ada
              </Button>
            ) : (
              <Button size="sm" onClick={() => setUnavailable(true)}>Tandai bukti Tidak Tersedia</Button>
            )
          )}
        </>
      )}

      {history.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
            <History className="size-3.5" aria-hidden />
            {showHistory ? "Sembunyikan" : "Tampilkan"} riwayat lampiran ({history.length})
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1.5">
              {history.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-line px-2.5 py-2 text-[13px] text-muted">
                  <Badge tone="neutral">{a.status === "diganti" ? "Diganti" : "Dihapus"}</Badge>
                  <span className="min-w-0 flex-1 truncate">{a.file_name} · diunggah {formatDateTime(a.uploaded_at)}{a.remove_reason ? ` · ${a.remove_reason}` : ""}</span>
                  <Button size="iconSm" variant="ghost" aria-label={`Lihat ${a.file_name}`} onClick={() => open(a)}><Eye aria-hidden /></Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent size="xl" className="sm:h-[88dvh]">
          <DialogHeader><DialogTitle className="truncate">{preview?.a.file_name}</DialogTitle></DialogHeader>
          <DialogBody className="flex min-h-[50dvh] items-center justify-center bg-subtle p-2">
            {preview && (preview.a.mime_type === "application/pdf" ? (
              <iframe src={preview.url} title={preview.a.file_name} className="h-full min-h-[60dvh] w-full rounded bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={`Bukti ${preview.a.file_name}`} className="max-h-full max-w-full object-contain" />
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Hapus bukti ini?"
        description={<>Lampiran <strong>{removing?.file_name}</strong> ditandai dihapus dan tetap tercatat di riwayat serta audit log.</>}
        confirmLabel="Hapus bukti"
        tone="danger"
        pending={pending}
        reason={entryPosted ? { label: "Alasan penghapusan", required: true, placeholder: "Misalnya: salah unggah berkas" } : undefined}
        onConfirm={(reason) =>
          run(() => supabase.rpc("remove_attachment", { p_attachment_id: removing!.id, p_reason: reason || null }), {
            success: "Bukti ditandai dihapus",
            onSuccess: () => setRemoving(null),
          })
        }
      />
      <ConfirmDialog
        open={unavailable}
        onOpenChange={setUnavailable}
        title="Tandai bukti tidak tersedia"
        description="Gunakan bila bukti memang tidak dapat diperoleh. Transaksi ini tidak lagi muncul di daftar bukti yang belum lengkap."
        confirmLabel="Simpan"
        pending={pending}
        reason={{ label: "Alasan", required: true, placeholder: "Misalnya: parkir tanpa karcis" }}
        onConfirm={(reason) =>
          run(() => supabase.rpc("set_evidence_status", { p_entry_id: entryId, p_status: "tidak_tersedia", p_reason: reason }), {
            success: "Status bukti diperbarui",
            onSuccess: () => setUnavailable(false),
          })
        }
      />
      {!canWrite && active.length === 0 && <Alert tone="info">Hanya Bendahara yang dapat mengunggah bukti.</Alert>}
    </div>
  );
}
