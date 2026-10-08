-- =====================================================================
-- Kas IPNU · 06 · Kesehatan keuangan dan notifikasi
-- Indikator ini alat bantu pengelolaan kas, bukan penilaian audit.
-- Semua aturan transparan dan berbasis angka buku besar; tidak ada AI.
-- Versi aturan perhitungan disimpan bersama setiap hasil dan notifikasi.
-- =====================================================================

alter table public.cash_needs
  add constraint cash_needs_dibayar_punya_transaksi check (status <> 'dibayar' or paid_entry_id is not null);

create or replace function private.cash_needs_validate() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_plan public.cash_needs;
begin
  if new.plan_id is not null then
    select * into v_plan from public.cash_needs n where n.id = new.plan_id;
    if not found or v_plan.organization_id <> new.organization_id or v_plan.kind <> 'rencana' or v_plan.id = new.id then
      raise exception 'Rencana yang dirujuk tidak valid.' using errcode = '23514';
    end if;
    if v_plan.fund_id <> new.fund_id then
      raise exception 'Kewajiban dan rencana yang dirujuk harus berada pada dana yang sama.' using errcode = '23514';
    end if;
  end if;
  if new.paid_entry_id is not null and not exists (
    select 1 from public.journal_entries e
    where e.id = new.paid_entry_id and e.organization_id = new.organization_id and e.status = 'dibukukan'
  ) then
    raise exception 'Transaksi pembayaran harus transaksi yang sudah dibukukan.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger cash_needs_validate before insert or update on public.cash_needs
  for each row execute function private.cash_needs_validate();

-- ---------------------------------------------------------------------
-- Perhitungan
-- ---------------------------------------------------------------------
create or replace function private.alert(
  p_key text, p_severity text, p_title text, p_body text, p_scope text, p_fund uuid, p_program uuid,
  p_data jsonb, p_suggestion text, p_action_label text, p_action_href text
) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('key', p_key, 'severity', p_severity, 'title', p_title, 'body', p_body,
    'scope_label', p_scope, 'fund_id', p_fund, 'program_id', p_program, 'data', p_data,
    'suggestion', p_suggestion, 'action_label', p_action_label, 'action_href', p_action_href)
$$;

