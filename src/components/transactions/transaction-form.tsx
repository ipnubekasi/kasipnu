"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Info, TriangleAlert } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { uploadAttachment } from "@/lib/attachments";
import { friendlyError, type FriendlyError } from "@/lib/errors";
import { formatDate, formatRupiah, isValidDate, todayJakarta } from "@/lib/format";
import { cn, uuid } from "@/lib/utils";
import type { Account, Category, Entry, Fund, Program } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, fieldAria } from "@/components/ui/field";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { useUnsavedWarning } from "@/components/app/hooks";
import { Money } from "@/components/app/money";
import { AttachmentPicker } from "./attachment-picker";

type Kind = "pemasukan" | "pengeluaran" | "transfer" | "saldo_awal";
type TransferMode = "rekening" | "dana" | "keduanya";
type Position = { account_id: string; fund_id: string; balance: number };

export type TransactionDefaults = {
  kind?: Kind;
  fundId?: string;
  toFundId?: string;
  amount?: number;
  description?: string;
  needId?: string;
  needName?: string;
  categoryId?: string;
  accountId?: string;
};

type Props = {
  orgId: string;
  accounts: Account[];
  funds: Fund[];
  programs: Program[];
  categories: Category[];
  positions: Position[];
  maxMb: number;
  entry?: Entry | null;
  existingAttachments?: number;
  defaults?: TransactionDefaults;
  returnTo: string;
};

const KINDS: { key: Kind; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { key: "pemasukan", label: "Pemasukan", icon: ArrowDownLeft, hint: "Uang diterima dari pihak luar" },
  { key: "pengeluaran", label: "Pengeluaran", icon: ArrowUpRight, hint: "Uang dibayarkan ke pihak luar" },
  { key: "transfer", label: "Transfer", icon: ArrowLeftRight, hint: "Pindah antarrekening atau antardana" },
];

