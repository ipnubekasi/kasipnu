"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileSpreadsheet, TriangleAlert, Upload, XCircle } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatRupiah, todayJakarta } from "@/lib/format";
import { autoMap, norm, parseAmount, parseDate, parseKind, readTable, sha256, TARGETS, type Mapping, type RawTable, type TargetKey } from "@/lib/import/parse";
import { downloadBlob } from "@/lib/reports/export";
import type { Account, Category, Fund, Program } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Checkbox, Select } from "@/components/ui/input";
import { useUnsavedWarning } from "@/components/app/hooks";
import { Money } from "@/components/app/money";

type Kind = "pemasukan" | "pengeluaran" | "transfer";
type Parsed = {
  rowNo: number;
  kind: Kind | null;
  date: string | null;
  amount: number | null;
  description: string;
  categoryId: string | null;
  accountId: string | null;
  fundId: string | null;
  toAccountId: string | null;
  toFundId: string | null;
  counterparty: string;
  notes: string;
  errors: string[];
  hash: string;
  already: boolean;
  similar: { id: string; ref_no: string | null; status: string; description: string }[];
  include: boolean;
};

const STEPS = ["Unggah berkas", "Petakan kolom", "Tinjau dan validasi", "Selesai"];

export function ImportWizard({ orgId, accounts, funds, programs, categories }: { orgId: string; accounts: Account[]; funds: Fund[]; programs: Program[]; categories: Category[] }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [file, setFile] = React.useState<File | null>(null);
  const [fileHash, setFileHash] = React.useState("");
  const [table, setTable] = React.useState<RawTable | null>(null);
  const [mapping, setMapping] = React.useState<Mapping>({});
  const [defaults, setDefaults] = React.useState({ account: "", fund: funds.find((f) => f.kind === "umum")?.id ?? "", kind: "", catIn: "", catOut: "" });
  const [rows, setRows] = React.useState<Parsed[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ batch_id: string; total: number; imported: number; duplicates: number } | null>(null);
  const [onlyProblems, setOnlyProblems] = React.useState(false);
  useUnsavedWarning(step > 0 && step < 3);

  const cashAccounts = accounts.filter((a) => a.is_cash && a.is_active);
  const usableFunds = funds.filter((f) => f.is_active && (f.kind === "umum" || programs.some((p) => p.fund_id === f.id && p.status !== "diarsipkan")));

  async function downloadTemplate(kind: "xlsx" | "csv") {
    const headers = ["Tanggal", "Jenis", "Nominal", "Uraian", "Kategori", "Rekening", "Dana", "Rekening Tujuan", "Dana Tujuan", "Pihak", "Catatan"];
    const acc = cashAccounts[0]?.name ?? "Kas Tunai";
    const examples = [
      ["05/01/2026", "Pemasukan", 500000, "Iuran PAC Januari", categories.find((c) => c.kind === "pemasukan")?.name ?? "Iuran", acc, "Kas Umum", "", "", "PAC Tambun", ""],
      ["07/01/2026", "Pengeluaran", 150000, "Fotokopi surat undangan", categories.find((c) => c.kind === "pengeluaran" && c.name.includes("ATK"))?.name ?? "ATK dan cetak", acc, "Kas Umum", "", "", "Toko ATK", ""],
      ["10/01/2026", "Transfer", 200000, "Setor tunai ke bank", "", acc, "Kas Umum", cashAccounts[1]?.name ?? "Rekening Bank", "Kas Umum", "", "Contoh transfer antarrekening"],
    ];
    if (kind === "csv") {
      const csv = "﻿" + [headers, ...examples].map((r) => r.map((c) => (/[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(";")).join("\r\n");
      return downloadBlob(csv, "Template Impor Kas IPNU.csv", "text/csv;charset=utf-8");
    }
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Transaksi");
    ws.addRow(headers).font = { bold: true };
    examples.forEach((r) => ws.addRow(r));
    ws.columns = headers.map((h, i) => ({ width: [12, 13, 14, 36, 22, 22, 18, 22, 18, 20, 24][i] }));
    ws.getColumn(3).numFmt = "#,##0";
    const help = wb.addWorksheet("Petunjuk");
    [
      ["Petunjuk impor Kas IPNU"],
      [""],
      ["1. Isi satu transaksi per baris pada sheet Transaksi. Hapus baris contoh sebelum mengunggah."],
      ["2. Tanggal: format dd/mm/yyyy, misalnya 05/01/2026."],
      ["3. Jenis: Pemasukan, Pengeluaran, atau Transfer. Untuk mutasi bank boleh memakai kolom Masuk dan Keluar sebagai pengganti Jenis dan Nominal."],
      ["4. Nominal: angka rupiah tanpa titik, misalnya 1500000."],
      ["5. Kategori, Rekening, dan Dana harus sama dengan nama di aplikasi (lihat daftar di bawah). Dana kosong berarti Kas Umum."],
      ["6. Semua baris masuk sebagai DRAFT. Periksa, lalu bukukan dari halaman Kas Umum. Mengunggah ulang berkas yang sama tidak menggandakan data."],
      [""],
      ["Kategori pemasukan", "Kategori pengeluaran", "Rekening", "Dana"],
    ].forEach((r) => help.addRow(r));
    const inc = categories.filter((c) => c.kind === "pemasukan" && c.is_active).map((c) => c.name);
    const exp = categories.filter((c) => c.kind === "pengeluaran" && c.is_active).map((c) => c.name);
    const max = Math.max(inc.length, exp.length, cashAccounts.length, usableFunds.length);
    for (let i = 0; i < max; i++) help.addRow([inc[i] ?? "", exp[i] ?? "", cashAccounts[i]?.name ?? "", usableFunds[i]?.name ?? ""]);
    help.getRow(1).font = { bold: true, size: 13 };
    help.getRow(10).font = { bold: true };
    help.columns = [{ width: 28 }, { width: 28 }, { width: 28 }, { width: 28 }];
    downloadBlob(await wb.xlsx.writeBuffer(), "Template Impor Kas IPNU.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  async function onFile(f: File | null) {
    if (!f) return;
    setError(null);
    if (/\.pdf$/i.test(f.name)) {
      setError("Berkas PDF tidak dapat diubah menjadi transaksi. Simpan sebagai arsip dokumen di menu Arsip Bukti, lalu gunakan CSV atau XLSX untuk impor.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("Berkas impor maksimal 10 MB. Bagi menjadi beberapa berkas.");
      return;
    }
    setBusy(true);
    try {
      const t = await readTable(f);
      if (!t.headers.length || !t.rows.length) throw new Error("Berkas kosong atau baris judul kolom tidak ditemukan.");
      if (t.rows.length > 2000) throw new Error(`Berkas berisi ${t.rows.length} baris. Maksimal 2.000 baris per impor; bagi menjadi beberapa berkas.`);
      setFile(f);
      setFileHash(await sha256(await f.arrayBuffer()));
      setTable(t);
      setMapping(autoMap(t.headers));
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Berkas tidak dapat dibaca.");
    } finally {
      setBusy(false);
    }
  }

  function matchAccount(v: string): string | null {
    const s = norm(v);
    if (!s) return null;
    return cashAccounts.find((a) => norm(a.name) === s || norm(a.code) === s)?.id ?? accounts.find((a) => a.is_cash && (norm(a.name) === s || norm(a.code) === s))?.id ?? null;
  }
  function matchFund(v: string): string | null {
    const s = norm(v);
    if (!s) return null;
    if (s === "umum" || s === "kas umum") return funds.find((f) => f.kind === "umum")?.id ?? null;
    const p = programs.find((x) => norm(x.name) === s || norm(x.code) === s);
    if (p) return p.fund_id;
    return funds.find((f) => norm(f.name) === s || norm(f.code) === s)?.id ?? null;
  }
  function matchCategory(v: string, kind: Kind): string | null {
    const s = norm(v);
    if (!s) return null;
    return categories.find((c) => c.kind === kind && (norm(c.name) === s || norm(c.name).startsWith(s)))?.id ?? null;
  }

  async function validate() {
    if (!table) return;
    const get = (row: unknown[], k: TargetKey) => (mapping[k] === undefined ? "" : row[mapping[k]!]);
    const parsed: Parsed[] = [];
    const seen = new Map<string, number>();
    const today = todayJakarta();
    for (const [i, row] of table.rows.entries()) {
      const errors: string[] = [];
      const date = parseDate(get(row, "tanggal"));
      if (!date) errors.push("Tanggal tidak terbaca");
      else if (date > today) errors.push("Tanggal di masa depan");

      let kind = parseKind(get(row, "jenis")) ?? (parseKind(defaults.kind) as Kind | null);
      let amount: number | null = null;
      const nominal = parseAmount(get(row, "nominal"));
      const masuk = parseAmount(get(row, "masuk"));
      const keluar = parseAmount(get(row, "keluar"));
      if (nominal !== null && nominal !== 0) {
        amount = Math.abs(nominal);
        if (!kind) kind = nominal < 0 ? "pengeluaran" : "pemasukan";
      } else if (masuk && Math.abs(masuk) > 0) {
        amount = Math.abs(masuk);
        kind = kind ?? "pemasukan";
      } else if (keluar && Math.abs(keluar) > 0) {
        amount = Math.abs(keluar);
        kind = kind ?? "pengeluaran";
      }
      if (!amount) errors.push("Nominal kosong atau nol");
      else if (!Number.isInteger(amount)) errors.push("Nominal berisi pecahan sen");
      if (!kind) errors.push("Jenis transaksi tidak dikenali");

      const description = String(get(row, "uraian") ?? "").trim().slice(0, 200);
      if (description.length < 3) errors.push("Uraian kosong");

      const accRaw = String(get(row, "rekening") ?? "").trim();
      const accountId = accRaw ? matchAccount(accRaw) : defaults.account || null;
      if (!accountId) errors.push(accRaw ? `Rekening "${accRaw}" tidak ditemukan` : "Rekening belum diisi");

      const fundRaw = String(get(row, "dana") ?? "").trim();
      const fundId = fundRaw ? matchFund(fundRaw) : defaults.fund || null;
      if (!fundId) errors.push(fundRaw ? `Dana/program "${fundRaw}" tidak ditemukan` : "Dana belum diisi");
      else if (!usableFunds.some((f) => f.id === fundId)) errors.push("Program sudah diarsipkan");

      let categoryId: string | null = null;
      let toAccountId: string | null = null;
      let toFundId: string | null = null;
      if (kind === "transfer") {
        const ta = String(get(row, "rekening_tujuan") ?? "").trim();
        const tf = String(get(row, "dana_tujuan") ?? "").trim();
        toAccountId = ta ? matchAccount(ta) : accountId;
        toFundId = tf ? matchFund(tf) : fundId;
        if (ta && !toAccountId) errors.push(`Rekening tujuan "${ta}" tidak ditemukan`);
        if (tf && !toFundId) errors.push(`Dana tujuan "${tf}" tidak ditemukan`);
        if (toAccountId === accountId && toFundId === fundId) errors.push("Asal dan tujuan transfer sama");
      } else if (kind) {
        const catRaw = String(get(row, "kategori") ?? "").trim();
        categoryId = catRaw ? matchCategory(catRaw, kind) : (kind === "pemasukan" ? defaults.catIn : defaults.catOut) || null;
        if (!categoryId) errors.push(catRaw ? `Kategori ${kind} "${catRaw}" tidak ditemukan` : "Kategori belum diisi");
      }

      const counterparty = String(get(row, "pihak") ?? "").trim().slice(0, 120);
      const notes = String(get(row, "catatan") ?? "").trim().slice(0, 1000);
      const base = [date, kind, amount, norm(description), accountId, fundId, toAccountId, toFundId, categoryId].join("|");
      const occ = (seen.get(base) ?? 0) + 1;
      seen.set(base, occ);
      parsed.push({ rowNo: i + 2, kind, date, amount, description, categoryId, accountId, fundId, toAccountId, toFundId, counterparty, notes, errors, hash: await sha256(`${base}|${occ}`), already: false, similar: [], include: errors.length === 0 });
    }

    setBusy(true);
    const valid = parsed.filter((p) => p.errors.length === 0);
    if (valid.length) {
      const { data, error: err } = await createClient().rpc("check_import_rows", { p_org: orgId, p_rows: valid.map((p) => ({ row_no: p.rowNo, hash: p.hash, entry_date: p.date, amount: p.amount, kind: p.kind })) });
      if (err) {
        setBusy(false);
        setError(friendlyError(err).message);
        return;
      }
      for (const c of (data ?? []) as { row_no: number; already_imported: boolean; similar: Parsed["similar"] }[]) {
        const p = parsed.find((x) => x.rowNo === c.row_no)!;
        p.already = c.already_imported;
        p.similar = c.similar;
        if (p.already || p.similar.length) p.include = false;
      }
    }
    setBusy(false);
    setRows(parsed);
    setStep(2);
  }

  async function doImport() {
    const chosen = rows.filter((r) => r.include && r.errors.length === 0 && !r.already);
    if (!chosen.length) return;
    setBusy(true);
    const { data, error: err } = await createClient().rpc("import_transactions", {
      p_org: orgId,
      p_file_name: file?.name ?? "impor",
      p_file_hash: fileHash,
      p_mapping: Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k, table?.headers[v as number] ?? ""])),
      p_rows: chosen.map((r) => ({ row_no: r.rowNo, hash: r.hash, kind: r.kind, entry_date: r.date, amount: r.amount, description: r.description, category_id: r.categoryId, account_id: r.accountId, fund_id: r.fundId, to_account_id: r.toAccountId, to_fund_id: r.toFundId, counterparty: r.counterparty, notes: r.notes })),
    });
    setBusy(false);
    if (err) {
      const f = friendlyError(err);
      setError(`${f.message}${f.hint ? " " + f.hint : ""}`);
      return;
    }
    setResult(data);
    setStep(3);
    toast.success(`${data.imported} draft diimpor`);
    router.refresh();
  }

  const accName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "";
  const fundName = (id: string | null) => funds.find((f) => f.id === id)?.name ?? "";
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "";
  const counts = {
    ok: rows.filter((r) => r.errors.length === 0 && !r.already && !r.similar.length).length,
    err: rows.filter((r) => r.errors.length > 0).length,
    already: rows.filter((r) => r.already).length,
    similar: rows.filter((r) => !r.already && r.errors.length === 0 && r.similar.length > 0).length,
    chosen: rows.filter((r) => r.include && r.errors.length === 0 && !r.already).length,
  };
  const shown = onlyProblems ? rows.filter((r) => r.errors.length || r.already || r.similar.length) : rows;
  const hasAmount = mapping.nominal !== undefined || mapping.masuk !== undefined || mapping.keluar !== undefined;

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Langkah impor">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={cn("flex items-center gap-2", i === step ? "font-medium text-primary" : i < step ? "text-ink" : "text-faint")}>
            <span className={cn("inline-flex size-6 items-center justify-center rounded-full border text-[12px]", i < step ? "border-primary bg-primary text-white" : i === step ? "border-primary text-primary" : "border-line-strong")}>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      {error && <Alert tone="danger" title={error} />}

      {step === 0 && (
        <Card>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-subtle/60 px-4 py-3">
              <p className="text-sm text-muted">Mulai dari template agar kolom langsung dikenali. Rekening koran bank juga dapat diunggah langsung.</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => downloadTemplate("xlsx")}><Download aria-hidden />Template XLSX</Button>
                <Button size="sm" onClick={() => downloadTemplate("csv")}><Download aria-hidden />Template CSV</Button>
              </div>
            </div>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-control border border-dashed border-line-strong px-4 py-10 text-center hover:bg-subtle/60">
              <FileSpreadsheet className="size-7 text-faint" aria-hidden />
              <span className="text-sm font-medium text-ink">Pilih berkas CSV atau XLSX</span>
              <span className="text-[13px] text-muted">Maksimal 2.000 baris dan 10 MB per berkas.</span>
              <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} disabled={busy} />
              {busy && <span className="text-[13px] text-muted">Membaca berkas...</span>}
            </label>
            <Alert tone="info" title="PDF laporan lama">Berkas PDF tidak diubah menjadi transaksi. Simpan sebagai arsip dokumen lewat menu <Link href="/arsip?tab=dokumen" className="font-medium text-accent underline">Arsip Bukti</Link>.</Alert>
          </CardContent>
        </Card>
      )}

      {step === 1 && table && (
        <Card>
          <CardHeader><CardTitle>Petakan kolom: {file?.name}</CardTitle><span className="text-[13px] text-muted">{table.rows.length} baris{table.sheetName ? ` · sheet ${table.sheetName}` : ""}</span></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {TARGETS.map((t) => (
                <Field key={t.key} label={t.label} htmlFor={`map-${t.key}`} required={"required" in t && t.required}>
                  <Select id={`map-${t.key}`} value={mapping[t.key] === undefined ? "" : String(mapping[t.key])} onChange={(e) => setMapping({ ...mapping, [t.key]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                    <option value="">Tidak dipakai</option>
                    {table.headers.map((h, i) => <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
            <p className="text-[13px] text-muted">Untuk rekening koran: kolom Kredit adalah uang masuk dan kolom Debit adalah uang keluar dari rekening.</p>
            <div className="border-t border-line pt-4">
              <p className="mb-3 text-sm font-medium text-ink">Nilai bawaan bila kolom kosong atau tidak dipakai</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Rekening" htmlFor="def-acc"><Select id="def-acc" value={defaults.account} onChange={(e) => setDefaults({ ...defaults, account: e.target.value })}><option value="">Tidak ada</option>{cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
                <Field label="Dana" htmlFor="def-fund"><Select id="def-fund" value={defaults.fund} onChange={(e) => setDefaults({ ...defaults, fund: e.target.value })}>{usableFunds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
                <Field label="Jenis" htmlFor="def-kind"><Select id="def-kind" value={defaults.kind} onChange={(e) => setDefaults({ ...defaults, kind: e.target.value })}><option value="">Dari kolom</option><option value="pemasukan">Pemasukan</option><option value="pengeluaran">Pengeluaran</option></Select></Field>
                <Field label="Kategori pemasukan" htmlFor="def-cin"><Select id="def-cin" value={defaults.catIn} onChange={(e) => setDefaults({ ...defaults, catIn: e.target.value })}><option value="">Wajib dari kolom</option>{categories.filter((c) => c.kind === "pemasukan" && c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
                <Field label="Kategori pengeluaran" htmlFor="def-cout"><Select id="def-cout" value={defaults.catOut} onChange={(e) => setDefaults({ ...defaults, catOut: e.target.value })}><option value="">Wajib dari kolom</option>{categories.filter((c) => c.kind === "pengeluaran" && c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              </div>
            </div>
            {(mapping.tanggal === undefined || mapping.uraian === undefined || !hasAmount) && <Alert tone="warn">Petakan minimal kolom Tanggal, Uraian, dan salah satu dari Nominal, Masuk, atau Keluar.</Alert>}
            <div className="flex justify-between gap-2">
              <Button onClick={() => { setStep(0); setTable(null); }}>Ganti berkas</Button>
              <Button variant="primary" loading={busy} disabled={mapping.tanggal === undefined || mapping.uraian === undefined || !hasAmount} onClick={validate}>Validasi baris</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Tinjau hasil validasi</CardTitle>
            <label className="flex items-center gap-2 text-[13px] text-muted"><Checkbox checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />Hanya tampilkan yang bermasalah</label>
          </CardHeader>
          <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 text-[13px] sm:px-5">
            <Badge tone="ok"><CheckCircle2 aria-hidden />{counts.ok} siap diimpor</Badge>
            <Badge tone="danger"><XCircle aria-hidden />{counts.err} galat</Badge>
            <Badge tone="neutral">{counts.already} sudah pernah diimpor</Badge>
            <Badge tone="warn"><TriangleAlert aria-hidden />{counts.similar} kemungkinan duplikat</Badge>
          </div>
          <div className="max-h-[60dvh] overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-10 bg-subtle text-left text-[12px] text-muted uppercase">
                <tr><th className="w-10 px-3 py-2" /><th className="px-2 py-2">Baris</th><th className="px-2 py-2">Tanggal</th><th className="px-2 py-2">Jenis</th><th className="px-2 py-2">Uraian</th><th className="px-2 py-2">Kategori/tujuan</th><th className="px-2 py-2">Rekening · Dana</th><th className="px-2 py-2 text-right">Nominal</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.rowNo} className={cn("border-b border-line align-top", r.errors.length ? "bg-danger-soft/40" : r.already ? "text-muted" : r.similar.length ? "bg-warn-soft/40" : "")}>
                    <td className="px-3 py-2"><Checkbox aria-label={`Sertakan baris ${r.rowNo}`} checked={r.include} disabled={r.errors.length > 0 || r.already} onChange={(e) => setRows(rows.map((x) => (x.rowNo === r.rowNo ? { ...x, include: e.target.checked } : x)))} /></td>
                    <td className="tnum px-2 py-2">{r.rowNo}</td>
                    <td className="tnum px-2 py-2 whitespace-nowrap">{r.date ? formatDate(r.date) : "-"}</td>
                    <td className="px-2 py-2">{r.kind ?? "-"}</td>
                    <td className="max-w-64 px-2 py-2">{r.description}{r.counterparty && <span className="block text-[12px] text-muted">{r.counterparty}</span>}</td>
                    <td className="px-2 py-2">{r.kind === "transfer" ? `${accName(r.toAccountId)} · ${fundName(r.toFundId)}` : catName(r.categoryId)}</td>
                    <td className="px-2 py-2">{accName(r.accountId)} · {fundName(r.fundId)}</td>
                    <td className="num px-2 py-2">{r.amount ? <Money value={r.amount} /> : "-"}</td>
                    <td className="px-3 py-2 text-[13px]">
                      {r.errors.length > 0 ? <span className="text-danger">{r.errors.join("; ")}</span>
                        : r.already ? "Sudah pernah diimpor, dilewati"
                          : r.similar.length ? <span className="text-warn">Mirip {r.similar.map((s) => s.ref_no ?? "draft").join(", ")} (tanggal, jenis, nominal sama). Centang bila tetap ingin diimpor.</span>
                            : <span className="text-accent">Siap</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
            <p className="text-sm text-muted"><strong className="text-ink">{counts.chosen}</strong> baris akan diimpor sebagai draft senilai {formatRupiah(rows.filter((r) => r.include && !r.errors.length && !r.already).reduce((t, r) => t + (r.amount ?? 0), 0))}. Baris bergalat tidak diimpor; perbaiki di berkas lalu unggah ulang.</p>
            <div className="flex gap-2">
              <Button onClick={() => setStep(1)}>Ubah pemetaan</Button>
              <Button variant="primary" loading={busy} disabled={counts.chosen === 0} onClick={doImport}><Upload aria-hidden />Impor {counts.chosen} baris sebagai draft</Button>
            </div>
          </div>
        </Card>
      )}

      {step === 3 && result && (
        <Card>
          <CardContent className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto size-9 text-accent" aria-hidden />
            <p className="text-base font-semibold text-ink">{result.imported} transaksi masuk sebagai draft</p>
            <p className="mx-auto max-w-lg text-sm text-muted">Draft belum memengaruhi saldo. Tinjau setiap baris, lalu pilih dan bukukan. {result.duplicates > 0 && `${result.duplicates} baris dilewati karena sudah pernah diimpor.`}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="primary"><Link href={`/kas?lingkup=gabungan&status=draft&batch=${result.batch_id}`}>Tinjau dan bukukan</Link></Button>
              <Button onClick={() => { setStep(0); setRows([]); setResult(null); setTable(null); }}>Impor berkas lain</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
