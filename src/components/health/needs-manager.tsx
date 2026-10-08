"use client";

import * as React from "react";
import Link from "next/link";
import { Ban, Pencil, Plus, Wallet } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatDate, todayJakarta } from "@/lib/format";
import type { CashNeed, Fund } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormDialog, type FieldDef } from "@/components/app/form-dialog";
import { useAction } from "@/components/app/hooks";
import { Money } from "@/components/app/money";
import { EmptyState } from "@/components/app/states";

export function NeedsManager({ orgId, needs, funds, canWrite, refs }: { orgId: string; needs: CashNeed[]; funds: Fund[]; canWrite: boolean; refs: Record<string, string> }) {
  const supabase = createClient();
  const { run, pending } = useAction();
  const [edit, setEdit] = React.useState<CashNeed | "new" | null>(null);
  const [cancel, setCancel] = React.useState<CashNeed | null>(null);
  const today = todayJakarta();
  const fundName = (id: string) => funds.find((f) => f.id === id)?.name ?? "";
  const general = funds.find((f) => f.kind === "umum")!;
  const plans = needs.filter((n) => n.kind === "rencana" && n.direction === "keluar" && n.status === "terbuka");
  const open = needs.filter((n) => n.status === "terbuka");
  const done = needs.filter((n) => n.status !== "terbuka");

  const fields: FieldDef[] = [
    { name: "name", label: "Nama kebutuhan", required: true, placeholder: "Misalnya: Sewa sekretariat triwulan IV" },
    { name: "direction", label: "Arah", type: "select", required: true, half: true, options: [{ value: "keluar", label: "Uang keluar (kebutuhan)" }, { value: "masuk", label: "Uang masuk (pemasukan rencana)" }] },
    { name: "kind", label: "Status kebutuhan", type: "select", required: true, half: true, options: [{ value: "rencana", label: "Rencana" }, { value: "kewajiban", label: "Kewajiban (tagihan pasti)" }], disabled: (v) => v.direction === "masuk", help: "Kewajiban dikurangkan dari dana tersedia; rencana hanya dibandingkan pada kebutuhan 30 hari." },
    { name: "fund_id", label: "Dana", type: "select", required: true, half: true, options: funds.map((f) => ({ value: f.id, label: f.name })) },
    { name: "amount", label: "Nominal", type: "money", required: true, half: true },
    { name: "due_date", label: "Jatuh tempo", type: "date", required: true, half: true },
    { name: "plan_id", label: "Merujuk rencana", type: "select", placeholder: "Tidak merujuk rencana", hidden: (v) => v.kind !== "kewajiban" || v.direction !== "keluar", help: "Pilih bila kewajiban ini berasal dari rencana yang sudah dicatat, agar tidak dihitung dua kali.", options: plans.map((p) => ({ value: p.id, label: `${p.name} (${fundName(p.fund_id)})` })) },
    { name: "notes", label: "Catatan", type: "textarea" },
  ];

  const row = (n: CashNeed) => {
    const overdue = n.status === "terbuka" && n.due_date < today;
    const covered = n.kind === "rencana" && needs.some((k) => k.plan_id === n.id && k.status !== "dibatalkan");
    return (
      <TR key={n.id} className={n.status !== "terbuka" ? "text-muted" : ""}>
        <TD className="font-medium">
          {n.name}
          {n.notes && <span className="block text-[12px] font-normal text-muted">{n.notes}</span>}
          {covered && <span className="block text-[12px] font-normal text-muted">Sudah menjadi kewajiban; tidak dihitung ganda.</span>}
        </TD>
        <TD>{fundName(n.fund_id)}</TD>
        <TD>{n.direction === "masuk" ? <Badge tone="info">Pemasukan rencana</Badge> : n.kind === "kewajiban" ? <Badge tone="outline">Kewajiban</Badge> : <Badge>Rencana</Badge>}</TD>
        <TD className="whitespace-nowrap">{formatDate(n.due_date)}{overdue && <span className="block text-[12px] text-danger">Lewat jatuh tempo</span>}</TD>
        <TD className="num"><Money value={n.amount} /></TD>
        <TD className="whitespace-nowrap">
          {n.status === "dibayar" ? <><Badge tone="ok">{n.direction === "masuk" ? "Diterima" : "Dibayar"}</Badge>{n.paid_entry_id && <Link href={`/kas/${n.paid_entry_id}`} className="ml-2 text-[12px] text-accent hover:underline">{refs[n.paid_entry_id] ?? "Transaksi"}</Link>}</> : n.status === "dibatalkan" ? <Badge>Dibatalkan</Badge> : <Badge tone="warn">Terbuka</Badge>}
        </TD>
        <TD className="text-right whitespace-nowrap">
          {canWrite && n.status === "terbuka" && (
            <>
              <Button asChild size="sm" variant="secondary"><Link href={`/kas/baru?kebutuhan=${n.id}&kembali=${encodeURIComponent("/kesehatan?tab=kebutuhan")}`}><Wallet aria-hidden />{n.direction === "masuk" ? "Catat penerimaan" : "Bayar"}</Link></Button>
              <Button size="iconSm" variant="ghost" aria-label={`Ubah ${n.name}`} onClick={() => setEdit(n)}><Pencil aria-hidden /></Button>
              <Button size="iconSm" variant="ghost" aria-label={`Batalkan ${n.name}`} onClick={() => setCancel(n)}><Ban aria-hidden /></Button>
            </>
          )}
        </TD>
      </TR>
    );
  };

  return (
    <>
      <div className="mb-4 flex justify-end">{canWrite && <Button variant="primary" onClick={() => setEdit("new")}><Plus aria-hidden />Tambah Kebutuhan Kas</Button>}</div>
      <Card>
        {needs.length === 0 ? (
          <EmptyState icon={Wallet} title="Belum ada kebutuhan kas" description="Catat tagihan yang akan datang (kewajiban) dan rencana pengeluaran, serta pemasukan yang direncanakan, agar kecukupan kas 30 hari dapat dihitung." />
        ) : (
          <Table>
            <THead><TR className="hover:bg-transparent"><TH>Kebutuhan</TH><TH>Dana</TH><TH>Jenis</TH><TH>Jatuh tempo</TH><TH className="text-right">Nominal</TH><TH>Status</TH><TH /></TR></THead>
            <TBody>
              {open.map(row)}
              {done.length > 0 && <TR className="hover:bg-transparent"><TD colSpan={7} className="bg-subtle/60 text-[12px] font-medium text-muted uppercase">Selesai atau dibatalkan</TD></TR>}
              {done.map(row)}
            </TBody>
          </Table>
        )}
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">Pembayaran kebutuhan dicatat lewat tombol Bayar. Setelah dibukukan, kebutuhan otomatis berstatus Dibayar dan terhubung ke transaksinya, sehingga tidak dikurangkan lagi dari dana tersedia.</p>
      </Card>
      <FormDialog
        open={Boolean(edit)}
        onOpenChange={(v) => !v && setEdit(null)}
        title={edit === "new" ? "Tambah kebutuhan kas" : "Ubah kebutuhan kas"}
        fields={fields}
        initial={edit === "new" || !edit ? { direction: "keluar", kind: "kewajiban", fund_id: general.id, due_date: today } : { ...edit, plan_id: edit.plan_id ?? "" }}
        onSubmit={async (v) => {
          const payload = { name: v.name.trim(), direction: v.direction, kind: v.direction === "masuk" ? "rencana" : v.kind, fund_id: v.fund_id, amount: v.amount, due_date: v.due_date, plan_id: v.kind === "kewajiban" && v.direction === "keluar" ? v.plan_id || null : null, notes: v.notes?.trim() || null };
          const res = edit === "new" ? await supabase.from("cash_needs").insert({ ...payload, organization_id: orgId }) : await supabase.from("cash_needs").update(payload).eq("id", (edit as CashNeed).id);
          if (res.error) return res.error;
          toast.success("Kebutuhan kas disimpan", { description: "Kesehatan keuangan dihitung ulang." });
          setEdit(null);
          await run(async () => ({ data: true }));
          return null;
        }}
      />
      <ConfirmDialog
        open={Boolean(cancel)}
        onOpenChange={(v) => !v && setCancel(null)}
        title={`Batalkan ${cancel?.name}?`}
        description="Kebutuhan yang dibatalkan tidak lagi dihitung, tetapi tetap tersimpan sebagai riwayat."
        confirmLabel="Batalkan kebutuhan"
        tone="danger"
        pending={pending}
        onConfirm={() => run(() => supabase.from("cash_needs").update({ status: "dibatalkan" }).eq("id", cancel!.id), { success: "Kebutuhan dibatalkan", onSuccess: () => setCancel(null) })}
      />
    </>
  );
}
