-- =====================================================================
-- Kas IPNU · 05 · Program, rekonsiliasi, tutup periode
-- =====================================================================

-- ---------------------------------------------------------------------
-- Program. Setiap program otomatis memiliki satu dana dan satu RAB.
-- ---------------------------------------------------------------------
create or replace function public.save_program(p_org uuid, p_program_id uuid, p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := p_program_id;
  v_fund uuid;
  v_code text := upper(trim(coalesce(p_payload ->> 'code', '')));
  v_name text := trim(coalesce(p_payload ->> 'name', ''));
  v_status text := coalesce(nullif(p_payload ->> 'status', ''), 'perencanaan');
  v_start date := nullif(p_payload ->> 'start_date', '')::date;
  v_end date := nullif(p_payload ->> 'end_date', '')::date;
  v_balance bigint;
  v_prog public.programs;
  v_term uuid;
begin
  perform private.require_role(p_org, array['bendahara']);
  if v_code = '' or v_name = '' then
    raise exception 'Kode dan nama program wajib diisi.' using errcode = '22023';
  end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9-]{1,19}$' then
    raise exception 'Kode program hanya boleh berisi huruf, angka, dan tanda hubung (2 sampai 20 karakter).' using errcode = '22023';
  end if;
  if v_status not in ('perencanaan', 'berjalan', 'selesai', 'diarsipkan') then
    raise exception 'Status program tidak valid.' using errcode = '22023';
  end if;
  if v_start is not null and v_end is not null and v_end < v_start then
    raise exception 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.' using errcode = '22023';
  end if;
  if exists (select 1 from public.programs p where p.organization_id = p_org and p.code = v_code and p.id is distinct from p_program_id) then
    raise exception 'Kode program "%" sudah dipakai.', v_code using errcode = '23505';
  end if;

  if p_program_id is null then
    select t.id into v_term from public.management_terms t where t.organization_id = p_org and t.status = 'aktif';
    perform set_config('kas.skip_audit', 'on', true);
    insert into public.funds (organization_id, code, name, kind, is_restricted)
    values (p_org, 'PRG-' || v_code, v_name, 'program', true)
    returning id into v_fund;
    perform set_config('kas.skip_audit', 'off', true);
    insert into public.programs (organization_id, fund_id, code, name, start_date, end_date, pic_name, description, status, term_id, created_by)
    values (p_org, v_fund, v_code, v_name, v_start, v_end, nullif(trim(coalesce(p_payload ->> 'pic_name', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'description', '')), ''), v_status, v_term, (select auth.uid()))
    returning id into v_id;
    insert into public.budgets (organization_id, program_id, name, created_by)
    values (p_org, v_id, 'RAB ' || v_name, (select auth.uid()));
    return v_id;
  end if;

  select * into v_prog from public.programs p where p.id = p_program_id and p.organization_id = p_org for update;
  if not found then
    raise exception 'Program tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_status = 'diarsipkan' and v_prog.status <> 'diarsipkan' then
    select coalesce(sum(l.debit - l.credit), 0) into v_balance
    from public.journal_lines l join public.accounts a on a.id = l.account_id
    where l.fund_id = v_prog.fund_id and a.is_cash;
    if v_balance <> 0 then
      raise exception 'Program masih memiliki saldo dana %. Program tidak dapat diarsipkan.',
        private.rp(v_balance) using errcode = '23514',
        hint = 'Kembalikan sisa dana ke Kas Umum melalui transfer, lalu arsipkan program.';
    end if;
    if exists (select 1 from public.journal_entries e where e.status = 'draft' and (e.fund_id = v_prog.fund_id or e.to_fund_id = v_prog.fund_id)) then
      raise exception 'Program masih memiliki draft transaksi. Bukukan atau hapus draft terlebih dahulu.' using errcode = '23514';
    end if;
  end if;
  update public.programs p set
    code = v_code, name = v_name, start_date = v_start, end_date = v_end,
    pic_name = nullif(trim(coalesce(p_payload ->> 'pic_name', '')), ''),
    description = nullif(trim(coalesce(p_payload ->> 'description', '')), ''),
    status = v_status
  where p.id = p_program_id;
  perform set_config('kas.skip_audit', 'on', true);
  update public.funds f set name = v_name, code = 'PRG-' || v_code where f.id = v_prog.fund_id;
  perform set_config('kas.skip_audit', 'off', true);
  return v_id;
end $$;

