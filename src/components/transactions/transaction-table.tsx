"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCheck } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TxRow } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { EntryStatusBadge, EvidenceBadge, KindBadge } from "@/components/app/badges";
import { useAction, useUrlParams } from "@/components/app/hooks";
import { Money } from "@/components/app/money";

type Names = Record<string, string>;

function SortHeader({ label, asc, desc, current, align }: { label: string; asc: string; desc: string; current: string; align?: "right" }) {
  const { set } = useUrlParams();
  const state = current === asc ? "asc" : current === desc ? "desc" : null;
  const Icon = state === "asc" ? ArrowUp : state === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => set({ urut: state === "desc" ? asc : desc })}
      aria-label={`Urutkan menurut ${label}${state ? (state === "asc" ? ", saat ini naik" : ", saat ini turun") : ""}`}
      className={cn("inline-flex items-center gap-1 uppercase hover:text-ink", align === "right" && "flex-row-reverse", state && "text-ink")}
    >
      {label}
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}

export function TransactionTable({
  rows, funds, accounts, categories, sort, backHref, canWrite, showFund = true, scopeNote,
}: {
  rows: TxRow[];
  funds: Names;
  accounts: Names;
  categories: Names;
  sort: string;
  backHref: string;
  canWrite: boolean;
  showFund?: boolean;
  scopeNote?: string;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [failures, setFailures] = React.useState<{ id: string; error: string }[]>([]);
  const { run, pending } = useAction();
  const drafts = rows.filter((r) => r.status === "draft");
  const allSelected = drafts.length > 0 && drafts.every((d) => selected.has(d.id));
  const detail = (id: string) => `/kas/${id}?kembali=${encodeURIComponent(backHref)}`;

  // Pilihan dikosongkan saat data berganti (filter, halaman, setelah pembukuan).
  const [prevRows, setPrevRows] = React.useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setSelected(new Set());
  }

  const fundText = (r: TxRow) =>
    r.kind === "transfer" || (r.kind === "pembalikan" && r.to_fund_id)
      ? r.fund_id === r.to_fund_id ? funds[r.fund_id ?? ""] ?? "" : `${funds[r.fund_id ?? ""] ?? ""} → ${funds[r.to_fund_id ?? ""] ?? ""}`
      : funds[r.fund_id ?? ""] ?? "";
  const accountText = (r: TxRow) =>
    r.to_account_id && r.to_account_id !== r.account_id
      ? `${accounts[r.account_id ?? ""] ?? ""} → ${accounts[r.to_account_id] ?? ""}`
      : accounts[r.account_id ?? ""] ?? (r.kind === "penyesuaian" ? "Jurnal manual" : "");

  async function postSelected() {
    const ids = Array.from(selected);
    setFailures([]);
    await run(
      async () => {
        const { data, error } = await createClient().rpc("post_entries", { p_ids: ids });
        if (error) return { error };
        return { data: data as { id: string; ok: boolean; ref_no?: string; error?: string }[] };
      },
      {
        onSuccess: (res: { id: string; ok: boolean; ref_no?: string; error?: string }[]) => {
          const ok = res.filter((r) => r.ok).length;
          const bad = res.filter((r) => !r.ok);
          setFailures(bad.map((b) => ({ id: b.id, error: b.error ?? "Tidak dapat dibukukan" })));
          if (ok) toast.success(`${ok} transaksi dibukukan`);
          if (bad.length) toast.error(`${bad.length} draft tidak dapat dibukukan`, { description: "Lihat rincian di atas tabel, perbaiki, lalu coba lagi." });
          setSelected(new Set());
        },
      },
    );
  }

  const sumIn = rows[0]?.sum_in ?? 0;
  const sumOut = rows[0]?.sum_out ?? 0;
  const pageHasAll = rows.length > 0 && Number(rows[0].total_count) === rows.length;

  return (
    <>
      {failures.length > 0 && (
        <Alert tone="danger" title={`${failures.length} draft tidak dibukukan`} className="m-4">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {failures.map((f) => {
              const r = rows.find((x) => x.id === f.id);
              return <li key={f.id}><Link className="font-medium text-ink underline underline-offset-2" href={detail(f.id)}>{r?.description || "Draft"}</Link>: {f.error}</li>;
            })}
          </ul>
        </Alert>
      )}
      {canWrite && selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-accent-soft px-4 py-2 text-sm sm:px-5">
          <span><strong className="tnum">{selected.size}</strong> draft dipilih</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Batal pilih</Button>
            <Button size="sm" variant="primary" loading={pending} onClick={postSelected}><CheckCheck aria-hidden />Bukukan terpilih</Button>
          </div>
        </div>
      )}

      {/* Desktop: tabel */}
      <div className="hidden md:block">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              {canWrite && drafts.length > 0 && (
                <TH className="w-8">
                  <Checkbox aria-label="Pilih semua draft di halaman ini" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(drafts.map((d) => d.id)) : new Set())} />
                </TH>
              )}
              <TH><SortHeader label="Tanggal" asc="tanggal_asc" desc="tanggal_desc" current={sort} /></TH>
              <TH><SortHeader label="Nomor" asc="nomor_asc" desc="nomor_desc" current={sort} /></TH>
              <TH className="min-w-[220px]">Uraian</TH>
              <TH>Kategori</TH>
              <TH>{showFund ? "Dana · rekening" : "Rekening"}</TH>
              <TH className="text-right">Masuk</TH>
              <TH className="text-right">Keluar</TH>
              <TH>Bukti</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              const neutral = r.cash_in === 0 && r.cash_out === 0;
              return (
                <TR key={r.id} className={cn(r.status === "dibalik" && "text-muted", r.status === "draft" && "bg-warn-soft/40")}>
                  {canWrite && drafts.length > 0 && (
                    <TD>
                      {r.status === "draft" && (
                        <Checkbox
                          aria-label={`Pilih draft ${r.description}`}
                          checked={selected.has(r.id)}
                          onChange={(e) => {
                            const n = new Set(selected);
                            if (e.target.checked) n.add(r.id);
                            else n.delete(r.id);
                            setSelected(n);
                          }}
                        />
                      )}
                    </TD>
                  )}
                  <TD className="tnum whitespace-nowrap">{formatDate(r.entry_date)}</TD>
                  <TD className="tnum whitespace-nowrap">
                    <Link href={detail(r.id)} className="font-medium text-primary underline-offset-2 hover:underline">{r.ref_no ?? "Draft"}</Link>
                  </TD>
                  <TD className="min-w-[220px]">
                    <Link href={detail(r.id)} className="line-clamp-2 text-ink hover:underline" title={r.description}>{r.description || <span className="text-faint">(tanpa uraian)</span>}</Link>
                    {r.counterparty && <span className="block truncate text-[12px] text-muted">{r.counterparty}</span>}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {r.kind === "pemasukan" || r.kind === "pengeluaran" ? categories[r.category_id ?? ""] ?? <span className="text-warn">Belum dipilih</span> : <KindBadge kind={r.kind} />}
                  </TD>
                  <TD className="text-[13px]">
                    {showFund && <span className="block whitespace-nowrap text-ink">{fundText(r)}</span>}
                    <span className={showFund ? "block whitespace-nowrap text-muted" : "whitespace-nowrap"}>{accountText(r)}</span>
                  </TD>
                  {neutral && r.kind !== "penyesuaian" && r.kind !== "pembalikan" ? (
                    <TD colSpan={2} className="num text-muted" title="Transfer internal tidak mengubah saldo pada lingkup ini">
                      <Money value={r.amount} tone="muted" /> <span className="text-[12px]">(internal)</span>
                    </TD>
                  ) : (
                    <>
                      <TD className="num"><Money value={r.cash_in} tone={r.status === "dibukukan" ? "in" : "muted"} dashZero /></TD>
                      <TD className="num"><Money value={r.cash_out} tone={r.status === "dibukukan" ? "out" : "muted"} dashZero /></TD>
                    </>
                  )}
                  <TD>{r.kind === "pemasukan" || r.kind === "pengeluaran" ? <EvidenceBadge status={r.evidence_status} count={r.attachment_count} /> : <span className="text-faint">-</span>}</TD>
                  <TD><EntryStatusBadge status={r.status} /></TD>
                </TR>
              );
            })}
          </TBody>
          <TFoot>
            <TR className="hover:bg-transparent">
              <TD colSpan={(canWrite && drafts.length > 0 ? 1 : 0) + 5} className="text-muted">
                Jumlah {pageHasAll ? "" : "seluruh hasil filter "}(hanya yang dibukukan){scopeNote ? ` · ${scopeNote}` : ""}
              </TD>
              <TD className="num"><Money value={sumIn} /></TD>
              <TD className="num"><Money value={sumOut} /></TD>
              <TD colSpan={2} />
            </TR>
          </TFoot>
        </Table>
      </div>

      {/* Ponsel: baris ringkas */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => {
          const neutral = r.cash_in === 0 && r.cash_out === 0;
          return (
            <li key={r.id} className={cn("flex items-start gap-3 px-4 py-3", r.status === "draft" && "bg-warn-soft/40")}>
              {canWrite && r.status === "draft" && (
                <Checkbox
                  aria-label={`Pilih draft ${r.description}`}
                  className="mt-1"
                  checked={selected.has(r.id)}
                  onChange={(e) => {
                    const n = new Set(selected);
                    if (e.target.checked) n.add(r.id);
                    else n.delete(r.id);
                    setSelected(n);
                  }}
                />
              )}
              <Link href={detail(r.id)} className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className={cn("min-w-0 text-[15px] leading-snug text-ink", r.status === "dibalik" && "text-muted line-through decoration-faint")}>{r.description || "(tanpa uraian)"}</span>
                  <span className="shrink-0 text-right">
                    {neutral ? (
                      <Money value={r.amount} tone="muted" className="text-[15px]" />
                    ) : r.cash_in > 0 ? (
                      <Money value={r.cash_in} sign tone={r.status === "dibukukan" ? "in" : "muted"} className="text-[15px] font-medium" />
                    ) : (
                      <Money value={-r.cash_out} tone={r.status === "dibukukan" ? "out" : "muted"} className="text-[15px] font-medium" />
                    )}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-muted">
                  <span className="tnum">{formatDate(r.entry_date)}</span> · {r.ref_no ?? "Draft"} · {r.kind === "pemasukan" || r.kind === "pengeluaran" ? categories[r.category_id ?? ""] ?? "Tanpa kategori" : fundText(r) || accountText(r)}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {r.status !== "dibukukan" && <EntryStatusBadge status={r.status} />}
                  {r.kind !== "pemasukan" && r.kind !== "pengeluaran" && <KindBadge kind={r.kind} />}
                  {(r.kind === "pemasukan" || r.kind === "pengeluaran") && r.evidence_status !== "lengkap" && r.status !== "dibalik" && <EvidenceBadge status={r.evidence_status} />}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="flex items-center justify-between gap-3 bg-subtle/60 px-4 py-2.5 text-[13px]">
          <span className="text-muted">Jumlah dibukukan</span>
          <span className="space-x-3"><Money value={sumIn} tone="in" sign /><Money value={-sumOut} tone="out" /></span>
        </li>
      </ul>
    </>
  );
}
