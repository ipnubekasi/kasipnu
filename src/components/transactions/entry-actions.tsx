"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, Pencil, Trash2, Undo2 } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { todayJakarta } from "@/lib/format";
import type { Entry } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, fieldAria } from "@/components/ui/field";
import { Checkbox, Input, Label, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useAction } from "@/components/app/hooks";

export function EntryActions({ entry, backHref }: { entry: Entry; backHref: string }) {
  const router = useRouter();
  const post = useAction();
  const del = useAction();
  const rev = useAction();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [reverseOpen, setReverseOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [date, setDate] = React.useState(todayJakarta());
  const [replacement, setReplacement] = React.useState(true);
  const [touched, setTouched] = React.useState(false);
  const supabase = createClient();
  const today = todayJakarta();

  if (entry.status === "draft") {
    const editHref = entry.kind === "penyesuaian" ? `/jurnal/penyesuaian?id=${entry.id}` : `/kas/${entry.id}/ubah`;
    return (
      <>
        {post.error && <Alert tone="danger" title={post.error.message} className="w-full basis-full">{post.error.hint}</Alert>}
        <Button variant="dangerOutline" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden />Hapus</Button>
        <Button asChild><Link href={editHref}><Pencil aria-hidden />Ubah</Link></Button>
        <Button
          variant="primary"
          loading={post.pending}
          onClick={() =>
            post.run(() => supabase.rpc("post_entry", { p_entry_id: entry.id }), {
              success: (d: { ref_no: string }) => `${d.ref_no} tercatat`,
              toastError: false,
            })
          }
        >
          <CheckCheck aria-hidden />Catat
        </Button>
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Hapus draft ini?"
          description="Draft belum masuk buku besar, jadi menghapusnya tidak mengubah saldo. Bukti yang sudah diunggah ditandai dihapus."
          confirmLabel="Hapus draft"
          tone="danger"
          pending={del.pending}
          onConfirm={() =>
            del.run(() => supabase.rpc("delete_draft", { p_entry_id: entry.id }), {
              success: "Draft dihapus",
              refresh: false,
              onSuccess: () => {
                router.replace(backHref);
                router.refresh();
              },
            })
          }
        />
      </>
    );
  }

  if (entry.status !== "dibukukan" || entry.kind === "pembalikan") return null;

  const reasonMissing = reason.trim().length === 0;
  const dateError = !date ? "Tanggal wajib diisi." : date < entry.entry_date ? "Tidak boleh lebih awal dari tanggal transaksi asal." : date > today ? "Tidak boleh melebihi hari ini." : null;

  return (
    <>
      <Button variant="dangerOutline" onClick={() => { setReverseOpen(true); setTouched(false); rev.clearError(); }}><Undo2 aria-hidden />Batalkan</Button>
      <Dialog open={reverseOpen} onOpenChange={(v) => !rev.pending && setReverseOpen(v)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Batalkan transaksi {entry.ref_no}</DialogTitle>
            <DialogDescription>
              Saldo kembali seperti sebelum transaksi ini. Riwayatnya tetap tersimpan.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {rev.error && <Alert tone="danger" title={rev.error.message}>{rev.error.hint}</Alert>}
            <Field label="Alasan pembalikan" htmlFor="rev-reason" required error={touched && reasonMissing ? "Alasan wajib diisi." : null}>
              <Textarea {...fieldAria("rev-reason", touched && reasonMissing ? "x" : null)} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Misalnya: nominal salah, seharusnya Rp150.000" autoFocus />
            </Field>
            <Field label="Tanggal pembalikan" htmlFor="rev-date" required error={touched ? dateError : null} help="Pakai hari ini bila bulannya sudah ditutup.">
              <Input {...fieldAria("rev-date", touched ? dateError : null)} type="date" value={date} min={entry.entry_date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="flex items-start gap-2.5">
              <Checkbox id="rev-repl" checked={replacement} onChange={(e) => setReplacement(e.target.checked)} className="mt-0.5" />
              <div>
                <Label htmlFor="rev-repl" className="font-normal">Buat transaksi pengganti sebagai draft</Label>
                <p className="text-[13px] text-muted">Isian transaksi ini disalin ke draft baru agar tinggal diperbaiki lalu tercatat.</p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setReverseOpen(false)} disabled={rev.pending}>Batal</Button>
            <Button
              variant="danger"
              loading={rev.pending}
              onClick={() => {
                setTouched(true);
                if (reasonMissing || dateError) return;
                void rev.run(
                  () => supabase.rpc("reverse_entry", { p_entry_id: entry.id, p_reason: reason.trim(), p_date: date, p_create_replacement: replacement }),
                  {
                    toastError: false,
                    refresh: false,
                    onSuccess: (d: { reversal_ref: string; replacement_id: string | null }) => {
                      toast.success(`${entry.ref_no} dibatalkan dengan ${d.reversal_ref}`, { description: d.replacement_id ? "Draft pengganti sudah dibuat. Perbaiki lalu catat." : undefined });
                      setReverseOpen(false);
                      if (d.replacement_id) router.push(`/kas/${d.replacement_id}/ubah`);
                      router.refresh();
                    },
                  },
                );
              }}
            >
              Batalkan transaksi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
