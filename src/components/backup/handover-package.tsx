"use client";

import * as React from "react";
import { Archive } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatBytes, formatDateTime, todayJakarta } from "@/lib/format";
import { buildReport } from "@/lib/reports/build";
import { downloadBlob, toCsv, toPdf, toXlsx } from "@/lib/reports/export";
import type { ReportKey } from "@/lib/reports/types";
import type { Master, Organization, Term } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Label } from "@/components/ui/input";

const TABLES = [
  "organizations", "management_terms", "organization_members", "accounts", "funds", "programs", "categories", "budgets", "budget_items",
  "journal_entries", "journal_lines", "attachments", "cash_needs", "reconciliations", "closed_periods", "import_batches", "audit_logs", "notifications", "health_checks",
] as const;

function toCsvRows(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\r\n");
}

/**
 * Paket serah terima: data (JSON dan CSV), laporan (PDF dan XLSX), dan lampiran bukti dalam satu ZIP.
 * Paket ini untuk serah terima dan arsip; bukan pengganti backup database (lihat panduan).
 */
export function HandoverPackage({ org, master, term, userName }: { org: Organization; master: Master; term: Term | null; userName: string }) {
  const [withFiles, setWithFiles] = React.useState(true);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function build() {
    setBusy(true);
    const supabase = createClient();
    const enc = new TextEncoder();
    const files: Record<string, Uint8Array> = {};
    const counts: Record<string, number> = {};
    try {
      for (const t of TABLES) {
        setProgress(`Mengambil data ${t}...`);
        const rows: Record<string, unknown>[] = [];
        for (let from = 0; ; from += 1000) {
          let q = supabase.from(t).select("*").range(from, from + 999);
          q = t === "organizations" ? q.eq("id", org.id) : q.eq("organization_id", org.id);
          const { data, error } = await q;
          if (error) throw new Error(`${t}: ${error.message}`);
          rows.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        counts[t] = rows.length;
        files[`data/${t}.json`] = enc.encode(JSON.stringify(rows, null, 2));
        files[`data/${t}.csv`] = enc.encode(toCsvRows(rows));
      }

      const today = todayJakarta();
      const reports: { key: ReportKey; scope: "gabungan" | "umum"; from: string }[] = [
        { key: "buku-kas", scope: "gabungan", from: "2000-01-01" },
        { key: "neraca-saldo", scope: "gabungan", from: "2000-01-01" },
        { key: "saldo-rekening", scope: "gabungan", from: "2000-01-01" },
        { key: "saldo-dana", scope: "gabungan", from: "2000-01-01" },
        { key: "akhir-kepengurusan", scope: "gabungan", from: term?.start_date ?? "2000-01-01" },
      ];
      for (const r of reports) {
        setProgress(`Menyusun laporan ${r.key}...`);
        const rep = await buildReport(r.key, {
          from: r.from, to: today, periodLabel: "",
          scope: { kind: "gabungan", fundId: null, label: "Gabungan organisasi" },
        }, { supabase, org, master, term });
        files[`laporan/${rep.fileName}.pdf`] = new Uint8Array(await toPdf(rep));
        files[`laporan/${rep.fileName}.xlsx`] = new Uint8Array(await toXlsx(rep));
        files[`laporan/${rep.fileName}.csv`] = enc.encode(toCsv(rep));
      }

      let fileBytes = 0;
      let failed = 0;
      if (withFiles) {
        const { data: atts } = await supabase.from("attachments").select("id, storage_path, file_name, status, kind, entry:journal_entries(ref_no)").eq("organization_id", org.id);
        const list = (atts ?? []) as unknown as { id: string; storage_path: string; file_name: string; status: string; kind: string; entry: { ref_no: string | null } | null }[];
        for (let i = 0; i < list.length; i += 50) {
          const chunk = list.slice(i, i + 50);
          const { data: urls } = await supabase.storage.from("bukti").createSignedUrls(chunk.map((a) => a.storage_path), 300);
          for (const [j, a] of chunk.entries()) {
            setProgress(`Mengunduh lampiran ${i + j + 1} dari ${list.length}...`);
            const u = urls?.find((x) => x.path === a.storage_path)?.signedUrl;
            if (!u) { failed += 1; continue; }
            const res = await fetch(u);
            if (!res.ok) { failed += 1; continue; }
            const buf = new Uint8Array(await res.arrayBuffer());
            fileBytes += buf.byteLength;
            const folder = a.kind === "dokumen" ? "dokumen" : a.entry?.ref_no ?? "draft";
            files[`lampiran/${a.status === "aktif" ? "" : "riwayat/"}${folder}/${a.id.slice(0, 8)}-${a.file_name}`] = buf;
          }
        }
      }

      const manifest = [
        `PAKET SERAH TERIMA KAS IPNU`,
        `Organisasi : ${org.name}`,
        `Periode    : ${term?.name ?? "-"}`,
        `Dibuat     : ${formatDateTime(new Date().toISOString())} oleh ${userName}`,
        ``,
        `ISI`,
        `data/       Seluruh tabel dalam JSON (lengkap) dan CSV (pemisah titik koma).`,
        `laporan/    Buku Kas Umum, Neraca Saldo, Saldo per Rekening, Saldo per Dana, Laporan Akhir Kepengurusan (PDF, XLSX, CSV).`,
        withFiles ? `lampiran/   Berkas bukti per nomor transaksi; riwayat/ berisi berkas yang diganti atau dihapus. ${formatBytes(fileBytes)}${failed ? `, ${failed} berkas gagal diunduh` : ""}.` : `lampiran/   Tidak disertakan.`,
        ``,
        `JUMLAH BARIS`,
        ...Object.entries(counts).map(([k, v]) => `${k.padEnd(22)} ${v}`),
        ``,
        `PENTING`,
        `Paket ini untuk serah terima dan arsip. Paket ini BUKAN pengganti backup database.`,
        `Untuk pemulihan penuh gunakan backup database Supabase dan salinan bucket Storage`,
        `sesuai dokumen "05 Backup Pemulihan dan Serah Terima.md" di source code aplikasi.`,
      ].join("\r\n");
      files["BACA SAYA.txt"] = enc.encode(manifest);

      setProgress("Membuat berkas ZIP...");
      const { zipSync } = await import("fflate");
      const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: k.startsWith("lampiran/") ? 0 : 6 }]])) as Parameters<typeof zipSync>[0]);
      downloadBlob(zipped, `Paket Serah Terima Kas IPNU ${today}.zip`, "application/zip");
      toast.success("Paket serah terima diunduh", { description: failed ? `${failed} lampiran gagal diunduh; ulangi bila perlu.` : undefined });
    } catch (e) {
      toast.error("Paket gagal dibuat.", { description: e instanceof Error ? e.message : "Coba lagi." });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">ZIP berisi semua data, laporan, dan bukti untuk bendahara berikutnya.</p>
      <div className="flex items-start gap-2.5">
        <Checkbox id="hp-files" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} className="mt-0.5" />
        <Label htmlFor="hp-files" className="font-normal">Sertakan lampiran bukti (ukuran berkas dapat besar)</Label>
      </div>
      <Button variant="primary" loading={busy} onClick={build}><Archive aria-hidden />Unduh Paket Serah Terima</Button>
      {progress && <p role="status" className="text-[13px] text-muted">{progress}</p>}
      <Alert tone="info">Paket ini bukan backup database. Backup dan pemulihan penuh dilakukan dari Supabase sesuai panduan.</Alert>
    </div>
  );
}
