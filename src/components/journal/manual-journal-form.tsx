"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { friendlyError, type FriendlyError } from "@/lib/errors";
import { todayJakarta } from "@/lib/format";
import type { Account, Entry, Fund } from "@/lib/types";
import { uuid } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, fieldAria } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { useUnsavedWarning } from "@/components/app/hooks";
import { Money } from "@/components/app/money";

type Line = { key: string; account_id: string; fund_id: string; debit: number | null; credit: number | null; memo: string };

export function ManualJournalForm({ orgId, accounts, funds, entry }: { orgId: string; accounts: Account[]; funds: Fund[]; entry?: Entry | null }) {
  const router = useRouter();
  const general = funds.find((f) => f.kind === "umum")!;
  const blank = (): Line => ({ key: uuid(), account_id: "", fund_id: general.id, debit: null, credit: null, memo: "" });
  const [date, setDate] = React.useState(entry?.entry_date ?? todayJakarta());
  const [description, setDescription] = React.useState(entry?.description ?? "");
  const [notes, setNotes] = React.useState(entry?.notes ?? "");
  const [lines, setLines] = React.useState<Line[]>(entry?.manual_lines?.map((l) => ({ key: uuid(), account_id: l.account_id, fund_id: l.fund_id, debit: Number(l.debit) || null, credit: Number(l.credit) || null, memo: l.memo ?? "" })) ?? [blank(), blank()]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<FriendlyError | null>(null);
  const [pending, setPending] = React.useState<null | "draft" | "post">(null);
  const [dirty, setDirty] = React.useState(false);
  const key = React.useRef(uuid());
  useUnsavedWarning(dirty);

  const update = (i: number, patch: Partial<Line>) => { setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l))); setDirty(true); };
  const totalD = lines.reduce((t, l) => t + (l.debit ?? 0), 0);
  const totalK = lines.reduce((t, l) => t + (l.credit ?? 0), 0);
  const perFund = funds.map((f) => ({ f, d: lines.filter((l) => l.fund_id === f.id).reduce((t, l) => t + (l.debit ?? 0), 0), k: lines.filter((l) => l.fund_id === f.id).reduce((t, l) => t + (l.credit ?? 0), 0) })).filter((x) => x.d || x.k);
  const unbalanced = perFund.filter((x) => x.d !== x.k);
  const touchesCash = lines.some((l) => accounts.find((a) => a.id === l.account_id)?.is_cash);

  async function submit(action: "draft" | "post") {
    const er: Record<string, string> = {};
    if (!date) er.date = "Tanggal wajib diisi.";
    else if (action === "post" && date > todayJakarta()) er.date = "Tanggal tidak boleh melebihi hari ini.";
    if (description.trim().length < 3) er.description = "Uraian wajib diisi.";
    lines.forEach((l, i) => {
      if (!l.account_id) er[`a${i}`] = "Pilih akun.";
      if (!!l.debit === !!l.credit) er[`v${i}`] = "Isi debit atau kredit, salah satu saja.";
    });
    if (lines.length < 2) er.lines = "Minimal dua baris.";
    if (unbalanced.length) er.lines = `Belum seimbang pada dana ${unbalanced.map((x) => x.f.name).join(", ")}.`;
    setErrors(er);
    if (Object.keys(er).length) return;
    setPending(action);
    setFormError(null);
    const supabase = createClient();
    const payload = { kind: "penyesuaian", entry_date: date, description: description.trim(), notes: notes.trim(), lines: lines.map((l) => ({ account_id: l.account_id, fund_id: l.fund_id, debit: l.debit ?? 0, credit: l.credit ?? 0, memo: l.memo.trim() || null })) };
    const res = action === "post"
      ? await supabase.rpc("save_and_post", { p_org: orgId, p_payload: payload, p_entry_id: entry?.id ?? null, p_idempotency_key: entry ? null : key.current })
      : await supabase.rpc("save_draft", { p_org: orgId, p_payload: payload, p_entry_id: entry?.id ?? null, p_idempotency_key: entry ? null : key.current });
    setPending(null);
    if (res.error) return setFormError(friendlyError(res.error));
    setDirty(false);
    const id = action === "post" ? res.data.id : res.data;
    toast.success(action === "post" ? `${res.data.ref_no} dibukukan` : "Draft jurnal tersimpan");
    router.push(`/kas/${id}`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {formError && <Alert tone="danger" title={formError.message}>{formError.hint}</Alert>}
      <Alert tone="info">
        Gunakan jurnal penyesuaian hanya untuk koreksi yang tidak dapat dicatat lewat formulir transaksi, misalnya pengakuan utang. Untuk selisih kas hasil rekonsiliasi, catat sebagai pemasukan atau pengeluaran kategori Selisih kas agar tetap tercermin di laporan arus kas.
      </Alert>
      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
            <Field label="Tanggal" htmlFor="mj-date" required error={errors.date}><Input {...fieldAria("mj-date", errors.date)} type="date" value={date} onChange={(e) => { setDate(e.target.value); setDirty(true); }} /></Field>
            <Field label="Uraian" htmlFor="mj-desc" required error={errors.description}><Input {...fieldAria("mj-desc", errors.description)} value={description} maxLength={200} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} /></Field>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-[12px] text-muted uppercase">
                <tr><th className="pb-2 font-medium">Akun</th><th className="pb-2 font-medium">Dana</th><th className="pb-2 text-right font-medium">Debit</th><th className="pb-2 text-right font-medium">Kredit</th><th className="pb-2 font-medium">Keterangan</th><th /></tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.key} className="align-top">
                    <td className="pr-2 pb-2">
                      <Select aria-label={`Akun baris ${i + 1}`} aria-invalid={errors[`a${i}`] ? true : undefined} value={l.account_id} onChange={(e) => update(i, { account_id: e.target.value })}>
                        <option value="">Pilih akun</option>
                        {accounts.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                      </Select>
                      {errors[`a${i}`] && <p className="mt-1 text-[12px] text-danger">{errors[`a${i}`]}</p>}
                    </td>
                    <td className="pr-2 pb-2 w-48">
                      <Select aria-label={`Dana baris ${i + 1}`} value={l.fund_id} onChange={(e) => update(i, { fund_id: e.target.value })}>
                        {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </Select>
                    </td>
                    <td className="pr-2 pb-2 w-40"><MoneyInput aria-label={`Debit baris ${i + 1}`} value={l.debit} onChange={(v) => update(i, { debit: v, credit: v ? null : l.credit })} /></td>
                    <td className="pr-2 pb-2 w-40">
                      <MoneyInput aria-label={`Kredit baris ${i + 1}`} value={l.credit} onChange={(v) => update(i, { credit: v, debit: v ? null : l.debit })} />
                      {errors[`v${i}`] && <p className="mt-1 text-[12px] text-danger">{errors[`v${i}`]}</p>}
                    </td>
                    <td className="pr-2 pb-2"><Input aria-label={`Keterangan baris ${i + 1}`} value={l.memo} onChange={(e) => update(i, { memo: e.target.value })} /></td>
                    <td className="pb-2"><Button size="icon" variant="ghost" aria-label={`Hapus baris ${i + 1}`} disabled={lines.length <= 2} onClick={() => { setLines(lines.filter((_, j) => j !== i)); setDirty(true); }}><Trash2 aria-hidden /></Button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-medium">
                  <td className="pt-2" colSpan={2}><Button size="sm" onClick={() => { setLines([...lines, blank()]); setDirty(true); }}><Plus aria-hidden />Tambah baris</Button></td>
                  <td className="num pt-2 pr-3"><Money value={totalD} /></td>
                  <td className="num pt-2 pr-3"><Money value={totalK} /></td>
                  <td colSpan={2} className="pt-2 text-[13px]">{unbalanced.length === 0 && totalD > 0 ? <span className="text-accent">Seimbang pada setiap dana</span> : <span className="text-warn">Belum seimbang</span>}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {errors.lines && <p role="alert" className="text-[13px] text-danger">{errors.lines}</p>}
          {!touchesCash && totalD > 0 && <p className="text-[13px] text-muted">Jurnal ini tidak menyentuh akun kas, sehingga ditandai nonkas dan tidak masuk laporan arus kas.</p>}
          <Field label="Catatan" htmlFor="mj-notes"><Input id="mj-notes" value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} /></Field>
        </CardContent>
      </Card>
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="ghost"><Link href="/jurnal">Batal</Link></Button>
        <Button loading={pending === "draft"} disabled={pending === "post"} onClick={() => submit("draft")}>Simpan sebagai Draft</Button>
        <Button variant="primary" loading={pending === "post"} disabled={pending === "draft"} onClick={() => submit("post")}>Simpan dan Bukukan</Button>
      </div>
    </div>
  );
}
