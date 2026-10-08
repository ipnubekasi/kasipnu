"use client";

import * as React from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatMonth } from "@/lib/format";
import { KIND_LABEL } from "@/lib/labels";
import type { EntryKind, OrgSettings } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useAction, useUnsavedWarning } from "@/components/app/hooks";

const DEFAULT_PREFIX: Record<EntryKind, string> = { pemasukan: "KM", pengeluaran: "KK", transfer: "TR", saldo_awal: "SA", penyesuaian: "JU", pembalikan: "JB" };

export function RefSettingsForm({ orgId, settings, isAdmin }: { orgId: string; settings: OrgSettings; isAdmin: boolean }) {
  const { run, pending } = useAction();
  const [prefix, setPrefix] = React.useState<Record<string, string>>({ ...DEFAULT_PREFIX, ...(settings.ref?.prefix ?? {}) });
  const [digits, setDigits] = React.useState(String(settings.ref?.digits ?? 4));
  const [dirty, setDirty] = React.useState(false);
  useUnsavedWarning(dirty);
  const year = new Date().getFullYear();
  const d = Math.min(Math.max(Number(digits) || 4, 3), 8);
  const values = Object.values(prefix).map((p) => p.trim().toUpperCase());
  const invalid = values.some((p) => !/^[A-Z0-9]{1,6}$/.test(p));
  const dup = new Set(values).size !== values.length;

  return (
    <Card>
      <CardHeader><CardTitle>Format nomor referensi</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!isAdmin && <Alert tone="info">Format nomor hanya dapat diubah oleh Admin Organisasi.</Alert>}
        <Table>
          <THead><TR className="hover:bg-transparent"><TH>Jenis</TH><TH>Awalan</TH><TH>Contoh nomor</TH></TR></THead>
          <TBody>
            {(Object.keys(DEFAULT_PREFIX) as EntryKind[]).map((k) => (
              <TR key={k} className="hover:bg-transparent">
                <TD>{KIND_LABEL[k]}</TD>
                <TD><Input aria-label={`Awalan ${KIND_LABEL[k]}`} className="h-9 w-24 uppercase" maxLength={6} value={prefix[k]} disabled={!isAdmin} onChange={(e) => { setPrefix({ ...prefix, [k]: e.target.value.toUpperCase() }); setDirty(true); }} /></TD>
                <TD className="tnum text-muted">{(prefix[k] || DEFAULT_PREFIX[k]).toUpperCase()}-{year}-{"1".padStart(d, "0")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Field label="Jumlah digit nomor urut" htmlFor="ref-digits" help="Antara 3 dan 8 digit.">
          <Input id="ref-digits" type="number" min={3} max={8} className="w-24" value={digits} disabled={!isAdmin} onChange={(e) => { setDigits(e.target.value); setDirty(true); }} />
        </Field>
        {invalid && <p role="alert" className="text-[13px] text-danger">Awalan hanya boleh huruf dan angka, 1 sampai 6 karakter.</p>}
        {dup && <p className="text-[13px] text-warn">Beberapa jenis memakai awalan yang sama. Nomor tetap unik, tetapi jenis transaksi menjadi tidak terbaca dari nomornya.</p>}
        <p className="text-[13px] text-muted">Nomor diberikan database saat transaksi dibukukan, berurutan per awalan dan tahun, dan aman dari penyimpanan bersamaan. Perubahan format hanya berlaku untuk transaksi berikutnya.</p>
        {isAdmin && (
          <Button
            variant="primary"
            loading={pending}
            disabled={invalid || !dirty}
            onClick={() => run(() => createClient().rpc("update_org_settings", { p_org: orgId, p_section: "ref", p_value: { prefix: Object.fromEntries(Object.entries(prefix).map(([k, v]) => [k, v.trim().toUpperCase()])), digits: d } }), { success: "Format nomor disimpan", onSuccess: () => setDirty(false) })}
          >
            Simpan format
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export type PeriodRow = { year: number; month: number; posted: number; drafts: number; status: "terbuka" | "ditutup" | "dibuka"; closed_at: string | null; reopen_reason: string | null; ended: boolean };

export function PeriodsManager({ orgId, rows, canClose, isAdmin }: { orgId: string; rows: PeriodRow[]; canClose: boolean; isAdmin: boolean }) {
  const supabase = createClient();
  const { run, pending } = useAction();
  const [close, setClose] = React.useState<PeriodRow | null>(null);
  const [reopen, setReopen] = React.useState<PeriodRow | null>(null);
  const label = (r: PeriodRow) => formatMonth(`${r.year}-${String(r.month).padStart(2, "0")}-01`);
  return (
    <>
      <Card>
        <Table>
          <THead><TR className="hover:bg-transparent"><TH>Periode</TH><TH className="text-right">Dibukukan</TH><TH className="text-right">Draft</TH><TH>Status</TH><TH /></TR></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={`${r.year}-${r.month}`}>
                <TD className="font-medium">{label(r)}</TD>
                <TD className="num">{r.posted}</TD>
                <TD className="num">{r.drafts > 0 ? <span className="text-warn">{r.drafts}</span> : 0}</TD>
                <TD>
                  {r.status === "ditutup" ? <Badge tone="neutral">Ditutup</Badge> : r.status === "dibuka" ? <Badge tone="warn">Dibuka kembali</Badge> : <Badge tone="ok">Terbuka</Badge>}
                  {r.status === "ditutup" && r.closed_at && <span className="mt-0.5 block text-[12px] text-muted">{formatDateTime(r.closed_at)}</span>}
                  {r.status === "dibuka" && r.reopen_reason && <span className="mt-0.5 block text-[12px] text-muted">Alasan: {r.reopen_reason}</span>}
                </TD>
                <TD className="text-right whitespace-nowrap">
                  {r.status === "ditutup"
                    ? isAdmin && <Button size="sm" onClick={() => setReopen(r)}>Buka kembali</Button>
                    : canClose && r.ended && <Button size="sm" onClick={() => setClose(r)}>Tutup periode</Button>}
                  {!r.ended && <span className="text-[12px] text-muted">Sedang berjalan</span>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">
          Periode yang ditutup menolak pembukuan dan pembalikan bertanggal di dalamnya. Penolakan dilakukan di database, bukan hanya di tampilan. Koreksi atas transaksi di periode tertutup dicatat dengan tanggal pada periode yang masih terbuka.
        </p>
      </Card>
      <ConfirmDialog
        open={Boolean(close)}
        onOpenChange={(v) => !v && setClose(null)}
        title={`Tutup periode ${close ? label(close) : ""}?`}
        description={close?.drafts ? <span className="text-warn">Masih ada {close.drafts} draft pada periode ini. Bukukan atau hapus draft terlebih dahulu.</span> : "Setelah ditutup, tidak ada transaksi baru yang dapat dibukukan dengan tanggal pada periode ini. Pastikan rekonsiliasi sudah selesai."}
        confirmLabel="Tutup periode"
        pending={pending}
        onConfirm={() => run(() => supabase.rpc("close_period", { p_org: orgId, p_year: close!.year, p_month: close!.month }), { success: `Periode ${label(close!)} ditutup`, onSuccess: () => setClose(null) })}
      />
      <ConfirmDialog
        open={Boolean(reopen)}
        onOpenChange={(v) => !v && setReopen(null)}
        title={`Buka kembali periode ${reopen ? label(reopen) : ""}?`}
        description="Pembukaan kembali dicatat di audit log beserta alasan dan nama Anda. Tutup kembali setelah koreksi selesai."
        confirmLabel="Buka kembali"
        tone="danger"
        pending={pending}
        reason={{ label: "Alasan pembukaan kembali", required: true, placeholder: "Misalnya: ada kuitansi yang tertinggal" }}
        onConfirm={(reason) => run(() => supabase.rpc("reopen_period", { p_org: orgId, p_year: reopen!.year, p_month: reopen!.month, p_reason: reason }), { success: `Periode ${label(reopen!)} dibuka kembali`, onSuccess: () => setReopen(null) })}
      />
    </>
  );
}

export function HealthSettingsForm({ orgId, settings, canEdit }: { orgId: string; settings: OrgSettings; canEdit: boolean }) {
  const h = settings.health ?? {};
  const { run, pending } = useAction();
  const [v, setV] = React.useState({
    min_balance: h.min_balance ?? 0,
    monthly_operational_budget: h.monthly_operational_budget ?? 0,
    target_months: String(h.target_months ?? 3),
    critical_months: String(h.critical_months ?? 1),
    budget_warn_pct: String(h.budget_warn_pct ?? 80),
    budget_over_pct: String(h.budget_over_pct ?? 100),
    deficit_streak: String(h.deficit_streak ?? 2),
    evidence_days: String(h.evidence_days ?? 7),
    remind_days: String(h.remind_days ?? 7),
  });
  const [dirty, setDirty] = React.useState(false);
  useUnsavedWarning(dirty);
  const set = (k: keyof typeof v, val: string | number) => { setV((s) => ({ ...s, [k]: val })); setDirty(true); };
  const num = (k: keyof typeof v) => Number(String(v[k]).replace(",", "."));

  function save() {
    const target = num("target_months");
    const critical = num("critical_months");
    if (!(target > 0) || !(critical >= 0) || critical >= target) return toast.error("Batas kritis harus lebih kecil dari target ketahanan kas.");
    if (!(num("budget_warn_pct") > 0) || num("budget_warn_pct") > num("budget_over_pct")) return toast.error("Ambang peringatan anggaran harus lebih kecil atau sama dengan ambang melebihi anggaran.");
    void run(
      () => createClient().rpc("update_org_settings", {
        p_org: orgId, p_section: "health",
        p_value: {
          min_balance: Number(v.min_balance) || 0, monthly_operational_budget: Number(v.monthly_operational_budget) || 0,
          target_months: target, critical_months: critical, budget_warn_pct: num("budget_warn_pct"), budget_over_pct: num("budget_over_pct"),
          deficit_streak: Math.round(num("deficit_streak")), evidence_days: Math.round(num("evidence_days")), remind_days: Math.round(num("remind_days")),
        },
      }),
      { success: "Ambang disimpan dan kesehatan keuangan dihitung ulang", onSuccess: () => setDirty(false) },
    );
  }
  const numField = (k: keyof typeof v, label: string, suffix: string, help?: string) => (
    <Field key={k} label={label} htmlFor={`h-${k}`} help={help}>
      <div className="flex items-center gap-2">
        <Input id={`h-${k}`} inputMode="decimal" className="w-24 text-right" value={String(v[k])} disabled={!canEdit} onChange={(e) => set(k, e.target.value)} />
        <span className="text-sm text-muted">{suffix}</span>
      </div>
    </Field>
  );

  return (
    <Card>
      <CardHeader><CardTitle>Ambang kesehatan keuangan</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <Alert tone="info">Ambang ini adalah kebijakan awal aplikasi yang dapat Anda sesuaikan, bukan standar universal kesehatan keuangan. Indikator adalah alat bantu pengelolaan kas, bukan penilaian audit.</Alert>
        {!canEdit && <Alert tone="info">Ambang hanya dapat diubah oleh Bendahara atau Admin.</Alert>}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Minimum saldo aman Kas Umum" htmlFor="h-min" help="Isi 0 untuk mematikan peringatan ini.">
            <MoneyInput id="h-min" value={Number(v.min_balance)} disabled={!canEdit} onChange={(n) => set("min_balance", n ?? 0)} />
          </Field>
          <Field label="Anggaran operasional bulanan" htmlFor="h-budget" help="Dipakai bila riwayat tiga bulan belum cukup. Hasilnya diberi label Berdasarkan anggaran.">
            <MoneyInput id="h-budget" value={Number(v.monthly_operational_budget)} disabled={!canEdit} onChange={(n) => set("monthly_operational_budget", n ?? 0)} />
          </Field>
          {numField("target_months", "Target ketahanan kas", "bulan", "Di bawah angka ini: Perlu Perhatian.")}
          {numField("critical_months", "Batas kritis ketahanan kas", "bulan", "Di bawah angka ini: Kritis.")}
          {numField("budget_warn_pct", "Peringatan realisasi anggaran program", "% terpakai")}
          {numField("budget_over_pct", "Realisasi dianggap melebihi anggaran", "% terpakai")}
          {numField("deficit_streak", "Batas defisit berturut-turut", "bulan", "Isi 0 untuk mematikan.")}
          {numField("evidence_days", "Batas waktu melengkapi bukti", "hari setelah dibukukan")}
          {numField("remind_days", "Pengingat ulang notifikasi", "hari", "Notifikasi yang belum selesai dimunculkan lagi sebagai belum dibaca. Isi 0 untuk mematikan.")}
        </div>
        {canEdit && <Button variant="primary" loading={pending} disabled={!dirty} onClick={save}>Simpan ambang</Button>}
      </CardContent>
    </Card>
  );
}
