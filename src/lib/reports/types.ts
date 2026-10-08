export type CellType = "text" | "money" | "date" | "number" | "percent";

export type Col = {
  key: string;
  label: string;
  type?: CellType;
  /** Lebar relatif untuk PDF dan XLSX. */
  width?: number;
};

export type Cell = string | number | boolean | null | undefined;
/**
 * Baris laporan. Kunci berawalan garis bawah adalah petunjuk tampilan:
 * _bold (judul kelompok atau subtotal), _indent (menjorok), _href (tautan detail, hanya di layar).
 */
export type Row = Record<string, Cell>;

export type Section = {
  title?: string;
  note?: string;
  columns: Col[];
  rows: Row[];
  totals?: Row;
  emptyText?: string;
};

export type SummaryItem = { label: string; value: number | string; type?: "money" | "text"; strong?: boolean };

export const REPORTS = [
  { key: "buku-kas", label: "Buku Kas Umum", group: "Kas", needs: "" },
  { key: "pemasukan-pengeluaran", label: "Laporan Pemasukan dan Pengeluaran", group: "Kas", needs: "" },
  { key: "arus-kas", label: "Laporan Arus Kas", group: "Kas", needs: "" },
  { key: "rekap-bulanan", label: "Rekap Bulanan", group: "Kas", needs: "" },
  { key: "saldo-rekening", label: "Saldo per Rekening", group: "Saldo", needs: "" },
  { key: "saldo-dana", label: "Saldo per Dana dan Program", group: "Saldo", needs: "" },
  { key: "jurnal-umum", label: "Jurnal Umum", group: "Buku besar", needs: "" },
  { key: "buku-besar", label: "Buku Besar", group: "Buku besar", needs: "" },
  { key: "neraca-saldo", label: "Neraca Saldo", group: "Buku besar", needs: "" },
  { key: "anggaran-realisasi", label: "Anggaran dan Realisasi Program", group: "Program", needs: "" },
  { key: "lpj-program", label: "LPJ Program", group: "Program", needs: "program" },
  { key: "akhir-kepengurusan", label: "Laporan Akhir Kepengurusan", group: "Kepengurusan", needs: "" },
] as const;

export type ReportKey = (typeof REPORTS)[number]["key"];

/**
 * Satu objek laporan dipakai untuk tampilan layar DAN semua ekspor (PDF, XLSX, CSV),
 * sehingga angka ekspor selalu sama dengan angka di layar pada filter yang sama.
 */
export type ReportData = {
  key: ReportKey;
  title: string;
  orgName: string;
  scopeLabel: string;
  periodLabel: string;
  from: string;
  to: string;
  generatedAt: string;
  summary: SummaryItem[];
  sections: Section[];
  notes: string[];
  signature: { city: string; date: string; signers: { role: string; name: string }[] } | null;
  fileName: string;
  landscape?: boolean;
};

export type ReportFilters = {
  from: string;
  to: string;
  periodLabel: string;
  scope: { kind: "umum" | "program" | "gabungan"; fundId: string | null; label: string; programId?: string };
  accountId?: string | null;
  categoryId?: string | null;
  ledgerAccountId?: string | null;
};
