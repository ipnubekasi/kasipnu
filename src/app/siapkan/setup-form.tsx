"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { todayJakarta } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SetupForm({ email }: { email: string }) {
  const router = useRouter();
  const year = Number(todayJakarta().slice(0, 4));
  const [v, setV] = React.useState({
    name: "PC IPNU Kabupaten Bekasi",
    short_name: "PC IPNU Kab. Bekasi",
    city: "Bekasi",
    full_name: "",
    position: "Bendahara",
    term_name: `Masa Khidmat ${year} sampai ${year + 2}`,
    term_start: `${year}-01-01`,
    term_end: "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<{ message: string; hint?: string } | null>(null);
  const [pending, setPending] = React.useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!v.name.trim()) er.name = "Nama organisasi wajib diisi.";
    if (!v.full_name.trim()) er.full_name = "Nama lengkap wajib diisi.";
    if (!v.term_name.trim()) er.term_name = "Nama periode wajib diisi.";
    if (!v.term_start) er.term_start = "Tanggal mulai wajib diisi.";
    if (v.term_end && v.term_end < v.term_start) er.term_end = "Tanggal selesai tidak boleh lebih awal dari tanggal mulai.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setPending(true);
    setFormError(null);
    const { error } = await createClient().rpc("bootstrap_organization", {
      p_name: v.name, p_short_name: v.short_name, p_city: v.city, p_full_name: v.full_name, p_position: v.position,
      p_term_name: v.term_name, p_term_start: v.term_start, p_term_end: v.term_end || null,
    });
    setPending(false);
    if (error) {
      setFormError(friendlyError(error));
      return;
    }
    router.replace("/ringkasan");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert tone="danger" title={formError.message}>{formError.hint}</Alert>}
      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-semibold text-ink">Organisasi</legend>
        <Field label="Nama organisasi" htmlFor="name" required error={errors.name}>
          <Input {...fieldAria("name", errors.name)} value={v.name} onChange={set("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama singkat" htmlFor="short_name" help="Tampil di menu dan kop laporan.">
            <Input id="short_name" value={v.short_name} onChange={set("short_name")} />
          </Field>
          <Field label="Kota/kabupaten" htmlFor="city">
            <Input id="city" value={v.city} onChange={set("city")} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-semibold text-ink">Periode kepengurusan</legend>
        <Field label="Nama periode" htmlFor="term_name" required error={errors.term_name}>
          <Input {...fieldAria("term_name", errors.term_name)} value={v.term_name} onChange={set("term_name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal mulai" htmlFor="term_start" required error={errors.term_start}>
            <Input {...fieldAria("term_start", errors.term_start)} type="date" value={v.term_start} onChange={set("term_start")} />
          </Field>
          <Field label="Tanggal selesai" htmlFor="term_end" error={errors.term_end} help="Boleh dikosongkan.">
            <Input {...fieldAria("term_end", errors.term_end)} type="date" value={v.term_end} onChange={set("term_end")} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-semibold text-ink">Akun Anda</legend>
        <p className="text-sm text-muted">Anda masuk sebagai <strong className="text-ink">{email}</strong> dan akan menjadi Admin Organisasi sekaligus Bendahara.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama lengkap" htmlFor="full_name" required error={errors.full_name}>
            <Input {...fieldAria("full_name", errors.full_name)} value={v.full_name} onChange={set("full_name")} autoComplete="name" />
          </Field>
          <Field label="Jabatan" htmlFor="position">
            <Input id="position" value={v.position} onChange={set("position")} />
          </Field>
        </div>
      </fieldset>
      <Alert tone="info">
        Daftar akun, dana Kas Umum, dan kategori bawaan akan dibuat. <strong>Tidak ada transaksi atau data contoh</strong> yang dimasukkan.
      </Alert>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>Siapkan organisasi</Button>
    </form>
  );
}