export function TransactionForm({ orgId, accounts, funds, programs, categories, positions, maxMb, entry, existingAttachments = 0, defaults, returnTo }: Props) {
  const router = useRouter();
  const today = todayJakarta();
  const general = funds.find((f) => f.kind === "umum")!;
  const usablePrograms = programs.filter((p) => p.status !== "diarsipkan" || p.fund_id === entry?.fund_id || p.fund_id === entry?.to_fund_id);
  const cashAccounts = accounts.filter((a) => a.is_cash && (a.is_active || a.id === entry?.account_id || a.id === entry?.to_account_id));
  const fundOptions = [general, ...usablePrograms.map((p) => funds.find((f) => f.id === p.fund_id)!).filter(Boolean)];
  const fundName = (id: string | null) => funds.find((f) => f.id === id)?.name ?? "";
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "";

  const initialKind = (entry?.kind as Kind | undefined) ?? defaults?.kind ?? "pengeluaran";
  const initialMode: TransferMode = entry?.kind === "transfer"
    ? entry.fund_id === entry.to_fund_id ? "rekening" : entry.account_id === entry.to_account_id ? "dana" : "keduanya"
    : defaults?.toFundId || (defaults?.kind === "transfer" && defaults.fundId) ? "dana" : "rekening";

  const [kind, setKind] = React.useState<Kind>(initialKind);
  const [date, setDate] = React.useState(entry?.entry_date ?? today);
  const [fundId, setFundId] = React.useState(entry?.fund_id ?? defaults?.fundId ?? general.id);
  const [accountId, setAccountId] = React.useState(entry?.account_id ?? defaults?.accountId ?? (cashAccounts.length === 1 ? cashAccounts[0].id : ""));
  const [categoryId, setCategoryId] = React.useState(entry?.category_id ?? defaults?.categoryId ?? "");
  const [amount, setAmount] = React.useState<number | null>(entry?.amount ?? defaults?.amount ?? null);
  const [counterparty, setCounterparty] = React.useState(entry?.counterparty ?? "");
  const [description, setDescription] = React.useState(entry?.description ?? defaults?.description ?? "");
  const [notes, setNotes] = React.useState(entry?.notes ?? "");
  const [oneOff, setOneOff] = React.useState(entry?.is_one_off ?? false);
  const [mode, setMode] = React.useState<TransferMode>(initialMode);
  const [toFundId, setToFundId] = React.useState(entry?.to_fund_id ?? defaults?.toFundId ?? "");
  const [toAccountId, setToAccountId] = React.useState(entry?.to_account_id ?? "");
  const [files, setFiles] = React.useState<File[]>([]);
  const [noEvidence, setNoEvidence] = React.useState(entry?.evidence_status === "tidak_tersedia");
  const [evidenceReason, setEvidenceReason] = React.useState(entry?.evidence_reason ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<FriendlyError | null>(null);
  const [pending, setPending] = React.useState<null | "draft" | "post">(null);
  const [dirty, setDirty] = React.useState(false);
  const idem = React.useRef(uuid());

  useUnsavedWarning(dirty);
  const touch = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  const fundIsProgram = fundId !== general.id;
  const catOptions = categories.filter((c) => c.kind === kind && (c.is_active || c.id === entry?.category_id));

  // Sumber dan tujuan transfer sesuai jenisnya.
  const tFromFund = fundId;
  const tToFund = mode === "rekening" ? fundId : toFundId;
  const tFromAccount = accountId;
  const tToAccount = mode === "dana" ? accountId : toAccountId;

  // Preview dampak terhadap saldo (berdasarkan saldo buku saat ini).
  const fundBalance = (id: string) => positions.filter((p) => p.fund_id === id).reduce((t, p) => t + Number(p.balance), 0);
  const accountBalance = (id: string) => positions.filter((p) => p.account_id === id).reduce((t, p) => t + Number(p.balance), 0);
  const totalBalance = positions.reduce((t, p) => t + Number(p.balance), 0);
  const amt = amount ?? 0;
  const impacts: { label: string; before: number; after: number; kind: "dana" | "rekening" | "gabungan" }[] = [];
  if (amt > 0) {
    if (kind === "transfer") {
      if (tFromFund && tToFund && tFromFund !== tToFund) {
        impacts.push({ label: `Dana ${fundName(tFromFund)}`, before: fundBalance(tFromFund), after: fundBalance(tFromFund) - amt, kind: "dana" });
        impacts.push({ label: `Dana ${fundName(tToFund)}`, before: fundBalance(tToFund), after: fundBalance(tToFund) + amt, kind: "dana" });
      }
      if (tFromAccount && tToAccount && tFromAccount !== tToAccount) {
        impacts.push({ label: accountName(tFromAccount), before: accountBalance(tFromAccount), after: accountBalance(tFromAccount) - amt, kind: "rekening" });
        impacts.push({ label: accountName(tToAccount), before: accountBalance(tToAccount), after: accountBalance(tToAccount) + amt, kind: "rekening" });
      }
      if (impacts.length) impacts.push({ label: "Saldo gabungan organisasi", before: totalBalance, after: totalBalance, kind: "gabungan" });
    } else {
      const sign = kind === "pengeluaran" ? -1 : 1;
      if (fundId) impacts.push({ label: `Dana ${fundName(fundId)}`, before: fundBalance(fundId), after: fundBalance(fundId) + sign * amt, kind: "dana" });
      if (accountId) impacts.push({ label: accountName(accountId), before: accountBalance(accountId), after: accountBalance(accountId) + sign * amt, kind: "rekening" });
      if (fundId || accountId) impacts.push({ label: "Saldo gabungan organisasi", before: totalBalance, after: totalBalance + sign * amt, kind: "gabungan" });
    }
  }
  const goesNegative = impacts.some((i) => i.after < 0 && i.after < i.before);

  function validate(forPost: boolean): Record<string, string> {
    const e: Record<string, string> = {};
    if (!isValidDate(date)) e.date = "Tanggal transaksi wajib diisi.";
    else if (forPost && date > today) e.date = "Tanggal tidak boleh melebihi hari ini. Simpan sebagai draft bila transaksi belum terjadi.";
    if (!amount || amount <= 0) e.amount = "Nominal harus lebih besar dari nol.";
    if (noEvidence && files.length === 0 && !evidenceReason.trim()) e.evidenceReason = "Tuliskan alasan mengapa bukti tidak tersedia.";
    if (!forPost) return e;
    if (description.trim().length < 3) e.description = "Uraian wajib diisi, minimal 3 huruf.";
    if (kind === "transfer") {
      if (!tFromFund) e.fund = "Pilih dana asal.";
      if (!tFromAccount) e.account = mode === "dana" ? "Pilih rekening tempat uang berada." : "Pilih rekening asal.";
      if (mode !== "rekening" && !toFundId) e.toFund = "Pilih dana tujuan.";
      if (mode !== "dana" && !toAccountId) e.toAccount = "Pilih rekening tujuan.";
      if (!e.toFund && mode !== "rekening" && toFundId === fundId) e.toFund = "Dana tujuan harus berbeda dari dana asal.";
      if (!e.toAccount && mode !== "dana" && toAccountId === accountId) e.toAccount = "Rekening tujuan harus berbeda dari rekening asal.";
    } else {
      if (!fundId) e.fund = "Pilih dana atau program.";
      if (!accountId) e.account = "Pilih rekening atau kas.";
      if (kind !== "saldo_awal" && !categoryId) e.category = "Pilih kategori.";
    }
    return e;
  }

  async function submit(action: "draft" | "post") {
    if (pending) return;
    const e = validate(action === "post");
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) {
      const first = Object.keys(e)[0];
      document.getElementById(first === "evidenceReason" ? "evidenceReason" : first)?.focus();
      return;
    }
    setPending(action);
    const supabase = createClient();
    const payload = {
      kind,
      entry_date: date,
      amount,
      fund_id: (kind === "transfer" ? tFromFund : fundId) || null,
      account_id: (kind === "transfer" ? tFromAccount : accountId) || null,
      category_id: kind === "pemasukan" || kind === "pengeluaran" ? categoryId || null : null,
      to_fund_id: kind === "transfer" ? tToFund || null : null,
      to_account_id: kind === "transfer" ? tToAccount || null : null,
      description: description.trim(),
      counterparty: counterparty.trim(),
      notes: notes.trim(),
      is_one_off: kind === "pengeluaran" ? oneOff : false,
      evidence_status: noEvidence && files.length === 0 ? "tidak_tersedia" : "belum_ada",
      evidence_reason: noEvidence && files.length === 0 ? evidenceReason.trim() : null,
      need_id: entry?.need_id ?? defaults?.needId ?? null,
    };

    try {
      let id: string;
      let ref: string | null = null;
      if (action === "post") {
        const { data, error } = await supabase.rpc("save_and_post", { p_org: orgId, p_payload: payload, p_entry_id: entry?.id ?? null, p_idempotency_key: entry ? null : idem.current });
        if (error) {
          // Bila pembukuan ditolak (misalnya periode tertutup), isian tetap ada di formulir.
          setFormError(friendlyError(error));
          return;
        }
        id = data.id;
        ref = data.ref_no;
      } else {
        const { data, error } = await supabase.rpc("save_draft", { p_org: orgId, p_payload: payload, p_entry_id: entry?.id ?? null, p_idempotency_key: entry ? null : idem.current });
        if (error) {
          setFormError(friendlyError(error));
          return;
        }
        id = data as string;
      }

      let failed = 0;
      for (const file of files) {
        const res = await uploadAttachment(supabase, { orgId, kind: "bukti", entryId: id, file });
        if (res.error) {
          failed += 1;
          toast.error(res.error.message, { description: res.error.hint ?? undefined });
        }
      }

      setDirty(false);
      if (failed > 0) {
        toast.warning(`Transaksi tersimpan, tetapi ${failed} bukti gagal diunggah.`, { description: "Unggah ulang dari halaman detail transaksi." });
      } else {
        toast.success(action === "post" ? `${ref} dibukukan` : "Draft tersimpan", {
          description: action === "post" ? `${formatRupiah(amount)} · ${description.trim()}` : "Draft belum memengaruhi saldo. Bukukan setelah diperiksa.",
        });
      }
      router.push(`/kas/${id}${returnTo && returnTo !== "/kas" ? `?kembali=${encodeURIComponent(returnTo)}` : ""}`);
      router.refresh();
    } catch (err) {
      setFormError(friendlyError(err as Error));
    } finally {
      setPending(null);
    }
  }

  const isEdit = Boolean(entry);
  const showKindPicker = kind !== "saldo_awal";

  return (
    <form
      noValidate
      onSubmit={(e) => { e.preventDefault(); void submit("post"); }}
      className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="space-y-5">
        {formError && <Alert tone="danger" title={formError.message}>{formError.hint}</Alert>}
        {defaults?.needName && !isEdit && (
          <Alert tone="info" title={`${kind === "pemasukan" ? "Penerimaan untuk rencana" : "Pembayaran untuk kebutuhan"}: ${defaults.needName}`}>
            Setelah dibukukan, kebutuhan ini otomatis ditandai selesai dan terhubung ke transaksi ini sehingga tidak dihitung dua kali.
          </Alert>
        )}
        {entry?.replaces_id && (
          <Alert tone="info" title="Transaksi pengganti">
            Draft ini menggantikan transaksi yang sudah dibalik. Perbaiki isiannya, lalu bukukan.{" "}
            <Link href={`/kas/${entry.replaces_id}`} className="font-medium text-accent underline underline-offset-2">Lihat transaksi asal</Link>
          </Alert>
        )}

        <Card>
          <CardContent className="space-y-5">
            {showKindPicker && (
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-ink">Jenis transaksi</legend>
                <div role="radiogroup" className="grid grid-cols-3 gap-2">
                  {KINDS.map((k) => {
                    const Icon = k.icon;
                    const active = kind === k.key;
                    return (
                      <button
                        key={k.key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => { setKind(k.key); setCategoryId(""); setDirty(true); setErrors({}); }}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-control border px-2 py-2.5 text-sm transition-colors sm:flex-row sm:justify-center sm:gap-2",
                          active ? "border-primary bg-accent-soft font-medium text-primary" : "border-line-strong bg-surface text-muted hover:bg-subtle",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        {k.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[13px] text-muted">{KINDS.find((k) => k.key === kind)?.hint}.{kind === "transfer" && " Transfer internal bukan pendapatan atau beban."}</p>
              </fieldset>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tanggal transaksi" htmlFor="date" required error={errors.date}>
                <Input {...fieldAria("date", errors.date)} type="date" value={date} max={undefined} onChange={(e) => touch(setDate)(e.target.value)} />
              </Field>
              <Field label="Nomor referensi" htmlFor="ref" help={entry?.ref_no ? undefined : "Diberikan otomatis saat dibukukan."}>
                <Input id="ref" value={entry?.ref_no ?? "Otomatis"} disabled readOnly />
              </Field>
            </div>

            <Field label="Nominal" htmlFor="amount" required error={errors.amount}>
              <MoneyInput {...fieldAria("amount", errors.amount)} value={amount} onChange={touch(setAmount)} className="h-12 text-lg font-semibold sm:text-lg" placeholder="0" />
            </Field>

            {kind === "transfer" ? (
              <>
                <fieldset>
                  <legend className="mb-1.5 text-sm font-medium text-ink">Yang dipindahkan</legend>
                  <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {([
                      ["rekening", "Antarrekening", "Dana tetap, tempat uang berubah. Contoh: setor tunai ke bank."],
                      ["dana", "Antardana", "Tempat uang tetap, pemilik dana berubah. Contoh: alokasi ke program."],
                      ["keduanya", "Rekening dan dana", "Keduanya berubah sekaligus."],
                    ] as const).map(([key, label, help]) => (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={mode === key}
                        onClick={() => { setMode(key); setDirty(true); setErrors({}); }}
                        className={cn(
                          "rounded-control border px-3 py-2 text-left text-sm transition-colors",
                          mode === key ? "border-primary bg-accent-soft text-primary" : "border-line-strong bg-surface text-ink hover:bg-subtle",
                        )}
                      >
                        <span className="block font-medium">{label}</span>
                        <span className="block text-[12px] text-muted">{help}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <div className="space-y-4 rounded-control border border-line p-3">
                    <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">Sumber</p>
                    <Field label={mode === "rekening" ? "Dana" : "Dana asal"} htmlFor="fund" required error={errors.fund}>
                      <Select {...fieldAria("fund", errors.fund)} value={fundId} onChange={(e) => touch(setFundId)(e.target.value)}>
                        {fundOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </Select>
                    </Field>
                    <Field label={mode === "dana" ? "Rekening tempat uang berada" : "Rekening asal"} htmlFor="account" required error={errors.account}>
                      <Select {...fieldAria("account", errors.account)} value={accountId} onChange={(e) => touch(setAccountId)(e.target.value)}>
                        <option value="">Pilih rekening</option>
                        {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <ArrowRight className="mx-auto mt-10 hidden size-5 text-faint sm:block" aria-hidden />
                  <div className="space-y-4 rounded-control border border-line p-3">
                    <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">Tujuan</p>
                    {mode === "rekening" ? (
                      <Field label="Dana" htmlFor="toFundSame"><Input id="toFundSame" value={fundName(fundId)} disabled readOnly /></Field>
                    ) : (
                      <Field label="Dana tujuan" htmlFor="toFund" required error={errors.toFund}>
                        <Select {...fieldAria("toFund", errors.toFund)} value={toFundId} onChange={(e) => touch(setToFundId)(e.target.value)}>
                          <option value="">Pilih dana</option>
                          {fundOptions.filter((f) => f.id !== fundId).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </Select>
                      </Field>
                    )}
                    {mode === "dana" ? (
                      <Field label="Rekening" htmlFor="toAccountSame" help="Uang tidak berpindah rekening."><Input id="toAccountSame" value={accountName(accountId) || "Sama dengan sumber"} disabled readOnly /></Field>
                    ) : (
                      <Field label="Rekening tujuan" htmlFor="toAccount" required error={errors.toAccount}>
                        <Select {...fieldAria("toAccount", errors.toAccount)} value={toAccountId} onChange={(e) => touch(setToAccountId)(e.target.value)}>
                          <option value="">Pilih rekening</option>
                          {cashAccounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </Select>
                      </Field>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Dana" htmlFor="fundKind" required help={fundIsProgram ? "Dana program terikat pada tujuan program." : "Dana umum yang bebas digunakan."}>
                    <Select
                      id="fundKind"
                      value={fundIsProgram ? "program" : "umum"}
                      onChange={(e) => { touch(setFundId)(e.target.value === "umum" ? general.id : ""); }}
                    >
                      <option value="umum">Kas Umum</option>
                      <option value="program" disabled={usablePrograms.length === 0}>Program{usablePrograms.length === 0 ? " (belum ada program)" : ""}</option>
                    </Select>
                  </Field>
                  {fundIsProgram && (
                    <Field label="Program" htmlFor="fund" required error={errors.fund}>
                      <Select {...fieldAria("fund", errors.fund)} value={fundId} onChange={(e) => touch(setFundId)(e.target.value)}>
                        <option value="">Pilih program</option>
                        {usablePrograms.map((p) => <option key={p.id} value={p.fund_id}>{p.name}</option>)}
                      </Select>
                    </Field>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={kind === "pengeluaran" ? "Dibayar dari" : "Diterima di"} htmlFor="account" required error={errors.account}>
                    <Select {...fieldAria("account", errors.account)} value={accountId} onChange={(e) => touch(setAccountId)(e.target.value)}>
                      <option value="">Pilih rekening atau kas</option>
                      {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                  </Field>
                  {kind !== "saldo_awal" && (
                    <Field label="Kategori" htmlFor="category" required error={errors.category}>
                      <Select {...fieldAria("category", errors.category)} value={categoryId} onChange={(e) => touch(setCategoryId)(e.target.value)}>
                        <option value="">Pilih kategori</option>
                        {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </Field>
                  )}
                </div>
                {kind !== "saldo_awal" && (
                  <Field label={kind === "pengeluaran" ? "Penerima" : "Pemberi"} htmlFor="counterparty" help={kind === "pengeluaran" ? "Toko, vendor, atau orang yang menerima uang." : "Orang atau lembaga yang memberi uang."}>
                    <Input id="counterparty" value={counterparty} onChange={(e) => touch(setCounterparty)(e.target.value)} maxLength={120} autoComplete="off" />
                  </Field>
                )}
              </>
            )}

            <Field label="Uraian" htmlFor="description" required error={errors.description} help="Singkat dan jelas, misalnya: Konsumsi rapat harian 5 Oktober.">
              <Input {...fieldAria("description", errors.description)} value={description} onChange={(e) => touch(setDescription)(e.target.value)} maxLength={200} autoComplete="off" />
            </Field>

            <Field label="Catatan tambahan" htmlFor="notes">
              <Textarea id="notes" value={notes} onChange={(e) => touch(setNotes)(e.target.value)} rows={2} maxLength={1000} />
            </Field>

            {kind === "pengeluaran" && !fundIsProgram && (
              <div className="flex items-start gap-2.5">
                <Checkbox id="oneOff" checked={oneOff} onChange={(e) => touch(setOneOff)(e.target.checked)} className="mt-0.5" />
                <div>
                  <Label htmlFor="oneOff" className="font-normal">Pengeluaran besar sekali terjadi</Label>
                  <p className="text-[13px] text-muted">Tidak dihitung dalam rata-rata biaya operasional rutin pada Kesehatan Keuangan.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bukti transaksi</CardTitle>
            {existingAttachments > 0 && <span className="text-[13px] text-muted">{existingAttachments} bukti sudah terlampir</span>}
          </CardHeader>
          <CardContent className="space-y-3">
            <AttachmentPicker files={files} onChange={(f) => { setFiles(f); setDirty(true); if (f.length) setNoEvidence(false); }} maxMb={maxMb} disabled={Boolean(pending)} />
            {existingAttachments === 0 && files.length === 0 && (
              <div className="space-y-2">
                <div className="flex items-start gap-2.5">
                  <Checkbox id="noEvidence" checked={noEvidence} onChange={(e) => touch(setNoEvidence)(e.target.checked)} className="mt-0.5" />
                  <Label htmlFor="noEvidence" className="font-normal">Bukti tidak tersedia untuk transaksi ini</Label>
                </div>
                {noEvidence && (
                  <Field label="Alasan" htmlFor="evidenceReason" required error={errors.evidenceReason}>
                    <Input {...fieldAria("evidenceReason", errors.evidenceReason)} value={evidenceReason} onChange={(e) => touch(setEvidenceReason)(e.target.value)} placeholder="Misalnya: parkir tanpa karcis" maxLength={200} />
                  </Field>
                )}
                {!noEvidence && <p className="text-[13px] text-muted">Bukti dapat diunggah nanti. Transaksi tanpa bukti akan muncul di daftar pekerjaan.</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader><CardTitle>Dampak ke saldo</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {impacts.length === 0 ? (
              <p className="flex gap-2 text-muted"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />Isi nominal, dana, dan rekening untuk melihat saldo sebelum dan sesudah transaksi dibukukan.</p>
            ) : (
              <ul className="space-y-2.5">
                {impacts.map((i) => (
                  <li key={i.label} className={cn("space-y-0.5", i.kind === "gabungan" && "border-t border-line pt-2.5")}>
                    <p className="text-[13px] text-muted">{i.label}</p>
                    <p className="flex items-center justify-between gap-2">
                      <Money value={i.before} tone="muted" />
                      <ArrowRight className="size-3.5 shrink-0 text-faint" aria-hidden />
                      <Money value={i.after} className="font-semibold" tone={i.after < 0 ? "out" : undefined} />
                    </p>
                    {i.kind === "gabungan" && i.before === i.after && <p className="text-[12px] text-muted">Transfer internal tidak mengubah saldo gabungan.</p>}
                  </li>
                ))}
              </ul>
            )}
            {goesNegative && (
              <p className="flex gap-2 rounded-control border border-warn-line bg-warn-soft p-2.5 text-[13px] text-ink">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                Saldo akan menjadi negatif. Pastikan pemasukan sebelumnya sudah dicatat, atau periksa kembali dana dan rekening yang dipilih.
              </p>
            )}
            <p className="text-[12px] text-faint">Saldo buku per {formatDate(today)}. Draft tidak mengubah saldo.</p>
          </CardContent>
        </Card>

        <div className="hidden flex-col gap-2 lg:flex">
          <Button type="submit" variant="primary" size="lg" loading={pending === "post"} disabled={pending === "draft"}>Simpan dan Bukukan</Button>
          <Button type="button" size="lg" loading={pending === "draft"} disabled={pending === "post"} onClick={() => submit("draft")}>Simpan sebagai Draft</Button>
          <Button asChild variant="ghost"><Link href={returnTo}>Batal</Link></Button>
        </div>
      </aside>

      {/* Aksi utama di bawah layar pada ponsel agar mudah dijangkau */}
      <div className="no-print fixed inset-x-0 bottom-14 z-20 flex gap-2 border-t border-line bg-surface px-4 py-3 lg:hidden">
        <Button type="button" className="flex-1" size="lg" loading={pending === "draft"} disabled={pending === "post"} onClick={() => submit("draft")}>Draft</Button>
        <Button type="submit" variant="primary" className="flex-[2]" size="lg" loading={pending === "post"} disabled={pending === "draft"}>Simpan dan Bukukan</Button>
      </div>
      <div className="h-16 lg:hidden" aria-hidden />
    </form>
  );
}
