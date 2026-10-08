import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashMonthly, CashSummary, Health, ProgramSummary, TxRow } from "./types";

const EMPTY: CashSummary = { opening_before: 0, opening_entries: 0, income: 0, expense: 0, transfer_in: 0, transfer_out: 0, adjustment: 0, closing: 0 };

function fail(what: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function fetchCashSummary(supabase: SupabaseClient, orgId: string, from: string, to: string, fundId: string | null = null, accountId: string | null = null): Promise<CashSummary> {
  const { data, error } = await supabase.rpc("cash_summary", { p_org: orgId, p_from: from, p_to: to, p_fund: fundId, p_account: accountId });
  fail("Tidak dapat memuat ringkasan kas", error);
  return (data?.[0] as CashSummary) ?? EMPTY;
}

export async function fetchCashMonthly(supabase: SupabaseClient, orgId: string, from: string, to: string, fundId: string | null = null, accountId: string | null = null): Promise<CashMonthly[]> {
  const { data, error } = await supabase.rpc("cash_monthly", { p_org: orgId, p_from: from, p_to: to, p_fund: fundId, p_account: accountId });
  fail("Tidak dapat memuat arus kas bulanan", error);
  return (data ?? []) as CashMonthly[];
}

export type Position = { account_id: string; fund_id: string; balance: number };

export async function fetchPositions(supabase: SupabaseClient, orgId: string, asOf: string): Promise<Position[]> {
  const { data, error } = await supabase.rpc("cash_positions", { p_org: orgId, p_as_of: asOf });
  fail("Tidak dapat memuat posisi kas", error);
  return (data ?? []) as Position[];
}

export type TxFilter = {
  fundId?: string | null;
  accountId?: string | null;
  from?: string | null;
  to?: string | null;
  kinds?: string[] | null;
  statuses?: string[] | null;
  categoryId?: string | null;
  evidence?: string | null;
  search?: string | null;
  batchId?: string | null;
  sort?: string;
  limit?: number;
  offset?: number;
};

export async function fetchTransactions(supabase: SupabaseClient, orgId: string, f: TxFilter): Promise<TxRow[]> {
  const { data, error } = await supabase.rpc("list_transactions", {
    p_org: orgId,
    p_fund: f.fundId ?? null,
    p_account: f.accountId ?? null,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_kinds: f.kinds?.length ? f.kinds : null,
    p_statuses: f.statuses?.length ? f.statuses : null,
    p_category: f.categoryId ?? null,
    p_evidence: f.evidence ?? null,
    p_search: f.search ?? null,
    p_batch: f.batchId ?? null,
    p_sort: f.sort ?? "tanggal_desc",
    p_limit: f.limit ?? 25,
    p_offset: f.offset ?? 0,
  });
  fail("Tidak dapat memuat daftar transaksi", error);
  return (data ?? []) as TxRow[];
}

export async function fetchProgramSummary(supabase: SupabaseClient, orgId: string): Promise<ProgramSummary[]> {
  const { data, error } = await supabase.rpc("program_summary", { p_org: orgId });
  fail("Tidak dapat memuat ringkasan program", error);
  return (data ?? []) as ProgramSummary[];
}

export async function fetchHealth(supabase: SupabaseClient, orgId: string): Promise<Health> {
  const { data, error } = await supabase.rpc("health_status", { p_org: orgId });
  fail("Tidak dapat memuat kesehatan keuangan", error);
  return data as Health;
}

export type PendingTasks = {
  drafts: number;
  missing_evidence: number;
  open_reconciliations: number;
  accounts_to_reconcile: { account_id: string; name: string; last_date: string | null }[];
};

export async function fetchPendingTasks(supabase: SupabaseClient, orgId: string): Promise<PendingTasks> {
  const { data, error } = await supabase.rpc("pending_tasks", { p_org: orgId });
  fail("Tidak dapat memuat daftar pekerjaan", error);
  return data as PendingTasks;
}

/** Mengambil semua baris dari sebuah query bertahap (PostgREST membatasi 1.000 baris per permintaan). */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, pageSize = 1000, max = 50000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