create or replace function private.compute_health(p_org uuid, p_today date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  c_version constant int := 1;
  v_fund uuid;
  v_min_balance bigint := private.org_setting_num(p_org, 0, 'health', 'min_balance')::bigint;
  v_target numeric := private.org_setting_num(p_org, 3, 'health', 'target_months');
  v_critical numeric := private.org_setting_num(p_org, 1, 'health', 'critical_months');
  v_warn_pct numeric := private.org_setting_num(p_org, 80, 'health', 'budget_warn_pct');
  v_over_pct numeric := private.org_setting_num(p_org, 100, 'health', 'budget_over_pct');
  v_deficit_limit int := private.org_setting_num(p_org, 2, 'health', 'deficit_streak')::int;
  v_evidence_days int := private.org_setting_num(p_org, 7, 'health', 'evidence_days')::int;
  v_monthly_budget bigint := private.org_setting_num(p_org, 0, 'health', 'monthly_operational_budget')::bigint;
  v_month_start date := date_trunc('month', p_today::timestamp)::date;
  v_win_start date := (date_trunc('month', p_today::timestamp) - interval '3 months')::date;
  v_win_end date := (date_trunc('month', p_today::timestamp) - interval '1 day')::date;
  v_first date;
  v_cash bigint;
  v_restricted bigint;
  v_oblig bigint;
  v_available bigint;
  v_months jsonb := '[]'::jsonb;
  v_total3 bigint := 0;
  v_amt bigint;
  v_avg numeric;
  v_basis text;
  v_sufficient boolean;
  v_runway numeric;
  v_flow jsonb := '[]'::jsonb;
  v_streak int := 0;
  v_deficit_months text[] := array[]::text[];
  v_ob30 bigint;
  v_plan30 bigint;
  v_in30 bigint;
  v_total30 bigint;
  v_short30 bigint;
  v_short_ob30 bigint;
  v_short_if bigint;
  v_needs jsonb;
  v_target_add bigint;
  v_reasons jsonb := '[]'::jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_status text;
  v_reco text;
  v_actions jsonb := '[]'::jsonb;
  v_need_funds boolean := false;
  v_programs jsonb := '[]'::jsonb;
  v_ev_count int;
  v_ev_oldest date;
  v_p_status text;
  v_p_reasons jsonb;
  v_pct numeric;
  v_short bigint;
  v_basis_label text;
  m date;
  s record;
  r record;
  i int;
begin
  select f.id into v_fund from public.funds f where f.organization_id = p_org and f.kind = 'umum';
  if v_fund is null then
    return jsonb_build_object('rule_version', c_version, 'today', p_today, 'computed_at', now(),
      'general', jsonb_build_object('status', 'data_belum_cukup', 'reasons', '[]'::jsonb), 'programs', '[]'::jsonb, 'alerts', '[]'::jsonb);
  end if;

  -- A. Pemisahan dana ------------------------------------------------
  select
    coalesce(sum(l.debit - l.credit) filter (where l.fund_id = v_fund), 0),
    coalesce(sum(l.debit - l.credit) filter (where l.fund_id <> v_fund), 0)
  into v_cash, v_restricted
  from public.journal_lines l join public.accounts a on a.id = l.account_id
  where l.organization_id = p_org and a.is_cash;

  select coalesce(sum(n.amount), 0) into v_oblig
  from public.v_open_needs n
  where n.organization_id = p_org and n.fund_id = v_fund and n.kind = 'kewajiban' and n.direction = 'keluar';

  v_available := v_cash - v_oblig;

  -- B1. Ketahanan kas ------------------------------------------------
  select min(e.entry_date) into v_first
  from public.journal_entries e where e.organization_id = p_org and e.status <> 'draft';
  v_sufficient := v_first is not null and v_first <= v_win_start;

  for i in 1..3 loop
    m := (v_month_start - make_interval(months => 4 - i))::date;
    select coalesce(sum(l.credit - l.debit), 0) into v_amt
    from public.journal_lines l
    join public.journal_entries e on e.id = l.entry_id
    join public.accounts a on a.id = l.account_id
    join public.categories c on c.id = e.category_id
    where l.organization_id = p_org and l.fund_id = v_fund and a.is_cash
      and e.flow_class = 'pengeluaran' and c.is_routine and not e.is_one_off
      and e.entry_date >= m and e.entry_date < (m + interval '1 month')::date;
    v_months := v_months || jsonb_build_array(jsonb_build_object('month', m, 'amount', v_amt));
    v_total3 := v_total3 + v_amt;
  end loop;

  if v_sufficient and v_total3 > 0 then
    v_avg := round(v_total3 / 3.0, 0);
    v_basis := 'riwayat';
  elsif v_monthly_budget > 0 then
    v_avg := v_monthly_budget;
    v_basis := 'anggaran';
  else
    v_avg := null;
    v_basis := 'tidak_ada';
  end if;
  v_basis_label := case v_basis when 'riwayat' then 'rata-rata tiga bulan lengkap terakhir' when 'anggaran' then 'berdasarkan anggaran' else null end;
  if v_avg is not null and v_avg > 0 then
    v_runway := round(greatest(v_available, 0) / v_avg, 1);
    v_target_add := greatest(0, ceil(v_target * v_avg - v_available))::bigint;
  end if;

  -- B2. Surplus/defisit: enam bulan lengkap terakhir dan bulan berjalan
  for i in 0..6 loop
    m := (v_month_start - make_interval(months => 6 - i))::date;
    select * into s from public.cash_summary(p_org, m, least((m + interval '1 month' - interval '1 day')::date, p_today), v_fund, null);
    v_flow := v_flow || jsonb_build_array(jsonb_build_object(
      'month', m, 'income', s.income, 'expense', s.expense, 'net', s.income - s.expense, 'complete', m < v_month_start));
  end loop;
  for i in reverse 5..0 loop
    if ((v_flow -> i ->> 'expense')::bigint > (v_flow -> i ->> 'income')::bigint) then
      v_streak := v_streak + 1;
      v_deficit_months := array_prepend(private.month_name((v_flow -> i ->> 'month')::date), v_deficit_months);
    else
      exit;
    end if;
  end loop;

  -- B3. Cakupan kebutuhan 30 hari (termasuk yang sudah lewat jatuh tempo)
  select
    coalesce(sum(n.amount) filter (where n.kind = 'kewajiban' and n.direction = 'keluar'), 0),
    coalesce(sum(n.amount) filter (where n.kind = 'rencana' and n.direction = 'keluar'), 0),
    coalesce(sum(n.amount) filter (where n.direction = 'masuk'), 0),
    coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'amount', n.amount, 'due_date', n.due_date,
      'kind', n.kind, 'direction', n.direction, 'overdue', n.due_date < p_today) order by n.due_date, n.name), '[]'::jsonb)
  into v_ob30, v_plan30, v_in30, v_needs
  from public.v_open_needs n
  where n.organization_id = p_org and n.fund_id = v_fund and n.due_date <= p_today + 30;

  v_total30 := v_ob30 + v_plan30;
  v_short30 := greatest(0, v_total30 - v_cash);
  v_short_ob30 := greatest(0, v_ob30 - v_cash);
  v_short_if := greatest(0, v_total30 - v_cash - v_in30);

  -- C. Status Kas Umum: kondisi terburuk yang dapat dihitung -----------
  if v_cash < 0 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'saldo_negatif', 'severity', 'kritis',
      'text', 'Saldo Kas Umum negatif (' || private.rp(v_cash) || ').'));
    v_alerts := v_alerts || jsonb_build_array(private.alert('saldo_negatif:umum', 'kritis', 'Saldo Kas Umum negatif',
      'Saldo Kas Umum ' || private.rp(v_cash) || ' per ' || private.fmt_date(p_today) || '. Periksa transaksi yang belum dicatat atau salah catat.',
      'Kas Umum', v_fund, null, jsonb_build_object('saldo', v_cash, 'per_tanggal', p_today),
      'Periksa pemasukan yang belum dicatat dan pengeluaran yang tercatat ganda.', 'Lihat Transaksi', '/kas'));
  elsif v_available < 0 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'tersedia_negatif', 'severity', 'kritis',
      'text', 'Dana umum tersedia negatif (' || private.rp(v_available) || ') setelah dikurangi kewajiban yang belum dibayar.'));
    v_alerts := v_alerts || jsonb_build_array(private.alert('dana_tersedia_negatif:umum', 'kritis', 'Dana umum tersedia negatif',
      'Saldo Kas Umum ' || private.rp(v_cash) || ', sedangkan kewajiban yang belum dibayar ' || private.rp(v_oblig) || '. Kekurangan ' || private.rp(-v_available) || '.',
      'Kas Umum', v_fund, null, jsonb_build_object('saldo', v_cash, 'kewajiban', v_oblig, 'tersedia', v_available, 'per_tanggal', p_today),
      'Cari pemasukan tambahan atau jadwalkan ulang kewajiban yang dapat ditunda.', 'Lihat Kebutuhan', '/kesehatan?tab=kebutuhan'));
  end if;

  if v_short_ob30 > 0 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'kewajiban_30', 'severity', 'kritis',
      'text', 'Kas Umum tidak cukup untuk kewajiban yang jatuh tempo dalam 30 hari. Kekurangan ' || private.rp(v_short_ob30) || '.'));
  elsif v_short30 > 0 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'kebutuhan_30', 'severity', 'perlu_perhatian',
      'text', 'Kas Umum belum cukup untuk seluruh kebutuhan 30 hari. Kekurangan ' || private.rp(v_short30) || '.'));
  end if;
  if v_short30 > 0 then
    v_alerts := v_alerts || jsonb_build_array(private.alert('kebutuhan_30:umum',
      case when v_short_ob30 > 0 then 'kritis' else 'perlu_perhatian' end,
      'Kas tidak cukup untuk kebutuhan 30 hari',
      'Saldo Kas Umum ' || private.rp(v_cash) || ', sedangkan kebutuhan 30 hari mendatang ' || private.rp(v_total30) ||
        '. Kekurangan ' || private.rp(v_short30) || '.',
      'Kas Umum', v_fund, null,
      jsonb_build_object('saldo', v_cash, 'kewajiban_30', v_ob30, 'rencana_30', v_plan30, 'kebutuhan_30', v_total30,
        'kekurangan', v_short30, 'kekurangan_kewajiban', v_short_ob30, 'periode_dari', p_today, 'periode_sampai', p_today + 30),
      'Tagih iuran yang belum diterima, hubungi calon donatur, atau tunda kebutuhan yang masih berupa rencana.',
      'Lihat Kebutuhan', '/kesehatan?tab=kebutuhan'));
  end if;

  if v_runway is not null and v_runway < v_target then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'ketahanan_kas',
      'severity', case when v_runway < v_critical then 'kritis' else 'perlu_perhatian' end,
      'text', 'Ketahanan kas sekitar ' || private.fmt_num(v_runway) || ' bulan, di bawah ' ||
        case when v_runway < v_critical then 'batas kritis ' || private.fmt_num(v_critical) else 'target ' || private.fmt_num(v_target) end || ' bulan.'));
    v_alerts := v_alerts || jsonb_build_array(private.alert('ketahanan_kas:umum',
      case when v_runway < v_critical then 'kritis' else 'perlu_perhatian' end,
      'Ketahanan kas di bawah ' || case when v_runway < v_critical then 'batas kritis' else 'target' end,
      'Kas operasional cukup untuk sekitar ' || private.fmt_num(v_runway) || ' bulan: dana umum tersedia ' || private.rp(v_available) ||
        ' dibagi pengeluaran operasional ' || private.rp(v_avg::bigint) || ' per bulan (' || v_basis_label || '). Target cadangan ' ||
        private.fmt_num(v_target) || ' bulan.',
      'Kas Umum', v_fund, null,
      jsonb_build_object('tersedia', v_available, 'rata_rata_bulanan', v_avg, 'dasar', v_basis, 'ketahanan_bulan', v_runway,
        'target_bulan', v_target, 'target_tambahan', v_target_add, 'periode_dari', v_win_start, 'periode_sampai', v_win_end),
      'Mulai mencari pemasukan tambahan sebesar ' || private.rp(v_target_add) || ' untuk mencapai cadangan operasional ' ||
        private.fmt_num(v_target) || ' bulan.',
      'Lihat Perhitungan', '/kesehatan'));
  end if;

  if v_min_balance > 0 and v_cash < v_min_balance and v_cash >= 0 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'saldo_minimum', 'severity', 'perlu_perhatian',
      'text', 'Saldo Kas Umum ' || private.rp(v_cash) || ' di bawah batas minimum ' || private.rp(v_min_balance) || '.'));
    v_alerts := v_alerts || jsonb_build_array(private.alert('saldo_minimum:umum', 'perlu_perhatian', 'Saldo di bawah batas minimum',
      'Saldo Kas Umum ' || private.rp(v_cash) || ', di bawah batas minimum ' || private.rp(v_min_balance) || '. Selisih ' || private.rp(v_min_balance - v_cash) || '.',
      'Kas Umum', v_fund, null, jsonb_build_object('saldo', v_cash, 'batas_minimum', v_min_balance, 'per_tanggal', p_today),
      'Tunda pengeluaran yang tidak mendesak sampai saldo kembali di atas batas minimum.', 'Lihat Perhitungan', '/kesehatan'));
  end if;

  if v_deficit_limit > 0 and v_streak >= v_deficit_limit then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'defisit_beruntun', 'severity', 'perlu_perhatian',
      'text', 'Kas Umum defisit ' || v_streak || ' bulan berturut-turut.'));
    v_alerts := v_alerts || jsonb_build_array(private.alert('defisit_beruntun:umum', 'perlu_perhatian',
      'Defisit ' || v_streak || ' bulan berturut-turut',
      'Pengeluaran Kas Umum melebihi pemasukan pada ' || array_to_string(v_deficit_months, ', ') || '.',
      'Kas Umum', v_fund, null, jsonb_build_object('bulan_defisit', to_jsonb(v_deficit_months), 'jumlah_bulan', v_streak),
      'Tinjau pengeluaran yang dapat ditunda dan rencanakan sumber pemasukan untuk bulan berikutnya.',
      'Lihat Rekap Bulanan', '/laporan?jenis=rekap-bulanan'));
  end if;

  if exists (select 1 from jsonb_array_elements(v_reasons) x where x ->> 'severity' = 'kritis') then
    v_status := 'kritis';
  elsif jsonb_array_length(v_reasons) > 0 then
    v_status := 'perlu_perhatian';
  elsif v_runway is null then
    v_status := 'data_belum_cukup';
  else
    v_status := 'aman';
  end if;

  -- D. Saran berbasis aturan ----------------------------------------
  if v_short_ob30 > 0 then
    v_reco := 'Kas Umum kurang ' || private.rp(v_short_ob30) || ' untuk kewajiban yang jatuh tempo dalam 30 hari. Segera cari pemasukan atau jadwalkan ulang pembayaran.';
    v_need_funds := true;
  elsif v_available < 0 then
    v_reco := 'Dana umum tersedia negatif. Cari pemasukan minimal ' || private.rp(-v_available) || ' untuk menutup kewajiban yang belum dibayar.';
    v_need_funds := true;
  elsif v_runway is not null and v_runway < v_target then
    v_reco := 'Kas operasional cukup untuk sekitar ' || private.fmt_num(v_runway) || ' bulan. Mulai mencari pemasukan tambahan sebesar ' ||
      private.rp(v_target_add) || ' untuk mencapai cadangan operasional ' || private.fmt_num(v_target) || ' bulan.';
    v_need_funds := true;
  elsif v_short30 > 0 then
    v_reco := 'Kas Umum kurang ' || private.rp(v_short30) || ' untuk seluruh kebutuhan 30 hari. Tinjau rencana yang dapat ditunda atau cari pemasukan tambahan.';
    v_need_funds := true;
  elsif v_runway is null then
    v_reco := 'Riwayat pengeluaran operasional rutin belum cukup untuk menghitung ketahanan kas. Isi anggaran operasional bulanan di Pengaturan agar perkiraan dapat ditampilkan.';
  else
    v_reco := 'Kas operasional cukup untuk sekitar ' || private.fmt_num(v_runway) || ' bulan. Pertahankan cadangan minimal ' || private.fmt_num(v_target) || ' bulan.';
  end if;
  if v_need_funds then
    v_actions := jsonb_build_array('Menagih iuran yang belum diterima', 'Menghubungi calon donatur',
      'Menyiapkan proposal sponsor', 'Meninjau pengeluaran yang dapat ditunda');
  end if;

  -- B4. Program ------------------------------------------------------
  for r in
    select p.id, p.name, p.code, p.status, ps.fund_id, ps.fund_balance, ps.income, ps.expense, ps.transfer_in, ps.transfer_out,
      ps.budget_income, ps.budget_expense, ps.open_needs
    from public.programs p
    join public.program_summary(p_org) ps on ps.program_id = p.id
    where p.organization_id = p_org and p.status <> 'diarsipkan'
    order by p.code
  loop
    v_p_reasons := '[]'::jsonb;
    v_pct := case when r.budget_expense > 0 then round(r.expense * 100.0 / r.budget_expense, 1) end;
    v_short := greatest(0, r.open_needs - r.fund_balance);

    if r.fund_balance < 0 then
      v_p_reasons := v_p_reasons || jsonb_build_array(jsonb_build_object('code', 'saldo_negatif', 'severity', 'kritis',
        'text', 'Saldo dana program negatif (' || private.rp(r.fund_balance) || ').'));
    end if;
    -- Peringatan anggaran hanya untuk program yang belum selesai.
    if r.status <> 'selesai' and v_pct is not null and v_pct > v_over_pct then
      v_p_reasons := v_p_reasons || jsonb_build_array(jsonb_build_object('code', 'anggaran_lewat', 'severity', 'kritis',
        'text', 'Realisasi ' || private.fmt_num(v_pct) || '% melebihi anggaran.'));
    elsif r.status <> 'selesai' and v_pct is not null and v_pct >= v_warn_pct then
      v_p_reasons := v_p_reasons || jsonb_build_array(jsonb_build_object('code', 'anggaran_tinggi', 'severity', 'perlu_perhatian',
        'text', 'Anggaran terpakai ' || private.fmt_num(v_pct) || '%.'));
    end if;
    if v_short > 0 and r.fund_balance >= 0 then
      v_p_reasons := v_p_reasons || jsonb_build_array(jsonb_build_object('code', 'dana_kurang', 'severity', 'perlu_perhatian',
        'text', 'Dana program kurang ' || private.rp(v_short) || ' untuk kebutuhan yang belum dibayar.'));
    end if;

    if r.status <> 'selesai' and v_pct is not null and v_pct >= v_warn_pct then
      v_alerts := v_alerts || jsonb_build_array(private.alert('anggaran:' || r.id,
        case when v_pct > v_over_pct then 'kritis' else 'perlu_perhatian' end,
        case when v_pct > v_over_pct then 'Realisasi melebihi anggaran' else 'Anggaran program terpakai ' || private.fmt_num(v_pct) || '%' end,
        'Realisasi pengeluaran ' || private.rp(r.expense) || ' dari anggaran ' || private.rp(r.budget_expense) || ' (' || private.fmt_num(v_pct) || '%). ' ||
          case when r.budget_expense - r.expense >= 0 then 'Sisa anggaran ' || private.rp(r.budget_expense - r.expense) else 'Melebihi anggaran ' || private.rp(r.expense - r.budget_expense) end ||
          '. Sisa dana aktual ' || private.rp(r.fund_balance) || '.',
        r.name, r.fund_id, r.id,
        jsonb_build_object('realisasi', r.expense, 'anggaran', r.budget_expense, 'persen', v_pct, 'sisa_dana', r.fund_balance, 'per_tanggal', p_today),
        'Tinjau pos RAB yang tersisa. Sisa anggaran tidak sama dengan uang yang tersedia.', 'Lihat RAB', '/program/' || r.id || '?tab=rab'));
    end if;
    if r.fund_balance < 0 or v_short > 0 then
      v_alerts := v_alerts || jsonb_build_array(private.alert('dana_program:' || r.id,
        case when r.fund_balance < 0 then 'kritis' else 'perlu_perhatian' end,
        case when r.fund_balance < 0 then 'Saldo dana program negatif' else 'Dana program tidak cukup' end,
        'Sisa dana ' || private.rp(r.fund_balance) || ', sedangkan kebutuhan yang belum dibayar ' || private.rp(r.open_needs) ||
          '. Kekurangan ' || private.rp(greatest(r.open_needs - r.fund_balance, 0)) || '.',
        r.name, r.fund_id, r.id,
        jsonb_build_object('sisa_dana', r.fund_balance, 'kebutuhan', r.open_needs, 'kekurangan', greatest(r.open_needs - r.fund_balance, 0), 'per_tanggal', p_today),
        'Alokasikan dana dari Kas Umum melalui transfer, atau cari pemasukan untuk program ini.', 'Lihat Program', '/program/' || r.id));
    end if;

    v_p_status := case
      when exists (select 1 from jsonb_array_elements(v_p_reasons) x where x ->> 'severity' = 'kritis') then 'kritis'
      when jsonb_array_length(v_p_reasons) > 0 then 'perlu_perhatian'
      when r.budget_expense = 0 and r.income = 0 and r.expense = 0 and r.transfer_in = 0 then 'data_belum_cukup'
      else 'aman' end;

    v_programs := v_programs || jsonb_build_array(jsonb_build_object(
      'program_id', r.id, 'fund_id', r.fund_id, 'name', r.name, 'code', r.code, 'program_status', r.status,
      'budget_expense', r.budget_expense, 'realized_expense', r.expense, 'pct_used', v_pct,
      'budget_remaining', r.budget_expense - r.expense, 'fund_balance', r.fund_balance,
      'open_needs', r.open_needs, 'shortfall', v_short, 'status', v_p_status, 'reasons', v_p_reasons));
  end loop;

  -- Bukti yang belum lengkap melewati batas waktu ---------------------
  select count(*), min(e.entry_date) into v_ev_count, v_ev_oldest
  from public.journal_entries e
  where e.organization_id = p_org and e.status = 'dibukukan' and e.kind in ('pemasukan', 'pengeluaran')
    and e.evidence_status = 'belum_ada'
    and (e.posted_at at time zone 'Asia/Jakarta')::date <= p_today - v_evidence_days;
  if v_ev_count > 0 then
    v_alerts := v_alerts || jsonb_build_array(private.alert('bukti_terlambat', 'perlu_perhatian',
      v_ev_count || ' transaksi belum memiliki bukti',
      v_ev_count || ' transaksi yang dibukukan lebih dari ' || v_evidence_days || ' hari lalu belum memiliki bukti. Transaksi tertua bertanggal ' || private.fmt_date(v_ev_oldest) || '.',
      'Semua dana', null, null, jsonb_build_object('jumlah', v_ev_count, 'batas_hari', v_evidence_days, 'tertua', v_ev_oldest),
      'Unggah bukti, atau tandai Tidak Tersedia dengan alasannya.', 'Lihat Transaksi', '/kas?lingkup=gabungan&bukti=belum_ada'));
  end if;

  return jsonb_build_object(
    'rule_version', c_version,
    'today', p_today,
    'computed_at', now(),
    'thresholds', jsonb_build_object('min_balance', v_min_balance, 'target_months', v_target, 'critical_months', v_critical,
      'budget_warn_pct', v_warn_pct, 'budget_over_pct', v_over_pct, 'deficit_streak', v_deficit_limit,
      'evidence_days', v_evidence_days, 'monthly_operational_budget', v_monthly_budget),
    'general', jsonb_build_object(
      'fund_id', v_fund,
      'cash_balance', v_cash,
      'restricted_balance', v_restricted,
      'open_obligations', v_oblig,
      'available', v_available,
      'history_sufficient', v_sufficient,
      'first_entry_date', v_first,
      'window_from', v_win_start,
      'window_to', v_win_end,
      'months_used', v_months,
      'avg_monthly', v_avg,
      'avg_basis', v_basis,
      'runway_months', v_runway,
      'target_additional', v_target_add,
      'flow', v_flow,
      'deficit_streak', v_streak,
      'needs30', jsonb_build_object('until', p_today + 30, 'obligations', v_ob30, 'plans', v_plan30, 'total', v_total30,
        'shortfall', v_short30, 'shortfall_obligations', v_short_ob30, 'planned_income', v_in30,
        'shortfall_if_income', v_short_if, 'items', v_needs),
      'status', v_status,
      'reasons', v_reasons,
      'recommendation', v_reco,
      'actions', v_actions),
    'programs', v_programs,
    'evidence', jsonb_build_object('overdue_count', v_ev_count, 'days', v_evidence_days, 'oldest', v_ev_oldest),
    'alerts', v_alerts);
