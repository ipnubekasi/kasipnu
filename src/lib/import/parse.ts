import { isValidDate } from "@/lib/format";

export type RawTable = { headers: string[]; rows: unknown[][]; sheetName?: string };

/** Membaca CSV atau XLSX menjadi tabel mentah. Baris kosong diabaikan. */
export async function readTable(file: File): Promise<RawTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    const Papa = (await import("papaparse")).default;
    const text = (await file.text()).replace(/^﻿/, "");
    const res = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimitersToGuess: [";", ",", "\t", "|"] });
    const all = res.data.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
    const headerIdx = findHeaderRow(all);
    return { headers: (all[headerIdx] ?? []).map((h) => String(h ?? "").trim()), rows: all.slice(headerIdx + 1) };
  }
  if (name.endsWith(".xlsx")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets.find((w) => w.state === "visible" && w.actualRowCount > 0 && !/petunjuk|daftar/i.test(w.name)) ?? wb.worksheets[0];
    if (!ws) return { headers: [], rows: [] };
    const all: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as unknown[]).slice(1).map((v) => {
        if (v && typeof v === "object") {
          const o = v as { result?: unknown; text?: string; richText?: { text: string }[] };
          if (o instanceof Date) return o;
          if ("result" in o) return o.result;
          if (o.richText) return o.richText.map((t) => t.text).join("");
          if (o.text) return o.text;
        }
        return v;
      });
      if (vals.some((c) => String(c ?? "").trim() !== "")) all.push(vals);
    });
    const headerIdx = findHeaderRow(all);
    return { headers: (all[headerIdx] ?? []).map((h) => String(h ?? "").trim()), rows: all.slice(headerIdx + 1), sheetName: ws.name };
  }
  throw new Error("Format berkas tidak didukung. Gunakan CSV atau XLSX. Berkas PDF hanya dapat disimpan sebagai arsip dokumen.");
}

/** Baris judul: baris pertama (dari 10 teratas) yang memuat kata tanggal dan nominal/masuk/keluar. */
function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const t = rows[i].map((c) => norm(String(c ?? ""))).join("|");
    if (/tanggal|tgl|date/.test(t) && /nominal|jumlah|masuk|keluar|debit|kredit|amount|mutasi/.test(t)) return i;
  }
  return 0;
}

export function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

export const TARGETS = [
  { key: "tanggal", label: "Tanggal", required: true, synonyms: ["tanggal", "tgl", "date", "tanggal transaksi", "tgl transaksi", "posting date"] },
  { key: "jenis", label: "Jenis", synonyms: ["jenis", "tipe", "type", "jenis transaksi"] },
  { key: "nominal", label: "Nominal", synonyms: ["nominal", "jumlah", "amount", "nilai", "jumlah rp", "nominal rp"] },
  { key: "masuk", label: "Kolom uang masuk", synonyms: ["masuk", "pemasukan", "penerimaan", "kredit", "credit", "cr", "uang masuk"] },
  { key: "keluar", label: "Kolom uang keluar", synonyms: ["keluar", "pengeluaran", "pembayaran", "debit", "debet", "db", "uang keluar"] },
  { key: "uraian", label: "Uraian", required: true, synonyms: ["uraian", "keterangan", "deskripsi", "description", "keterangan transaksi", "berita"] },
  { key: "kategori", label: "Kategori", synonyms: ["kategori", "category", "akun", "pos"] },
  { key: "rekening", label: "Rekening", synonyms: ["rekening", "kas", "sumber", "rekening asal", "akun kas"] },
  { key: "dana", label: "Dana/program", synonyms: ["dana", "program", "dana program", "kegiatan", "dana asal"] },
  { key: "rekening_tujuan", label: "Rekening tujuan (transfer)", synonyms: ["rekening tujuan", "ke rekening", "tujuan rekening"] },
  { key: "dana_tujuan", label: "Dana tujuan (transfer)", synonyms: ["dana tujuan", "ke dana", "program tujuan"] },
  { key: "pihak", label: "Pemberi/penerima", synonyms: ["pihak", "pemberi", "penerima", "vendor", "nama", "dari ke"] },
  { key: "catatan", label: "Catatan", synonyms: ["catatan", "notes", "memo"] },
] as const;

export type TargetKey = (typeof TARGETS)[number]["key"];
export type Mapping = Partial<Record<TargetKey, number>>;

export function autoMap(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<number>();
  for (const t of TARGETS) {
    const idx = headers.findIndex((h, i) => !used.has(i) && (t.synonyms as readonly string[]).includes(norm(h)));
    if (idx >= 0) {
      m[t.key] = idx;
      used.add(idx);
    }
  }
  return m;
}

const MONTHS: Record<string, number> = { jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, nov: 11, november: 11, des: 12, desember: 12, dec: 12 };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Tanggal dari sel: Date, nomor seri Excel, dd/mm/yyyy, yyyy-mm-dd, atau "8 Okt 2026". */
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // ExcelJS membaca tanggal sebagai UTC tengah malam.
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) {
    const d = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    return isValidDate(d) ? d : null;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = `${y}-${pad(+m[2])}-${pad(+m[1])}`;
    return isValidDate(d) ? d : null;
  }
  m = /^(\d{1,2})\s+([a-zA-Z]+)\.?\s+(\d{2,4})$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = `${y}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}`;
    return isValidDate(d) ? d : null;
  }
  return null;
}

export function parseKind(v: unknown): "pemasukan" | "pengeluaran" | "transfer" | null {
  const s = norm(String(v ?? ""));
  if (!s) return null;
  if (/^(pemasukan|masuk|penerimaan|km|terima|income|in)$/.test(s)) return "pemasukan";
  if (/^(pengeluaran|keluar|pembayaran|kk|bayar|expense|out|belanja)$/.test(s)) return "pengeluaran";
  if (/^(transfer|tr|pindah|pemindahan|mutasi internal|alokasi)$/.test(s)) return "transfer";
  return null;
}

export function parseAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v).trim();
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /\s?(db|dr)$/i.test(s);
  s = s.replace(/rp\.?|idr|\s|\(|\)|-|db$|dr$|cr$/gi, "");
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{1,2}$/.test(s) && !/\.\d{3}($|\.)/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(/[.,]/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export async function sha256(data: ArrayBuffer | string): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
