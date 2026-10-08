-- =====================================================================
-- Kas IPNU · 11 · Mode demo
-- Data contoh TIDAK pernah dimuat otomatis. Admin harus menekan tombol
-- "Muat data contoh" secara eksplisit, dan itu hanya diizinkan selama
-- organisasi belum memiliki transaksi apa pun. Selama mode demo aktif,
-- aplikasi menampilkan penanda yang jelas. "Hapus data contoh" hanya
-- tersedia dalam mode demo dan mengembalikan organisasi ke keadaan kosong.
-- =====================================================================

create or replace function private.demo_post(
  p_org uuid, p_kind text, p_date date, p_amount bigint, p_fund uuid, p_account uuid, p_category text,
  p_description text, p_counterparty text default null, p_to_fund uuid default null, p_to_account uuid default null,
  p_post boolean default true
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cat uuid;
  v_payload jsonb;
  v_id uuid;
begin
  if p_date > private.jakarta_today() then
    return null;
  end if;
  if p_category is not null then
    select c.id into v_cat from public.categories c
    where c.organization_id = p_org and c.kind = p_kind and c.name = p_category;
  end if;
  v_payload := jsonb_build_object('kind', p_kind, 'entry_date', p_date, 'amount', p_amount, 'fund_id', p_fund,
    'account_id', p_account, 'category_id', v_cat, 'description', p_description, 'counterparty', p_counterparty,
    'to_fund_id', p_to_fund, 'to_account_id', p_to_account);
  v_id := public.save_draft(p_org, v_payload, null, null);
  if p_post then
    perform public.post_entry(v_id);
  end if;
  return v_id;
end $$;

create or replace function public.load_demo_data(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_today date := private.jakarta_today();
  v_m0 date := date_trunc('month', private.jakarta_today()::timestamp)::date;
  v_umum uuid;
  v_kas uuid;
  v_bank uuid;
  v_makesta uuid; v_lakmud uuid; v_raker uuid; v_baksos uuid;
  f_makesta uuid; f_raker uuid; f_baksos uuid;
  b uuid;
  m date;
  k int;
  v_id uuid;
begin
  perform private.require_role(p_org, array['admin']);
  perform private.require_role(p_org, array['bendahara']);
  if exists (select 1 from public.journal_entries e where e.organization_id = p_org)
     or exists (select 1 from public.programs p where p.organization_id = p_org) then
    raise exception 'Data contoh hanya dapat dimuat pada organisasi yang belum memiliki transaksi atau program.' using errcode = '23514';
  end if;

  perform set_config('kas.defer_health', 'on', true);
  perform set_config('kas.skip_audit', 'on', true);

  select f.id into v_umum from public.funds f where f.organization_id = p_org and f.kind = 'umum';
  select a.id into v_kas from public.accounts a where a.organization_id = p_org and a.is_cash and a.cash_kind = 'tunai' order by a.code limit 1;
  select a.id into v_bank from public.accounts a where a.organization_id = p_org and a.is_cash and a.cash_kind = 'bank' order by a.code limit 1;
  if v_bank is null then
    insert into public.accounts (organization_id, code, name, type, is_cash, cash_kind, bank_name, description)
    values (p_org, '1-1200', 'Rekening Bank (contoh)', 'aset', true, 'bank', 'Bank Contoh', 'Rekening contoh untuk mode demo')
    returning id into v_bank;
  end if;

  -- Saldo awal lima bulan lalu
  m := (v_m0 - interval '5 months')::date;
  perform private.demo_post(p_org, 'saldo_awal', m, 1500000, v_umum, v_kas, null, 'Saldo awal kas tunai');
  perform private.demo_post(p_org, 'saldo_awal', m, 6000000, v_umum, v_bank, null, 'Saldo awal rekening bank');

  -- Operasional bulanan Kas Umum
  for k in reverse 5..0 loop
    m := (v_m0 - make_interval(months => k))::date;
    perform private.demo_post(p_org, 'pemasukan', m + 2, 1200000, v_umum, v_bank, 'Iuran', 'Iuran PAC bulan ' || private.month_name(m), 'PAC se-Kabupaten');
    if k % 2 = 0 then
      perform private.demo_post(p_org, 'pemasukan', m + 9, 750000, v_umum, v_kas, 'Donasi', 'Donasi alumni', 'Alumni IPNU');
    end if;
    perform private.demo_post(p_org, 'pengeluaran', m + 5, 350000, v_umum, v_bank, 'Kesekretariatan', 'Listrik dan internet sekretariat', 'Pengelola gedung');
    perform private.demo_post(p_org, 'pengeluaran', m + 11, 175000, v_umum, v_kas, 'ATK dan cetak', 'Cetak surat dan ATK', 'Toko ATK');
    perform private.demo_post(p_org, 'pengeluaran', m + 16, 280000, v_umum, v_kas, 'Konsumsi', 'Konsumsi rapat harian', 'Warung makan');
    perform private.demo_post(p_org, 'pengeluaran', m + 21, 220000, v_umum, v_kas, 'Transportasi', 'Transportasi kunjungan PAC', 'Pengurus');
  end loop;
  perform private.demo_post(p_org, 'transfer', (v_m0 - interval '2 months')::date + 3, 1000000, v_umum, v_bank, null, 'Tarik tunai untuk kas kecil', null, v_umum, v_kas);

  -- Program
  v_makesta := public.save_program(p_org, null, jsonb_build_object('code', 'MAKESTA', 'name', 'MAKESTA Raya', 'status', 'berjalan',
    'start_date', (v_m0 - interval '1 month')::date, 'end_date', (v_m0 + interval '1 month')::date, 'pic_name', 'Ketua Panitia MAKESTA',
    'description', 'Masa Kesetiaan Anggota tingkat kabupaten (data contoh).'));
  v_lakmud := public.save_program(p_org, null, jsonb_build_object('code', 'LAKMUD', 'name', 'LAKMUD', 'status', 'perencanaan',
    'start_date', (v_m0 + interval '2 months')::date, 'pic_name', 'Departemen Kaderisasi', 'description', 'Latihan Kader Muda (data contoh).'));
  v_raker := public.save_program(p_org, null, jsonb_build_object('code', 'RAKER', 'name', 'Rapat Kerja', 'status', 'selesai',
    'start_date', (v_m0 - interval '4 months')::date, 'end_date', (v_m0 - interval '4 months')::date + 1, 'pic_name', 'Sekretaris',
    'description', 'Rapat kerja tahunan pengurus (data contoh).'));
  v_baksos := public.save_program(p_org, null, jsonb_build_object('code', 'BAKSOS', 'name', 'Kegiatan Sosial', 'status', 'berjalan',
    'start_date', v_m0, 'pic_name', 'Departemen Sosial', 'description', 'Santunan dan bakti sosial (data contoh).'));
  select p.fund_id into f_makesta from public.programs p where p.id = v_makesta;
  select p.fund_id into f_raker from public.programs p where p.id = v_raker;
  select p.fund_id into f_baksos from public.programs p where p.id = v_baksos;

  select x.id into b from public.budgets x where x.program_id = v_makesta;
  insert into public.budget_items (organization_id, budget_id, kind, name, category_id, quantity, unit, unit_price, amount, sort_order)
  select p_org, b, v.kind, v.name, c.id, v.qty, v.unit, v.price, (v.qty * v.price)::bigint, v.ord
  from (values
    ('pemasukan', 'Alokasi Kas Umum', null, 1, 'paket', 2000000, 1),
    ('pemasukan', 'Sponsor', 'Sponsor', 1, 'paket', 1500000, 2),
    ('pemasukan', 'Kontribusi peserta', 'Penerimaan kegiatan', 60, 'orang', 25000, 3),
    ('pengeluaran', 'Sewa aula', 'Sewa tempat', 2, 'hari', 600000, 1),
    ('pengeluaran', 'Konsumsi peserta', 'Konsumsi', 60, 'orang', 35000, 2),
    ('pengeluaran', 'Modul dan sertifikat', 'ATK dan cetak', 60, 'set', 12000, 3),
    ('pengeluaran', 'Honor pemateri', 'Kaderisasi', 4, 'orang', 250000, 4),
    ('pengeluaran', 'Spanduk dan dokumentasi', 'Publikasi', 1, 'paket', 400000, 5)
  ) as v(kind, name, cat, qty, unit, price, ord)
  left join public.categories c on c.organization_id = p_org and c.kind = v.kind and c.name = v.cat;

  select x.id into b from public.budgets x where x.program_id = v_raker;
  insert into public.budget_items (organization_id, budget_id, kind, name, category_id, quantity, unit, unit_price, amount, sort_order)
  select p_org, b, v.kind, v.name, c.id, v.qty, v.unit, v.price, (v.qty * v.price)::bigint, v.ord
  from (values
    ('pemasukan', 'Alokasi Kas Umum', null, 1, 'paket', 1000000, 1),
    ('pengeluaran', 'Konsumsi', 'Konsumsi', 25, 'orang', 20000, 1),
    ('pengeluaran', 'Sewa tempat', 'Sewa tempat', 1, 'hari', 300000, 2),
    ('pengeluaran', 'ATK', 'ATK dan cetak', 1, 'paket', 100000, 3)
  ) as v(kind, name, cat, qty, unit, price, ord)
  left join public.categories c on c.organization_id = p_org and c.kind = v.kind and c.name = v.cat;

  select x.id into b from public.budgets x where x.program_id = v_baksos;
  insert into public.budget_items (organization_id, budget_id, kind, name, category_id, quantity, unit, unit_price, amount, sort_order)
  select p_org, b, v.kind, v.name, c.id, v.qty, v.unit, v.price, (v.qty * v.price)::bigint, v.ord
  from (values
    ('pemasukan', 'Donasi masyarakat', 'Donasi', 1, 'paket', 3000000, 1),
    ('pengeluaran', 'Paket santunan', 'Sosial', 30, 'paket', 75000, 1),
    ('pengeluaran', 'Transportasi distribusi', 'Transportasi', 1, 'paket', 250000, 2)
  ) as v(kind, name, cat, qty, unit, price, ord)
  left join public.categories c on c.organization_id = p_org and c.kind = v.kind and c.name = v.cat;

  -- Rapat Kerja: dialokasikan, dipakai, sisa dikembalikan
  m := (v_m0 - interval '4 months')::date;
  perform private.demo_post(p_org, 'transfer', m + 1, 1000000, v_umum, v_bank, null, 'Alokasi dana Rapat Kerja', null, f_raker, v_bank);
  perform private.demo_post(p_org, 'pengeluaran', m + 6, 480000, f_raker, v_bank, 'Konsumsi', 'Konsumsi Rapat Kerja', 'Katering');
  perform private.demo_post(p_org, 'pengeluaran', m + 6, 300000, f_raker, v_bank, 'Sewa tempat', 'Sewa ruang rapat', 'Pengelola gedung');
  perform private.demo_post(p_org, 'pengeluaran', m + 7, 90000, f_raker, v_bank, 'ATK dan cetak', 'ATK Rapat Kerja', 'Toko ATK');
  perform private.demo_post(p_org, 'transfer', m + 14, 130000, f_raker, v_bank, null, 'Pengembalian sisa dana Rapat Kerja ke Kas Umum', null, v_umum, v_bank);

  -- MAKESTA: alokasi kas umum, sponsor, dan pengeluaran berjalan
  m := (v_m0 - interval '1 month')::date;
  perform private.demo_post(p_org, 'transfer', m + 4, 2000000, v_umum, v_bank, null, 'Alokasi dana MAKESTA Raya', null, f_makesta, v_bank);
  perform private.demo_post(p_org, 'pemasukan', m + 10, 1500000, f_makesta, v_bank, 'Sponsor', 'Sponsor MAKESTA Raya', 'Sponsor lokal');
  perform private.demo_post(p_org, 'pengeluaran', m + 15, 1200000, f_makesta, v_bank, 'Sewa tempat', 'Sewa aula dua hari', 'Pengelola aula');
  perform private.demo_post(p_org, 'pengeluaran', m + 20, 720000, f_makesta, v_bank, 'ATK dan cetak', 'Cetak modul dan sertifikat', 'Percetakan');
  perform private.demo_post(p_org, 'pengeluaran', v_m0 + 1, 1400000, f_makesta, v_bank, 'Konsumsi', 'Uang muka konsumsi peserta', 'Katering');

  -- Kegiatan sosial: donasi terikat
  perform private.demo_post(p_org, 'pemasukan', v_m0 + 2, 1800000, f_baksos, v_bank, 'Donasi', 'Donasi santunan', 'Donatur');
  perform private.demo_post(p_org, 'pengeluaran', v_m0 + 4, 750000, f_baksos, v_bank, 'Sosial', 'Paket santunan tahap pertama', 'Toko sembako');

  -- Satu draft dan satu transaksi yang dibalik
  perform private.demo_post(p_org, 'pengeluaran', v_today, 125000, v_umum, v_kas, 'Perlengkapan', 'Pembelian map arsip (masih draft)', 'Toko ATK', null, null, false);
  v_id := private.demo_post(p_org, 'pengeluaran', v_m0, 500000, v_umum, v_kas, 'Lainnya', 'Salah catat nominal', 'Contoh');
  if v_id is not null then
    perform public.reverse_entry(v_id, 'Nominal salah, seharusnya Rp50.000', null, false);
    perform private.demo_post(p_org, 'pengeluaran', v_m0, 50000, v_umum, v_kas, 'Lainnya', 'Biaya administrasi (pengganti salah catat)', 'Contoh');
  end if;

  -- Kebutuhan kas mendatang
  insert into public.cash_needs (organization_id, name, fund_id, direction, kind, amount, due_date, notes, created_by) values
    (p_org, 'Sewa sekretariat triwulan', v_umum, 'keluar', 'kewajiban', 900000, v_today + 12, 'Tagihan sudah diterima', (select auth.uid())),
    (p_org, 'Pembelian printer', v_umum, 'keluar', 'rencana', 1800000, v_today + 24, 'Masih rencana', (select auth.uid())),
    (p_org, 'Iuran PAC yang belum masuk', v_umum, 'masuk', 'rencana', 1200000, v_today + 15, 'Perkiraan penerimaan', (select auth.uid())),
    (p_org, 'Pelunasan konsumsi MAKESTA', f_makesta, 'keluar', 'kewajiban', 400000, v_today + 7, 'Sisa pembayaran katering', (select auth.uid()));

  perform set_config('kas.skip_audit', 'off', true);
  perform set_config('kas.defer_health', 'off', true);

  update public.organizations o set settings = jsonb_set(o.settings, '{is_demo}', 'true'::jsonb, true) where o.id = p_org;
  perform private.audit(p_org, 'muat_data_contoh', 'organizations', p_org::text, 'Memuat data contoh (mode demo aktif)');
  perform private.after_ledger_change(p_org, 'manual');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.clear_demo_data(p_org uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role(p_org, array['admin']);
  if coalesce((private.org_setting(p_org, 'is_demo') #>> '{}')::boolean, false) is not true then
    raise exception 'Organisasi ini tidak dalam mode demo. Data tidak dihapus.' using errcode = '42501';
  end if;
  perform set_config('kas.purge_demo', 'on', true);
  perform set_config('kas.skip_audit', 'on', true);
  perform set_config('kas.defer_health', 'on', true);

  delete from public.notification_reads r using public.notifications n where n.id = r.notification_id and n.organization_id = p_org;
  delete from public.notifications where organization_id = p_org;
  delete from public.health_checks where organization_id = p_org;
  update public.cash_needs set paid_entry_id = null, plan_id = null, status = 'dibatalkan' where organization_id = p_org;
  delete from public.cash_needs where organization_id = p_org;
  update public.attachments set entry_id = null, program_id = null, status = 'dihapus' where organization_id = p_org;
  delete from public.attachments where organization_id = p_org;
  delete from public.journal_lines where organization_id = p_org;
  delete from public.reconciliations where organization_id = p_org;
  update public.journal_entries set reverses_id = null, reversed_by_id = null, replaces_id = null where organization_id = p_org;
  delete from public.journal_entries where organization_id = p_org;
  delete from public.import_batches where organization_id = p_org;
  delete from public.closed_periods where organization_id = p_org;
  delete from public.ref_counters where organization_id = p_org;
  delete from public.budget_items where organization_id = p_org;
  delete from public.budgets where organization_id = p_org;
  delete from public.programs where organization_id = p_org;
  delete from public.funds where organization_id = p_org and kind = 'program';
  delete from public.accounts where organization_id = p_org and code = '1-1200' and name = 'Rekening Bank (contoh)';

  perform set_config('kas.purge_demo', 'off', true);
  perform set_config('kas.skip_audit', 'off', true);
  perform set_config('kas.defer_health', 'off', true);

  update public.organizations o set settings = o.settings - 'is_demo' where o.id = p_org;
  perform private.audit(p_org, 'hapus_data_contoh', 'organizations', p_org::text, 'Menghapus seluruh data contoh (mode demo dinonaktifkan)');
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function public.load_demo_data(uuid), public.clear_demo_data(uuid) to authenticated, service_role;
grant execute on function private.is_member(uuid), private.has_role(uuid, text[]), private.try_uuid(text),
  private.severity_rank(text) to authenticated;
grant execute on all functions in schema private to service_role;
