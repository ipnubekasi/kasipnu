"use client";

import * as React from "react";
import { Pencil, Plus, Trash2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatNumber } from "@/lib/format";
import type { BudgetItem, Category } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormDialog, type FieldDef } from "@/components/app/form-dialog";
import { useAction } from "@/components/app/hooks";
import { Money } from "@/components/app/money";
import { EmptyState } from "@/components/app/states";

export function BudgetEditor({ orgId, budgetId, items, categories, canWrite }: { orgId: string; budgetId: string; items: BudgetItem[]; categories: Category[]; canWrite: boolean }) {
  const supabase = createClient();
  const { run, pending } = useAction();
  const [edit, setEdit] = React.useState<BudgetItem | { kind: "pemasukan" | "pengeluaran" } | null>(null);
  const [remove, setRemove] = React.useState<BudgetItem | null>(null);
  const isNew = edit && !("id" in edit);
  const kind = edit?.kind ?? "pengeluaran";
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name;

  const fields: FieldDef[] = [
    { name: "name", label: kind === "pengeluaran" ? "Nama pos" : "Sumber dana", required: true, placeholder: kind === "pengeluaran" ? "Misalnya: Konsumsi peserta" : "Misalnya: Sponsor" },
    { name: "category_id", label: "Kategori", type: "select", placeholder: "Tanpa kategori", help: kind === "pengeluaran" ? "Realisasi dibandingkan dengan anggaran per kategori." : undefined, options: categories.filter((c) => c.kind === kind && c.is_active && !c.system_key).map((c) => ({ value: c.id, label: c.name })) },
    { name: "quantity", label: "Jumlah", type: "number", half: true, required: true, validate: (v) => (Number(String(v).replace(",", ".")) > 0 ? null : "Isi angka lebih besar dari nol.") },
    { name: "unit", label: "Satuan", half: true, placeholder: "orang, paket, hari" },
    { name: "unit_price", label: "Harga satuan", type: "money", required: true },
    { name: "notes", label: "Catatan", type: "textarea" },
  ];

  return (
    <div className="space-y-5">
      {(["pemasukan", "pengeluaran"] as const).map((k) => {
        const rows = items.filter((i) => i.kind === k);
        const total = rows.reduce((t, r) => t + Number(r.amount), 0);
        return (
          <Card key={k}>
            <CardHeader>
              <CardTitle>{k === "pemasukan" ? "Rencana pemasukan" : "RAB per pos pengeluaran"}</CardTitle>
              {canWrite && <Button size="sm" variant={k === "pengeluaran" ? "primary" : "secondary"} onClick={() => setEdit({ kind: k })}><Plus aria-hidden />Tambah pos</Button>}
            </CardHeader>
            {rows.length === 0 ? (
              <EmptyState className="py-8" title={k === "pemasukan" ? "Rencana pemasukan belum diisi" : "RAB belum diisi"} description={k === "pemasukan" ? "Tuliskan dari mana dana program direncanakan berasal: alokasi Kas Umum, sponsor, kontribusi peserta." : "Tambahkan pos pengeluaran agar realisasi dapat dibandingkan dengan anggaran."} />
            ) : (
              <Table>
                <THead><TR className="hover:bg-transparent"><TH>Pos</TH><TH>Kategori</TH><TH className="text-right">Jumlah</TH><TH className="text-right">Harga satuan</TH><TH className="text-right">Anggaran</TH>{canWrite && <TH />}</TR></THead>
                <TBody>
                  {rows.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-medium">{r.name}{r.notes && <span className="block text-[12px] font-normal text-muted">{r.notes}</span>}</TD>
                      <TD>{catName(r.category_id) ?? <span className="text-muted">Tanpa kategori</span>}</TD>
                      <TD className="num">{formatNumber(Number(r.quantity))} {r.unit ?? ""}</TD>
                      <TD className="num"><Money value={r.unit_price} /></TD>
                      <TD className="num font-medium"><Money value={r.amount} /></TD>
                      {canWrite && (
                        <TD className="text-right whitespace-nowrap">
                          <Button size="iconSm" variant="ghost" aria-label={`Ubah ${r.name}`} onClick={() => setEdit(r)}><Pencil aria-hidden /></Button>
                          <Button size="iconSm" variant="ghost" aria-label={`Hapus ${r.name}`} onClick={() => setRemove(r)}><Trash2 aria-hidden /></Button>
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
                <TFoot><TR className="hover:bg-transparent"><TD colSpan={4}>Jumlah {k === "pemasukan" ? "rencana pemasukan" : "anggaran pengeluaran"}</TD><TD className="num"><Money value={total} /></TD>{canWrite && <TD />}</TR></TFoot>
              </Table>
            )}
          </Card>
        );
      })}

      <FormDialog
        open={Boolean(edit)}
        onOpenChange={(v) => !v && setEdit(null)}
        title={isNew ? (kind === "pengeluaran" ? "Tambah pos pengeluaran" : "Tambah rencana pemasukan") : "Ubah pos anggaran"}
        fields={fields}
        initial={isNew ? { quantity: "1", unit_price: null } : { ...(edit as BudgetItem), quantity: String((edit as BudgetItem | null)?.quantity ?? 1), category_id: (edit as BudgetItem | null)?.category_id ?? "" }}
        onSubmit={async (v) => {
          const qty = Number(String(v.quantity).replace(",", "."));
          const price = Number(v.unit_price) || 0;
          const payload = { name: v.name.trim(), category_id: v.category_id || null, quantity: qty, unit: v.unit?.trim() || null, unit_price: price, amount: Math.round(qty * price), notes: v.notes?.trim() || null };
          const res = isNew
            ? await supabase.from("budget_items").insert({ ...payload, kind, budget_id: budgetId, organization_id: orgId, sort_order: items.filter((i) => i.kind === kind).length + 1 })
            : await supabase.from("budget_items").update(payload).eq("id", (edit as BudgetItem).id);
          if (res.error) return res.error;
          toast.success("Pos anggaran disimpan");
          setEdit(null);
          await run(async () => ({ data: true }));
          return null;
        }}
      />
      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(v) => !v && setRemove(null)}
        title={`Hapus pos ${remove?.name}?`}
        description="Pos anggaran dihapus dari RAB. Transaksi yang sudah dicatat tidak berubah."
        confirmLabel="Hapus pos"
        tone="danger"
        pending={pending}
        onConfirm={() => run(() => supabase.from("budget_items").delete().eq("id", remove!.id), { success: "Pos dihapus", onSuccess: () => setRemove(null) })}
      />
    </div>
  );
}
