-- =====================================================================
-- Kas IPNU · 04 · Tampilan dan fungsi laporan
-- Semua angka dihitung dari journal_lines. Fungsi berjalan dengan hak
-- pemanggil (security invoker), sehingga RLS tetap berlaku.
-- =====================================================================

create or replace view public.v_ledger with (security_invoker = true) as
select
  l.id, l.organization_id, l.entry_id, l.line_no,
  e.entry_date, e.ref_no, e.kind, e.flow_class, e.status as entry_status,
  e.description, e.counterparty, e.category_id, e.is_noncash, e.posted_at,
  l.account_id, a.code as account_code, a.name as account_name, a.type as account_type, a.is_cash,
  l.fund_id, f.name as fund_name, f.kind as fund_kind,
  l.debit, l.credit, l.memo, l.reconciliation_id
from public.journal_lines l
join public.journal_entries e on e.id = l.entry_id
join public.accounts a on a.id = l.account_id
join public.funds f on f.id = l.fund_id;

-- Kebutuhan kas terbuka tanpa penghitungan ganda: rencana yang sudah
-- memiliki kewajiban terbuka yang merujuknya tidak dihitung lagi.
create or replace view public.v_open_needs with (security_invoker = true) as
select n.*
from public.cash_needs n
where n.status = 'terbuka'
  and not (n.kind = 'rencana' and exists (
    select 1 from public.cash_needs k
    where k.plan_id = n.id and k.status in ('terbuka', 'dibayar')));

-- ---------------------------------------------------------------------
-- Ringkasan kas untuk satu lingkup dan rentang tanggal.
-- saldo awal + pemasukan - pengeluaran + transfer masuk - transfer keluar
-- + penyesuaian = saldo akhir
-- ---------------------------------------------------------------------
create or replace function public.cash_summary(
  p_org uuid, p_from date, p_to date, p_fund uuid default null, p_account uuid default null
) returns table (
  opening_before bigint, opening_entries bigint, income bigint, expense bigint,
  transfer_in bigint, transfer_out bigint, adjustment bigint, closing bigint
)
language sql stable security invoker set search_path = public, pg_temp as $$
  with cl as (
    select coalesce(e.reverses_id, e.id) as root_id, e.entry_date, e.flow_class, (l.debit - l.credit) as delta
    from public.journal_lines l
    join public.journal_entries e on e.id = l.entry_id
    join public.accounts a on a.id = l.account_id
    where l.organization_id = p_org and a.is_cash and e.entry_date <= p_to
      and (p_fund is null or l.fund_id = p_fund)
      and (p_account is null or l.account_id = p_account)
  ),
  per_root as (
    select root_id, flow_class, sum(delta) as net
    from cl where entry_date >= p_from
    group by root_id, flow_class
  )
  select
    coalesce((select sum(delta) from cl where entry_date < p_from), 0)::bigint,
    coalesce((select sum(net) from per_root where flow_class = 'saldo_awal'), 0)::bigint,
    coalesce((select sum(net) from per_root where flow_class = 'pemasukan'), 0)::bigint,
    coalesce((select -sum(net) from per_root where flow_class = 'pengeluaran'), 0)::bigint,
    coalesce((select sum(net) from per_root where flow_class = 'transfer' and net > 0), 0)::bigint,
    coalesce((select -sum(net) from per_root where flow_class = 'transfer' and net < 0), 0)::bigint,
    coalesce((select sum(net) from per_root where flow_class = 'penyesuaian'), 0)::bigint,
    coalesce((select sum(delta) from cl), 0)::bigint
$$;

create or replace function public.cash_monthly(
  p_org uuid, p_from date, p_to date, p_fund uuid default null, p_account uuid default null
) returns table (
  month date, opening_before bigint, opening_entries bigint, income bigint, expense bigint,
  transfer_in bigint, transfer_out bigint, adjustment bigint, closing bigint
)
language sql stable security invoker set search_path = public, pg_temp as $$
  select m.month::date, s.opening_before, s.opening_entries, s.income, s.expense,
    s.transfer_in, s.transfer_out, s.adjustment, s.closing
  from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') as m(month)
  cross join lateral public.cash_summary(
    p_org,
    greatest(m.month::date, p_from),
    least((m.month + interval '1 month' - interval '1 day')::date, p_to),
    p_fund, p_account) s
  order by m.month
