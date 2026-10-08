-- =====================================================================
-- Kas IPNU · 10 · Pemeriksaan berkala harian
-- Memakai pg_cron bila tersedia (tersedia di semua paket Supabase).
-- Bila tidak tersedia, migration ini dilewati dengan aman: aplikasi tetap
-- menjalankan pemeriksaan harian saat dibuka (ensure_daily_check) dan
-- menampilkan keterangan bahwa penjadwal belum dikonfigurasi.
-- Jadwal: setiap hari 00.05 WIB (17.05 UTC).
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron tidak tersedia. Pemeriksaan harian berjalan saat aplikasi dibuka.';
    return;
  end if;
  begin
    create extension if not exists pg_cron;
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'kas-ipnu-pemeriksaan-harian';
    perform cron.schedule('kas-ipnu-pemeriksaan-harian', '5 17 * * *', 'select public.run_scheduled_checks()');
  exception when others then
    raise notice 'Penjadwalan pg_cron belum dapat dibuat: %. Aktifkan pg_cron di Dashboard Supabase lalu jalankan ulang migration ini.', sqlerrm;
  end;
end $$;
