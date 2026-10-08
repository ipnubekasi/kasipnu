import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate, formatDateLong, todayJakarta } from "@/lib/format";
import { EVIDENCE_LABEL, KIND_LABEL, PROGRAM_STATUS_LABEL, ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import type { Account, BudgetItem, CashMonthly, CashSummary, Fund, LedgerLine, Master, Organization, Program, ProgramSummary, Term, TxRow } from "@/lib/types";
import type { Col, ReportData, ReportFilters, ReportKey, Row, Section, SummaryItem } from "./types";
import { REPORTS } from "./types";

type Ctx = { supabase: SupabaseClient; org: Organization; master: Master; term: Term | null };

const n = (v: unknown) => Number(v ?? 0);

async function rpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 100000; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return out;
}

const cashSummary = async (c: Ctx, f: ReportFilters, fundId = f.scope.fundId, from = f.from, to = f.to) =>
  (await rpc<CashSummary>(c.supabase, "cash_summary", { p_org: c.org.id, p_from: from, p_to: to, p_fund: fundId, p_account: f.accountId ?? null }))[0];

const categorySummary = (c: Ctx, f: ReportFilters, fundId = f.scope.fundId, from = f.from, to = f.to) =>
  rpc<{ category_id: string | null; flow_class: string; amount: number; entry_count: number }>(c.supabase, "category_summary", { p_org: c.org.id, p_from: from, p_to: to, p_fund: fundId, p_account: f.accountId ?? null });

const positions = (c: Ctx, asOf: string) => rpc<{ account_id: string; fund_id: string; balance: number }>(c.supabase, "cash_positions", { p_org: c.org.id, p_as_of: asOf });

