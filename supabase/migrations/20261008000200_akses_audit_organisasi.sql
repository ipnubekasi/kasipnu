-- =====================================================================
-- Kas IPNU · 02 · Fungsi akses, audit log, penyiapan organisasi, anggota
-- =====================================================================

create or replace function private.jakarta_today() returns date
language sql stable set search_path = public, pg_temp as $$
  select (now() at time zone 'Asia/Jakarta')::date
$$;

-- Format tampilan untuk pesan dan notifikasi.
create or replace function private.rp(p bigint) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when p < 0 then '-' else '' end || 'Rp' || replace(to_char(abs(p), 'FM999,999,999,999,990'), ',', '.')
$$;

create or replace function private.fmt_num(p numeric) returns text
language sql immutable set search_path = public, pg_temp as $$
  select replace(to_char(round(p, 1), 'FM999999990.0'), '.', ',')
$$;

create or replace function private.fmt_date(p date) returns text
language sql immutable set search_path = public, pg_temp as $$
  select to_char(p, 'DD/MM/YYYY')
$$;

create or replace function private.month_name(p date) returns text
language sql immutable set search_path = public, pg_temp as $$
  select (array['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'])[extract(month from p)::int]
    || ' ' || extract(year from p)::int::text
$$;

create or replace function private.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function private.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.status = 'aktif'
  )
$$;

create or replace function private.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.status = 'aktif' and m.roles && p_roles
  )
$$;

create or replace function private.require_role(p_org uuid, p_roles text[]) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sesi tidak ditemukan. Silakan masuk kembali.' using errcode = '28000';
  end if;
  if not private.has_role(p_org, p_roles) then
    raise exception 'Anda tidak memiliki hak untuk melakukan tindakan ini.'
      using errcode = '42501', hint = 'Tindakan ini memerlukan role: ' || array_to_string(p_roles, ' atau ') || '.';
  end if;
end $$;

create or replace function private.require_member(p_org uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sesi tidak ditemukan. Silakan masuk kembali.' using errcode = '28000';
  end if;
  if not private.is_member(p_org) then
    raise exception 'Anda bukan anggota organisasi ini.' using errcode = '42501';
  end if;
end $$;

create or replace function private.actor_name(p_org uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select m.full_name from public.organization_members m where m.organization_id = p_org and m.user_id = (select auth.uid())),
    'Sistem')
$$;

