-- =====================================================================
-- Kas IPNU · 01 · Skema inti
-- Sumber data tunggal: journal_entries (transaksi + kepala jurnal) dan
-- journal_lines (baris debit/kredit). Semua saldo dihitung dari journal_lines.
-- Uang disimpan sebagai bigint rupiah utuh. Tanggal akuntansi bertipe date.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Tidak ada peran aplikasi yang boleh membuat objek di schema public.
revoke create on schema public from public;

-- ---------------------------------------------------------------------
-- Organisasi, periode kepengurusan, anggota
-- ---------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  short_name text not null check (length(trim(short_name)) > 0),
  address text,
  city text,
  logo_path text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.management_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  start_date date not null,
  end_date date,
  chair_name text,
  secretary_name text,
  treasurer_name text,
  status text not null default 'aktif' check (status in ('aktif', 'arsip')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (end_date is null or end_date >= start_date)
);
create unique index management_terms_satu_aktif on public.management_terms (organization_id) where status = 'aktif';
create index management_terms_org on public.management_terms (organization_id, start_date desc);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null,
  position text,
  roles text[] not null check (roles <@ array['admin', 'bendahara', 'pembaca']::text[] and cardinality(roles) >= 1),
  status text not null default 'aktif' check (status in ('aktif', 'dicabut')),
  term_id uuid references public.management_terms(id) on delete set null,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user on public.organization_members (user_id) where status = 'aktif';

-- ---------------------------------------------------------------------
-- Daftar akun. Rekening (kas tunai, bank, dompet digital) adalah akun
-- aset dengan is_cash = true.
-- ---------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('aset', 'kewajiban', 'saldo_dana', 'pendapatan', 'beban')),
  is_cash boolean not null default false,
  cash_kind text check (cash_kind in ('tunai', 'bank', 'dompet_digital')),
  bank_name text,
  account_number text,
  account_holder text,
  system_key text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id),
  check ((is_cash and type = 'aset' and cash_kind is not null) or (not is_cash and cash_kind is null))
);
create unique index accounts_system_key on public.accounts (organization_id, system_key) where system_key is not null;
create index accounts_cash on public.accounts (organization_id) where is_cash;

-- ---------------------------------------------------------------------
-- Dana: Kas Umum (satu per organisasi) dan dana program.
-- ---------------------------------------------------------------------
create table public.funds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('umum', 'program')),
  is_restricted boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id)
);
create unique index funds_satu_kas_umum on public.funds (organization_id) where kind = 'umum';

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  fund_id uuid not null unique,
  code text not null check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  start_date date,
  end_date date,
  pic_name text,
  description text,
  status text not null default 'perencanaan' check (status in ('perencanaan', 'berjalan', 'selesai', 'diarsipkan')),
  term_id uuid references public.management_terms(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id),
  foreign key (fund_id, organization_id) references public.funds (id, organization_id) on delete restrict,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index programs_org_status on public.programs (organization_id, status);

-- ---------------------------------------------------------------------
-- Kategori dan pemetaan ke akun pendapatan/beban.
-- ---------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('pemasukan', 'pengeluaran')),
  account_id uuid not null,
  is_routine boolean not null default false,
  system_key text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, kind, name),
  unique (id, organization_id),
  foreign key (account_id, organization_id) references public.accounts (id, organization_id) on delete restrict
);
create index categories_org on public.categories (organization_id, kind, sort_order);

-- ---------------------------------------------------------------------
-- Anggaran (RAB) program. Anggaran adalah rencana, bukan saldo kas.
-- ---------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_id uuid not null unique,
  name text not null default 'RAB',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (program_id, organization_id) references public.programs (id, organization_id) on delete cascade
);

create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  budget_id uuid not null,
  kind text not null check (kind in ('pemasukan', 'pengeluaran')),
  name text not null check (length(trim(name)) > 0),
  category_id uuid,
  quantity numeric(14, 2) not null default 1 check (quantity >= 0),
  unit text,
  unit_price bigint not null default 0 check (unit_price >= 0),
  amount bigint not null check (amount >= 0),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (budget_id, organization_id) references public.budgets (id, organization_id) on delete cascade,
  foreign key (category_id, organization_id) references public.categories (id, organization_id) on delete restrict
);
create index budget_items_budget on public.budget_items (budget_id, kind, sort_order);

