"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah, todayJakarta } from "@/lib/format";
import type { Account, Fund } from "@/lib/types";
import { uuid } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { useAction } from "@/components/app/hooks";

export function OpeningBalanceForm({ orgId, accounts, funds, defaultDate }: { orgId: string; accounts: Account[]; funds: Fund[]; defaultDate: string }) {
  const { run, pending, error } = useAction();
  const today = todayJakarta();
  const [date, setDate] = React.useState(defaultDate > today ? today : defaultDate);
  const [fundId, setFundId] = React.useState(funds.find((f) => f.kind === "umum")?.id ?? "");
  const [accountId, setAccountId] = React.useState(accounts.length === 1 ? accounts[0].id : "");
  const [amount, setAmount] = React.useState<number | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const key = React.useRef(uuid());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!date) er.date = "Tanggal wajib diisi.";
    else if (date > today) er.date = "Tanggal tidak boleh melebihi hari ini.";
    if (!accountId) er.account = "Pilih rekening atau kas.";
    if (!amount || amount <= 0) er.amount = "Nominal harus lebih besar dari nol.";
    setErrors(er);
    if (Object.keys(er).length) return;
    const acc = accounts.find((a) => a.id === accountId)!;
    const fund = funds.find((f) => f.id === fundId)!;
    void run(
      () => createClient().rpc("save_and_post", {
        p_org: orgId,
        p_payload: { kind: "saldo_awal", entry_date: date, amount, fund_id: fundId, account_id: accountId, description: `Saldo awal ${acc.name} (${fund.name})` },
        p_entry_id: null,
        p_idempotency_key: key.current,
      }),
      {
        success: (d: { ref_no: string }) => `Saldo awal ${formatRupiah(amount)} tercatat (${d.ref_no})`,
        toastError: false,
        onSuccess: () => { setAmount(null); key.current = uuid(); },
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <Alert tone="danger" title={error.message}>{error.hint}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Per tanggal" htmlFor="ob-date" required error={errors.date}>
          <Input {...fieldAria("ob-date", errors.date)} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Rekening atau kas" htmlFor="ob-account" required error={errors.account}>
          <Select {...fieldAria("ob-account", errors.account)} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Pilih</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Milik dana" htmlFor="ob-fund" required>
          <Select id="ob-fund" value={fundId} onChange={(e) => setFundId(e.target.value)}>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
        <Field label="Nominal" htmlFor="ob-amount" required error={errors.amount}>
          <MoneyInput {...fieldAria("ob-amount", errors.amount)} value={amount} onChange={setAmount} />
        </Field>
      </div>
      <Button type="submit" variant="primary" loading={pending}>Simpan Saldo Awal</Button>
    </form>
  );
}
