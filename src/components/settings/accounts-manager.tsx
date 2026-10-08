"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL, CASH_KIND_LABEL } from "@/lib/labels";
import type { Account } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormDialog, type FieldDef } from "@/components/app/form-dialog";
import { useAction } from "@/components/app/hooks";
import { Money } from "@/components/app/money";
import { EmptyState } from "@/components/app/states";

function nextCode(accounts: Account[], prefix: string, step: number): string {
  const nums = accounts.filter((a) => a.code.startsWith(prefix)).map((a) => Number(a.code.slice(prefix.length))).filter(Number.isFinite);
  const next = (nums.length ? Math.max(...nums) : 1000) + step;
  return `${prefix}${next}`;
}

export function AccountsManager({
  orgId, accounts, mode, canWrite, balances = {}, lastReconciled = {}, used = [],
}: {
  orgId: string;
  accounts: Account[];
  mode: "rekening" | "akun";
  canWrite: boolean;
  balances?: Record<string, number>;
  lastReconciled?: Record<string, string>;
  used?: string[];
}) {
  const supabase = createClient();
  const { run, pending } = useAction();
  const [edit, setEdit] = React.useState<Account | "new" | null>(null);
  const [remove, setRemove] = React.useState<Account | null>(null);
  const rows = mode === "rekening" ? accounts.filter((a) => a.is_cash) : accounts;
  const isCash = mode === "rekening";

  const fields: FieldDef[] = isCash
    ? [
        { name: "name", label: "Nama rekening atau kas", required: true, placeholder: "Misalnya: Bank BSI PC IPNU" },
        { name: "cash_kind", label: "Jenis", type: "select", required: true, half: true, options: Object.entries(CASH_KIND_LABEL).map(([value, label]) => ({ value, label })) },
        { name: "code", label: "Kode akun", required: true, half: true, help: "Dipakai di buku besar.", disabled: (v) => Boolean(v.system_key) },
        { name: "bank_name", label: "Nama bank atau penyedia", half: true, hidden: (v) => v.cash_kind === "tunai" },
        { name: "account_number", label: "Nomor rekening", half: true, hidden: (v) => v.cash_kind === "tunai" },
        { name: "account_holder", label: "Atas nama", hidden: (v) => v.cash_kind === "tunai" },
        { name: "is_active", label: "Aktif", type: "checkbox", help: "Rekening nonaktif tidak dapat dipilih untuk transaksi baru, tetapi riwayatnya tetap ada." },
      ]
    : [
        { name: "code", label: "Kode akun", required: true, half: true, placeholder: "5-1900", disabled: (v) => Boolean(v.system_key) },
        { name: "type", label: "Jenis akun", type: "select", required: true, half: true, options: Object.entries(ACCOUNT_TYPE_LABEL).map(([value, label]) => ({ value, label })), disabled: (v) => Boolean(v.locked) },
        { name: "name", label: "Nama akun", required: true },
        { name: "description", label: "Keterangan", type: "textarea" },
        { name: "is_active", label: "Aktif", type: "checkbox", disabled: (v) => Boolean(v.system_key) },
      ];

  const total = rows.reduce((t, a) => t + (balances[a.id] ?? 0), 0);

  return (
    <>
      <div className="mb-4 flex justify-end">
        {canWrite && <Button variant="primary" onClick={() => setEdit("new")}><Plus aria-hidden />{isCash ? "Tambah Rekening" : "Tambah Akun"}</Button>}
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Belum ada rekening" description="Tambahkan kas tunai atau rekening bank tempat uang organisasi disimpan." />
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Kode</TH><TH>Nama</TH><TH>Jenis</TH>
                {isCash && <><TH>Rincian</TH><TH className="text-right">Saldo aplikasi</TH><TH>Cocokkan Kas terakhir</TH></>}
                <TH>Status</TH><TH />
              </TR>
            </THead>
            <TBody>
              {rows.map((a) => (
                <TR key={a.id} className={a.is_active ? "" : "text-muted"}>
                  <TD className="tnum whitespace-nowrap">{a.code}</TD>
                  <TD className="font-medium">{a.name}{a.system_key && <Badge className="ml-2">Sistem</Badge>}{!isCash && a.is_cash && <Badge tone="info" className="ml-2">Rekening</Badge>}</TD>
                  <TD className="whitespace-nowrap">{isCash ? CASH_KIND_LABEL[a.cash_kind!] : ACCOUNT_TYPE_LABEL[a.type]}</TD>
                  {isCash && (
                    <>
                      <TD className="text-muted">{[a.bank_name, a.account_number, a.account_holder && `a.n. ${a.account_holder}`].filter(Boolean).join(" · ") || "-"}</TD>
                      <TD className="num"><Money value={balances[a.id] ?? 0} tone="auto" /></TD>
                      <TD className="whitespace-nowrap">{lastReconciled[a.id] ? formatDate(lastReconciled[a.id]) : <span className="text-warn">Belum pernah</span>}</TD>
                    </>
                  )}
                  <TD>{a.is_active ? <Badge tone="ok">Aktif</Badge> : <Badge>Nonaktif</Badge>}</TD>
                  <TD className="text-right whitespace-nowrap">
                    {canWrite && (isCash || !a.is_cash) && (
                      <>
                        <Button size="iconSm" variant="ghost" aria-label={`Ubah ${a.name}`} onClick={() => setEdit(a)}><Pencil aria-hidden /></Button>
                        {!a.system_key && !used.includes(a.id) && <Button size="iconSm" variant="ghost" aria-label={`Hapus ${a.name}`} onClick={() => setRemove(a)}><Trash2 aria-hidden /></Button>}
                      </>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
            {isCash && (
              <TFoot><TR className="hover:bg-transparent"><TD colSpan={4}>Jumlah saldo buku (semua dana)</TD><TD className="num"><Money value={total} /></TD><TD colSpan={3} /></TR></TFoot>
            )}
          </Table>
        )}
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">
          {isCash
            ? <>Saldo ini dihitung dari catatan aplikasi. Cocokkan dengan uang atau rekening koran lewat <Link href="/kas/rekonsiliasi" className="font-medium text-accent underline underline-offset-2">Cocokkan Kas</Link>. </>
            : "Rekening dan kas dikelola di halaman Rekening dan kas. Akun yang sudah memiliki jurnal tidak dapat diubah jenisnya atau dihapus; nonaktifkan bila tidak dipakai lagi."}
        </p>
      </Card>

      <FormDialog
        open={Boolean(edit)}
        onOpenChange={(v) => !v && setEdit(null)}
        title={edit === "new" ? (isCash ? "Tambah rekening atau kas" : "Tambah akun") : `Ubah ${(edit as Account | null)?.name ?? ""}`}
        fields={fields}
        initial={edit === "new" || !edit ? { is_active: true, cash_kind: "bank", code: isCash ? nextCode(accounts, "1-", 100) : "", type: "beban" } : { ...edit, locked: used.includes(edit.id) || Boolean(edit.system_key) }}
        onSubmit={async (v) => {
          const payload = isCash
            ? { name: v.name.trim(), code: v.code.trim(), type: "aset", is_cash: true, cash_kind: v.cash_kind, bank_name: v.cash_kind === "tunai" ? null : v.bank_name?.trim() || null, account_number: v.cash_kind === "tunai" ? null : v.account_number?.trim() || null, account_holder: v.cash_kind === "tunai" ? null : v.account_holder?.trim() || null, is_active: Boolean(v.is_active) }
            : { name: v.name.trim(), code: v.code.trim(), type: v.type, description: v.description?.trim() || null, is_active: Boolean(v.is_active) };
          const res = edit === "new"
            ? await supabase.from("accounts").insert({ ...payload, organization_id: orgId })
            : await supabase.from("accounts").update(payload).eq("id", (edit as Account).id);
          if (res.error) return res.error.code === "23505" ? { message: `Kode akun ${v.code} sudah dipakai.`, hint: "Gunakan kode lain." } : res.error;
          toast.success(edit === "new" ? "Tersimpan" : "Perubahan disimpan");
          setEdit(null);
          await run(async () => ({ data: true }));
          return null;
        }}
      />
      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(v) => !v && setRemove(null)}
        title={`Hapus ${remove?.name}?`}
        description="Hanya akun yang belum pernah dipakai yang dapat dihapus."
        confirmLabel="Hapus"
        tone="danger"
        pending={pending}
        onConfirm={() => run(() => supabase.from("accounts").delete().eq("id", remove!.id), { success: "Akun dihapus", onSuccess: () => setRemove(null) })}
      />
    </>
  );
}
