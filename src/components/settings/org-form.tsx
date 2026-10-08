"use client";

import * as React from "react";
import { Plus, Trash2, Upload } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BUCKET } from "@/lib/attachments";
import type { Organization } from "@/lib/types";
import { uuid } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Textarea } from "@/components/ui/input";
import { useAction, useUnsavedWarning } from "@/components/app/hooks";
import { OrgLogo } from "@/components/app/org-logo";

export function OrgForm({ org, logoUrl, isAdmin, canWrite, termSigners }: { org: Organization; logoUrl: string | null; isAdmin: boolean; canWrite: boolean; termSigners: { role: string; name: string }[] }) {
  const supabase = createClient();
  const profile = useAction();
  const sign = useAction();
  const logo = useAction();
  const limit = useAction();
  const [v, setV] = React.useState({ name: org.name, short_name: org.short_name, address: org.address ?? "", city: org.city ?? "" });
  const [dirty, setDirty] = React.useState(false);
  const sig = org.settings?.signature;
  const [sigEnabled, setSigEnabled] = React.useState(sig?.enabled ?? true);
  const [sigCity, setSigCity] = React.useState(sig?.city ?? org.city ?? "");
  const [signers, setSigners] = React.useState<{ role: string; name: string }[]>(sig?.signers?.length ? sig.signers : termSigners);
  const [maxMb, setMaxMb] = React.useState(String(org.settings?.attachment?.max_mb ?? 10));
  const fileRef = React.useRef<HTMLInputElement>(null);
  useUnsavedWarning(dirty);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setV((s) => ({ ...s, [k]: e.target.value })); setDirty(true); };

  async function uploadLogo(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) return toast.error("Logo harus berupa PNG atau JPG.");
    if (file.size > 2 * 1024 * 1024) return toast.error("Ukuran logo maksimal 2 MB.");
    await logo.run(async () => {
      const path = `${org.id}/logo/${uuid()}.${file.type === "image/png" ? "png" : "jpg"}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) return { error: { message: "Logo gagal diunggah. Periksa koneksi lalu coba lagi." } };
      return supabase.from("organizations").update({ logo_path: path }).eq("id", org.id);
    }, { success: "Logo diperbarui" });
  }

  return (
    <div className="space-y-5">
      {!isAdmin && <Alert tone="info">Profil organisasi hanya dapat diubah oleh Admin Organisasi.</Alert>}
      <Card>
        <CardHeader><CardTitle>Profil organisasi</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <OrgLogo src={logoUrl} name={org.name} size={64} />
            <div className="space-y-1.5">
              <p className="text-sm text-muted">{logoUrl ? "Logo tampil di menu dan kop laporan PDF." : "Logo belum diunggah. Placeholder netral dipakai sampai logo resmi tersedia."}</p>
              {isAdmin && (
                <>
                  <Button size="sm" loading={logo.pending} onClick={() => fileRef.current?.click()}><Upload aria-hidden />{logoUrl ? "Ganti logo" : "Unggah logo"}</Button>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadLogo(f); }} />
                </>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama organisasi" htmlFor="o-name" required><Input id="o-name" value={v.name} onChange={set("name")} disabled={!isAdmin} /></Field>
            <Field label="Nama singkat" htmlFor="o-short"><Input id="o-short" value={v.short_name} onChange={set("short_name")} disabled={!isAdmin} /></Field>
            <Field label="Alamat sekretariat" htmlFor="o-address" className="sm:col-span-2"><Textarea id="o-address" rows={2} value={v.address} onChange={set("address")} disabled={!isAdmin} /></Field>
            <Field label="Kota/kabupaten" htmlFor="o-city"><Input id="o-city" value={v.city} onChange={set("city")} disabled={!isAdmin} /></Field>
          </div>
          {isAdmin && (
            <Button
              variant="primary"
              loading={profile.pending}
              disabled={!dirty || !v.name.trim()}
              onClick={() => profile.run(() => supabase.from("organizations").update({ name: v.name.trim(), short_name: v.short_name.trim() || v.name.trim(), address: v.address.trim() || null, city: v.city.trim() || null }).eq("id", org.id), { success: "Profil organisasi disimpan", onSuccess: () => setDirty(false) })}
            >
              Simpan profil
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tanda tangan pada laporan</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2.5">
            <Checkbox id="sig-on" checked={sigEnabled} disabled={!canWrite && !isAdmin} onChange={(e) => setSigEnabled(e.target.checked)} className="mt-0.5" />
            <div><Label htmlFor="sig-on" className="font-normal">Tampilkan area nama dan tanda tangan pada PDF laporan dan LPJ</Label></div>
          </div>
          {sigEnabled && (
            <>
              <Field label="Tempat penandatanganan" htmlFor="sig-city" help="Dicetak sebelum tanggal, misalnya: Bekasi, 8 Oktober 2026."><Input id="sig-city" className="sm:max-w-xs" value={sigCity} onChange={(e) => setSigCity(e.target.value)} /></Field>
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">Penanda tangan</p>
                {signers.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input aria-label={`Jabatan penanda tangan ${i + 1}`} placeholder="Jabatan" value={s.role} onChange={(e) => setSigners(signers.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} className="sm:max-w-40" />
                    <Input aria-label={`Nama penanda tangan ${i + 1}`} placeholder="Nama lengkap" value={s.name} onChange={(e) => setSigners(signers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <Button size="icon" variant="ghost" aria-label="Hapus penanda tangan" onClick={() => setSigners(signers.filter((_, j) => j !== i))}><Trash2 aria-hidden /></Button>
                  </div>
                ))}
                {signers.length < 4 && <Button size="sm" onClick={() => setSigners([...signers, { role: "", name: "" }])}><Plus aria-hidden />Tambah penanda tangan</Button>}
              </div>
            </>
          )}
          {(canWrite || isAdmin) && (
            <Button
              variant="primary"
              loading={sign.pending}
              onClick={() => sign.run(() => supabase.rpc("update_org_settings", { p_org: org.id, p_section: "signature", p_value: { enabled: sigEnabled, city: sigCity.trim(), signers: signers.filter((s) => s.role.trim() || s.name.trim()) } }), { success: "Pengaturan tanda tangan disimpan" })}
            >
              Simpan tanda tangan
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Batas ukuran bukti</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Ukuran maksimal per berkas (MB)" htmlFor="max-mb" help="Batas awal 10 MB. Nilai di atas 10 MB juga memerlukan perubahan batas bucket di Supabase Storage (lihat panduan setup).">
            <Input id="max-mb" type="number" min={1} max={50} className="sm:max-w-32" value={maxMb} disabled={!isAdmin} onChange={(e) => setMaxMb(e.target.value)} />
          </Field>
          {isAdmin && (
            <Button
              loading={limit.pending}
              onClick={() => {
                const n = Math.round(Number(maxMb));
                if (!(n >= 1 && n <= 50)) return toast.error("Isi angka antara 1 dan 50.");
                void limit.run(() => supabase.rpc("update_org_settings", { p_org: org.id, p_section: "attachment", p_value: { max_mb: n } }), { success: "Batas ukuran disimpan" });
              }}
            >
              Simpan batas
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
