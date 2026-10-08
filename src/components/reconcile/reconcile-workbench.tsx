"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Plus, Trash2 } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatRupiah } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useAction } from "@/components/app/hooks";
import { Money } from "@/components/app/money";

type Line = { id: string; entry_id: string; entry_date: string; ref_no: string; description: string; debit: number; credit: number; reconciliation_id: string | null };

export function ReconcileWorkbench({
  reconId, accountId, statementBalance, bookBalance, lines, status, canWrite, statementDate,
}: {
  reconId: string; accountId: string; statementBalance: number; bookBalance: number; lines: Line[]; status: "draft" | "selesai"; canWrite: boolean; statementDate: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toggle = useAction();
  const finish = useAction();
  const del = useAction();
  const [completeOpen, setCompleteOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const diff = statementBalance - bookBalance;
  const matched = lines.filter((l) => l.reconciliation_id === reconId);
  const unmatched = lines.filter((l) => l.reconciliation_id !== reconId);
  const editable = canWrite && status === "draft";
  const net = (ls: Line[]) => ls.reduce((t, l) => t + Number(l.debit) - Number(l.credit), 0);

  const set = (ids: string[], v: boolean) => toggle.run(() => supabase.rpc("set_reconciled", { p_recon_id: reconId, p_line_ids: ids, p_matched: v }), {});

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-surface p-4"><p className="text-[13px] text-muted">Saldo pembanding (hitung kas atau rekening koran)</p><p className="mt-1 text-xl font-semibold"><Money value={statementBalance} /></p></div>
        <div className="rounded-card border border-line bg-surface p-4"><p className="text-[13px] text-muted">Saldo Buku per {formatDate(statementDate)}</p><p className="mt-1 text-xl font-semibold"><Money value={bookBalance} /></p></div>
        <div className={`rounded-card border p-4 ${diff === 0 ? "border-accent-line bg-accent-soft" : "border-warn-line bg-warn-soft"}`}>
          <p className="text-[13px] text-muted">Selisih</p>
          <p className="mt-1 text-xl font-semibold"><Money value={diff} tone={diff === 0 ? undefined : "out"} /></p>
          <p className="text-[12px] text-muted">{diff === 0 ? "Saldo cocok." : diff > 0 ? "Uang nyata lebih banyak dari catatan." : "Uang nyata lebih sedikit dari catatan."}</p>
        </div>
      </div>

      {diff !== 0 && editable && (
        <Alert tone="warn" title="Saldo tidak disesuaikan otomatis">
          Periksa transaksi yang belum dicatat atau salah nominal. Bila selisih memang nyata (misalnya biaya administrasi bank), catat koreksi secara eksplisit:
          <span className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm"><Link href={`/kas/baru?rekening=${accountId}&kategori=${diff < 0 ? "selisih_kurang" : "selisih_lebih"}&nominal=${Math.abs(diff)}&uraian=${encodeURIComponent(`Koreksi selisih rekonsiliasi per ${formatDate(statementDate)}`)}&kembali=${encodeURIComponent(`/kas/rekonsiliasi/${reconId}`)}`}><Plus aria-hidden />Catat koreksi {formatRupiah(Math.abs(diff))}</Link></Button>
          </span>
        </Alert>
      )}

      <div className="rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <p className="text-[15px] font-semibold">Mutasi pada Saldo Buku</p>
          <p className="text-[13px] text-muted">{matched.length} cocok (<Money value={net(matched)} />) · {unmatched.length} belum dicocokkan (<Money value={net(unmatched)} />)</p>
          {editable && unmatched.length > 0 && <Button size="sm" loading={toggle.pending} onClick={() => set(unmatched.map((l) => l.id), true)}><CheckCheck aria-hidden />Tandai semua cocok</Button>}
        </div>
        {lines.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Tidak ada mutasi yang belum direkonsiliasi sampai tanggal ini.</p>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((l) => {
              const ok = l.reconciliation_id === reconId;
              return (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <Checkbox aria-label={`Tandai ${l.ref_no} cocok`} checked={ok} disabled={!editable || toggle.pending} onChange={(e) => set([l.id], e.target.checked)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{l.description}</span>
                    <span className="block text-[12px] text-muted"><span className="tnum">{formatDate(l.entry_date)}</span> · <Link href={`/kas/${l.entry_id}`} className="text-primary hover:underline">{l.ref_no}</Link></span>
                  </span>
                  <Money value={Number(l.debit) - Number(l.credit)} tone={Number(l.debit) > 0 ? "in" : "out"} sign className="text-sm font-medium" />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="dangerOutline" onClick={() => setDeleteOpen(true)}><Trash2 aria-hidden />Hapus rekonsiliasi</Button>
          <Button variant="primary" onClick={() => setCompleteOpen(true)}>Selesaikan Rekonsiliasi</Button>
        </div>
      )}
      <ConfirmDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        title="Selesaikan rekonsiliasi?"
        description={diff === 0 ? "Saldo Buku sama dengan saldo pembanding. Hasil rekonsiliasi disimpan dan tidak dapat diubah." : `Masih ada selisih ${formatRupiah(diff)}. Jelaskan penyebabnya; rekonsiliasi akan disimpan beserta selisih tersebut. Saldo tidak diubah.`}
        confirmLabel="Selesaikan"
        pending={finish.pending}
        reason={diff !== 0 ? { label: "Penjelasan selisih", required: true } : undefined}
        onConfirm={(reason) => finish.run(() => supabase.rpc("complete_reconciliation", { p_recon_id: reconId, p_notes: reason || null }), { success: "Rekonsiliasi selesai", onSuccess: () => setCompleteOpen(false) })}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus rekonsiliasi yang belum selesai?"
        description="Tanda cocok pada mutasi dilepas. Transaksi tidak berubah."
        confirmLabel="Hapus"
        tone="danger"
        pending={del.pending}
        onConfirm={() => del.run(() => supabase.rpc("delete_reconciliation", { p_recon_id: reconId }), { success: "Rekonsiliasi dihapus", refresh: false, onSuccess: () => { router.replace("/kas/rekonsiliasi"); router.refresh(); } })}
      />
    </div>
  );
}