async function transactions(c: Ctx, f: ReportFilters, extra: Record<string, unknown> = {}): Promise<TxRow[]> {
  const out: TxRow[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const rows = await rpc<TxRow>(c.supabase, "list_transactions", {
      p_org: c.org.id, p_fund: f.scope.fundId, p_account: f.accountId ?? null, p_from: f.from, p_to: f.to,
      p_statuses: ["dibukukan", "dibalik"], p_category: f.categoryId ?? null, p_sort: "tanggal_asc", p_limit: 1000, p_offset: offset, ...extra,
    });
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

function ledger(c: Ctx, f: ReportFilters, filter: { accountId?: string | null; from?: string } = {}): Promise<LedgerLine[]> {
  return all<LedgerLine>((from, to) => {
    let q = c.supabase.from("v_ledger").select("*").eq("organization_id", c.org.id).gte("entry_date", filter.from ?? f.from).lte("entry_date", f.to);
    if (f.scope.fundId) q = q.eq("fund_id", f.scope.fundId);
    if (filter.accountId) q = q.eq("account_id", filter.accountId);
    return q.order("entry_date").order("posted_at").order("ref_no").order("line_no").range(from, to);
  });
}

function summaryItems(s: CashSummary, showTransfers: boolean): SummaryItem[] {
  const items: SummaryItem[] = [
    { label: "Saldo awal", value: n(s.opening_before) + n(s.opening_entries), type: "money" },
    { label: "Pemasukan", value: n(s.income), type: "money" },
    { label: "Pengeluaran", value: n(s.expense), type: "money" },
  ];
  if (showTransfers || n(s.transfer_in) || n(s.transfer_out)) {
    items.push({ label: "Transfer masuk", value: n(s.transfer_in), type: "money" });
    items.push({ label: "Transfer keluar", value: n(s.transfer_out), type: "money" });
  }
  if (n(s.adjustment) !== 0) items.push({ label: "Penyesuaian kas", value: n(s.adjustment), type: "money" });
  items.push({ label: "Saldo akhir", value: n(s.closing), type: "money", strong: true });
  return items;
}

const TRANSFER_NOTE = "Transfer internal bukan pendapatan atau beban. Pada lingkup dana tertentu ditampilkan sebagai Transfer Masuk atau Transfer Keluar; pada lingkup Gabungan sudah dieliminasi.";
const CASH_NOTE = "Angka berbasis kas dari jurnal yang sudah dibukukan. Pemasukan dan pengeluaran sudah dikurangi pembalikan. Draft tidak dihitung.";
const COMBINED_NOTE = "Lingkup Gabungan mencakup dana program yang terikat pada tujuannya; hanya Kas Umum yang bebas digunakan.";

function catName(master: Master, id: string | null, fallback = "Tanpa kategori") {
  return master.categories.find((c) => c.id === id)?.name ?? fallback;
}

function categorySections(master: Master, cats: Awaited<ReturnType<typeof categorySummary>>): { income: Section; expense: Section; totalIncome: number; totalExpense: number } {
  const cols: Col[] = [{ key: "name", label: "Kategori", width: 5 }, { key: "count", label: "Jumlah transaksi", type: "number", width: 2 }, { key: "amount", label: "Nominal", type: "money", width: 3 }];
  const make = (flow: string) => {
    const rows = cats.filter((c) => c.flow_class === flow && (n(c.amount) !== 0 || n(c.entry_count) > 0)).map((c) => ({ name: catName(master, c.category_id), count: n(c.entry_count), amount: n(c.amount), order: master.categories.find((x) => x.id === c.category_id)?.sort_order ?? 999 }));
    rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return rows.map((r) => ({ name: r.name, count: r.count, amount: r.amount }) as Row);
  };
  const inc = make("pemasukan");
  const exp = make("pengeluaran");
  const totalIncome = inc.reduce((t, r) => t + n(r.amount), 0);
  const totalExpense = exp.reduce((t, r) => t + n(r.amount), 0);
  return {
    income: { title: "Pemasukan per kategori", columns: cols, rows: inc, totals: { name: "Jumlah pemasukan", count: inc.reduce((t, r) => t + n(r.count), 0), amount: totalIncome }, emptyText: "Tidak ada pemasukan pada periode ini." },
    expense: { title: "Pengeluaran per kategori", columns: cols, rows: exp, totals: { name: "Jumlah pengeluaran", count: exp.reduce((t, r) => t + n(r.count), 0), amount: totalExpense }, emptyText: "Tidak ada pengeluaran pada periode ini." },
    totalIncome, totalExpense,
  };
}

function monthlySection(rows: CashMonthly[], showTransfers: boolean): Section {
  const cols: Col[] = [
    { key: "month", label: "Bulan", width: 3 }, { key: "opening", label: "Saldo awal", type: "money", width: 3 },
    { key: "income", label: "Pemasukan", type: "money", width: 3 }, { key: "expense", label: "Pengeluaran", type: "money", width: 3 },
    ...(showTransfers ? [{ key: "tin", label: "Transfer masuk", type: "money", width: 3 } as Col, { key: "tout", label: "Transfer keluar", type: "money", width: 3 } as Col] : []),
    { key: "net", label: "Selisih", type: "money", width: 3 }, { key: "closing", label: "Saldo akhir", type: "money", width: 3 },
  ];
  const monthLabel = (d: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
  const data = rows.map((m) => ({ month: monthLabel(m.month), opening: n(m.opening_before) + n(m.opening_entries), income: n(m.income), expense: n(m.expense), tin: n(m.transfer_in), tout: n(m.transfer_out), net: n(m.income) - n(m.expense), closing: n(m.closing) }));
  const sum = (k: "income" | "expense" | "tin" | "tout" | "net") => data.reduce((t, r) => t + r[k], 0);
  return {
    title: "Rekap bulanan", columns: cols, rows: data,
    totals: { month: "Jumlah", opening: data[0]?.opening ?? 0, income: sum("income"), expense: sum("expense"), tin: sum("tin"), tout: sum("tout"), net: sum("net"), closing: data.at(-1)?.closing ?? 0 },
    emptyText: "Tidak ada data pada periode ini.",
  };
}

async function budgetSection(c: Ctx, program: Program, f: ReportFilters): Promise<{ section: Section; budget: number; realized: number }> {
  const { data: budget } = await c.supabase.from("budgets").select("id").eq("program_id", program.id).maybeSingle();
  const items = budget ? ((await c.supabase.from("budget_items").select("*").eq("budget_id", budget.id).eq("kind", "pengeluaran").order("sort_order")).data ?? []) as BudgetItem[] : [];
  const cats = await categorySummary(c, { ...f, accountId: null }, program.fund_id);
  const realizedBy = new Map<string, number>();
  for (const x of cats.filter((x) => x.flow_class === "pengeluaran")) realizedBy.set(x.category_id ?? "", n(x.amount));
  const budgetBy = new Map<string, number>();
  for (const i of items) budgetBy.set(i.category_id ?? "", (budgetBy.get(i.category_id ?? "") ?? 0) + n(i.amount));
  const keys = Array.from(new Set([...budgetBy.keys(), ...realizedBy.keys()]));
  const rows: Row[] = keys.map((k) => {
    const b = budgetBy.get(k) ?? 0;
    const r = realizedBy.get(k) ?? 0;
    return { name: k ? catName(c.master, k) : "Pos tanpa kategori", budget: b, realized: r, diff: b - r, pct: b > 0 ? Math.round((r / b) * 1000) / 10 : null, note: b === 0 && r > 0 ? "Tidak dianggarkan" : r > b && b > 0 ? "Melebihi anggaran" : "" };
  });
  rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const tb = rows.reduce((t, r) => t + n(r.budget), 0);
  const tr = rows.reduce((t, r) => t + n(r.realized), 0);
  return {
    budget: tb, realized: tr,
    section: {
      title: `Anggaran dan realisasi pengeluaran: ${program.name}`,
      note: "Anggaran adalah rencana, bukan saldo kas. Realisasi dihitung per kategori dari pengeluaran yang dibukukan pada dana program.",
      columns: [{ key: "name", label: "Kategori pos", width: 4 }, { key: "budget", label: "Anggaran", type: "money", width: 3 }, { key: "realized", label: "Realisasi", type: "money", width: 3 }, { key: "diff", label: "Sisa anggaran", type: "money", width: 3 }, { key: "pct", label: "Terpakai", type: "percent", width: 2 }, { key: "note", label: "Keterangan", width: 3 }],
      rows,
      totals: { name: "Jumlah", budget: tb, realized: tr, diff: tb - tr, pct: tb > 0 ? Math.round((tr / tb) * 1000) / 10 : null, note: "" },
      emptyText: "RAB belum diisi dan belum ada pengeluaran.",
    },
  };
}

export async function buildReport(key: ReportKey, f: ReportFilters, c: Ctx): Promise<ReportData> {
  const def = REPORTS.find((r) => r.key === key)!;
  const { master } = c;
  const fundName = (id: string | null) => master.funds.find((x: Fund) => x.id === id)?.name ?? "";
  const accName = (id: string | null) => master.accounts.find((x: Account) => x.id === id)?.name ?? "";
  const account = master.accounts.find((a) => a.id === f.accountId);
  const sig = c.org.settings?.signature;
  const signers = (sig?.signers?.length ? sig.signers : [{ role: "Ketua", name: c.term?.chair_name ?? "" }, { role: "Bendahara", name: c.term?.treasurer_name ?? "" }]).filter((s) => s.role || s.name);
  const base: ReportData = {
    key,
    title: def.label,
    orgName: c.org.name,
    scopeLabel: f.scope.label + (account ? ` · ${account.name}` : ""),
    periodLabel: f.from === "2000-01-01" ? `Sampai ${formatDate(f.to)}` : `${formatDate(f.from)} sampai ${formatDate(f.to)}`,
    from: f.from,
    to: f.to,
    generatedAt: new Date().toISOString(),
    summary: [],
    sections: [],
    notes: [],
    signature: sig?.enabled === false ? null : { city: sig?.city || c.org.city || "", date: formatDateLong(todayJakarta()), signers },
    fileName: `${def.label} ${f.scope.label} ${f.from === "2000-01-01" ? "" : f.from + " sd "}${f.to}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim(),
  };
  const combined = f.scope.kind === "gabungan";
  const showTransfers = !combined || Boolean(f.accountId);
  if (combined) base.notes.push(COMBINED_NOTE);

  switch (key) {
    case "buku-kas": {
      const [s, rows] = await Promise.all([cashSummary(c, f), transactions(c, f)]);
      let running = n(s.opening_before);
      let hidden = 0;
      const data: Row[] = [];
      const filtered = Boolean(f.categoryId);
      for (const r of rows) {
        const cin = n(r.cash_in);
        const cout = n(r.cash_out);
        if (cin === 0 && cout === 0) { hidden += 1; continue; }
        running += cin - cout;
        data.push({
          date: r.entry_date, ref: r.ref_no, desc: r.description + (r.counterparty ? ` (${r.counterparty})` : ""),
          cat: r.kind === "pemasukan" || r.kind === "pengeluaran" ? catName(master, r.category_id) : r.kind === "transfer" ? `Transfer: ${fundName(r.fund_id)}${r.to_fund_id !== r.fund_id ? " ke " + fundName(r.to_fund_id) : ""}${r.to_account_id !== r.account_id ? ` (${accName(r.account_id)} ke ${accName(r.to_account_id)})` : ""}` : KIND_LABEL[r.kind],
          cin, cout, bal: filtered ? null : running, _href: `/kas/${r.id}`,
        });
      }
      base.summary = filtered ? [{ label: "Jumlah masuk", value: data.reduce((t, r) => t + n(r.cin), 0), type: "money" }, { label: "Jumlah keluar", value: data.reduce((t, r) => t + n(r.cout), 0), type: "money" }] : summaryItems(s, showTransfers);
      base.sections = [{
        columns: [{ key: "date", label: "Tanggal", type: "date", width: 2 }, { key: "ref", label: "Nomor", width: 2.4 }, { key: "desc", label: "Uraian", width: 6 }, { key: "cat", label: "Kategori", width: 3.4 }, { key: "cin", label: "Masuk", type: "money", width: 2.6 }, { key: "cout", label: "Keluar", type: "money", width: 2.6 }, ...(filtered ? [] : [{ key: "bal", label: "Saldo", type: "money", width: 2.8 } as Col])],
        rows: filtered ? data : [{ date: null, ref: "", desc: "Saldo sebelum periode", cat: "", cin: null, cout: null, bal: n(s.opening_before), _bold: true }, ...data],
        totals: { date: null, ref: "", desc: "Jumlah mutasi", cat: "", cin: data.reduce((t, r) => t + n(r.cin), 0), cout: data.reduce((t, r) => t + n(r.cout), 0), bal: filtered ? null : n(s.closing) },
        emptyText: "Tidak ada mutasi kas pada periode ini.",
      }];
      base.notes.push(CASH_NOTE, TRANSFER_NOTE);
      if (filtered) base.notes.push(`Difilter pada kategori ${catName(master, f.categoryId!)}; kolom saldo tidak ditampilkan.`);
      if (hidden) base.notes.push(`${hidden} transaksi internal tidak mengubah saldo pada lingkup ini sehingga tidak ditampilkan.`);
      base.landscape = true;
      break;
    }
    case "pemasukan-pengeluaran": {
      const cats = await categorySummary(c, f);
      const cs = categorySections(master, cats);
      base.summary = [
        { label: "Jumlah pemasukan", value: cs.totalIncome, type: "money" },
        { label: "Jumlah pengeluaran", value: cs.totalExpense, type: "money" },
        { label: cs.totalIncome - cs.totalExpense >= 0 ? "Surplus" : "Defisit", value: cs.totalIncome - cs.totalExpense, type: "money", strong: true },
      ];
      base.sections = [cs.income, cs.expense];
      base.notes.push(CASH_NOTE, "Transfer internal dan saldo awal tidak termasuk pemasukan atau pengeluaran.");
      break;
    }
    case "arus-kas": {
      const [s, cats] = await Promise.all([cashSummary(c, f), categorySummary(c, f)]);
      const cs = categorySections(master, cats);
      const rows: Row[] = [{ label: "Saldo kas awal periode", amount: n(s.opening_before) + n(s.opening_entries), _bold: true }];
      rows.push({ label: "Penerimaan kas", amount: null, _bold: true });
      for (const r of cs.income.rows) rows.push({ label: String(r.name), amount: n(r.amount), _indent: true });
      rows.push({ label: "Jumlah penerimaan", amount: cs.totalIncome, _bold: true });
      rows.push({ label: "Pengeluaran kas", amount: null, _bold: true });
      for (const r of cs.expense.rows) rows.push({ label: String(r.name), amount: -n(r.amount), _indent: true });
      rows.push({ label: "Jumlah pengeluaran", amount: -cs.totalExpense, _bold: true });
      if (showTransfers || n(s.transfer_in) || n(s.transfer_out)) {
        rows.push({ label: "Transfer internal", amount: null, _bold: true });
        rows.push({ label: "Transfer masuk", amount: n(s.transfer_in), _indent: true });
        rows.push({ label: "Transfer keluar", amount: -n(s.transfer_out), _indent: true });
      }
      if (n(s.adjustment) !== 0) rows.push({ label: "Penyesuaian kas", amount: n(s.adjustment), _bold: true });
      const change = n(s.income) - n(s.expense) + n(s.transfer_in) - n(s.transfer_out) + n(s.adjustment);
      rows.push({ label: change >= 0 ? "Kenaikan kas" : "Penurunan kas", amount: change, _bold: true });
      base.summary = summaryItems(s, showTransfers);
      base.sections = [{ columns: [{ key: "label", label: "Uraian", width: 7 }, { key: "amount", label: "Nominal", type: "money", width: 3 }], rows, totals: { label: "Saldo kas akhir periode", amount: n(s.closing) } }];
      base.notes.push("Disusun dari pergerakan akun kas dan rekening (basis kas). Jurnal nonkas tidak termasuk.", TRANSFER_NOTE);
      break;
    }
    case "rekap-bulanan": {
      const [s, m] = await Promise.all([cashSummary(c, f), rpc<CashMonthly>(c.supabase, "cash_monthly", { p_org: c.org.id, p_from: f.from === "2000-01-01" ? (c.term?.start_date ?? f.to.slice(0, 4) + "-01-01") : f.from, p_to: f.to, p_fund: f.scope.fundId, p_account: f.accountId ?? null })]);
      base.summary = f.from === "2000-01-01" ? [{ label: "Saldo akhir", value: n(s.closing), type: "money", strong: true }] : summaryItems(s, showTransfers);
      base.sections = [{ ...monthlySection(m, showTransfers), title: undefined }];
      base.notes.push(CASH_NOTE);
      if (f.from === "2000-01-01") base.notes.push("Untuk periode Semua waktu, rekap ditampilkan sejak awal periode kepengurusan aktif.");
      base.landscape = true;
      break;
    }
    case "saldo-rekening": {
      const pos = (await positions(c, f.to)).filter((p) => !f.scope.fundId || p.fund_id === f.scope.fundId);
      const cash = master.cashAccounts;
      const rows: Row[] = cash.map((a) => ({ code: a.code, name: a.name, kind: a.cash_kind === "tunai" ? "Kas tunai" : a.cash_kind === "bank" ? "Rekening bank" : "Dompet digital", detail: [a.bank_name, a.account_number].filter(Boolean).join(" "), balance: pos.filter((p) => p.account_id === a.id).reduce((t, p) => t + n(p.balance), 0) })).filter((r) => r.balance !== 0 || cash.find((a) => a.code === r.code)?.is_active);
      const total = rows.reduce((t, r) => t + n(r.balance), 0);
      const detail: Row[] = pos.filter((p) => n(p.balance) !== 0).map((p) => ({ account: accName(p.account_id), fund: fundName(p.fund_id), balance: n(p.balance) })).sort((a, b) => String(a.account).localeCompare(String(b.account)) || String(a.fund).localeCompare(String(b.fund)));
      base.periodLabel = `Per ${formatDate(f.to)}`;
      base.summary = [{ label: "Jumlah saldo buku", value: total, type: "money", strong: true }];
      base.sections = [
        { title: "Saldo buku per rekening", columns: [{ key: "code", label: "Kode", width: 1.6 }, { key: "name", label: "Rekening", width: 4 }, { key: "kind", label: "Jenis", width: 2.4 }, { key: "detail", label: "Rincian", width: 3.4 }, { key: "balance", label: "Saldo buku", type: "money", width: 3 }], rows, totals: { code: "", name: "Jumlah", kind: "", detail: "", balance: total }, emptyText: "Belum ada rekening." },
        { title: "Rincian per dana", note: "Satu rekening dapat berisi uang beberapa dana.", columns: [{ key: "account", label: "Rekening", width: 4 }, { key: "fund", label: "Dana", width: 4 }, { key: "balance", label: "Saldo", type: "money", width: 3 }], rows: detail, totals: { account: "Jumlah", fund: "", balance: detail.reduce((t, r) => t + n(r.balance), 0) }, emptyText: "Belum ada saldo." },
      ];
      base.notes.push("Saldo Buku adalah saldo menurut pencatatan aplikasi, bukan saldo bank waktu nyata. Cocokkan dengan rekening koran melalui Rekonsiliasi.");
      break;
    }
    case "saldo-dana": {
      const pos = await positions(c, f.to);
      const rows: Row[] = master.funds.map((fd) => {
        const p = master.programs.find((x) => x.fund_id === fd.id);
        return { name: fd.name, kind: fd.kind === "umum" ? "Dana umum (bebas digunakan)" : "Dana program (terikat)", status: p ? PROGRAM_STATUS_LABEL[p.status] : "", balance: pos.filter((x) => x.fund_id === fd.id).reduce((t, x) => t + n(x.balance), 0) };
      }).filter((r) => r.kind.startsWith("Dana umum") || n(r.balance) !== 0 || r.status === "Berjalan" || r.status === "Perencanaan");
      const general = n(rows.find((r) => String(r.kind).startsWith("Dana umum"))?.balance);
      const total = rows.reduce((t, r) => t + n(r.balance), 0);
      base.periodLabel = `Per ${formatDate(f.to)}`;
      base.scopeLabel = "Semua dana";
      base.summary = [{ label: "Kas Umum", value: general, type: "money" }, { label: "Dana program terikat", value: total - general, type: "money" }, { label: "Saldo gabungan", value: total, type: "money", strong: true }];
      base.sections = [{ columns: [{ key: "name", label: "Dana", width: 4 }, { key: "kind", label: "Jenis", width: 4 }, { key: "status", label: "Status program", width: 2.4 }, { key: "balance", label: "Saldo", type: "money", width: 3 }], rows, totals: { name: "Saldo gabungan", kind: "", status: "", balance: total } }];
      base.notes = ["Dana program terikat pada tujuan programnya dan tidak dihitung sebagai dana operasional yang tersedia."];
      break;
    }
    case "jurnal-umum": {
      const lines = await ledger(c, f);
      const rows: Row[] = [];
      let last = "";
      let td = 0, tk = 0;
      for (const l of lines) {
        if (l.entry_id !== last) {
          rows.push({ date: l.entry_date, ref: l.ref_no, account: l.description, fund: "", debit: null, credit: null, _bold: true, _href: `/kas/${l.entry_id}` });
          last = l.entry_id;
        }
        rows.push({ date: null, ref: "", account: `${l.account_code} ${l.account_name}`, fund: l.fund_name, debit: n(l.debit) || null, credit: n(l.credit) || null, _indent: n(l.credit) > 0 });
        td += n(l.debit);
        tk += n(l.credit);
      }
      base.summary = [{ label: "Jumlah debit", value: td, type: "money" }, { label: "Jumlah kredit", value: tk, type: "money" }, { label: "Keseimbangan", value: td === tk ? "Seimbang" : "TIDAK SEIMBANG", type: "text", strong: true }];
      base.sections = [{ columns: [{ key: "date", label: "Tanggal", type: "date", width: 2 }, { key: "ref", label: "Nomor", width: 2.4 }, { key: "account", label: "Uraian / Akun", width: 6.5 }, { key: "fund", label: "Dana", width: 2.8 }, { key: "debit", label: "Debit", type: "money", width: 2.6 }, { key: "credit", label: "Kredit", type: "money", width: 2.6 }], rows, totals: { date: null, ref: "", account: "Jumlah", fund: "", debit: td, credit: tk }, emptyText: "Tidak ada jurnal pada periode ini." }];
      base.notes.push("Mencakup jurnal otomatis, jurnal penyesuaian, dan jurnal pembalikan dari sumber data yang sama.");
      base.landscape = true;
      break;
    }
    case "buku-besar": {
      const tb = await rpc<{ account_id: string; opening: number; debit: number; credit: number; closing: number }>(c.supabase, "trial_balance", { p_org: c.org.id, p_from: f.from, p_to: f.to, p_fund: f.scope.fundId });
      const lines = await ledger(c, f, { accountId: f.ledgerAccountId ?? null });
      const accounts = master.accounts.filter((a) => (f.ledgerAccountId ? a.id === f.ledgerAccountId : tb.some((t) => t.account_id === a.id)));
      const cols: Col[] = [{ key: "date", label: "Tanggal", type: "date", width: 2 }, { key: "ref", label: "Nomor", width: 2.4 }, { key: "desc", label: "Uraian", width: 6 }, { key: "fund", label: "Dana", width: 2.8 }, { key: "debit", label: "Debit", type: "money", width: 2.6 }, { key: "credit", label: "Kredit", type: "money", width: 2.6 }, { key: "bal", label: "Saldo", type: "money", width: 2.8 }];
      for (const a of accounts) {
        const t = tb.find((x) => x.account_id === a.id);
        let bal = n(t?.opening);
        const rows: Row[] = [{ date: null, ref: "", desc: "Saldo awal", fund: "", debit: null, credit: null, bal, _bold: true }];
        for (const l of lines.filter((x) => x.account_id === a.id)) {
          bal += n(l.debit) - n(l.credit);
          rows.push({ date: l.entry_date, ref: l.ref_no, desc: l.description, fund: l.fund_name, debit: n(l.debit) || null, credit: n(l.credit) || null, bal, _href: `/kas/${l.entry_id}` });
        }
        base.sections.push({ title: `${a.code} ${a.name} (${ACCOUNT_TYPE_LABEL[a.type]})`, columns: cols, rows, totals: { date: null, ref: "", desc: "Saldo akhir", fund: "", debit: n(t?.debit), credit: n(t?.credit), bal: n(t?.closing) } });
      }
      if (!base.sections.length) base.sections.push({ columns: cols, rows: [], emptyText: "Tidak ada akun dengan mutasi pada periode ini." });
      base.notes.push("Saldo ditampilkan sebagai debit dikurangi kredit: positif berarti saldo debit, negatif berarti saldo kredit.");
      base.landscape = true;
      break;
    }
    case "neraca-saldo": {
      const tb = await rpc<{ account_id: string; opening: number; debit: number; credit: number; closing: number }>(c.supabase, "trial_balance", { p_org: c.org.id, p_from: f.from, p_to: f.to, p_fund: f.scope.fundId });
      const rows: Row[] = master.accounts.filter((a) => tb.some((t) => t.account_id === a.id)).map((a) => {
        const t = tb.find((x) => x.account_id === a.id)!;
        return { code: a.code, name: a.name, type: ACCOUNT_TYPE_LABEL[a.type], opening: n(t.opening), debit: n(t.debit), credit: n(t.credit), cd: n(t.closing) > 0 ? n(t.closing) : null, ck: n(t.closing) < 0 ? -n(t.closing) : null };
      });
      const sum = (k: string) => rows.reduce((t, r) => t + n(r[k]), 0);
      base.summary = [{ label: "Saldo akhir debit", value: sum("cd"), type: "money" }, { label: "Saldo akhir kredit", value: sum("ck"), type: "money" }, { label: "Keseimbangan", value: sum("cd") === sum("ck") ? "Seimbang" : "TIDAK SEIMBANG", type: "text", strong: true }];
      base.sections = [{ columns: [{ key: "code", label: "Kode", width: 1.6 }, { key: "name", label: "Akun", width: 4.4 }, { key: "type", label: "Jenis", width: 2.2 }, { key: "opening", label: "Saldo awal", type: "money", width: 2.6 }, { key: "debit", label: "Mutasi debit", type: "money", width: 2.6 }, { key: "credit", label: "Mutasi kredit", type: "money", width: 2.6 }, { key: "cd", label: "Saldo akhir debit", type: "money", width: 2.8 }, { key: "ck", label: "Saldo akhir kredit", type: "money", width: 2.8 }], rows, totals: { code: "", name: "Jumlah", type: "", opening: sum("opening"), debit: sum("debit"), credit: sum("credit"), cd: sum("cd"), ck: sum("ck") }, emptyText: "Belum ada jurnal sampai tanggal ini." }];
      base.notes.push("Saldo awal ditampilkan sebagai debit dikurangi kredit sebelum periode.");
      base.landscape = true;
      break;
    }
    case "anggaran-realisasi": {
      const programs = f.scope.kind === "program" ? master.programs.filter((p) => p.id === f.scope.programId) : master.programs.filter((p) => p.status !== "diarsipkan");
      let tb = 0, tr = 0;
      for (const p of programs) {
        const b = await budgetSection(c, p, f);
        base.sections.push(b.section);
        tb += b.budget;
        tr += b.realized;
      }
      if (!programs.length) base.sections.push({ columns: [{ key: "name", label: "Program" }], rows: [], emptyText: "Belum ada program." });
      base.scopeLabel = f.scope.kind === "program" ? f.scope.label : "Semua program aktif";
      base.summary = [{ label: "Jumlah anggaran pengeluaran", value: tb, type: "money" }, { label: "Jumlah realisasi", value: tr, type: "money" }, { label: "Sisa anggaran", value: tb - tr, type: "money", strong: true }];
      base.notes = ["Sisa anggaran tidak sama dengan uang yang tersedia. Dana yang benar-benar tersedia terlihat pada laporan Saldo per Dana dan Program."];
      break;
    }
    case "lpj-program": {
      const program = master.programs.find((p) => p.id === f.scope.programId);
      if (!program) throw new Error("Pilih satu program pada Lingkup untuk membuat LPJ Program.");
      const pf: ReportFilters = { ...f, accountId: null, categoryId: null };
      const [s, cats, rows, b, ps, att] = await Promise.all([
        cashSummary(c, pf), categorySummary(c, pf), transactions(c, pf), budgetSection(c, program, pf),
        rpc<ProgramSummary>(c.supabase, "program_summary", { p_org: c.org.id }),
        all<{ file_name: string; uploaded_at: string; size_bytes: number; entry: { ref_no: string | null; entry_date: string; description: string; fund_id: string | null; to_fund_id: string | null } | null }>((from, to) =>
          c.supabase.from("attachments").select("file_name, uploaded_at, size_bytes, entry:journal_entries!inner(ref_no, entry_date, description, fund_id, to_fund_id)").eq("organization_id", c.org.id).eq("status", "aktif").eq("kind", "bukti").or(`fund_id.eq.${program.fund_id},to_fund_id.eq.${program.fund_id}`, { referencedTable: "journal_entries" }).range(from, to)),
      ]);
      const cs = categorySections(master, cats);
      const summary = ps.find((x) => x.program_id === program.id);
      base.title = `LPJ Program: ${program.name}`;
      base.scopeLabel = program.name;
      base.summary = summaryItems(s, true);
      base.sections = [
        { title: "A. Identitas kegiatan", columns: [{ key: "k", label: "Keterangan", width: 3 }, { key: "v", label: "Isi", width: 8 }], rows: [
          { k: "Nama kegiatan", v: program.name }, { k: "Kode", v: program.code },
          { k: "Waktu pelaksanaan", v: program.start_date ? `${formatDate(program.start_date)}${program.end_date ? " sampai " + formatDate(program.end_date) : ""}` : "Belum ditentukan" },
          { k: "Penanggung jawab", v: program.pic_name ?? "Belum diisi" }, { k: "Status", v: PROGRAM_STATUS_LABEL[program.status] }, { k: "Deskripsi", v: program.description ?? "" },
        ] },
        { ...cs.income, title: "B. Ringkasan penerimaan dari pihak luar" },
        { title: "C. Transfer dana", note: "Alokasi dari Kas Umum dan pengembalian sisa dana. Transfer bukan pendapatan atau beban.", columns: [{ key: "date", label: "Tanggal", type: "date", width: 2 }, { key: "ref", label: "Nomor", width: 2.4 }, { key: "desc", label: "Uraian", width: 6 }, { key: "tin", label: "Transfer masuk", type: "money", width: 3 }, { key: "tout", label: "Transfer keluar", type: "money", width: 3 }],
          rows: rows.filter((r) => r.flow_class === "transfer" && (n(r.cash_in) || n(r.cash_out))).map((r) => ({ date: r.entry_date, ref: r.ref_no, desc: r.description, tin: n(r.cash_in) || null, tout: n(r.cash_out) || null, _href: `/kas/${r.id}` })),
          totals: { date: null, ref: "", desc: "Jumlah", tin: n(s.transfer_in), tout: n(s.transfer_out) }, emptyText: "Tidak ada transfer dana." },
        { ...b.section, title: "D. RAB dibandingkan realisasi" },
        { title: "E. Rincian pengeluaran", columns: [{ key: "date", label: "Tanggal", type: "date", width: 2 }, { key: "ref", label: "Nomor", width: 2.4 }, { key: "desc", label: "Uraian", width: 5 }, { key: "cat", label: "Kategori", width: 2.6 }, { key: "who", label: "Penerima", width: 2.6 }, { key: "amount", label: "Nominal", type: "money", width: 2.8 }, { key: "ev", label: "Bukti", width: 2 }],
          rows: rows.filter((r) => r.flow_class === "pengeluaran" && (n(r.cash_in) || n(r.cash_out))).map((r) => ({ date: r.entry_date, ref: r.ref_no, desc: r.description, cat: r.kind === "pembalikan" ? "Pembalikan" : catName(master, r.category_id), who: r.counterparty ?? "", amount: n(r.cash_out) - n(r.cash_in), ev: r.kind === "pembalikan" ? "" : EVIDENCE_LABEL[r.evidence_status], _href: `/kas/${r.id}` })),
          totals: { date: null, ref: "", desc: "Jumlah pengeluaran", cat: "", who: "", amount: n(s.expense), ev: "" }, emptyText: "Belum ada pengeluaran." },
        { title: "F. Saldo akhir", columns: [{ key: "k", label: "Keterangan", width: 6 }, { key: "v", label: "Nominal", type: "money", width: 3 }], rows: [
          { k: "Penerimaan dari pihak luar", v: n(s.income) }, { k: "Transfer masuk", v: n(s.transfer_in) }, { k: "Pengeluaran", v: -n(s.expense) }, { k: "Transfer keluar", v: -n(s.transfer_out) },
          ...(n(s.opening_before) + n(s.opening_entries) + n(s.adjustment) !== 0 ? [{ k: "Saldo awal dan penyesuaian", v: n(s.opening_before) + n(s.opening_entries) + n(s.adjustment) }] : []),
        ], totals: { k: `Saldo dana program per ${formatDate(f.to)}`, v: n(s.closing) }, note: summary && n(summary.open_needs) > 0 ? `Masih ada kebutuhan yang belum dibayar sebesar Rp${n(summary.open_needs).toLocaleString("id-ID")}.` : undefined },
        { title: "G. Daftar bukti", columns: [{ key: "ref", label: "Nomor transaksi", width: 2.6 }, { key: "date", label: "Tanggal", type: "date", width: 2 }, { key: "desc", label: "Uraian", width: 5 }, { key: "file", label: "Nama berkas", width: 5 }],
          rows: att.filter((a) => a.entry).map((a) => ({ ref: a.entry!.ref_no ?? "Draft", date: a.entry!.entry_date, desc: a.entry!.description, file: a.file_name })).sort((x, y) => String(x.date).localeCompare(String(y.date))), emptyText: "Belum ada bukti yang diunggah." },
      ];
      base.notes = [CASH_NOTE];
      base.fileName = `LPJ ${program.name} sampai ${f.to}`.replace(/[\\/:*?"<>|]+/g, " ");
      base.landscape = true;
      break;
    }
    case "akhir-kepengurusan": {
      const gf: ReportFilters = { ...f, accountId: null, categoryId: null };
      const [s, cats, m, pos, ps, counts] = await Promise.all([
        cashSummary(c, gf), categorySummary(c, gf),
        rpc<CashMonthly>(c.supabase, "cash_monthly", { p_org: c.org.id, p_from: f.from === "2000-01-01" ? (c.term?.start_date ?? f.to.slice(0, 4) + "-01-01") : f.from, p_to: f.to, p_fund: f.scope.fundId, p_account: null }),
        positions(c, f.to), rpc<ProgramSummary>(c.supabase, "program_summary", { p_org: c.org.id }),
        Promise.all(["dibukukan", "dibalik", "draft"].map(async (st) => (await c.supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", c.org.id).eq("status", st).gte("entry_date", f.from).lte("entry_date", f.to)).count ?? 0)),
      ]);
      const cs = categorySections(master, cats);
      const scoped = pos.filter((p) => !f.scope.fundId || p.fund_id === f.scope.fundId);
      base.title = `Laporan Akhir Kepengurusan${c.term ? ": " + c.term.name : ""}`;
      base.summary = summaryItems(s, showTransfers);
      base.sections = [
        { title: "A. Identitas", columns: [{ key: "k", label: "Keterangan", width: 3 }, { key: "v", label: "Isi", width: 8 }], rows: [
          { k: "Organisasi", v: c.org.name }, { k: "Periode kepengurusan", v: c.term?.name ?? "" }, { k: "Ketua", v: c.term?.chair_name ?? "" }, { k: "Sekretaris", v: c.term?.secretary_name ?? "" }, { k: "Bendahara", v: c.term?.treasurer_name ?? "" },
          { k: "Jumlah transaksi", v: `${counts[0]} dibukukan, ${counts[1]} dibalik, ${counts[2]} masih draft` },
        ] },
        { title: "B. Saldo per rekening", columns: [{ key: "name", label: "Rekening", width: 6 }, { key: "balance", label: "Saldo buku", type: "money", width: 3 }], rows: master.cashAccounts.map((a) => ({ name: a.name, balance: scoped.filter((p) => p.account_id === a.id).reduce((t, p) => t + n(p.balance), 0) })).filter((r) => r.balance !== 0), totals: { name: "Jumlah", balance: scoped.reduce((t, p) => t + n(p.balance), 0) }, emptyText: "Tidak ada saldo." },
        { title: "C. Saldo per dana", columns: [{ key: "name", label: "Dana", width: 6 }, { key: "balance", label: "Saldo", type: "money", width: 3 }], rows: master.funds.map((fd) => ({ name: fd.name + (fd.kind === "program" ? " (terikat)" : ""), balance: scoped.filter((p) => p.fund_id === fd.id).reduce((t, p) => t + n(p.balance), 0) })).filter((r) => r.balance !== 0), totals: { name: "Jumlah", balance: scoped.reduce((t, p) => t + n(p.balance), 0) }, emptyText: "Tidak ada saldo." },
        { ...cs.income, title: "D. Pemasukan per kategori" },
        { ...cs.expense, title: "E. Pengeluaran per kategori" },
        { ...monthlySection(m, showTransfers), title: "F. Rekap bulanan" },
        { title: "G. Program", columns: [{ key: "name", label: "Program", width: 4 }, { key: "status", label: "Status", width: 2 }, { key: "budget", label: "Anggaran", type: "money", width: 2.8 }, { key: "realized", label: "Realisasi", type: "money", width: 2.8 }, { key: "balance", label: "Sisa dana", type: "money", width: 2.8 }],
          rows: master.programs.map((p) => { const x = ps.find((y) => y.program_id === p.id); return { name: p.name, status: PROGRAM_STATUS_LABEL[p.status], budget: n(x?.budget_expense), realized: n(x?.expense), balance: n(x?.fund_balance) }; }), emptyText: "Tidak ada program.", note: "Realisasi dan sisa dana program dihitung sepanjang umur program." },
      ];
      base.notes.push(CASH_NOTE, "Laporan ini adalah ringkasan untuk serah terima. Bukan pengganti backup database; lihat panduan backup dan serah terima.");
      base.landscape = true;
      break;
    }
  }
  return base;
}
