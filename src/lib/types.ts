export type Role = "admin" | "bendahara" | "pembaca";

export type Organization = {
  id: string;
  name: string;
  short_name: string;
  address: string | null;
  city: string | null;
  logo_path: string | null;
  settings: OrgSettings;
};

export type OrgSettings = {
  is_demo?: boolean;
  ref?: { prefix?: Partial<Record<EntryKind, string>>; digits?: number };
  attachment?: { max_mb?: number };
  signature?: { enabled?: boolean; city?: string; signers?: { role: string; name: string }[] };
  health?: Partial<HealthThresholds> & { remind_days?: number };
};

export type HealthThresholds = {
  min_balance: number;
  target_months: number;
  critical_months: number;
  budget_warn_pct: number;
  budget_over_pct: number;
  deficit_streak: number;
  evidence_days: number;
  monthly_operational_budget: number;
};

export type Term = {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  chair_name: string | null;
  secretary_name: string | null;
  treasurer_name: string | null;
  status: "aktif" | "arsip";
  notes: string | null;
};

export type Member = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  position: string | null;
  roles: Role[];
  status: "aktif" | "dicabut";
  granted_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

export type AccountType = "aset" | "kewajiban" | "saldo_dana" | "pendapatan" | "beban";

export type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  is_cash: boolean;
  cash_kind: "tunai" | "bank" | "dompet_digital" | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  system_key: string | null;
  description: string | null;
  is_active: boolean;
};

export type Fund = {
  id: string;
  code: string;
  name: string;
  kind: "umum" | "program";
  is_restricted: boolean;
  is_active: boolean;
};

export type ProgramStatus = "perencanaan" | "berjalan" | "selesai" | "diarsipkan";

export type Program = {
  id: string;
  fund_id: string;
  code: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  pic_name: string | null;
  description: string | null;
  status: ProgramStatus;
  term_id: string | null;
};

export type Category = {
  id: string;
  name: string;
  kind: "pemasukan" | "pengeluaran";
  account_id: string;
  is_routine: boolean;
  system_key: string | null;
  sort_order: number;
  is_active: boolean;
};

export type EntryKind = "pemasukan" | "pengeluaran" | "transfer" | "saldo_awal" | "penyesuaian" | "pembalikan";
export type EntryStatus = "draft" | "dibukukan" | "dibalik";
export type EvidenceStatus = "lengkap" | "belum_ada" | "tidak_tersedia";

export type Entry = {
  id: string;
  organization_id: string;
  kind: EntryKind;
  flow_class: string;
  status: EntryStatus;
  entry_date: string;
  ref_no: string | null;
  description: string;
  counterparty: string | null;
  notes: string | null;
  amount: number;
  fund_id: string | null;
  account_id: string | null;
  category_id: string | null;
  to_fund_id: string | null;
  to_account_id: string | null;
  is_one_off: boolean;
  is_noncash: boolean;
  evidence_status: EvidenceStatus;
  evidence_reason: string | null;
  manual_lines: ManualLine[] | null;
  reverses_id: string | null;
  reversed_by_id: string | null;
  replaces_id: string | null;
  need_id: string | null;
  import_batch_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  posted_by: string | null;
  posted_at: string | null;
  reversed_by: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
};

export type ManualLine = { account_id: string; fund_id: string; debit: number; credit: number; memo?: string | null };

export type TxRow = {
  id: string;
  kind: EntryKind;
  flow_class: string;
  status: EntryStatus;
  entry_date: string;
  ref_no: string | null;
  description: string;
  counterparty: string | null;
  amount: number;
  fund_id: string | null;
  account_id: string | null;
  category_id: string | null;
  to_fund_id: string | null;
  to_account_id: string | null;
  evidence_status: EvidenceStatus;
  attachment_count: number;
  cash_in: number;
  cash_out: number;
  is_noncash: boolean;
  reverses_id: string | null;
  replaces_id: string | null;
  import_batch_id: string | null;
  created_at: string;
  total_count: number;
  sum_in: number;
  sum_out: number;
};