create or replace function private.org_setting(p_org uuid, variadic p_path text[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select o.settings #> p_path from public.organizations o where o.id = p_org
$$;

create or replace function private.org_setting_num(p_org uuid, p_default numeric, variadic p_path text[]) returns numeric
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  select o.settings #> p_path into v from public.organizations o where o.id = p_org;
  if v is null or jsonb_typeof(v) <> 'number' then return p_default; end if;
  return (v #>> '{}')::numeric;
end $$;

-- ---------------------------------------------------------------------
-- Audit log: hanya dapat ditambah.
-- ---------------------------------------------------------------------
create or replace function private.audit(
  p_org uuid, p_action text, p_entity_type text, p_entity_id text, p_summary text, p_details jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.audit_logs (organization_id, actor_id, actor_name, action, entity_type, entity_id, summary, details)
  values (p_org, (select auth.uid()), private.actor_name(p_org), p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_details, '{}'::jsonb));
end $$;

create or replace function private.audit_logs_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'Audit log tidak dapat diubah atau dihapus.' using errcode = '42501';
end $$;

create trigger audit_logs_no_change before update or delete on public.audit_logs
  for each row execute function private.audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function private.audit_logs_immutable();

-- Trigger audit generik untuk tabel master dan pengaturan.
create or replace function private.audit_row_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_label text := tg_argv[0];
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_key text;
  v_name text;
begin
  if current_setting('kas.skip_audit', true) = 'on' then
    return coalesce(new, old);
  end if;
  v_org := case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid else (v_row ->> 'organization_id')::uuid end;
  v_name := coalesce(v_row ->> 'name', v_row ->> 'code', v_row ->> 'id');
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at', 'created_at') and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_before := v_before || jsonb_build_object(v_key, v_old -> v_key);
        v_after := v_after || jsonb_build_object(v_key, v_new -> v_key);
      end if;
    end loop;
    if v_after = '{}'::jsonb then
      return new;
    end if;
  end if;
  insert into public.audit_logs (organization_id, actor_id, actor_name, action, entity_type, entity_id, summary, details)
  values (
    v_org, (select auth.uid()), private.actor_name(v_org),
    case tg_op when 'INSERT' then 'tambah' when 'UPDATE' then 'ubah' else 'hapus' end,
    tg_table_name, v_row ->> 'id',
    case tg_op when 'INSERT' then 'Menambah ' when 'UPDATE' then 'Mengubah ' else 'Menghapus ' end || v_label || ' "' || v_name || '"',
    case tg_op
      when 'INSERT' then jsonb_build_object('sesudah', v_new - 'settings')
      when 'UPDATE' then jsonb_build_object('sebelum', v_before, 'sesudah', v_after)
      else jsonb_build_object('sebelum', v_old)
    end
  );
  return coalesce(new, old);
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('organizations', 'profil organisasi', 'update'),
    ('management_terms', 'periode kepengurusan', 'insert or update or delete'),
    ('accounts', 'akun', 'insert or update or delete'),
    ('funds', 'dana', 'insert or update or delete'),
    ('programs', 'program', 'insert or update or delete'),
    ('categories', 'kategori', 'insert or update or delete'),
    ('budget_items', 'pos anggaran', 'insert or update or delete'),
    ('cash_needs', 'kebutuhan kas', 'insert or update or delete')
  ) as t(tbl, label, ops) loop
    execute format('create trigger %I after %s on public.%I for each row execute function private.audit_row_change(%L)',
      r.tbl || '_audit', r.ops, r.tbl, r.label);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Data bawaan organisasi baru: daftar akun, Kas Umum, kategori.
-- Ini struktur, bukan data contoh. Tidak ada transaksi yang dibuat.
-- ---------------------------------------------------------------------
create or replace function private.seed_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.accounts (organization_id, code, name, type, is_cash, cash_kind, system_key) values
    (p_org, '1-1100', 'Kas Tunai', 'aset', true, 'tunai', null),
    (p_org, '2-1000', 'Utang Lain-lain', 'kewajiban', false, null, null),
    (p_org, '3-1000', 'Saldo Dana Awal', 'saldo_dana', false, null, 'saldo_dana_awal'),
    (p_org, '3-2000', 'Transfer Antardana', 'saldo_dana', false, null, 'transfer_antardana'),
    (p_org, '4-1000', 'Pendapatan Iuran', 'pendapatan', false, null, null),
    (p_org, '4-2000', 'Pendapatan Donasi', 'pendapatan', false, null, null),
    (p_org, '4-3000', 'Bantuan Organisasi', 'pendapatan', false, null, null),
    (p_org, '4-4000', 'Pendapatan Sponsor', 'pendapatan', false, null, null),
    (p_org, '4-5000', 'Penerimaan Kegiatan', 'pendapatan', false, null, null),
    (p_org, '4-9000', 'Pendapatan Lainnya', 'pendapatan', false, null, null),
    (p_org, '4-9100', 'Selisih Lebih Kas', 'pendapatan', false, null, null),
    (p_org, '5-1000', 'Beban Kesekretariatan', 'beban', false, null, null),
    (p_org, '5-1100', 'Beban ATK dan Cetak', 'beban', false, null, null),
    (p_org, '5-1200', 'Beban Konsumsi', 'beban', false, null, null),
    (p_org, '5-1300', 'Beban Transportasi', 'beban', false, null, null),
    (p_org, '5-1400', 'Beban Perlengkapan', 'beban', false, null, null),
    (p_org, '5-1500', 'Beban Sewa Tempat', 'beban', false, null, null),
    (p_org, '5-1600', 'Beban Kaderisasi', 'beban', false, null, null),
    (p_org, '5-1700', 'Beban Sosial', 'beban', false, null, null),
    (p_org, '5-1800', 'Beban Publikasi', 'beban', false, null, null),
    (p_org, '5-9000', 'Beban Lainnya', 'beban', false, null, null),
    (p_org, '5-9100', 'Selisih Kurang Kas', 'beban', false, null, null);

  insert into public.funds (organization_id, code, name, kind, is_restricted)
  values (p_org, 'UMUM', 'Kas Umum', 'umum', false);

  insert into public.categories (organization_id, name, kind, account_id, is_routine, system_key, sort_order)
  select p_org, v.name, v.kind, a.id, v.is_routine, v.system_key, v.sort_order
  from (values
    ('Iuran', 'pemasukan', '4-1000', false, null, 10),
    ('Donasi', 'pemasukan', '4-2000', false, null, 20),
    ('Bantuan organisasi', 'pemasukan', '4-3000', false, null, 30),
    ('Sponsor', 'pemasukan', '4-4000', false, null, 40),
    ('Penerimaan kegiatan', 'pemasukan', '4-5000', false, null, 50),
    ('Lainnya', 'pemasukan', '4-9000', false, null, 90),
    ('Selisih lebih kas', 'pemasukan', '4-9100', false, 'selisih_lebih', 99),
    ('Kesekretariatan', 'pengeluaran', '5-1000', true, null, 10),
    ('ATK dan cetak', 'pengeluaran', '5-1100', true, null, 20),
    ('Konsumsi', 'pengeluaran', '5-1200', true, null, 30),
    ('Transportasi', 'pengeluaran', '5-1300', true, null, 40),
    ('Perlengkapan', 'pengeluaran', '5-1400', true, null, 50),
    ('Sewa tempat', 'pengeluaran', '5-1500', false, null, 60),
    ('Kaderisasi', 'pengeluaran', '5-1600', false, null, 70),
    ('Sosial', 'pengeluaran', '5-1700', false, null, 80),
    ('Publikasi', 'pengeluaran', '5-1800', true, null, 85),
    ('Lainnya', 'pengeluaran', '5-9000', false, null, 90),
    ('Selisih kurang kas', 'pengeluaran', '5-9100', false, 'selisih_kurang', 99)
  ) as v(name, kind, account_code, is_routine, system_key, sort_order)
  join public.accounts a on a.organization_id = p_org and a.code = v.account_code;
end $$;

-- ---------------------------------------------------------------------
-- Status instance untuk pengguna yang baru masuk.
-- ---------------------------------------------------------------------
create or replace function public.instance_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := (select auth.uid());
  v_member jsonb;
begin
  if v_uid is null then
    raise exception 'Sesi tidak ditemukan. Silakan masuk kembali.' using errcode = '28000';
  end if;
  select jsonb_build_object(
    'member_id', m.id, 'organization_id', m.organization_id, 'roles', to_jsonb(m.roles),
    'full_name', m.full_name, 'email', m.email, 'position', m.position)
  into v_member
  from public.organization_members m
  where m.user_id = v_uid and m.status = 'aktif'
  order by m.granted_at
  limit 1;
  return jsonb_build_object(
    'has_organization', exists (select 1 from public.organizations),
    'membership', v_member,
    'revoked', exists (select 1 from public.organization_members m where m.user_id = v_uid and m.status = 'dicabut')
  );
end $$;

-- Pengguna pertama menyiapkan organisasi dan menjadi Admin sekaligus Bendahara.
-- Setelah organisasi ada, fungsi ini menolak semua pemanggilan.
create or replace function public.bootstrap_organization(
  p_name text, p_short_name text, p_city text, p_full_name text, p_position text,
  p_term_name text, p_term_start date, p_term_end date default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_term uuid;
  v_email text;
begin
  if v_uid is null then
    raise exception 'Sesi tidak ditemukan. Silakan masuk kembali.' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtext('kas_ipnu_bootstrap'));
  if exists (select 1 from public.organizations) then
    raise exception 'Organisasi sudah disiapkan.' using errcode = '42501',
      hint = 'Minta Admin Organisasi menambahkan akun Anda sebagai anggota.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(trim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'Nama organisasi dan nama lengkap wajib diisi.' using errcode = '22023';
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;

  insert into public.organizations (name, short_name, city, settings)
  values (trim(p_name), trim(coalesce(nullif(p_short_name, ''), p_name)), nullif(trim(coalesce(p_city, '')), ''), '{}'::jsonb)
  returning id into v_org;

  insert into public.management_terms (organization_id, name, start_date, end_date, treasurer_name, status)
  values (v_org, coalesce(nullif(trim(p_term_name), ''), 'Masa Khidmat'), coalesce(p_term_start, private.jakarta_today()), p_term_end, trim(p_full_name), 'aktif')
  returning id into v_term;

  insert into public.organization_members (organization_id, user_id, full_name, email, position, roles, term_id, granted_by)
  values (v_org, v_uid, trim(p_full_name), coalesce(v_email, ''), nullif(trim(coalesce(p_position, '')), ''), array['admin', 'bendahara'], v_term, v_uid);

  perform set_config('kas.skip_audit', 'on', true);
  perform private.seed_defaults(v_org);
  perform set_config('kas.skip_audit', 'off', true);

  perform private.audit(v_org, 'siapkan_organisasi', 'organizations', v_org::text,
    'Menyiapkan organisasi "' || trim(p_name) || '" dengan daftar akun dan kategori bawaan');
  return v_org;
end $$;

-- ---------------------------------------------------------------------
-- Pengaturan organisasi (bagian tertentu boleh diubah Bendahara).
-- ---------------------------------------------------------------------
create or replace function public.update_org_settings(p_org uuid, p_section text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_settings jsonb;
begin
  if p_section in ('health', 'signature') then
    perform private.require_role(p_org, array['admin', 'bendahara']);
  elsif p_section in ('ref', 'attachment') then
    perform private.require_role(p_org, array['admin']);
  else
    raise exception 'Bagian pengaturan "%" tidak dikenal.', p_section using errcode = '22023';
  end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'Nilai pengaturan tidak valid.' using errcode = '22023';
  end if;
  update public.organizations o
  set settings = jsonb_set(o.settings, array[p_section], p_value, true)
  where o.id = p_org
  returning o.settings into v_settings;
  return v_settings;
end $$;

-- ---------------------------------------------------------------------
-- Anggota dan hak akses. Tabel organization_members tidak memiliki policy
-- tulis; semua perubahan melewati fungsi berikut yang memeriksa role Admin.
-- ---------------------------------------------------------------------
create or replace function private.assert_roles(p_roles text[]) returns void
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_roles is null or cardinality(p_roles) = 0 or not (p_roles <@ array['admin', 'bendahara', 'pembaca']::text[]) then
    raise exception 'Role tidak valid. Pilih Admin, Bendahara, atau Pembaca.' using errcode = '22023';
  end if;
end $$;

create or replace function private.assert_admin_remains(p_org uuid, p_except_member uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.status = 'aktif' and 'admin' = any (m.roles) and m.id <> p_except_member
  ) then
    raise exception 'Organisasi harus memiliki minimal satu Admin aktif.' using errcode = '23514',
      hint = 'Jadikan anggota lain sebagai Admin terlebih dahulu.';
  end if;
end $$;

create or replace function public.add_member_by_email(
  p_org uuid, p_email text, p_full_name text, p_position text, p_roles text[]
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
  v_member public.organization_members;
  v_term uuid;
begin
  perform private.require_role(p_org, array['admin']);
  perform private.assert_roles(p_roles);
  if length(trim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'Nama lengkap wajib diisi.' using errcode = '22023';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Akun dengan email % belum terdaftar.', trim(p_email) using errcode = 'P0002',
      hint = 'Buat atau undang akun tersebut terlebih dahulu, lalu tambahkan sebagai anggota.';
  end if;
  select t.id into v_term from public.management_terms t where t.organization_id = p_org and t.status = 'aktif';
  select * into v_member from public.organization_members m where m.organization_id = p_org and m.user_id = v_user;
  if found and v_member.status = 'aktif' then
    raise exception 'Akun ini sudah menjadi anggota aktif.' using errcode = '23505';
  elsif found then
    update public.organization_members m
    set status = 'aktif', roles = p_roles, full_name = trim(p_full_name), position = nullif(trim(coalesce(p_position, '')), ''),
        term_id = v_term, granted_by = (select auth.uid()), granted_at = now(), revoked_by = null, revoked_at = null, revoke_reason = null
    where m.id = v_member.id;
    perform private.audit(p_org, 'pulihkan_akses', 'organization_members', v_member.id::text,
      'Memulihkan akses ' || trim(p_full_name) || ' sebagai ' || array_to_string(p_roles, ', '), jsonb_build_object('roles', p_roles));
    return v_member.id;
  end if;
  insert into public.organization_members (organization_id, user_id, full_name, email, position, roles, term_id, granted_by)
  values (p_org, v_user, trim(p_full_name), lower(trim(p_email)), nullif(trim(coalesce(p_position, '')), ''), p_roles, v_term, (select auth.uid()))
  returning * into v_member;
  perform private.audit(p_org, 'tambah_anggota', 'organization_members', v_member.id::text,
    'Menambahkan ' || v_member.full_name || ' sebagai ' || array_to_string(p_roles, ', '), jsonb_build_object('roles', p_roles, 'email', v_member.email));
  return v_member.id;
end $$;

create or replace function public.update_member(
  p_member_id uuid, p_full_name text, p_position text, p_roles text[]
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_member public.organization_members;
begin
  select * into v_member from public.organization_members m where m.id = p_member_id for update;
  if not found then
    raise exception 'Anggota tidak ditemukan.' using errcode = 'P0002';
  end if;
  perform private.require_role(v_member.organization_id, array['admin']);
  perform private.assert_roles(p_roles);
  if 'admin' = any (v_member.roles) and not ('admin' = any (p_roles)) then
    perform private.assert_admin_remains(v_member.organization_id, v_member.id);
  end if;
  update public.organization_members m
  set full_name = coalesce(nullif(trim(p_full_name), ''), m.full_name),
      position = nullif(trim(coalesce(p_position, '')), ''),
      roles = p_roles
  where m.id = p_member_id;
  perform private.audit(v_member.organization_id, 'ubah_anggota', 'organization_members', p_member_id::text,
    'Mengubah akses ' || v_member.full_name || ' menjadi ' || array_to_string(p_roles, ', '),
    jsonb_build_object('sebelum', jsonb_build_object('roles', v_member.roles), 'sesudah', jsonb_build_object('roles', p_roles)));
end $$;

create or replace function public.revoke_member(p_member_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_member public.organization_members;
begin
  select * into v_member from public.organization_members m where m.id = p_member_id for update;
  if not found then
    raise exception 'Anggota tidak ditemukan.' using errcode = 'P0002';
  end if;
  perform private.require_role(v_member.organization_id, array['admin']);
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Alasan pencabutan akses wajib diisi.' using errcode = '22023';
  end if;
  if v_member.status = 'dicabut' then
    return;
  end if;
  if 'admin' = any (v_member.roles) then
    perform private.assert_admin_remains(v_member.organization_id, v_member.id);
  end if;
  update public.organization_members m
  set status = 'dicabut', revoked_by = (select auth.uid()), revoked_at = now(), revoke_reason = trim(p_reason)
  where m.id = p_member_id;
  perform private.audit(v_member.organization_id, 'cabut_akses', 'organization_members', p_member_id::text,
    'Mencabut akses ' || v_member.full_name, jsonb_build_object('alasan', trim(p_reason), 'roles', v_member.roles));
end $$;

-- Serah terima bendahara: memberi role Bendahara kepada penerus dan
-- menurunkan atau mencabut akses bendahara lama. Tidak ada data yang dipindah.
create or replace function public.handover_treasurer(
  p_org uuid, p_new_member_id uuid, p_old_member_id uuid, p_old_action text, p_make_admin boolean, p_note text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_new public.organization_members;
  v_old public.organization_members;
  v_new_roles text[];
  v_old_roles text[];
begin
  perform private.require_role(p_org, array['admin']);
  if p_old_action not in ('tetap', 'pembaca', 'cabut') then
    raise exception 'Pilihan untuk bendahara lama tidak valid.' using errcode = '22023';
  end if;
  select * into v_new from public.organization_members m where m.id = p_new_member_id and m.organization_id = p_org for update;
  if not found or v_new.status <> 'aktif' then
    raise exception 'Bendahara penerus harus anggota aktif.' using errcode = 'P0002';
  end if;
  v_new_roles := array(select distinct unnest(v_new.roles || array['bendahara'] || case when p_make_admin then array['admin'] else array[]::text[] end));
  update public.organization_members m set roles = v_new_roles where m.id = v_new.id;

  if p_old_member_id is not null and p_old_member_id <> p_new_member_id and p_old_action <> 'tetap' then
    select * into v_old from public.organization_members m where m.id = p_old_member_id and m.organization_id = p_org for update;
    if not found then
      raise exception 'Bendahara lama tidak ditemukan.' using errcode = 'P0002';
    end if;
    if 'admin' = any (v_old.roles) then
      perform private.assert_admin_remains(p_org, v_old.id);
    end if;
    if p_old_action = 'cabut' then
      update public.organization_members m
      set status = 'dicabut', revoked_by = (select auth.uid()), revoked_at = now(),
          revoke_reason = 'Serah terima bendahara' || coalesce(': ' || nullif(trim(p_note), ''), '')
      where m.id = v_old.id;
    else
      v_old_roles := array['pembaca'];
      update public.organization_members m set roles = v_old_roles where m.id = v_old.id;
    end if;
  end if;

  update public.management_terms t set treasurer_name = v_new.full_name
  where t.organization_id = p_org and t.status = 'aktif';

  perform private.audit(p_org, 'serah_terima', 'organization_members', v_new.id::text,
    'Serah terima bendahara kepada ' || v_new.full_name,
    jsonb_build_object('penerus', v_new.full_name, 'bendahara_lama', v_old.full_name, 'tindakan_lama', p_old_action,
      'jadi_admin', p_make_admin, 'catatan', p_note));
end $$;

-- Memulai periode kepengurusan baru. Periode lama diarsipkan, datanya tetap.
create or replace function public.start_new_term(
  p_org uuid, p_name text, p_start date, p_end date, p_chair text, p_secretary text, p_treasurer text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform private.require_role(p_org, array['admin']);
  if length(trim(coalesce(p_name, ''))) = 0 or p_start is null then
    raise exception 'Nama periode dan tanggal mulai wajib diisi.' using errcode = '22023';
  end if;
  update public.management_terms t
  set status = 'arsip', end_date = coalesce(t.end_date, greatest(p_start - 1, t.start_date))
  where t.organization_id = p_org and t.status = 'aktif';
  insert into public.management_terms (organization_id, name, start_date, end_date, chair_name, secretary_name, treasurer_name, status)
  values (p_org, trim(p_name), p_start, p_end, nullif(trim(coalesce(p_chair, '')), ''), nullif(trim(coalesce(p_secretary, '')), ''),
    nullif(trim(coalesce(p_treasurer, '')), ''), 'aktif')
  returning id into v_id;
  return v_id;
end $$;