end $$;

-- ---------------------------------------------------------------------
-- Sinkronisasi notifikasi.
-- Notifikasi baru hanya dibuat saat ambang dilewati atau kondisi memburuk.
-- Kondisi yang sama tidak membuat notifikasi berulang. Notifikasi ditandai
-- selesai saat penyebabnya teratasi; status dibaca tidak berarti selesai.
-- ---------------------------------------------------------------------
create or replace function private.severity_rank(p text) returns int
language sql immutable set search_path = public, pg_temp as $$
  select case p when 'kritis' then 3 when 'perlu_perhatian' then 2 else 1 end
$$;

create or replace function private.sync_alert(p_org uuid, a jsonb, p_remind_days int, p_version int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare n public.notifications;
begin
  select * into n from public.notifications x
  where x.organization_id = p_org and x.condition_key = a ->> 'key' and x.resolved_at is null
  for update;

  if found and private.severity_rank(a ->> 'severity') > private.severity_rank(n.severity) then
    update public.notifications x set resolved_at = now(), resolved_reason = 'Kondisi memburuk; digantikan notifikasi baru'
    where x.id = n.id;
  elsif found then
    update public.notifications x set
      severity = a ->> 'severity', title = a ->> 'title', body = a ->> 'body', data = coalesce(a -> 'data', '{}'::jsonb),
      suggestion = a ->> 'suggestion', scope_label = a ->> 'scope_label', action_label = a ->> 'action_label',
      action_href = a ->> 'action_href', checked_at = now(), rule_version = p_version
    where x.id = n.id;
    if p_remind_days > 0 and n.last_notified_at < now() - make_interval(days => p_remind_days) then
      delete from public.notification_reads r where r.notification_id = n.id;
      update public.notifications x set last_notified_at = now(), reminder_count = x.reminder_count + 1 where x.id = n.id;
    end if;
    return;
  end if;

  insert into public.notifications (organization_id, condition_key, kind, severity, title, body, scope_label,
    fund_id, program_id, data, suggestion, action_label, action_href, rule_version)
  values (p_org, a ->> 'key', 'kondisi', a ->> 'severity', a ->> 'title', a ->> 'body', a ->> 'scope_label',
    nullif(a ->> 'fund_id', '')::uuid, nullif(a ->> 'program_id', '')::uuid, coalesce(a -> 'data', '{}'::jsonb),
    a ->> 'suggestion', a ->> 'action_label', a ->> 'action_href', p_version);
end $$;

create or replace function private.run_health(p_org uuid, p_source text, p_today date default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_today date := coalesce(p_today, private.jakarta_today());
  v jsonb;
  a jsonb;
  v_version int;
  v_status text;
  v_last text;
  v_remind int := private.org_setting_num(p_org, 7, 'health', 'remind_days')::int;
  v_week_key text := 'ringkasan_mingguan:' || to_char(v_today, 'IYYY-IW');
  s record;
  t jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('kas_health:' || p_org::text));
  v := private.compute_health(p_org, v_today);
  v_version := (v ->> 'rule_version')::int;
  v_status := v -> 'general' ->> 'status';

  select h.status into v_last from public.health_checks h
  where h.organization_id = p_org order by h.id desc limit 1;
  if p_source in ('terjadwal', 'harian', 'manual') or v_last is distinct from v_status then
    insert into public.health_checks (organization_id, check_date, source, rule_version, status, result)
    values (p_org, v_today, p_source, v_version, v_status, v - 'alerts');
  end if;

  for a in select * from jsonb_array_elements(v -> 'alerts') loop
    perform private.sync_alert(p_org, a, v_remind, v_version);
  end loop;

  update public.notifications x
  set resolved_at = now(), resolved_reason = 'Kondisi sudah teratasi'
  where x.organization_id = p_org and x.kind = 'kondisi' and x.resolved_at is null
    and not exists (select 1 from jsonb_array_elements(v -> 'alerts') e where e ->> 'key' = x.condition_key);

  -- Ringkasan mingguan dalam aplikasi: satu kali per minggu ISO, dibuat oleh
  -- pemeriksaan harian atau terjadwal (bukan oleh setiap pembukuan).
  if p_source in ('terjadwal', 'harian')
     and not exists (select 1 from public.notifications x where x.organization_id = p_org and x.condition_key = v_week_key)
     and exists (select 1 from public.journal_entries e where e.organization_id = p_org and e.status <> 'draft') then
    select * into s from public.cash_summary(p_org, v_today - 7, v_today - 1, (v -> 'general' ->> 'fund_id')::uuid, null);
    t := public.pending_tasks_internal(p_org);
    insert into public.notifications (organization_id, condition_key, kind, severity, title, body, scope_label, fund_id,
      data, suggestion, action_label, action_href, rule_version)
    values (p_org, v_week_key, 'info', 'info', 'Ringkasan mingguan',
      'Tujuh hari terakhir (' || private.fmt_date(v_today - 7) || ' sampai ' || private.fmt_date(v_today - 1) || '): pemasukan ' ||
        private.rp(s.income) || ', pengeluaran ' || private.rp(s.expense) || ', saldo Kas Umum ' || private.rp((v -> 'general' ->> 'cash_balance')::bigint) ||
        '. Status kesehatan: ' || case v_status when 'aman' then 'Aman' when 'perlu_perhatian' then 'Perlu Perhatian' when 'kritis' then 'Kritis' else 'Data Belum Cukup' end ||
        '. Draft: ' || (t ->> 'drafts') || ', transaksi tanpa bukti: ' || (t ->> 'missing_evidence') || '.',
      'Kas Umum', (v -> 'general' ->> 'fund_id')::uuid,
      jsonb_build_object('periode_dari', v_today - 7, 'periode_sampai', v_today - 1, 'pemasukan', s.income, 'pengeluaran', s.expense,
        'saldo', (v -> 'general' ->> 'cash_balance')::bigint, 'status', v_status, 'draft', (t ->> 'drafts')::int,
        'tanpa_bukti', (t ->> 'missing_evidence')::int),
      v -> 'general' ->> 'recommendation', 'Lihat Ringkasan', '/ringkasan', v_version);
  end if;

  return v;
end $$;

create or replace function public.pending_tasks_internal(p_org uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'drafts', (select count(*) from public.journal_entries e where e.organization_id = p_org and e.status = 'draft'),
    'missing_evidence', (select count(*) from public.journal_entries e
      where e.organization_id = p_org and e.status = 'dibukukan' and e.kind in ('pemasukan', 'pengeluaran') and e.evidence_status = 'belum_ada'))
$$;

-- Dipanggil setelah pembukuan, pembalikan, perubahan kebutuhan kas, anggaran,
-- dan pengaturan. Kegagalan pemeriksaan tidak boleh membatalkan pembukuan.
create or replace function private.after_ledger_change(p_org uuid, p_source text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if current_setting('kas.defer_health', true) = 'on' then
    return;
  end if;
  begin
    perform private.run_health(p_org, p_source, null);
  exception when others then
    raise warning 'Pemeriksaan kesehatan keuangan gagal: %', sqlerrm;
  end;
end $$;

create or replace function private.health_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid := coalesce(new.organization_id, old.organization_id);
begin
  if current_setting('kas.purge_demo', true) = 'on' then
    return coalesce(new, old);
  end if;
  perform private.after_ledger_change(v_org, 'perubahan');
  return coalesce(new, old);
end $$;

create trigger cash_needs_health after insert or update or delete on public.cash_needs
  for each row execute function private.health_trigger();
create trigger budget_items_health after insert or update or delete on public.budget_items
  for each row execute function private.health_trigger();
create trigger categories_health after update of is_routine on public.categories
  for each row execute function private.health_trigger();

-- Pembukuan massal: pemeriksaan dijalankan satu kali di akhir.
create or replace function public.post_entries(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_org uuid;
  v_orgs uuid[] := array[]::uuid[];
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
  perform set_config('kas.defer_health', 'on', true);
  for v_id, v_org in
    select e.id, e.organization_id from public.journal_entries e where e.id = any (p_ids) order by e.entry_date, e.created_at, e.id
  loop
    begin
      v_one := public.post_entry(v_id);
      v_result := v_result || jsonb_build_array(v_one || jsonb_build_object('ok', true));
      if not (v_org = any (v_orgs)) then
        v_orgs := v_orgs || v_org;
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      perform set_config('kas.posting', 'off', true);
      v_result := v_result || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', false, 'error', v_msg));
    end;
  end loop;
  perform set_config('kas.defer_health', 'off', true);
  foreach v_org in array v_orgs loop
    perform private.after_ledger_change(v_org, 'pembukuan');
  end loop;
  return v_result;
end $$;

-- ---------------------------------------------------------------------
-- Fungsi untuk aplikasi
-- ---------------------------------------------------------------------
create or replace function public.health_status(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_member(p_org);
  return private.compute_health(p_org, private.jakarta_today()) - 'alerts';
end $$;

create or replace function public.run_health_checks(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_member(p_org);
  return private.run_health(p_org, 'manual', null) - 'alerts';
end $$;

-- Pemeriksaan harian saat aplikasi dibuka: berjalan paling banyak satu kali
-- per tanggal (Asia/Jakarta), sehingga pergantian tanggal memicu pemeriksaan
-- kebutuhan yang jatuh tempo walaupun penjadwal belum dikonfigurasi.
create or replace function public.ensure_daily_check(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_today date := private.jakarta_today();
  v_ran boolean := false;
  v_last_scheduled timestamptz;
begin
  perform private.require_member(p_org);
  if not exists (
    select 1 from public.health_checks h
    where h.organization_id = p_org and h.check_date = v_today and h.source in ('terjadwal', 'harian', 'manual')
  ) then
    perform private.run_health(p_org, 'harian', v_today);
    v_ran := true;
  end if;
  select max(h.created_at) into v_last_scheduled from public.health_checks h
  where h.organization_id = p_org and h.source = 'terjadwal';
  return jsonb_build_object(
    'ran', v_ran,
    'scheduler_configured', v_last_scheduled is not null and v_last_scheduled > now() - interval '3 days',
    'last_scheduled_at', v_last_scheduled,
    'last_check_at', (select max(h.created_at) from public.health_checks h where h.organization_id = p_org));
end $$;

-- Untuk penjadwal (pg_cron atau Vercel Cron dengan secret key server).
create or replace function public.run_scheduled_checks() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid;
  v_count int := 0;
begin
  for v_org in select o.id from public.organizations o loop
    perform private.run_health(v_org, 'terjadwal', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.list_notifications(
  p_org uuid, p_filter text default 'aktif', p_limit integer default 50, p_offset integer default 0
) returns table (
  id uuid, condition_key text, kind text, severity text, title text, body text, scope_label text,
  fund_id uuid, program_id uuid, data jsonb, suggestion text, action_label text, action_href text,
  rule_version integer, checked_at timestamptz, created_at timestamptz, resolved_at timestamptz,
  resolved_reason text, reminder_count integer, is_read boolean, total_count bigint
)
language sql stable security invoker set search_path = public, pg_temp as $$
  select n.id, n.condition_key, n.kind, n.severity, n.title, n.body, n.scope_label, n.fund_id, n.program_id,
    n.data, n.suggestion, n.action_label, n.action_href, n.rule_version, n.checked_at, n.created_at,
    n.resolved_at, n.resolved_reason, n.reminder_count,
    exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = (select auth.uid())),
    count(*) over ()
  from public.notifications n
  where n.organization_id = p_org
    and case p_filter
      when 'aktif' then (n.kind = 'kondisi' and n.resolved_at is null) or (n.kind = 'info' and n.created_at > now() - interval '14 days')
      when 'belum_dibaca' then ((n.kind = 'kondisi' and n.resolved_at is null) or (n.kind = 'info' and n.created_at > now() - interval '14 days'))
        and not exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = (select auth.uid()))
      when 'selesai' then n.kind = 'kondisi' and n.resolved_at is not null
      else true end
  order by (n.resolved_at is null and n.kind = 'kondisi') desc, private.severity_rank(n.severity) desc, n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.unread_notification_count(p_org uuid) returns integer
language sql stable security invoker set search_path = public, pg_temp as $$
  select count(*)::int
  from public.notifications n
  where n.organization_id = p_org
    and ((n.kind = 'kondisi' and n.resolved_at is null) or (n.kind = 'info' and n.created_at > now() - interval '14 days'))
    and not exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = (select auth.uid()))
$$;

create or replace function public.mark_notifications_read(p_org uuid, p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count int;
begin
  perform private.require_member(p_org);
  insert into public.notification_reads (notification_id, user_id)
  select n.id, (select auth.uid())
  from public.notifications n
  where n.organization_id = p_org and (p_ids is null or n.id = any (p_ids))
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Pengaturan kesehatan memicu pemeriksaan ulang.
create or replace function private.org_settings_health() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.settings -> 'health') is distinct from (old.settings -> 'health') then
    perform private.after_ledger_change(new.id, 'perubahan');
  end if;
  return new;
end $$;

create trigger organizations_health after update of settings on public.organizations
  for each row execute function private.org_settings_health();
