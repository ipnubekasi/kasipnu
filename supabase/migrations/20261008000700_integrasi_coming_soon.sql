-- =====================================================================
-- Kas IPNU · 07 · Fondasi integrasi bank dan QRIS (BELUM AKTIF)
-- Struktur disiapkan sekarang; koneksi nyata dikerjakan pada tahap
-- berikutnya. Selama flag nonaktif, tabel-tabel ini menolak semua tulisan
-- sehingga tidak dapat memengaruhi saldo, jurnal, laporan, atau indikator.
-- =====================================================================

create table public.app_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.app_feature_flags (key, enabled, description)
values ('integrasi_bank_qris', false, 'Integrasi bank dan QRIS. Hanya diubah oleh pengelola sistem setelah persiapan aktivasi selesai.');

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  kind text not null check (kind in ('bank', 'payment')),
  provider text not null,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'produksi')),
  account_id uuid,
  display_name text,
  external_account_id text,
  status text not null default 'nonaktif' check (status in ('nonaktif', 'menunggu', 'aktif', 'galat', 'dicabut')),
  config jsonb not null default '{}'::jsonb,
  -- Hanya rujukan ke tempat rahasia disimpan (misalnya nama secret di server).
  -- Kredensial tidak pernah disimpan di tabel ini.
  secret_ref text,
  last_sync_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, provider, environment, external_account_id),
  foreign key (account_id, organization_id) references public.accounts (id, organization_id) on delete restrict
);

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  connection_id uuid not null,
  fund_id uuid not null,
  category_id uuid,
  purpose text not null,
  payer_name text,
  amount bigint not null check (amount > 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  method text not null default 'qris',
  external_id text,
  qr_payload text,
  status text not null default 'dibuat' check (status in ('dibuat', 'menunggu', 'dibayar', 'kedaluwarsa', 'dibatalkan', 'gagal')),
  expires_at timestamptz,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (connection_id, external_id),
  foreign key (connection_id, organization_id) references public.integration_connections (id, organization_id) on delete restrict,
  foreign key (fund_id, organization_id) references public.funds (id, organization_id) on delete restrict,
  foreign key (category_id, organization_id) references public.categories (id, organization_id) on delete restrict
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  connection_id uuid not null,
  external_id text not null,
  settled_at timestamptz,
  gross_amount bigint not null check (gross_amount >= 0),
  fee_amount bigint not null default 0 check (fee_amount >= 0),
  net_amount bigint not null,
  bank_account_id uuid,
  -- Pencairan dicatat sebagai TRANSFER dari saldo pada penyedia ke rekening
  -- bank, bukan sebagai pemasukan kedua.
  transfer_entry_id uuid references public.journal_entries(id) on delete set null,
  status text not null default 'menunggu' check (status in ('menunggu', 'diterima', 'dicocokkan')),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (connection_id, external_id),
  foreign key (connection_id, organization_id) references public.integration_connections (id, organization_id) on delete restrict,
  foreign key (bank_account_id, organization_id) references public.accounts (id, organization_id) on delete restrict
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  connection_id uuid not null,
  payment_request_id uuid,
  external_id text not null,
  status text not null check (status in ('berhasil', 'gagal', 'refund', 'refund_sebagian')),
  gross_amount bigint not null check (gross_amount >= 0),
  fee_amount bigint not null default 0 check (fee_amount >= 0),
  net_amount bigint not null,
  paid_at timestamptz,
  payer_name text,
  -- Pembayaran berhasil, dana pada penyedia, dan pencairan adalah tiga hal terpisah.
  income_entry_id uuid references public.journal_entries(id) on delete set null,
  settlement_id uuid references public.settlements(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (connection_id, external_id),
  foreign key (connection_id, organization_id) references public.integration_connections (id, organization_id) on delete restrict,
  foreign key (payment_request_id, organization_id) references public.payment_requests (id, organization_id) on delete restrict
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null,
  external_event_id text not null,
  event_type text,
  signature_valid boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'diterima' check (status in ('diterima', 'diproses', 'ditolak', 'galat')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, external_event_id)
);

create table public.bank_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  connection_id uuid references public.integration_connections(id) on delete set null,
  account_id uuid not null,
  source text not null check (source in ('api', 'impor_berkas')),
  status text not null default 'berjalan' check (status in ('berjalan', 'selesai', 'galat')),
  fetched_count integer not null default 0,
  new_count integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid,
  unique (id, organization_id),
  foreign key (account_id, organization_id) references public.accounts (id, organization_id) on delete restrict
);

-- Mutasi bank disimpan terpisah dari jurnal agar dapat dicocokkan dahulu
-- sebelum dibukukan.
create table public.bank_statement_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  account_id uuid not null,
  connection_id uuid references public.integration_connections(id) on delete set null,
  sync_run_id uuid references public.bank_sync_runs(id) on delete set null,
  external_id text,
  row_hash text,
  posted_date date not null,
  description text,
  amount bigint not null,
  balance_after bigint,
  match_status text not null default 'belum_dicocokkan' check (match_status in ('belum_dicocokkan', 'dicocokkan', 'diabaikan')),
  matched_entry_id uuid references public.journal_entries(id) on delete set null,
  matched_by uuid,
  matched_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (account_id, organization_id) references public.accounts (id, organization_id) on delete restrict
);
create unique index bank_statement_entries_external on public.bank_statement_entries (account_id, external_id) where external_id is not null;
create unique index bank_statement_entries_hash on public.bank_statement_entries (account_id, row_hash) where row_hash is not null;
create index bank_statement_entries_date on public.bank_statement_entries (organization_id, account_id, posted_date);

-- Penjaga: selama flag nonaktif, tidak ada baris yang dapat ditulis.
create or replace function private.integration_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not coalesce((select f.enabled from public.app_feature_flags f where f.key = 'integrasi_bank_qris'), false) then
    raise exception 'Integrasi bank dan QRIS belum aktif.' using errcode = '0A000',
      hint = 'Fitur ini masih dalam persiapan. Gunakan input transaksi dan impor mutasi rekening.';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['integration_connections', 'payment_requests', 'payment_transactions', 'webhook_events',
    'settlements', 'bank_sync_runs', 'bank_statement_entries'] loop
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function private.integration_guard()', t || '_guard', t);
  end loop;
end $$;
