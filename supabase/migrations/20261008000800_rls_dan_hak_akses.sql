-- =====================================================================
-- Kas IPNU · 08 · Row Level Security dan hak akses
-- Prinsip:
--   * RLS aktif di SEMUA tabel aplikasi.
--   * Anggota aktif hanya dapat membaca data organisasinya.
--   * Buku besar, bukti, anggota, audit, periode, rekonsiliasi, dan impor
--     tidak memiliki policy tulis. Perubahan hanya lewat fungsi RPC yang
--     memeriksa role di dalam database.
--   * Pengguna login tanpa keanggotaan tidak dapat membaca apa pun.
--   * anon tidak memiliki hak apa pun.
-- =====================================================================

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Baca: anggota aktif organisasi ------------------------------------
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_member(id));

do $$
declare t text;
begin
  foreach t in array array['management_terms', 'organization_members', 'accounts', 'funds', 'programs', 'categories',
    'budgets', 'budget_items', 'import_batches', 'cash_needs', 'journal_entries', 'journal_lines', 'reconciliations',
    'ref_counters', 'attachments', 'closed_periods', 'audit_logs', 'notifications', 'health_checks',
    'integration_connections', 'payment_requests', 'payment_transactions', 'settlements', 'bank_sync_runs',
    'bank_statement_entries'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(organization_id))', t || '_select', t);
  end loop;
end $$;

create policy webhook_events_select on public.webhook_events for select to authenticated
  using (organization_id is not null and private.has_role(organization_id, array['admin']));

create policy app_feature_flags_select on public.app_feature_flags for select to authenticated using (true);

-- Tulis langsung: hanya tabel master dan perencanaan -------------------
create policy organizations_update on public.organizations for update to authenticated
  using (private.has_role(id, array['admin'])) with check (private.has_role(id, array['admin']));

create policy management_terms_write on public.management_terms for all to authenticated
  using (private.has_role(organization_id, array['admin'])) with check (private.has_role(organization_id, array['admin']));

create policy accounts_insert on public.accounts for insert to authenticated
  with check (private.has_role(organization_id, array['admin', 'bendahara']));
create policy accounts_update on public.accounts for update to authenticated
  using (private.has_role(organization_id, array['admin', 'bendahara'])) with check (private.has_role(organization_id, array['admin', 'bendahara']));
create policy accounts_delete on public.accounts for delete to authenticated
  using (private.has_role(organization_id, array['admin', 'bendahara']));

create policy categories_insert on public.categories for insert to authenticated
  with check (private.has_role(organization_id, array['admin', 'bendahara']));
create policy categories_update on public.categories for update to authenticated
  using (private.has_role(organization_id, array['admin', 'bendahara'])) with check (private.has_role(organization_id, array['admin', 'bendahara']));
create policy categories_delete on public.categories for delete to authenticated
  using (private.has_role(organization_id, array['admin', 'bendahara']));

create policy budgets_update on public.budgets for update to authenticated
  using (private.has_role(organization_id, array['bendahara'])) with check (private.has_role(organization_id, array['bendahara']));

create policy budget_items_write on public.budget_items for all to authenticated
  using (private.has_role(organization_id, array['bendahara'])) with check (private.has_role(organization_id, array['bendahara']));

create policy cash_needs_write on public.cash_needs for all to authenticated
  using (private.has_role(organization_id, array['bendahara'])) with check (private.has_role(organization_id, array['bendahara']));

-- Status dibaca milik masing-masing pengguna ---------------------------
create policy notification_reads_select on public.notification_reads for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_reads_insert on public.notification_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.notifications n where n.id = notification_id and private.is_member(n.organization_id)));
create policy notification_reads_delete on public.notification_reads for delete to authenticated
  using (user_id = (select auth.uid()));

-- Penjaga akun dan kategori sistem --------------------------------------
create or replace function private.accounts_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_setting('kas.purge_demo', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.system_key is not null then
      raise exception 'Akun sistem "%" tidak dapat dihapus.', old.name using errcode = '42501';
    end if;
    return old;
  end if;
  if new.system_key is distinct from old.system_key or new.organization_id <> old.organization_id then
    raise exception 'Penanda akun sistem tidak dapat diubah.' using errcode = '42501';
  end if;
  if (new.type <> old.type or new.is_cash <> old.is_cash)
     and exists (select 1 from public.journal_lines l where l.account_id = old.id) then
    raise exception 'Jenis akun "%" tidak dapat diubah karena sudah memiliki jurnal.', old.name using errcode = '23514',
      hint = 'Nonaktifkan akun ini dan buat akun baru.';
  end if;
  if old.system_key is not null and (new.type <> old.type or not new.is_active) then
    raise exception 'Akun sistem "%" tidak dapat diubah jenisnya atau dinonaktifkan.', old.name using errcode = '42501';
  end if;
  return new;
end $$;

create trigger accounts_guard before update or delete on public.accounts
  for each row execute function private.accounts_guard();

create or replace function private.categories_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_type text;
begin
  if tg_op = 'DELETE' then
    if old.system_key is not null and current_setting('kas.purge_demo', true) is distinct from 'on' then
      raise exception 'Kategori sistem "%" tidak dapat dihapus.', old.name using errcode = '42501';
    end if;
    return old;
  end if;
  select a.type into v_type from public.accounts a where a.id = new.account_id;
  if (new.kind = 'pemasukan' and v_type <> 'pendapatan') or (new.kind = 'pengeluaran' and v_type <> 'beban') then
    raise exception 'Kategori % harus dipetakan ke akun %.', new.kind,
      case new.kind when 'pemasukan' then 'pendapatan' else 'beban' end using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.system_key is distinct from old.system_key or new.kind <> old.kind) then
    raise exception 'Jenis kategori tidak dapat diubah.' using errcode = '42501',
      hint = 'Buat kategori baru dengan jenis yang diinginkan.';
  end if;
  return new;
end $$;

create trigger categories_guard before insert or update or delete on public.categories
  for each row execute function private.categories_guard();

-- Hak tabel -----------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.management_terms, public.accounts, public.categories, public.budget_items, public.cash_needs to authenticated;
grant update on public.organizations, public.budgets to authenticated;
grant insert, delete on public.notification_reads to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Hak fungsi ----------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema private to service_role;
grant execute on function private.is_member(uuid), private.has_role(uuid, text[]), private.try_uuid(text),
  private.severity_rank(text) to authenticated;
revoke execute on function public.run_scheduled_checks() from authenticated;

-- Objek baru yang dibuat kemudian tidak otomatis terbuka.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