$$;

-- Posisi kas per rekening dan dana pada suatu tanggal.
create or replace function public.cash_positions(p_org uuid, p_as_of date)
returns table (account_id uuid, fund_id uuid, balance bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
  select l.account_id, l.fund_id, sum(l.debit - l.credit)::bigint
  from public.journal_lines l
  join public.journal_entries e on e.id = l.entry_id
  join public.accounts a on a.id = l.account_id
  where l.organization_id = p_org and a.is_cash and e.entry_date <= p_as_of
  group by l.account_id, l.fund_id
$$;

-- Pemasukan dan pengeluaran per kategori (basis kas, sudah dikurangi pembalikan).
create or replace function public.category_summary(
  p_org uuid, p_from date, p_to date, p_fund uuid default null, p_account uuid default null
) returns table (category_id uuid, flow_class text, amount bigint, entry_count bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
  select e.category_id, e.flow_class,
    sum(case when e.flow_class = 'pemasukan' then l.debit - l.credit else l.credit - l.debit end)::bigint,
    count(distinct coalesce(e.reverses_id, e.id))
  from public.journal_lines l
  join public.journal_entries e on e.id = l.entry_id
  join public.accounts a on a.id = l.account_id
  where l.organization_id = p_org and a.is_cash
    and e.flow_class in ('pemasukan', 'pengeluaran')
    and e.entry_date between p_from and p_to
    and (p_fund is null or l.fund_id = p_fund)
    and (p_account is null or l.account_id = p_account)
  group by e.category_id, e.flow_class
$$;

-- Neraca saldo: saldo awal, mutasi debit/kredit, saldo akhir per akun.
create or replace function public.trial_balance(
  p_org uuid, p_from date, p_to date, p_fund uuid default null
) returns table (account_id uuid, opening bigint, debit bigint, credit bigint, closing bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
  select l.account_id,
    coalesce(sum(l.debit - l.credit) filter (where e.entry_date < p_from), 0)::bigint,
    coalesce(sum(l.debit) filter (where e.entry_date >= p_from), 0)::bigint,
    coalesce(sum(l.credit) filter (where e.entry_date >= p_from), 0)::bigint,
    coalesce(sum(l.debit - l.credit), 0)::bigint
  from public.journal_lines l
  join public.journal_entries e on e.id = l.entry_id
  where l.organization_id = p_org and e.entry_date <= p_to
    and (p_fund is null or l.fund_id = p_fund)
  group by l.account_id
$$;

-- ---------------------------------------------------------------------
-- Daftar transaksi dengan pengaruh kas pada lingkup yang dipilih.
-- Untuk transaksi yang sudah dibukukan, masuk/keluar dihitung dari baris
-- jurnal. Untuk draft, nilainya adalah perkiraan dari isian formulir.
-- ---------------------------------------------------------------------
create or replace function public.list_transactions(
  p_org uuid,
  p_fund uuid default null,
  p_account uuid default null,
  p_from date default null,
  p_to date default null,
  p_kinds text[] default null,
  p_statuses text[] default null,
  p_category uuid default null,
  p_evidence text default null,
  p_search text default null,
  p_batch uuid default null,
  p_sort text default 'tanggal_desc',
  p_limit integer default 25,
  p_offset integer default 0
) returns table (
  id uuid, kind text, flow_class text, status text, entry_date date, ref_no text, description text,
  counterparty text, amount bigint, fund_id uuid, account_id uuid, category_id uuid, to_fund_id uuid,
  to_account_id uuid, evidence_status text, attachment_count integer, cash_in bigint, cash_out bigint,
  is_noncash boolean, reverses_id uuid, replaces_id uuid, import_batch_id uuid, created_at timestamptz,
  total_count bigint, sum_in bigint, sum_out bigint
)
language sql stable security invoker set search_path = public, pg_temp as $$
  with base as (
    select e.*,
      case when e.status = 'draft' then
        case e.kind
          when 'pemasukan' then e.amount
          when 'saldo_awal' then e.amount
          when 'pengeluaran' then -e.amount
          when 'transfer' then
            (case when (p_fund is null or e.to_fund_id = p_fund) and (p_account is null or e.to_account_id = p_account) then e.amount else 0 end)
            - (case when (p_fund is null or e.fund_id = p_fund) and (p_account is null or e.account_id = p_account) then e.amount else 0 end)
          else 0
        end
      else coalesce((
        select sum(l.debit - l.credit)
        from public.journal_lines l join public.accounts a on a.id = l.account_id
        where l.entry_id = e.id and a.is_cash
          and (p_fund is null or l.fund_id = p_fund)
          and (p_account is null or l.account_id = p_account)), 0)
      end as net
    from public.journal_entries e
    where e.organization_id = p_org
      and (p_from is null or e.entry_date >= p_from)
      and (p_to is null or e.entry_date <= p_to)
      and (p_kinds is null or e.kind = any (p_kinds))
      and (p_statuses is null or e.status = any (p_statuses))
      and (p_category is null or e.category_id = p_category)
      and (p_evidence is null or (e.evidence_status = p_evidence and e.kind in ('pemasukan', 'pengeluaran')))
      and (p_batch is null or e.import_batch_id = p_batch)
      and (p_search is null or p_search = '' or e.description ilike '%' || p_search || '%'
           or e.ref_no ilike '%' || p_search || '%' or e.counterparty ilike '%' || p_search || '%')
      and (p_fund is null or e.fund_id = p_fund or e.to_fund_id = p_fund
           or exists (select 1 from public.journal_lines l where l.entry_id = e.id and l.fund_id = p_fund))
      and (p_account is null or e.account_id = p_account or e.to_account_id = p_account
           or exists (select 1 from public.journal_lines l where l.entry_id = e.id and l.account_id = p_account))
  )
  select b.id, b.kind, b.flow_class, b.status, b.entry_date, b.ref_no, b.description, b.counterparty, b.amount,
    b.fund_id, b.account_id, b.category_id, b.to_fund_id, b.to_account_id, b.evidence_status,
    (select count(*)::int from public.attachments t where t.entry_id = b.id and t.status = 'aktif'),
    greatest(b.net, 0)::bigint, greatest(-b.net, 0)::bigint,
    b.is_noncash, b.reverses_id, b.replaces_id, b.import_batch_id, b.created_at,
    count(*) over (),
    coalesce(sum(greatest(b.net, 0)) filter (where b.status <> 'draft') over (), 0)::bigint,
    coalesce(sum(greatest(-b.net, 0)) filter (where b.status <> 'draft') over (), 0)::bigint
  from base b
  order by
    case when p_sort = 'tanggal_asc' then b.entry_date end asc,
    case when p_sort = 'tanggal_desc' then b.entry_date end desc,
    case when p_sort = 'nominal_asc' then b.amount end asc,
    case when p_sort = 'nominal_desc' then b.amount end desc,
    case when p_sort = 'nomor_asc' then b.ref_no end asc nulls last,
    case when p_sort = 'nomor_desc' then b.ref_no end desc nulls last,
    case when p_sort = 'tanggal_asc' then b.created_at end asc,
    case when p_sort = 'tanggal_asc' then b.ref_no end asc,
    b.created_at desc, b.ref_no desc nulls first, b.id
  limit least(greatest(coalesce(p_limit, 25), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------------------------------------------------------------------
-- Ringkasan keuangan setiap program.
-- Anggaran adalah rencana; dana tersedia adalah saldo kas dana program.
-- ---------------------------------------------------------------------
create or replace function public.program_summary(p_org uuid)
returns table (
  program_id uuid, fund_id uuid, fund_balance bigint, income bigint, expense bigint,
  transfer_in bigint, transfer_out bigint, budget_income bigint, budget_expense bigint,
  open_needs bigint, attachment_count integer, missing_evidence integer
)
language sql stable security invoker set search_path = public, pg_temp as $$
  with cl as (
    select l.fund_id, coalesce(e.reverses_id, e.id) as root_id, e.flow_class, sum(l.debit - l.credit) as net
    from public.journal_lines l
    join public.journal_entries e on e.id = l.entry_id
    join public.accounts a on a.id = l.account_id
    where l.organization_id = p_org and a.is_cash
    group by l.fund_id, coalesce(e.reverses_id, e.id), e.flow_class
  ),
  agg as (
    select fund_id,
      sum(net) as balance,
      sum(net) filter (where flow_class = 'pemasukan') as income,
      -sum(net) filter (where flow_class = 'pengeluaran') as expense,
      sum(net) filter (where flow_class = 'transfer' and net > 0) as transfer_in,
      -sum(net) filter (where flow_class = 'transfer' and net < 0) as transfer_out
    from cl group by fund_id
  )
  select p.id, p.fund_id,
    coalesce(a.balance, 0)::bigint, coalesce(a.income, 0)::bigint, coalesce(a.expense, 0)::bigint,
    coalesce(a.transfer_in, 0)::bigint, coalesce(a.transfer_out, 0)::bigint,
    coalesce((select sum(i.amount) from public.budget_items i join public.budgets b on b.id = i.budget_id
              where b.program_id = p.id and i.kind = 'pemasukan'), 0)::bigint,
    coalesce((select sum(i.amount) from public.budget_items i join public.budgets b on b.id = i.budget_id
              where b.program_id = p.id and i.kind = 'pengeluaran'), 0)::bigint,
    coalesce((select sum(n.amount) from public.v_open_needs n where n.fund_id = p.fund_id and n.direction = 'keluar'), 0)::bigint,
    (select count(*)::int from public.attachments t join public.journal_entries e on e.id = t.entry_id
      where t.status = 'aktif' and (e.fund_id = p.fund_id or e.to_fund_id = p.fund_id)),
    (select count(*)::int from public.journal_entries e
      where e.fund_id = p.fund_id and e.status = 'dibukukan' and e.kind in ('pemasukan', 'pengeluaran') and e.evidence_status = 'belum_ada')
  from public.programs p
  left join agg a on a.fund_id = p.fund_id
  where p.organization_id = p_org
$$;

-- ---------------------------------------------------------------------
-- Pekerjaan yang perlu diselesaikan.
-- ---------------------------------------------------------------------
create or replace function public.pending_tasks(p_org uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'drafts', (select count(*) from public.journal_entries e where e.organization_id = p_org and e.status = 'draft'),
    'missing_evidence', (select count(*) from public.journal_entries e
      where e.organization_id = p_org and e.status = 'dibukukan' and e.kind in ('pemasukan', 'pengeluaran') and e.evidence_status = 'belum_ada'),
    'open_reconciliations', (select count(*) from public.reconciliations r where r.organization_id = p_org and r.status = 'draft'),
    'accounts_to_reconcile', (
      select coalesce(jsonb_agg(jsonb_build_object('account_id', a.id, 'name', a.name, 'last_date', lr.last_date) order by a.code), '[]'::jsonb)
      from public.accounts a
      left join lateral (
        select max(r.statement_date) as last_date from public.reconciliations r
        where r.account_id = a.id and r.status = 'selesai') lr on true
      where a.organization_id = p_org and a.is_cash and a.is_active
        and exists (select 1 from public.journal_lines l where l.account_id = a.id)
        and (lr.last_date is null or lr.last_date < (date_trunc('month', (now() at time zone 'Asia/Jakarta')) - interval '1 day')::date)
    )
  )
$$;
