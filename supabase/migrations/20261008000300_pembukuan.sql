-- =====================================================================
-- Kas IPNU · 03 · Pembukuan
-- Penomoran, simpan draft, bukukan, balik, bukti, impor.
-- Semua perubahan buku besar berjalan dalam satu transaction per fungsi.
-- =====================================================================

-- Diganti di migration kesehatan keuangan. Disediakan di sini agar fungsi
-- pembukuan dapat dipakai sebelum modul kesehatan terpasang.
create or replace function private.after_ledger_change(p_org uuid, p_source text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return;
end $$;

-- ---------------------------------------------------------------------
-- Pengaman: baris jurnal tidak dapat diubah atau dihapus.
-- ---------------------------------------------------------------------
create or replace function private.journal_lines_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('kas.posting', true) is distinct from 'on' then
      raise exception 'Baris jurnal hanya dapat dibuat melalui proses pembukuan.' using errcode = '42501';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if current_setting('kas.reconciling', true) = 'on'
       and (to_jsonb(new) - 'reconciliation_id') = (to_jsonb(old) - 'reconciliation_id') then
      return new;
    end if;
    raise exception 'Baris jurnal yang sudah dibukukan tidak dapat diubah.' using errcode = '42501',
      hint = 'Gunakan pembalikan lalu catat transaksi pengganti.';
  else
    if current_setting('kas.purge_demo', true) = 'on' then
      return old;
    end if;
    raise exception 'Baris jurnal yang sudah dibukukan tidak dapat dihapus.' using errcode = '42501',
      hint = 'Gunakan pembalikan lalu catat transaksi pengganti.';
  end if;
end $$;

create trigger journal_lines_guard before insert or update or delete on public.journal_lines
  for each row execute function private.journal_lines_guard();

create or replace function private.journal_entries_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_mutable text[] := array['status', 'reversed_by_id', 'reversed_by', 'reversed_at', 'reversal_reason',
    'evidence_status', 'evidence_reason', 'updated_at', 'updated_by'];
begin
  if current_setting('kas.purge_demo', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status = 'draft' then
      return old;
    end if;
    raise exception 'Transaksi yang sudah dibukukan tidak dapat dihapus.' using errcode = '42501',
      hint = 'Gunakan pembalikan untuk membatalkan transaksi.';
  end if;
  if old.status = 'draft' then
    if new.status <> 'draft' and current_setting('kas.posting', true) is distinct from 'on' then
      raise exception 'Status transaksi hanya dapat berubah melalui proses pembukuan.' using errcode = '42501';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'Transaksi yang sudah dibukukan tidak dapat diubah.' using errcode = '42501',
      hint = 'Gunakan pembalikan lalu catat transaksi pengganti.';
  end if;
  if new.status <> old.status and not (old.status = 'dibukukan' and new.status = 'dibalik'
       and current_setting('kas.posting', true) = 'on') then
    raise exception 'Perubahan status transaksi tidak diizinkan.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger journal_entries_guard before update or delete on public.journal_entries
  for each row execute function private.journal_entries_guard();

-- Jurnal harus seimbang secara total dan per dana. Diperiksa saat commit.
create or replace function private.check_entry_balanced() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_fund uuid;
begin
  select l.fund_id into v_fund
  from public.journal_lines l
  where l.entry_id = new.entry_id
  group by l.fund_id
  having sum(l.debit) <> sum(l.credit)
  limit 1;
  if found then
    raise exception 'Jurnal tidak seimbang: total debit harus sama dengan total kredit pada setiap dana.' using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger journal_lines_balanced after insert on public.journal_lines
  deferrable initially deferred for each row execute function private.check_entry_balanced();

-- ---------------------------------------------------------------------
-- Periode tertutup
-- ---------------------------------------------------------------------
create or replace function private.assert_period_open(p_org uuid, p_date date) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if exists (
    select 1 from public.closed_periods c
    where c.organization_id = p_org and c.status = 'ditutup'
      and c.year = extract(year from p_date)::int and c.month = extract(month from p_date)::int
  ) then
    raise exception 'Periode % sudah ditutup. Transaksi bertanggal % tidak dapat dibukukan.',
      to_char(p_date, 'MM/YYYY'), to_char(p_date, 'DD/MM/YYYY')
      using errcode = 'KP001', hint = 'Gunakan tanggal pada periode yang masih terbuka, atau minta Admin membuka kembali periode tersebut.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Penomoran aman dari penyimpanan bersamaan.
-- ---------------------------------------------------------------------
create or replace function private.next_ref(p_org uuid, p_kind text, p_date date) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_default text := case p_kind
    when 'pemasukan' then 'KM' when 'pengeluaran' then 'KK' when 'transfer' then 'TR'
    when 'saldo_awal' then 'SA' when 'penyesuaian' then 'JU' else 'JB' end;
  v_prefix text;
  v_digits int;
  v_year int := extract(year from p_date)::int;
  v_no int;
begin
  v_prefix := upper(coalesce(nullif(trim(private.org_setting(p_org, 'ref', 'prefix', p_kind) #>> '{}'), ''), v_default));
  v_digits := least(greatest(private.org_setting_num(p_org, 4, 'ref', 'digits')::int, 3), 8);
  insert into public.ref_counters as c (organization_id, prefix, year, last_no)
  values (p_org, v_prefix, v_year, 1)
  on conflict (organization_id, prefix, year) do update set last_no = c.last_no + 1
  returning c.last_no into v_no;
  return v_prefix || '-' || v_year::text || '-' || lpad(v_no::text, v_digits, '0');
end $$;

-- ---------------------------------------------------------------------
-- Status bukti mengikuti lampiran aktif.
-- ---------------------------------------------------------------------
create or replace function private.refresh_evidence_status(p_entry_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_has boolean;
begin
  select exists (select 1 from public.attachments a where a.entry_id = p_entry_id and a.status = 'aktif') into v_has;
  if v_has then
    update public.journal_entries e set evidence_status = 'lengkap', evidence_reason = null
    where e.id = p_entry_id and e.evidence_status <> 'lengkap';
  else
    update public.journal_entries e set evidence_status = 'belum_ada', evidence_reason = null
    where e.id = p_entry_id and e.evidence_status = 'lengkap';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Simpan draft. Draft tidak memiliki baris jurnal dan tidak memengaruhi saldo.
-- ---------------------------------------------------------------------
create or replace function public.save_draft(
  p_org uuid, p_payload jsonb, p_entry_id uuid default null, p_idempotency_key uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_kind text := p_payload ->> 'kind';
  v_date date;
  v_amount bigint;
  v_lines jsonb := p_payload -> 'lines';
  v_ev_status text := coalesce(nullif(p_payload ->> 'evidence_status', ''), 'belum_ada');
  v_ev_reason text := nullif(trim(coalesce(p_payload ->> 'evidence_reason', '')), '');
  v_existing public.journal_entries;
  v_term uuid;
begin
  perform private.require_role(p_org, array['bendahara']);

  if p_entry_id is null and p_idempotency_key is not null then
    select e.id into v_id from public.journal_entries e
    where e.organization_id = p_org and e.idempotency_key = p_idempotency_key;
    if found then
      return v_id;
    end if;
  end if;

  if v_kind is null or v_kind not in ('pemasukan', 'pengeluaran', 'transfer', 'saldo_awal', 'penyesuaian') then
    raise exception 'Jenis transaksi tidak valid.' using errcode = '22023';
  end if;
  begin
    v_date := (p_payload ->> 'entry_date')::date;
  exception when others then
    raise exception 'Tanggal transaksi tidak valid.' using errcode = '22007';
  end;
  if v_date is null then
    raise exception 'Tanggal transaksi wajib diisi.' using errcode = '22007';
  end if;

  if v_kind = 'penyesuaian' then
    if v_lines is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) < 2 then
      raise exception 'Jurnal penyesuaian memerlukan minimal dua baris.' using errcode = '22023';
    end if;
    select coalesce(sum(coalesce(nullif(l ->> 'debit', '')::numeric, 0)), 0)::bigint into v_amount
    from jsonb_array_elements(v_lines) l;
  else
    begin
      v_amount := (p_payload ->> 'amount')::numeric;
      if (p_payload ->> 'amount')::numeric <> trunc((p_payload ->> 'amount')::numeric) then
        raise exception 'pecahan';
      end if;
    exception when others then
      raise exception 'Nominal harus berupa angka rupiah utuh.' using errcode = '22023';
    end;
    v_lines := null;
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Nominal harus lebih besar dari nol.' using errcode = '22023';
  end if;
  if v_ev_status not in ('belum_ada', 'tidak_tersedia') then
    v_ev_status := 'belum_ada';
  end if;
  if v_ev_status = 'tidak_tersedia' and v_ev_reason is null then
    raise exception 'Alasan bukti tidak tersedia wajib diisi.' using errcode = '22023';
  end if;

  if p_entry_id is not null then
    select * into v_existing from public.journal_entries e
    where e.id = p_entry_id and e.organization_id = p_org for update;
    if not found then
      raise exception 'Transaksi tidak ditemukan.' using errcode = 'P0002';
    end if;
    if v_existing.status <> 'draft' then
      raise exception 'Transaksi yang sudah dibukukan tidak dapat diubah.' using errcode = '42501',
        hint = 'Gunakan pembalikan lalu catat transaksi pengganti.';
    end if;
    update public.journal_entries e set
      kind = v_kind,
      flow_class = v_kind,
      entry_date = v_date,
      amount = v_amount,
      description = trim(coalesce(p_payload ->> 'description', '')),
      counterparty = nullif(trim(coalesce(p_payload ->> 'counterparty', '')), ''),
      notes = nullif(trim(coalesce(p_payload ->> 'notes', '')), ''),
      fund_id = nullif(p_payload ->> 'fund_id', '')::uuid,
      account_id = nullif(p_payload ->> 'account_id', '')::uuid,
      category_id = case when v_kind in ('pemasukan', 'pengeluaran') then nullif(p_payload ->> 'category_id', '')::uuid end,
      to_fund_id = case when v_kind = 'transfer' then nullif(p_payload ->> 'to_fund_id', '')::uuid end,
      to_account_id = case when v_kind = 'transfer' then nullif(p_payload ->> 'to_account_id', '')::uuid end,
      is_one_off = coalesce((p_payload ->> 'is_one_off')::boolean, false),
      manual_lines = v_lines,
      need_id = nullif(p_payload ->> 'need_id', '')::uuid,
      evidence_status = case when e.evidence_status = 'lengkap' then 'lengkap' else v_ev_status end,
      evidence_reason = case when e.evidence_status = 'lengkap' then null else v_ev_reason end,
      updated_by = v_uid
    where e.id = p_entry_id;
    return p_entry_id;
  end if;

  select t.id into v_term from public.management_terms t where t.organization_id = p_org and t.status = 'aktif';

  insert into public.journal_entries (
    organization_id, kind, flow_class, status, entry_date, amount, description, counterparty, notes,
    fund_id, account_id, category_id, to_fund_id, to_account_id, is_one_off, manual_lines,
    need_id, replaces_id, evidence_status, evidence_reason, idempotency_key, term_id, created_by, updated_by
  ) values (
    p_org, v_kind, v_kind, 'draft', v_date, v_amount,
    trim(coalesce(p_payload ->> 'description', '')),
    nullif(trim(coalesce(p_payload ->> 'counterparty', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'notes', '')), ''),
    nullif(p_payload ->> 'fund_id', '')::uuid,
    nullif(p_payload ->> 'account_id', '')::uuid,
    case when v_kind in ('pemasukan', 'pengeluaran') then nullif(p_payload ->> 'category_id', '')::uuid end,
    case when v_kind = 'transfer' then nullif(p_payload ->> 'to_fund_id', '')::uuid end,
    case when v_kind = 'transfer' then nullif(p_payload ->> 'to_account_id', '')::uuid end,
    coalesce((p_payload ->> 'is_one_off')::boolean, false),
    v_lines,
    nullif(p_payload ->> 'need_id', '')::uuid,
    nullif(p_payload ->> 'replaces_id', '')::uuid,
    v_ev_status, v_ev_reason, p_idempotency_key, v_term, v_uid, v_uid
  )
  on conflict (organization_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    -- Permintaan kembar yang datang bersamaan: kembalikan transaksi yang sudah tersimpan.
    select e.id into v_id from public.journal_entries e
    where e.organization_id = p_org and e.idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Validasi dana dan rekening saat pembukuan.
-- ---------------------------------------------------------------------
create or replace function private.assert_fund_usable(p_org uuid, p_fund uuid, p_label text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_fund public.funds;
  v_status text;
begin
  if p_fund is null then
    raise exception '% wajib dipilih.', p_label using errcode = '23514';
  end if;
  select * into v_fund from public.funds f where f.id = p_fund and f.organization_id = p_org;
  if not found then
    raise exception '% tidak ditemukan.', p_label using errcode = '23503';
  end if;
  if not v_fund.is_active then
    raise exception '% "%" sudah tidak aktif.', p_label, v_fund.name using errcode = '23514';
  end if;
  if v_fund.kind = 'program' then
    select p.status into v_status from public.programs p where p.fund_id = p_fund;
    if v_status = 'diarsipkan' then
      raise exception 'Program "%" sudah diarsipkan dan tidak menerima transaksi baru.', v_fund.name using errcode = '23514';
    end if;
  end if;
end $$;

create or replace function private.assert_cash_account(p_org uuid, p_account uuid, p_label text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_acc public.accounts;
begin
  if p_account is null then
    raise exception '% wajib dipilih.', p_label using errcode = '23514';
  end if;
  select * into v_acc from public.accounts a where a.id = p_account and a.organization_id = p_org;
  if not found then
    raise exception '% tidak ditemukan.', p_label using errcode = '23503';
  end if;
  if not v_acc.is_cash then
    raise exception '% harus berupa kas atau rekening.', p_label using errcode = '23514';
  end if;
  if not v_acc.is_active then
    raise exception '% "%" sudah tidak aktif.', p_label, v_acc.name using errcode = '23514';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Bukukan. Idempoten: memanggil ulang pada transaksi yang sudah dibukukan
-- mengembalikan hasil yang sama tanpa membuat jurnal kedua.
-- ---------------------------------------------------------------------
create or replace function public.post_entry(p_entry_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e public.journal_entries;
  v_cat public.categories;
  v_ref text;
  v_equity uuid;
  v_transfer uuid;
  v_line jsonb;
  v_no int := 0;
  v_noncash boolean;
  v_debit bigint;
  v_credit bigint;
begin
  select * into e from public.journal_entries x where x.id = p_entry_id for update;
  if not found then
    raise exception 'Transaksi tidak ditemukan.' using errcode = 'P0002';
  end if;
  perform private.require_role(e.organization_id, array['bendahara']);

  if e.status in ('dibukukan', 'dibalik') then
    return jsonb_build_object('id', e.id, 'ref_no', e.ref_no, 'status', e.status, 'already_posted', true);
  end if;

  if e.entry_date > private.jakarta_today() then
    raise exception 'Tanggal transaksi tidak boleh melebihi hari ini.' using errcode = '23514',
      hint = 'Simpan sebagai draft, lalu bukukan pada tanggal transaksi.';
  end if;
  perform private.assert_period_open(e.organization_id, e.entry_date);
  if length(trim(e.description)) = 0 then
    raise exception 'Uraian wajib diisi.' using errcode = '23514';
  end if;
  if e.amount <= 0 then
    raise exception 'Nominal harus lebih besar dari nol.' using errcode = '23514';
  end if;

  perform set_config('kas.posting', 'on', true);

  if e.kind in ('pemasukan', 'pengeluaran') then
    perform private.assert_fund_usable(e.organization_id, e.fund_id, 'Dana');
    perform private.assert_cash_account(e.organization_id, e.account_id, 'Rekening');
    if e.category_id is null then
      raise exception 'Kategori wajib dipilih.' using errcode = '23514';
    end if;
    select * into v_cat from public.categories c where c.id = e.category_id and c.organization_id = e.organization_id;
    if not found then
      raise exception 'Kategori tidak ditemukan.' using errcode = '23503';
    end if;
    if v_cat.kind <> e.kind then
      raise exception 'Kategori "%" bukan kategori %.', v_cat.name, e.kind using errcode = '23514';
    end if;
    if not v_cat.is_active then
      raise exception 'Kategori "%" sudah tidak aktif.', v_cat.name using errcode = '23514';
    end if;
    if e.kind = 'pemasukan' then
      insert into public.journal_lines (organization_id, entry_id, line_no, account_id, fund_id, debit, credit) values
        (e.organization_id, e.id, 1, e.account_id, e.fund_id, e.amount, 0),
        (e.organization_id, e.id, 2, v_cat.account_id, e.fund_id, 0, e.amount);
    else
      insert into public.journal_lines (organization_id, entry_id, line_no, account_id, fund_id, debit, credit) values
        (e.organization_id, e.id, 1, v_cat.account_id, e.fund_id, e.amount, 0),
        (e.organization_id, e.id, 2, e.account_id, e.fund_id, 0, e.amount);
    end if;

  elsif e.kind = 'saldo_awal' then
    perform private.assert_fund_usable(e.organization_id, e.fund_id, 'Dana');
    perform private.assert_cash_account(e.organization_id, e.account_id, 'Rekening');
    select a.id into v_equity from public.accounts a
    where a.organization_id = e.organization_id and a.system_key = 'saldo_dana_awal';
    if v_equity is null then
      raise exception 'Akun Saldo Dana Awal belum tersedia di daftar akun.' using errcode = '23503';
    end if;
    insert into public.journal_lines (organization_id, entry_id, line_no, account_id, fund_id, debit, credit) values
      (e.organization_id, e.id, 1, e.account_id, e.fund_id, e.amount, 0),
      (e.organization_id, e.id, 2, v_equity, e.fund_id, 0, e.amount);

  elsif e.kind = 'transfer' then
    perform private.assert_fund_usable(e.organization_id, e.fund_id, 'Dana asal');
    perform private.assert_fund_usable(e.organization_id, e.to_fund_id, 'Dana tujuan');
    perform private.assert_cash_account(e.organization_id, e.account_id, 'Rekening asal');
    perform private.assert_cash_account(e.organization_id, e.to_account_id, 'Rekening tujuan');
    if e.fund_id = e.to_fund_id and e.account_id = e.to_account_id then
      raise exception 'Asal dan tujuan transfer tidak boleh sama.' using errcode = '23514',
        hint = 'Ubah rekening tujuan atau dana tujuan.';
    end if;
    insert into public.journal_lines (organization_id, entry_id, line_no, account_id, fund_id, debit, credit) values
      (e.organization_id, e.id, 1, e.to_account_id, e.to_fund_id, e.amount, 0),
      (e.organization_id, e.id, 2, e.account_id, e.fund_id, 0, e.amount);
    if e.fund_id <> e.to_fund_id then
      select a.id into v_transfer from public.accounts a
      where a.organization_id = e.organization_id and a.system_key = 'transfer_antardana';
      if v_transfer is null then
        raise exception 'Akun Transfer Antardana belum tersedia di daftar akun.' using errcode = '23503';
      end if;
      insert into public.journal_lines (organization_id, entry_id, line_no, account_id, fund_id, debit, credit) values
        (e.organization_id, e.id, 3, v_transfer, e.fund_id, e.amount, 0),
        (e.organization_id, e.id, 4, v_transfer, e.to_fund_id, 0, e.amount);
    end if;

  elsif e.kind = 'penyesuaian' then
    if e.manual_lines is null or jsonb_array_length(e.manual_lines) < 2 then
      raise exception 'Jurnal penyesuaian memerlukan minimal dua baris.' using errcode = '23514';
    end if;
    for v_line in select * from jsonb_array_elements(e.manual_lines) loop
      v_no := v_no + 1;
      v_debit := coalesce(nullif(v_line ->> 'debit', '')::numeric, 0)::bigint;
      v_credit := coalesce(nullif(v_line ->> 'credit', '')::numeric, 0)::bigint;
      if nullif(v_line ->> 'account_id', '') is null or nullif(v_line ->> 'fund_id', '') is null then
        raise exception 'Baris % belum memiliki akun atau dana.', v_no using errcode = '23514';
      end if;
      if not ((v_debit > 0 and v_credit = 0) or (v_credit > 0 and v_debit = 0)) then
        raise exception 'Baris % harus diisi di salah satu kolom saja: debit atau kredit.', v_no using errcode = '23514';
      end if;
      if not exists (select 1 from public.accounts a where a.id = (v_line ->> 'account_id')::uuid
                     and a.organization_id = e.organization_id and a.is_active) then
        raise exception 'Akun pada baris % tidak ditemukan atau tidak aktif.', v_no using errcode = '23503';
      end if;
      perform private.assert_fund_usable(e.organization_id, (v_line ->> 'fund_id')::uuid, 'Dana pada baris ' || v_no);
      insert into public.journal_lines (organization_id, entry_id, line_no, account_id, fund_id, debit, credit, memo)
      values (e.organization_id, e.id, v_no, (v_line ->> 'account_id')::uuid, (v_line ->> 'fund_id')::uuid,
        v_debit, v_credit, nullif(trim(coalesce(v_line ->> 'memo', '')), ''));
    end loop;
    if exists (
      select 1 from public.journal_lines l where l.entry_id = e.id
      group by l.fund_id having sum(l.debit) <> sum(l.credit)
    ) then
      raise exception 'Jurnal tidak seimbang: total debit harus sama dengan total kredit pada setiap dana.' using errcode = '23514';
    end if;
  else
    raise exception 'Jenis transaksi "%" tidak dapat dibukukan dari draft.', e.kind using errcode = '23514';
  end if;

  select not exists (
    select 1 from public.journal_lines l join public.accounts a on a.id = l.account_id
    where l.entry_id = e.id and a.is_cash
  ) into v_noncash;

  v_ref := private.next_ref(e.organization_id, e.kind, e.entry_date);

  update public.journal_entries x
  set status = 'dibukukan', ref_no = v_ref, posted_by = (select auth.uid()), posted_at = now(), is_noncash = v_noncash
  where x.id = e.id;

  perform set_config('kas.posting', 'off', true);

  if e.need_id is not null then
    update public.cash_needs n set status = 'dibayar', paid_entry_id = e.id
    where n.id = e.need_id and n.organization_id = e.organization_id and n.status = 'terbuka';
  end if;

  perform private.audit(e.organization_id, 'bukukan', 'journal_entries', e.id::text,
    'Membukukan ' || v_ref || ': ' || e.description,
    jsonb_build_object('ref_no', v_ref, 'jenis', e.kind, 'nominal', e.amount, 'tanggal', e.entry_date));
  perform private.after_ledger_change(e.organization_id, 'pembukuan');

  return jsonb_build_object('id', e.id, 'ref_no', v_ref, 'status', 'dibukukan', 'already_posted', false);
end $$;

create or replace function public.save_and_post(
  p_org uuid, p_payload jsonb, p_entry_id uuid default null, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  v_id := public.save_draft(p_org, p_payload, p_entry_id, p_idempotency_key);
  return public.post_entry(v_id);
end $$;

-- Membukukan beberapa draft sekaligus. Draft yang tidak valid dilewati dan
-- dilaporkan per baris; draft lain tetap dibukukan.
create or replace function public.post_entries(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_one jsonb;
  v_msg text;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return v_result;
  end if;
  if cardinality(p_ids) > 500 then
    raise exception 'Maksimal 500 transaksi dalam satu kali pembukuan.' using errcode = '22023';
  end if;
  for v_id in
    select e.id from public.journal_entries e where e.id = any (p_ids) order by e.entry_date, e.created_at, e.id
  loop
    begin
      v_one := public.post_entry(v_id);
      v_result := v_result || jsonb_build_array(v_one || jsonb_build_object('ok', true));
    exception when others then
      get stacked diagnostics v_msg = message_text;
      perform set_config('kas.posting', 'off', true);
      v_result := v_result || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', false, 'error', v_msg));
    end;
  end loop;
  return v_result;
end $$;

-- ---------------------------------------------------------------------
-- Pembalikan. Riwayat transaksi asal tetap ada; saldo diperbaiki oleh
-- jurnal pembalikan yang merupakan kebalikan persis jurnal asal.
-- ---------------------------------------------------------------------
create or replace function public.reverse_entry(
  p_entry_id uuid, p_reason text, p_date date default null, p_create_replacement boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e public.journal_entries;
  v_uid uuid := (select auth.uid());
  v_date date := coalesce(p_date, private.jakarta_today());
  v_ref text;
  v_rev uuid := gen_random_uuid();
  v_repl uuid;
  v_term uuid;
begin
  select * into e from public.journal_entries x where x.id = p_entry_id for update;
  if not found then
    raise exception 'Transaksi tidak ditemukan.' using errcode = 'P0002';
  end if;
  perform private.require_role(e.organization_id, array['bendahara']);

  if e.status = 'dibalik' then
    return jsonb_build_object('id', e.id, 'reversal_id', e.reversed_by_id, 'already_reversed', true,
      'reversal_ref', (select r.ref_no from public.journal_entries r where r.id = e.reversed_by_id));
  end if;
  if e.status <> 'dibukukan' then
    raise exception 'Hanya transaksi yang sudah dibukukan yang dapat dibalik.' using errcode = '23514',
      hint = 'Draft dapat langsung diubah atau dihapus.';
  end if;
  if e.kind = 'pembalikan' then
    raise exception 'Jurnal pembalikan tidak dapat dibalik.' using errcode = '23514',
      hint = 'Catat transaksi baru sebagai gantinya.';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Alasan pembalikan wajib diisi.' using errcode = '22023';
  end if;
  if v_date < e.entry_date then
    raise exception 'Tanggal pembalikan tidak boleh lebih awal dari tanggal transaksi asal.' using errcode = '23514';
  end if;
  if v_date > private.jakarta_today() then
    raise exception 'Tanggal pembalikan tidak boleh melebihi hari ini.' using errcode = '23514';
  end if;
  perform private.assert_period_open(e.organization_id, v_date);

  select t.id into v_term from public.management_terms t where t.organization_id = e.organization_id and t.status = 'aktif';
  v_ref := private.next_ref(e.organization_id, 'pembalikan', v_date);

  insert into public.journal_entries (
    id, organization_id, kind, flow_class, status, entry_date, ref_no, description, counterparty, amount,
    fund_id, account_id, category_id, to_fund_id, to_account_id, is_one_off, is_noncash,
    evidence_status, evidence_reason, reverses_id, term_id, created_by, updated_by, posted_by, posted_at
  ) values (
    v_rev, e.organization_id, 'pembalikan', e.flow_class, 'dibukukan', v_date, v_ref,
    'Pembalikan ' || e.ref_no || ': ' || trim(p_reason), e.counterparty, e.amount,
    e.fund_id, e.account_id, e.category_id, e.to_fund_id, e.to_account_id, e.is_one_off, e.is_noncash,
    'tidak_tersedia', 'Jurnal pembalikan, bukti mengikuti transaksi asal', e.id, v_term, v_uid, v_uid, v_uid, now()
  );

  perform set_config('kas.posting', 'on', true);
  insert into public.journal_lines (organization_id, entry_id, line_no, account_id, fund_id, debit, credit, memo)
  select l.organization_id, v_rev, l.line_no, l.account_id, l.fund_id, l.credit, l.debit, l.memo
  from public.journal_lines l where l.entry_id = e.id;

  update public.journal_entries x
  set status = 'dibalik', reversed_by_id = v_rev, reversed_by = v_uid, reversed_at = now(), reversal_reason = trim(p_reason)
  where x.id = e.id;
  perform set_config('kas.posting', 'off', true);

  update public.cash_needs n set status = 'terbuka', paid_entry_id = null
  where n.paid_entry_id = e.id and n.status = 'dibayar';

  if p_create_replacement then
    insert into public.journal_entries (
      organization_id, kind, flow_class, status, entry_date, description, counterparty, notes, amount,
      fund_id, account_id, category_id, to_fund_id, to_account_id, is_one_off, manual_lines,
      replaces_id, term_id, created_by, updated_by
    ) values (
      e.organization_id, e.kind, e.flow_class, 'draft', e.entry_date, e.description, e.counterparty, e.notes, e.amount,
      e.fund_id, e.account_id, e.category_id, e.to_fund_id, e.to_account_id, e.is_one_off,
      case when e.kind = 'penyesuaian' then (
        select jsonb_agg(jsonb_build_object('account_id', l.account_id, 'fund_id', l.fund_id, 'debit', l.debit, 'credit', l.credit, 'memo', l.memo) order by l.line_no)
        from public.journal_lines l where l.entry_id = e.id) end,
      e.id, v_term, v_uid, v_uid
    ) returning id into v_repl;
  end if;

  perform private.audit(e.organization_id, 'balik', 'journal_entries', e.id::text,
    'Membalik ' || e.ref_no || ' dengan ' || v_ref || ': ' || trim(p_reason),
    jsonb_build_object('ref_asal', e.ref_no, 'ref_pembalikan', v_ref, 'alasan', trim(p_reason), 'nominal', e.amount,
      'transaksi_pengganti', v_repl));
  perform private.after_ledger_change(e.organization_id, 'pembukuan');

  return jsonb_build_object('id', e.id, 'reversal_id', v_rev, 'reversal_ref', v_ref, 'replacement_id', v_repl, 'already_reversed', false);
end $$;

create or replace function public.delete_draft(p_entry_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.journal_entries;
begin
  select * into e from public.journal_entries x where x.id = p_entry_id for update;
  if not found then
    return;
  end if;
  perform private.require_role(e.organization_id, array['bendahara']);
  if e.status <> 'draft' then
    raise exception 'Hanya draft yang dapat dihapus.' using errcode = '42501',
      hint = 'Transaksi yang sudah dibukukan dibatalkan dengan pembalikan.';
  end if;
  update public.attachments a
  set status = 'dihapus', removed_by = (select auth.uid()), removed_at = now(), remove_reason = 'Draft dihapus'
  where a.entry_id = e.id and a.status = 'aktif';
  delete from public.journal_entries x where x.id = e.id;
  perform private.audit(e.organization_id, 'hapus_draft', 'journal_entries', e.id::text,
    'Menghapus draft: ' || coalesce(nullif(e.description, ''), '(tanpa uraian)'),
    jsonb_build_object('jenis', e.kind, 'nominal', e.amount, 'tanggal', e.entry_date));
end $$;

-- ---------------------------------------------------------------------
-- Bukti transaksi
-- ---------------------------------------------------------------------
create or replace function public.set_evidence_status(p_entry_id uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.journal_entries;
begin
  select * into e from public.journal_entries x where x.id = p_entry_id for update;
  if not found then
    raise exception 'Transaksi tidak ditemukan.' using errcode = 'P0002';
  end if;
  perform private.require_role(e.organization_id, array['bendahara']);
  if p_status not in ('belum_ada', 'tidak_tersedia') then
    raise exception 'Status bukti tidak valid.' using errcode = '22023';
  end if;
  if exists (select 1 from public.attachments a where a.entry_id = e.id and a.status = 'aktif') then
    raise exception 'Transaksi ini sudah memiliki bukti. Status bukti mengikuti lampiran.' using errcode = '23514';
  end if;
  if p_status = 'tidak_tersedia' and length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Alasan bukti tidak tersedia wajib diisi.' using errcode = '22023';
  end if;
  update public.journal_entries x
  set evidence_status = p_status, evidence_reason = case when p_status = 'tidak_tersedia' then trim(p_reason) end,
      updated_by = (select auth.uid())
  where x.id = e.id;
  perform private.audit(e.organization_id, 'status_bukti', 'journal_entries', e.id::text,
    'Mengubah status bukti ' || coalesce(e.ref_no, 'draft') || ' menjadi ' ||
      case p_status when 'tidak_tersedia' then 'Tidak Tersedia' else 'Belum Ada' end,
    jsonb_build_object('alasan', p_reason));
  perform private.after_ledger_change(e.organization_id, 'perubahan');
end $$;

create or replace function public.register_attachment(
  p_org uuid, p_entry_id uuid, p_program_id uuid, p_kind text, p_title text,
  p_storage_path text, p_file_name text, p_mime_type text, p_size_bytes bigint, p_replaces_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_max bigint;
  v_entry public.journal_entries;
  v_old public.attachments;
begin
  perform private.require_role(p_org, array['bendahara']);
  if p_kind not in ('bukti', 'dokumen') then
    raise exception 'Jenis lampiran tidak valid.' using errcode = '22023';
  end if;
  if p_storage_path is null or position(p_org::text || '/' in p_storage_path) <> 1 then
    raise exception 'Lokasi berkas tidak sesuai dengan organisasi.' using errcode = '42501';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'application/pdf') then
    raise exception 'Jenis berkas tidak didukung. Gunakan JPG, PNG, atau PDF.' using errcode = '22023';
  end if;
  v_max := (private.org_setting_num(p_org, 10, 'attachment', 'max_mb') * 1024 * 1024)::bigint;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > v_max then
    raise exception 'Ukuran berkas melebihi batas % MB.', (v_max / 1024 / 1024) using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'bukti' and o.name = p_storage_path) then
    raise exception 'Berkas belum terunggah ke penyimpanan.' using errcode = 'P0002',
      hint = 'Ulangi unggahan, lalu simpan kembali.';
  end if;
  if p_kind = 'bukti' then
    select * into v_entry from public.journal_entries e where e.id = p_entry_id and e.organization_id = p_org;
    if not found then
      raise exception 'Transaksi tidak ditemukan.' using errcode = 'P0002';
    end if;
  end if;
  if p_replaces_id is not null then
    select * into v_old from public.attachments a where a.id = p_replaces_id and a.organization_id = p_org for update;
    if not found then
      raise exception 'Lampiran yang akan diganti tidak ditemukan.' using errcode = 'P0002';
    end if;
    update public.attachments a
    set status = 'diganti', removed_by = (select auth.uid()), removed_at = now(), remove_reason = 'Diganti dengan berkas baru'
    where a.id = v_old.id;
  end if;

  insert into public.attachments (organization_id, entry_id, program_id, kind, title, storage_path, file_name,
    mime_type, size_bytes, replaces_id, uploaded_by, uploaded_by_name)
  values (p_org, case when p_kind = 'bukti' then p_entry_id end, p_program_id, p_kind, nullif(trim(coalesce(p_title, '')), ''),
    p_storage_path, p_file_name, p_mime_type, p_size_bytes, p_replaces_id, (select auth.uid()), private.actor_name(p_org))
  returning id into v_id;

  if p_kind = 'bukti' then
    perform private.refresh_evidence_status(p_entry_id);
  end if;
  perform private.audit(p_org,
    case when p_replaces_id is not null then 'ganti_bukti' when p_kind = 'bukti' then 'unggah_bukti' else 'unggah_dokumen' end,
    'attachments', v_id::text,
    case when p_replaces_id is not null then 'Mengganti lampiran "' || v_old.file_name || '" dengan "' || p_file_name || '"'
         when p_kind = 'bukti' then 'Mengunggah bukti "' || p_file_name || '" untuk ' || coalesce(v_entry.ref_no, 'draft')
         else 'Mengunggah dokumen arsip "' || p_file_name || '"' end,
    jsonb_build_object('entry_id', p_entry_id, 'ref_no', v_entry.ref_no, 'ukuran', p_size_bytes, 'menggantikan', p_replaces_id));
  if p_kind = 'bukti' and v_entry.status <> 'draft' then
    perform private.after_ledger_change(p_org, 'perubahan');
  end if;
  return v_id;
end $$;

-- Lampiran tidak pernah dihapus fisik oleh pengguna; statusnya ditandai
-- sehingga riwayat bukti transaksi yang sudah dibukukan tetap ada.
create or replace function public.remove_attachment(p_attachment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.attachments;
  v_entry public.journal_entries;
begin
  select * into a from public.attachments x where x.id = p_attachment_id for update;
  if not found then
    raise exception 'Lampiran tidak ditemukan.' using errcode = 'P0002';
  end if;
  perform private.require_role(a.organization_id, array['bendahara']);
  if a.status <> 'aktif' then
    return;
  end if;
  if a.entry_id is not null then
    select * into v_entry from public.journal_entries e where e.id = a.entry_id;
  end if;
  if (a.entry_id is null or v_entry.status <> 'draft') and length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Alasan penghapusan lampiran wajib diisi.' using errcode = '22023';
  end if;
  update public.attachments x
  set status = 'dihapus', removed_by = (select auth.uid()), removed_at = now(), remove_reason = nullif(trim(coalesce(p_reason, '')), '')
  where x.id = a.id;
  if a.entry_id is not null then
    perform private.refresh_evidence_status(a.entry_id);
  end if;
  perform private.audit(a.organization_id, 'hapus_lampiran', 'attachments', a.id::text,
    'Menandai lampiran "' || a.file_name || '" sebagai dihapus' || coalesce(' dari ' || v_entry.ref_no, ''),
    jsonb_build_object('alasan', p_reason, 'entry_id', a.entry_id));
  if a.entry_id is not null and v_entry.status <> 'draft' then
    perform private.after_ledger_change(a.organization_id, 'perubahan');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Impor transaksi historis sebagai draft. Idempoten per baris melalui
-- import_row_hash: unggahan ulang berkas yang sama tidak menggandakan data.
-- ---------------------------------------------------------------------
create or replace function public.check_import_rows(p_org uuid, p_rows jsonb) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'row_no', (r ->> 'row_no')::int,
    'already_imported', exists (
      select 1 from public.journal_entries e
      where e.organization_id = p_org and e.import_row_hash = r ->> 'hash'),
    'similar', (
      select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'ref_no', e.ref_no, 'status', e.status, 'description', e.description)), '[]'::jsonb)
      from public.journal_entries e
      where e.organization_id = p_org
        and e.entry_date = (r ->> 'entry_date')::date
        and e.amount = (r ->> 'amount')::bigint
        and e.kind = r ->> 'kind'
        and e.status in ('draft', 'dibukukan')
        and e.import_row_hash is distinct from r ->> 'hash')
  ) order by (r ->> 'row_no')::int), '[]'::jsonb)
  from jsonb_array_elements(p_rows) r
  where private.is_member(p_org)
$$;

create or replace function public.import_transactions(
  p_org uuid, p_file_name text, p_file_hash text, p_mapping jsonb, p_rows jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := (select auth.uid());
  v_batch uuid;
  v_term uuid;
  r jsonb;
  v_total int := 0;
  v_imported int := 0;
  v_id uuid;
  v_kind text;
begin
  perform private.require_role(p_org, array['bendahara']);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Tidak ada baris untuk diimpor.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'Maksimal 2.000 baris per impor. Bagi berkas menjadi beberapa bagian.' using errcode = '22023';
  end if;
  select t.id into v_term from public.management_terms t where t.organization_id = p_org and t.status = 'aktif';

  insert into public.import_batches (organization_id, file_name, file_hash, mapping, total_rows, created_by)
  values (p_org, p_file_name, p_file_hash, coalesce(p_mapping, '{}'::jsonb), jsonb_array_length(p_rows), v_uid)
  returning id into v_batch;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_kind := r ->> 'kind';
    if v_kind not in ('pemasukan', 'pengeluaran', 'transfer') then
      raise exception 'Baris %: jenis transaksi tidak valid.', r ->> 'row_no' using errcode = '22023';
    end if;
    if nullif(r ->> 'hash', '') is null then
      raise exception 'Baris %: tanda pengenal baris tidak ada.', r ->> 'row_no' using errcode = '22023';
    end if;
    if (r ->> 'amount')::bigint <= 0 then
      raise exception 'Baris %: nominal harus lebih besar dari nol.', r ->> 'row_no' using errcode = '22023';
    end if;
    v_id := null;
    insert into public.journal_entries (
      organization_id, kind, flow_class, status, entry_date, amount, description, counterparty, notes,
      fund_id, account_id, category_id, to_fund_id, to_account_id,
      import_batch_id, import_row_hash, term_id, created_by, updated_by
    ) values (
      p_org, v_kind, v_kind, 'draft', (r ->> 'entry_date')::date, (r ->> 'amount')::bigint,
      trim(coalesce(r ->> 'description', '')), nullif(trim(coalesce(r ->> 'counterparty', '')), ''),
      nullif(trim(coalesce(r ->> 'notes', '')), ''),
      nullif(r ->> 'fund_id', '')::uuid, nullif(r ->> 'account_id', '')::uuid,
      case when v_kind <> 'transfer' then nullif(r ->> 'category_id', '')::uuid end,
      case when v_kind = 'transfer' then nullif(r ->> 'to_fund_id', '')::uuid end,
      case when v_kind = 'transfer' then nullif(r ->> 'to_account_id', '')::uuid end,
      v_batch, r ->> 'hash', v_term, v_uid, v_uid
    )
    on conflict (organization_id, import_row_hash) where import_row_hash is not null do nothing
    returning id into v_id;
    if v_id is not null then
      v_imported := v_imported + 1;
    end if;
  end loop;

  update public.import_batches b
  set imported_rows = v_imported, duplicate_rows = v_total - v_imported
  where b.id = v_batch;

  perform private.audit(p_org, 'impor', 'import_batches', v_batch::text,
    'Mengimpor ' || v_imported || ' draft dari "' || p_file_name || '"' ||
      case when v_total - v_imported > 0 then ' (' || (v_total - v_imported) || ' baris sudah pernah diimpor dan dilewati)' else '' end,
    jsonb_build_object('total', v_total, 'diimpor', v_imported, 'dilewati', v_total - v_imported));

  return jsonb_build_object('batch_id', v_batch, 'total', v_total, 'imported', v_imported, 'duplicates', v_total - v_imported);
end $$;