export type LedgerLine = {
  id: string;
  entry_id: string;
  line_no: number;
  entry_date: string;
  ref_no: string;
  kind: EntryKind;
  flow_class: string;
  entry_status: EntryStatus;
  description: string;
  counterparty: string | null;
  category_id: string | null;
  is_noncash: boolean;
  posted_at: string;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  is_cash: boolean;
  fund_id: string;
  fund_name: string;
  fund_kind: string;
  debit: number;
  credit: number;
  memo: string | null;
  reconciliation_id: string | null;
};

export type Attachment = {
  id: string;
  entry_id: string | null;
  program_id: string | null;
  kind: "bukti" | "dokumen";
  title: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: "aktif" | "diganti" | "dihapus";
  replaces_id: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
  removed_at: string | null;
  remove_reason: string | null;
};

export type CashSummary = {
  opening_before: number;
  opening_entries: number;
  income: number;
  expense: number;
  transfer_in: number;
  transfer_out: number;
  adjustment: number;
  closing: number;
};

export type CashMonthly = CashSummary & { month: string };

export type ProgramSummary = {
  program_id: string;
  fund_id: string;
  fund_balance: number;
  income: number;
  expense: number;
  transfer_in: number;
  transfer_out: number;
  budget_income: number;
  budget_expense: number;
  open_needs: number;
  attachment_count: number;
  missing_evidence: number;
};

export type BudgetItem = {
  id: string;
  budget_id: string;
  kind: "pemasukan" | "pengeluaran";
  name: string;
  category_id: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  amount: number;
  notes: string | null;
  sort_order: number;
};

export type CashNeed = {
  id: string;
  name: string;
  fund_id: string;
  direction: "keluar" | "masuk";
  kind: "rencana" | "kewajiban";
  amount: number;
  due_date: string;
  status: "terbuka" | "dibayar" | "dibatalkan";
  plan_id: string | null;
  paid_entry_id: string | null;
  notes: string | null;
};

export type HealthStatus = "aman" | "perlu_perhatian" | "kritis" | "data_belum_cukup";

export type HealthReason = { code: string; severity: "kritis" | "perlu_perhatian"; text: string };

export type Health = {
  rule_version: number;
  today: string;
  computed_at: string;
  thresholds: HealthThresholds;
  general: {
    fund_id: string;
    cash_balance: number;
    restricted_balance: number;
    open_obligations: number;
    available: number;
    history_sufficient: boolean;
    first_entry_date: string | null;
    window_from: string;
    window_to: string;
    months_used: { month: string; amount: number }[];
    avg_monthly: number | null;
    avg_basis: "riwayat" | "anggaran" | "tidak_ada";
    runway_months: number | null;
    target_additional: number | null;
    flow: { month: string; income: number; expense: number; net: number; complete: boolean }[];
    deficit_streak: number;
    needs30: {
      until: string;
      obligations: number;
      plans: number;
      total: number;
      shortfall: number;
      shortfall_obligations: number;
      planned_income: number;
      shortfall_if_income: number;
      items: { id: string; name: string; amount: number; due_date: string; kind: string; direction: string; overdue: boolean }[];
    };
    status: HealthStatus;
    reasons: HealthReason[];
    recommendation: string;
    actions: string[];
  };
  programs: {
    program_id: string;
    fund_id: string;
    name: string;
    code: string;
    program_status: ProgramStatus;
    budget_expense: number;
    realized_expense: number;
    pct_used: number | null;
    budget_remaining: number;
    fund_balance: number;
    open_needs: number;
    shortfall: number;
    status: HealthStatus;
    reasons: HealthReason[];
  }[];
  evidence: { overdue_count: number; days: number; oldest: string | null };
};

export type Notification = {
  id: string;
  condition_key: string;
  kind: "kondisi" | "info";
  severity: "info" | "perlu_perhatian" | "kritis";
  title: string;
  body: string;
  scope_label: string | null;
  fund_id: string | null;
  program_id: string | null;
  data: Record<string, unknown>;
  suggestion: string | null;
  action_label: string | null;
  action_href: string | null;
  rule_version: number;
  checked_at: string;
  created_at: string;
  resolved_at: string | null;
  resolved_reason: string | null;
  reminder_count: number;
  is_read: boolean;
  total_count: number;
};

export type Master = {
  accounts: Account[];
  cashAccounts: Account[];
  funds: Fund[];
  generalFund: Fund;
  programs: Program[];
  categories: Category[];
};