-- ---------------------------------------------------------------------
-- Impor
-- ---------------------------------------------------------------------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  file_name text not null,
  file_hash text not null,
  mapping jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  error_rows integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index import_batches_org on public.import_batches (organization_id, created_at desc);

-- ---------------------------------------------------------------------
-- Kebutuhan kas mendatang (rencana dan kewajiban).
-- ---------------------------------------------------------------------
create table public.cash_needs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  fund_id uuid not null,
  direction text not null default 'keluar' check (direction in ('keluar', 'masuk')),
  kind text not null check (kind in ('rencana', 'kewajiban')),
  amount bigint not null check (amount > 0),
  due_date date not null,
  status text not null default 'terbuka' check (status in ('terbuka', 'dibayar', 'dibatalkan')),
  plan_id uuid references public.cash_needs(id) on delete set null,
  paid_entry_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (fund_id, organization_id) references public.funds (id, organization_id) on delete restrict,
  check (direction = 'keluar' or kind = 'rencana'),
  check (plan_id is null or kind = 'kewajiban')
);
create index cash_needs_open on public.cash_needs (organization_id, due_date) where status = 'terbuka';

-- ---------------------------------------------------------------------
-- Buku besar
-- ---------------------------------------------------------------------
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  kind text not null check (kind in ('pemasukan', 'pengeluaran', 'transfer', 'saldo_awal', 'penyesuaian', 'pembalikan')),
  flow_class text not null check (flow_class in ('pemasukan', 'pengeluaran', 'transfer', 'saldo_awal', 'penyesuaian')),
  status text not null default 'draft' check (status in ('draft', 'dibukukan', 'dibalik')),
  entry_date date not null,
  ref_no text,
  description text not null default '',
  counterparty text,
  notes text,
  amount bigint not null check (amount > 0),
  fund_id uuid,
  account_id uuid,
  category_id uuid,
  to_fund_id uuid,
  to_account_id uuid,
  is_one_off boolean not null default false,
  is_noncash boolean not null default false,
  evidence_status text not null default 'belum_ada' check (evidence_status in ('lengkap', 'belum_ada', 'tidak_tersedia')),
  evidence_reason text,
  manual_lines jsonb,
  reverses_id uuid references public.journal_entries(id) on delete restrict,
  reversed_by_id uuid references public.journal_entries(id) on delete restrict,
  replaces_id uuid references public.journal_entries(id) on delete set null,
  need_id uuid references public.cash_needs(id) on delete set null,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  import_row_hash text,
  idempotency_key uuid,
  term_id uuid references public.management_terms(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  posted_by uuid,
  posted_at timestamptz,
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  unique (id, organization_id),
  unique (organization_id, ref_no),
  unique (organization_id, idempotency_key),
  foreign key (fund_id, organization_id) references public.funds (id, organization_id) on delete restrict,
  foreign key (to_fund_id, organization_id) references public.funds (id, organization_id) on delete restrict,
  foreign key (account_id, organization_id) references public.accounts (id, organization_id) on delete restrict,
  foreign key (to_account_id, organization_id) references public.accounts (id, organization_id) on delete restrict,
  foreign key (category_id, organization_id) references public.categories (id, organization_id) on delete restrict,
  check (status = 'draft' or (ref_no is not null and posted_at is not null)),
  check (evidence_status <> 'tidak_tersedia' or length(trim(coalesce(evidence_reason, ''))) > 0)
);
create unique index journal_entries_import_hash on public.journal_entries (organization_id, import_row_hash) where import_row_hash is not null;
create index journal_entries_tanggal on public.journal_entries (organization_id, entry_date desc, created_at desc);
create index journal_entries_status on public.journal_entries (organization_id, status, entry_date desc);
create index journal_entries_fund on public.journal_entries (organization_id, fund_id);
create index journal_entries_to_fund on public.journal_entries (organization_id, to_fund_id) where to_fund_id is not null;
create index journal_entries_account on public.journal_entries (organization_id, account_id);
create index journal_entries_category on public.journal_entries (organization_id, category_id);
create index journal_entries_batch on public.journal_entries (import_batch_id) where import_batch_id is not null;

