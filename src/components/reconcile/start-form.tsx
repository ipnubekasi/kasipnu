"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayJakarta } from "@/lib/format";
import type { Account } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { useAction } from "@/components/app/hooks";

export function StartReconciliation({ orgId, accounts }: { orgId: string; accounts: Account[] }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [account, setAccount] = React.useState(accounts[0]?.id ?? "");
  const [date, setDate] = React.useState(todayJakarta());
  const [balance, setBalance] = React.useState<number | null>(null);
  const [notes, setNotes] = React.useState("");
  const [errs, setErrs] = React.useState<Record<string, string>>({});
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const er: Record<string, string> = {};
        if (!account) er.account = "Pilih rekening.";
        if (!date) er.date = "Tanggal wajib diisi.";
        if (balance === null) er.balance = "Isi saldo hasil hitung kas atau saldo rekening koran.";
        setErrs(er);
        if (Object.keys(er).length) return;
        void run(() => createClient().rpc("start_reconciliation", { p_org: orgId, p_account: account, p_statement_date: date, p_statement_balance: balance, p_notes: notes || null }), {
          toastError: false, refresh: false, onSuccess: (id: string) => router.push(`/kas/rekonsiliasi/${id}`),
        });
      }}
    >
      {error && <Alert tone="danger" title={error.message}>{error.hint}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Rekening atau kas" htmlFor="rc-acc" required error={errs.account}>
          <Select {...fieldAria("rc-acc", errs.account)} value={account} onChange={(e) => setAccount(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        </Field>
        <Field label="Per tanggal" htmlFor="rc-date" required error={errs.date}><Input {...fieldAria("rc-date", errs.date)} type="date" max={todayJakarta()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Saldo hasil hitung atau rekening koran" htmlFor="rc-bal" required error={errs.balance}><MoneyInput {...fieldAria("rc-bal", errs.balance)} value={balance} onChange={setBalance} allowNegative /></Field>
        <Field label="Catatan" htmlFor="rc-notes"><Input id="rc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Misalnya: rekening koran September" /></Field>
      </div>
      <Button type="submit" variant="primary" loading={pending}>Mulai Cocokkan</Button>
    </form>
  );
}