create or replace function public.delete_program(p_program_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prog public.programs;
begin
  select * into v_prog from public.programs p where p.id = p_program_id for update;
  if not found then
    return;
  end if;
  perform private.require_role(v_prog.organization_id, array['bendahara']);
  if exists (select 1 from public.journal_entries e where e.fund_id = v_prog.fund_id or e.to_fund_id = v_prog.fund_id)
     or exists (select 1 from public.journal_lines l where l.fund_id = v_prog.fund_id)
     or exists (select 1 from public.cash_needs n where n.fund_id = v_prog.fund_id) then
    raise exception 'Program sudah memiliki transaksi atau kebutuhan kas sehingga tidak dapat dihapus.' using errcode = '23503',
      hint = 'Ubah status program menjadi Diarsipkan agar riwayatnya tetap tersimpan.';
  end if;
  delete from public.programs p where p.id = v_prog.id;
  perform set_config('kas.skip_audit', 'on', true);
  delete from public.funds f where f.id = v_prog.fund_id;
  perform set_config('kas.skip_audit', 'off', true);
end $$;

-- ---------------------------------------------------------------------
-- Rekonsiliasi: membandingkan saldo buku dengan hitung kas atau rekening
-- koran. Saldo tidak pernah disesuaikan otomatis; selisih dikoreksi dengan
-- transaksi yang dicatat secara eksplisit.
-- ---------------------------------------------------------------------
create or replace function public.start_reconciliation(
  p_org uuid, p_account uuid, p_statement_date date, p_statement_balance bigint, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform private.require_role(p_org, array['bendahara']);
  perform private.assert_cash_account(p_org, p_account, 'Rekening');
  if p_statement_date is null or p_statement_date > private.jakarta_today() then
    raise exception 'Tanggal saldo tidak valid atau melebihi hari ini.' using errcode = '22023';
  end if;
  if p_statement_balance is null then
    raise exception 'Saldo menurut hitung kas atau rekening koran wajib diisi.' using errcode = '22023';
  end if;
  if exists (select 1 from public.reconciliations r where r.organization_id = p_org and r.account_id = p_account and r.status = 'draft') then
    raise exception 'Masih ada rekonsiliasi yang belum selesai untuk rekening ini.' using errcode = '23505',
      hint = 'Selesaikan atau hapus rekonsiliasi tersebut terlebih dahulu.';
  end if;
  insert into public.reconciliations (organization_id, account_id, statement_date, statement_balance, notes, created_by)
  values (p_org, p_account, p_statement_date, p_statement_balance, nullif(trim(coalesce(p_notes, '')), ''), (select auth.uid()))
  returning id into v_id;
  perform private.audit(p_org, 'mulai_rekonsiliasi', 'reconciliations', v_id::text,
    'Memulai rekonsiliasi per ' || to_char(p_statement_date, 'DD/MM/YYYY'),
    jsonb_build_object('account_id', p_account, 'saldo_pembanding', p_statement_balance));
  return v_id;
end $$;

create or replace function public.set_reconciled(p_recon_id uuid, p_line_ids uuid[], p_matched boolean) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.reconciliations;
  v_count int;
begin
  select * into r from public.reconciliations x where x.id = p_recon_id for update;
  if not found then
    raise exception 'Rekonsiliasi tidak ditemukan.' using errcode = 'P0002';
  end if;
  perform private.require_role(r.organization_id, array['bendahara']);
  if r.status <> 'draft' then
    raise exception 'Rekonsiliasi yang sudah selesai tidak dapat diubah.' using errcode = '42501';
  end if;
  perform set_config('kas.reconciling', 'on', true);
  update public.journal_lines l
  set reconciliation_id = case when p_matched then r.id else null end
  from public.journal_entries e
  where e.id = l.entry_id
    and l.id = any (p_line_ids)
    and l.organization_id = r.organization_id
    and l.account_id = r.account_id
    and e.entry_date <= r.statement_date
    and (l.reconciliation_id is null or l.reconciliation_id = r.id);
  get diagnostics v_count = row_count;
  perform set_config('kas.reconciling', 'off', true);
  return v_count;
end $$;

create or replace function public.complete_reconciliation(p_recon_id uuid, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.reconciliations;
  v_book bigint;
  v_diff bigint;
  v_notes text;
begin
  select * into r from public.reconciliations x where x.id = p_recon_id for update;
  if not found then
    raise exception 'Rekonsiliasi tidak ditemukan.' using errcode = 'P0002';
  end if;
  perform private.require_role(r.organization_id, array['bendahara']);
  if r.status = 'selesai' then
    return jsonb_build_object('id', r.id, 'book_balance', r.book_balance, 'difference', r.difference);
  end if;
  select coalesce(sum(l.debit - l.credit), 0) into v_book
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.account_id = r.account_id and e.entry_date <= r.statement_date;
  v_diff := r.statement_balance - v_book;
  v_notes := coalesce(nullif(trim(coalesce(p_notes, '')), ''), r.notes);
  if v_diff <> 0 and v_notes is null then
    raise exception 'Masih ada selisih % antara saldo buku dan saldo pembanding.',
      private.rp(abs(v_diff)) using errcode = '23514',
      hint = 'Catat transaksi koreksi, atau isi catatan yang menjelaskan selisih sebelum menyelesaikan.';
  end if;
  update public.reconciliations x
  set status = 'selesai', book_balance = v_book, difference = v_diff, notes = v_notes,
      completed_by = (select auth.uid()), completed_at = now()
  where x.id = r.id;
  perform private.audit(r.organization_id, 'selesai_rekonsiliasi', 'reconciliations', r.id::text,
    'Menyelesaikan rekonsiliasi per ' || to_char(r.statement_date, 'DD/MM/YYYY') ||
      case when v_diff = 0 then ' tanpa selisih' else ' dengan selisih ' || private.rp(v_diff) end,
    jsonb_build_object('saldo_buku', v_book, 'saldo_pembanding', r.statement_balance, 'selisih', v_diff, 'catatan', v_notes));
  return jsonb_build_object('id', r.id, 'book_balance', v_book, 'difference', v_diff);
end $$;

create or replace function public.delete_reconciliation(p_recon_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.reconciliations;
begin
  select * into r from public.reconciliations x where x.id = p_recon_id for update;
  if not found then
    return;
  end if;
  perform private.require_role(r.organization_id, array['bendahara']);
  if r.status <> 'draft' then
    raise exception 'Rekonsiliasi yang sudah selesai tidak dapat dihapus.' using errcode = '42501';
  end if;
  perform set_config('kas.reconciling', 'on', true);
  update public.journal_lines l set reconciliation_id = null where l.reconciliation_id = r.id;
  perform set_config('kas.reconciling', 'off', true);
  delete from public.reconciliations x where x.id = r.id;
  perform private.audit(r.organization_id, 'hapus_rekonsiliasi', 'reconciliations', r.id::text,
    'Menghapus rekonsiliasi yang belum selesai per ' || to_char(r.statement_date, 'DD/MM/YYYY'));
end $$;

-- ---------------------------------------------------------------------
-- Tutup periode bulanan.
-- ---------------------------------------------------------------------
create or replace function public.close_period(p_org uuid, p_year integer, p_month integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_start date;
  v_end date;
  v_drafts int;
begin
  perform private.require_role(p_org, array['bendahara', 'admin']);
  if p_month not between 1 and 12 or p_year not between 2000 and 2100 then
    raise exception 'Bulan atau tahun tidak valid.' using errcode = '22023';
  end if;
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month' - interval '1 day')::date;
  if v_end >= private.jakarta_today() then
    raise exception 'Periode % belum berakhir sehingga belum dapat ditutup.', to_char(v_start, 'MM/YYYY') using errcode = '23514';
  end if;
  select count(*) into v_drafts from public.journal_entries e
  where e.organization_id = p_org and e.status = 'draft' and e.entry_date between v_start and v_end;
  if v_drafts > 0 then
    raise exception 'Masih ada % draft bertanggal pada periode ini.', v_drafts using errcode = '23514',
      hint = 'Bukukan atau hapus draft tersebut sebelum menutup periode.';
  end if;
  insert into public.closed_periods as c (organization_id, year, month, status, closed_by, closed_at)
  values (p_org, p_year, p_month, 'ditutup', (select auth.uid()), now())
  on conflict (organization_id, year, month) do update
    set status = 'ditutup', closed_by = excluded.closed_by, closed_at = excluded.closed_at;
  perform private.audit(p_org, 'tutup_periode', 'closed_periods', p_year || '-' || lpad(p_month::text, 2, '0'),
    'Menutup periode ' || lpad(p_month::text, 2, '0') || '/' || p_year);
end $$;

create or replace function public.reopen_period(p_org uuid, p_year integer, p_month integer, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role(p_org, array['admin']);
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Alasan pembukaan kembali periode wajib diisi.' using errcode = '22023';
  end if;
  update public.closed_periods c
  set status = 'dibuka', reopened_by = (select auth.uid()), reopened_at = now(), reopen_reason = trim(p_reason)
  where c.organization_id = p_org and c.year = p_year and c.month = p_month and c.status = 'ditutup';
  if not found then
    raise exception 'Periode tersebut tidak dalam keadaan tertutup.' using errcode = 'P0002';
  end if;
  perform private.audit(p_org, 'buka_periode', 'closed_periods', p_year || '-' || lpad(p_month::text, 2, '0'),
    'Membuka kembali periode ' || lpad(p_month::text, 2, '0') || '/' || p_year || ': ' || trim(p_reason),
    jsonb_build_object('alasan', trim(p_reason)));
end $$;
