-- =====================================================================
-- Kas IPNU · 09 · Storage untuk bukti transaksi
-- Bucket privat. Tidak ada URL publik. Akses unduh melalui signed URL
-- berumur pendek yang hanya dapat dibuat oleh anggota organisasi.
-- Jalur berkas: <organization_id>/<kelompok>/<uuid>-<nama-berkas>
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bukti', 'bukti', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bukti_baca_anggota" on storage.objects;
create policy "bukti_baca_anggota" on storage.objects for select to authenticated
  using (bucket_id = 'bukti' and private.is_member(private.try_uuid((storage.foldername(name))[1])));

drop policy if exists "bukti_unggah_bendahara" on storage.objects;
create policy "bukti_unggah_bendahara" on storage.objects for insert to authenticated
  with check (bucket_id = 'bukti' and private.has_role(private.try_uuid((storage.foldername(name))[1]), array['bendahara', 'admin']));

-- Sengaja tidak ada policy UPDATE dan DELETE: berkas bukti tidak dapat
-- ditimpa atau dihapus oleh pengguna, sehingga riwayat lampiran terjaga.
