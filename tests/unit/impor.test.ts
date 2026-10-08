import { describe, expect, it } from "vitest";
import { autoMap, parseAmount, parseDate, parseKind } from "@/lib/import/parse";
import { parseRupiah } from "@/lib/format";

describe("Pembacaan berkas impor", () => {
  it("tanggal dari berbagai format", () => {
    expect(parseDate("05/01/2026")).toBe("2026-01-05");
    expect(parseDate("5-1-26")).toBe("2026-01-05");
    expect(parseDate("2026-01-05")).toBe("2026-01-05");
    expect(parseDate("8 Okt 2026")).toBe("2026-10-08");
    expect(parseDate("8 Oktober 2026")).toBe("2026-10-08");
    expect(parseDate(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-01-05");
    expect(parseDate(46027)).toBe("2026-01-05");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("bukan tanggal")).toBeNull();
  });

  it("nominal rupiah dari berbagai format", () => {
    expect(parseAmount("1.500.000")).toBe(1500000);
    expect(parseAmount("Rp 1.500.000,00")).toBe(1500000);
    expect(parseAmount("1,500,000.00")).toBe(1500000);
    expect(parseAmount("(250.000)")).toBe(-250000);
    expect(parseAmount("-75000")).toBe(-75000);
    expect(parseAmount(125000)).toBe(125000);
    expect(parseAmount("")).toBeNull();
    expect(parseRupiah("Rp 2.000.000")).toBe(2000000);
  });

  it("jenis transaksi dan pemetaan kolom otomatis", () => {
    expect(parseKind("Pemasukan")).toBe("pemasukan");
    expect(parseKind("KK")).toBe("pengeluaran");
    expect(parseKind("transfer")).toBe("transfer");
    expect(parseKind("lain")).toBeNull();
    const m = autoMap(["Tgl", "Keterangan", "Debit", "Kredit", "Saldo"]);
    expect(m.tanggal).toBe(0);
    expect(m.uraian).toBe(1);
    expect(m.keluar).toBe(2);
    expect(m.masuk).toBe(3);
  });
});