alter table public.cash_needs
  add constraint cash_needs_paid_entry_fk foreign key (paid_entry_id) references public.journal_entries(id) on delete set null;

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  account_id uuid not null,
  statement_date date not null,
  statement_balance bigint not null,
  book_balance bigint,
  difference bigint,
  status text not null default 'draft' check (status in ('draft', 'selesai')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_by uuid,
  completed_at timestamptz,
  unique (id, organization_id),
  foreign key (account_id, organization_id) references public.accounts (id, organization_id) on delete restrict
);
create index reconciliations_account on public.reconciliations (organization_id, account_id, statement_date desc);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_id uuid not null,
  line_no integer not null check (line_no > 0),
  account_id uuid not null,
  fund_id uuid not null,
  debit bigint not null default 0 check (debit >= 0),
  credit bigint not null default 0 check (credit >= 0),
  memo text,
  reconciliation_id uuid references public.reconciliations(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (entry_id, line_no),
  foreign key (entry_id, organization_id) references public.journal_entries (id, organization_id) on delete restrict,
  foreign key (account_id, organization_id) references public.accounts (id, organization_id) on delete restrict,
  foreign key (fund_id, organization_id) references public.funds (id, organization_id) on delete restrict,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index journal_lines_account on public.journal_lines (organization_id, account_id);
create index journal_lines_fund on public.journal_lines (organization_id, fund_id);
create index journal_lines_entry on public.journal_lines (entry_id);
create index journal_lines_recon on public.journal_lines (reconciliation_id) where reconciliation_id is not null;

create table public.ref_counters (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  prefix text not null,
  year integer not null,
  last_no integer not null default 0,
  primary key (organization_id, prefix, year)
);

-- ---------------------------------------------------------------------
-- Bukti transaksi dan dokumen arsip (metadata; berkas ada di Storage).
-- ---------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_id uuid references public.journal_entries(id) on delete set null,
  program_id uuid references public.programs(id) on delete set null,
  kind text not null default 'bukti' check (kind in ('bukti', 'dokumen')),
  title text,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes bigint not null check (size_bytes > 0),
  status text not null default 'aktif' check (status in ('aktif', 'diganti', 'dihapus')),
  replaces_id uuid references public.attachments(id) on delete set null,
  uploaded_by uuid,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now(),
  removed_by uuid,
  removed_at timestamptz,
  remove_reason text
);
create index attachments_entry on public.attachments (entry_id) where entry_id is not null;
create index attachments_org on public.attachments (organization_id, uploaded_at desc);

create table public.closed_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  status text not null default 'ditutup' check (status in ('ditutup', 'dibuka')),
  closed_by uuid,
  closed_at timestamptz not null default now(),
  reopened_by uuid,
  reopened_at timestamptz,
  reopen_reason text,
  unique (organization_id, year, month)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid,
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity on public.audit_logs (organization_id, entity_type, entity_id);

-- ---------------------------------------------------------------------
-- Notifikasi dan riwayat pemeriksaan kesehatan keuangan.
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  condition_key text not null,
  kind text not null default 'kondisi' check (kind in ('kondisi', 'info')),
  severity text not null check (severity in ('info', 'perlu_perhatian', 'kritis')),
  title text not null,
  body text not null,
  scope_label text,
  fund_id uuid references public.funds(id) on delete set null,
  program_id uuid references public.programs(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  suggestion text,
  action_label text,
  action_href text,
  rule_version integer not null default 1,
  checked_at timestamptz not null default now(),
  last_notified_at timestamptz not null default now(),
  reminder_count integer not null default 0,
  resolved_at timestamptz,
  resolved_reason text,
  created_at timestamptz not null default now()
);
create unique index notifications_satu_terbuka on public.notifications (organization_id, condition_key) where resolved_at is null;
create index notifications_org on public.notifications (organization_id, created_at desc);

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table public.health_checks (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  check_date date not null,
  source text not null check (source in ('terjadwal', 'harian', 'pembukuan', 'perubahan', 'manual')),
  rule_version integer not null,
  status text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index health_checks_org on public.health_checks (organization_id, created_at desc);

-- ---------------------------------------------------------------------
-- updated_at otomatis
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['organizations', 'management_terms', 'organization_members', 'accounts', 'funds',
    'programs', 'categories', 'budgets', 'budget_items', 'cash_needs', 'journal_entries'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;
