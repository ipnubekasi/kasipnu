import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { toCsv, toPdf, toXlsx } from "@/lib/reports/export";
import type { ReportData } from "@/lib/reports/types";

const report: ReportData = {
  key: "buku-kas",
  title: "Buku Kas Umum",
  orgName: "PC IPNU Kabupaten Bekasi",
  scopeLabel: "Kas Umum",
  periodLabel: "1 Okt 2026 sampai 8 Okt 2026",
  from: "2026-10-01",
  to: "2026-10-08",
  generatedAt: "2026-10-08T03:00:00.000Z",
  summary: [
    { label: "Saldo awal", value: 1_000_000, type: "money" },
    { label: "Pemasukan", value: 500_000, type: "money" },
    { label: "Pengeluaran", value: 200_000, type: "money" },
    { label: "Saldo akhir", value: 1_300_000, type: "money", strong: true },
  ],
  sections: [{
    columns: [
      { key: "date", label: "Tanggal", type: "date" }, { key: "ref", label: "Nomor" }, { key: "desc", label: "Uraian" },
      { key: "cin", label: "Masuk", type: "money" }, { key: "cout", label: "Keluar", type: "money" }, { key: "bal", label: "Saldo", type: "money" },
    ],
    rows: [
      { date: null, ref: "", desc: "Saldo sebelum periode", cin: null, cout: null, bal: 1_000_000, _bold: true },
      { date: "2026-10-03", ref: "KM-2026-0001", desc: "Iuran PAC; Tambun", cin: 500_000, cout: 0, bal: 1_500_000, _href: "/kas/x" },
      { date: "2026-10-05", ref: "KK-2026-0001", desc: 'Beli ATK "kertas"', cin: 0, cout: 200_000, bal: 1_300_000 },
    ],
    totals: { date: null, ref: "", desc: "Jumlah mutasi", cin: 500_000, cout: 200_000, bal: 1_300_000 },
  }],
  notes: ["Draft tidak dihitung."],
  signature: { city: "Bekasi", date: "8 Oktober 2026", signers: [{ role: "Ketua", name: "Ketua Uji" }, { role: "Bendahara", name: "Bendahara Uji" }] },
  fileName: "Buku Kas Umum Kas Umum 2026-10-01 sd 2026-10-08",
  landscape: true,
};

describe("Ekspor laporan memakai angka yang sama dengan tampilan", () => {
  it("CSV: BOM, pemisah titik koma, angka polos, tanda kutip di-escape", () => {
    const csv = toCsv(report);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toContain("Saldo akhir;1300000");
    expect(lines).toContain("03/10/2026;KM-2026-0001;\"Iuran PAC; Tambun\";500000;0;1500000");
    expect(lines).toContain('05/10/2026;KK-2026-0001;"Beli ATK ""kertas""";0;200000;1300000');
    expect(lines).toContain(";;Jumlah mutasi;500000;200000;1300000");
  });

  it("XLSX: nominal tersimpan sebagai angka dan totalnya sama", async () => {
    const buf = await toXlsx(report);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Laporan")!;
    const values: unknown[][] = [];
    ws.eachRow((r) => values.push((r.values as unknown[]).slice(1)));
    const summary = values.find((v) => v[0] === "Saldo akhir")!;
    expect(summary[1]).toBe(1_300_000);
    const total = values.find((v) => v[2] === "Jumlah mutasi")!;
    expect(total.slice(3, 6)).toEqual([500_000, 200_000, 1_300_000]);
    const row = values.find((v) => v[1] === "KM-2026-0001")!;
    expect(row[0]).toBeInstanceOf(Date);
    expect((row[0] as Date).toISOString().slice(0, 10)).toBe("2026-10-03");
  });

  it("PDF: teks dapat dipilih, memuat identitas, total, nomor halaman, dan tanda tangan", async () => {
    const buf = Buffer.from(await toPdf(report));
    const text = buf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    for (const s of ["PC IPNU Kabupaten Bekasi", "Buku Kas Umum", "Periode: 1 Okt 2026 sampai 8 Okt 2026", "Rp1.300.000", "1.500.000", "KM-2026-0001", "Halaman 1 dari 1", "Bendahara Uji", "Bekasi, 8 Oktober 2026"]) {
      expect(text, s).toContain(s);
    }
    expect(text).not.toMatch(/\/Subtype\s*\/Image/);
  });
});
