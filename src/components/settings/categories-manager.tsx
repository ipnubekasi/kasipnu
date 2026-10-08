"use client";

import * as React from "react";
import { Pencil, Plus, Trash2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Account, Category } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormDialog, type FieldDef } from "@/components/app/form-dialog";
import { useAction } from "@/components/app/hooks";

export function CategoriesManager({ orgId, categories, accounts, canWrite, used }: { orgId: string; categories: Category[]; accounts: Account[]; canWrite: boolean; used: string[] }) {
  const supabase = createClient();
  const { run, pending } = useAction();
  const [edit, setEdit] = React.useState<Category | { kind: "pemasukan" | "pengeluaran" } | null>(null);
  const [remove, setRemove] = React.useState<Category | null>(null);
  const isNew = edit && !("id" in edit);
  const kind = edit?.kind ?? "pengeluaran";
  const accountName = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : ""; };

  const fields: FieldDef[] = [
    { name: "name", label: "Nama kategori", required: true },
    { name: "account_id", label: kind === "pemasukan" ? "Akun pendapatan" : "Akun beban", type: "select", required: true, help: "Jurnal otomatis memakai akun ini.", options: accounts.filter((a) => a.type === (kind === "pemasukan" ? "pendapatan" : "beban") && a.is_active).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })) },
    { name: "is_routine", label: "Pengeluaran operasional rutin", type: "checkbox", help: "Dihitung dalam rata-rata biaya bulanan pada Kesehatan Keuangan.", hidden: () => kind !== "pengeluaran" },
    { name: "sort_order", label: "Urutan tampil", type: "number", half: true },
    { name: "is_active", label: "Aktif", type: "checkbox" },
  ];

  return (
    <div className="space-y-5">
      {(["pemasukan", "pengeluaran"] as const).map((k) => (
        <Card key={k}>
          <CardHeader>
            <CardTitle>Kategori {k}</CardTitle>
            {canWrite && <Button size="sm" variant={k === "pengeluaran" ? "primary" : "secondary"} onClick={() => setEdit({ kind: k })}><Plus aria-hidden />Tambah</Button>}
          </CardHeader>
          <Table>
            <THead><TR className="hover:bg-transparent"><TH>Kategori</TH><TH>Akun buku besar</TH>{k === "pengeluaran" && <TH>Sifat</TH>}<TH>Status</TH><TH /></TR></THead>
            <TBody>
              {categories.filter((c) => c.kind === k).map((c) => (
                <TR key={c.id} className={c.is_active ? "" : "text-muted"}>
                  <TD className="font-medium">{c.name}{c.system_key && <Badge className="ml-2">Sistem</Badge>}</TD>
                  <TD className="tnum">{accountName(c.account_id)}</TD>
                  {k === "pengeluaran" && <TD>{c.is_routine ? <Badge tone="info">Operasional rutin</Badge> : <span className="text-muted">Tidak rutin</span>}</TD>}
                  <TD>{c.is_active ? <Badge tone="ok">Aktif</Badge> : <Badge>Nonaktif</Badge>}</TD>
                  <TD className="text-right whitespace-nowrap">
                    {canWrite && (
                      <>
                        <Button size="iconSm" variant="ghost" aria-label={`Ubah ${c.name}`} onClick={() => setEdit(c)}><Pencil aria-hidden /></Button>
                        {!c.system_key && !used.includes(c.id) && <Button size="iconSm" variant="ghost" aria-label={`Hapus ${c.name}`} onClick={() => setRemove(c)}><Trash2 aria-hidden /></Button>}
                      </>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ))}

      <FormDialog
        open={Boolean(edit)}
        onOpenChange={(v) => !v && setEdit(null)}
        title={isNew ? `Tambah kategori ${kind}` : "Ubah kategori"}
        fields={fields}
        initial={isNew ? { is_active: true, is_routine: false, sort_order: 50 } : (edit as Category) ?? {}}
        onSubmit={async (v) => {
          const payload = { name: v.name.trim(), account_id: v.account_id, is_routine: kind === "pengeluaran" ? Boolean(v.is_routine) : false, sort_order: Number(v.sort_order) || 0, is_active: Boolean(v.is_active) };
          const res = isNew
            ? await supabase.from("categories").insert({ ...payload, kind, organization_id: orgId })
            : await supabase.from("categories").update(payload).eq("id", (edit as Category).id);
          if (res.error) return res.error.code === "23505" ? { message: `Kategori "${v.name}" sudah ada.`, hint: "Gunakan nama lain." } : res.error;
          toast.success("Kategori disimpan");
          setEdit(null);
          await run(async () => ({ data: true }));
          return null;
        }}
      />
      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(v) => !v && setRemove(null)}
        title={`Hapus kategori ${remove?.name}?`}
        description="Hanya kategori yang belum pernah dipakai yang dapat dihapus. Kategori yang sudah dipakai sebaiknya dinonaktifkan."
        confirmLabel="Hapus"
        tone="danger"
        pending={pending}
        onConfirm={() => run(() => supabase.from("categories").delete().eq("id", remove!.id), { success: "Kategori dihapus", onSuccess: () => setRemove(null) })}
      />
    </div>
  );
}
