import { addDays, addMonths, endOfMonth, formatDate, formatMonth, isValidDate, startOfMonth, todayJakarta } from "./format";
import type { Master, Term } from "./types";

/** Lingkup dana: Kas Umum (bawaan), program tertentu, atau gabungan organisasi. */
export type Scope = {
  key: string;
  fundId: string | null;
  label: string;
  kind: "umum" | "program" | "gabungan";
  programId?: string;
};

export function resolveScope(value: string | undefined, master: Master): Scope {
  if (value === "gabungan") return { key: "gabungan", fundId: null, label: "Gabungan organisasi", kind: "gabungan" };
  if (value && value !== "umum") {
    const p = master.programs.find((x) => x.id === value);
    if (p) return { key: p.id, fundId: p.fund_id, label: p.name, kind: "program", programId: p.id };
  }
  return { key: "umum", fundId: master.generalFund.id, label: "Kas Umum", kind: "umum" };
}

export const PERIOD_OPTIONS = [
  { key: "bulan-ini", label: "Bulan ini" },
  { key: "bulan-lalu", label: "Bulan lalu" },
  { key: "3-bulan", label: "3 bulan terakhir" },
  { key: "tahun-ini", label: "Tahun ini" },
  { key: "kepengurusan", label: "Periode kepengurusan" },
  { key: "semua", label: "Semua waktu" },
  { key: "khusus", label: "Rentang khusus" },
] as const;

export type Period = { key: string; from: string; to: string; label: string };

export function resolvePeriod(
  sp: { periode?: string; dari?: string; sampai?: string },
  term: Term | null,
  fallback: string = "bulan-ini",
): Period {
  const today = todayJakarta();
  const key = sp.periode ?? (sp.dari || sp.sampai ? "khusus" : fallback);
  switch (key) {
    case "bulan-lalu": {
      const d = addMonths(startOfMonth(today), -1);
      return { key, from: d, to: endOfMonth(d), label: formatMonth(d) };
    }
    case "3-bulan": {
      const from = addMonths(startOfMonth(today), -2);
      return { key, from, to: today, label: `${formatDate(from)} sampai ${formatDate(today)}` };
    }
    case "tahun-ini":
      return { key, from: `${today.slice(0, 4)}-01-01`, to: today, label: `Tahun ${today.slice(0, 4)}` };
    case "kepengurusan": {
      const from = term?.start_date ?? `${today.slice(0, 4)}-01-01`;
      const to = term?.end_date && term.end_date < today ? term.end_date : today;
      return { key, from, to, label: term?.name ?? "Periode kepengurusan" };
    }
    case "semua":
      return { key, from: "2000-01-01", to: today, label: "Semua waktu" };
    case "khusus": {
      const from = isValidDate(sp.dari) ? sp.dari : startOfMonth(today);
      const to = isValidDate(sp.sampai) ? sp.sampai : today;
      const [a, b] = from <= to ? [from, to] : [to, from];
      return { key, from: a, to: b, label: `${formatDate(a)} sampai ${formatDate(b)}` };
    }
    default:
      return { key: "bulan-ini", from: startOfMonth(today), to: today, label: formatMonth(today) };
  }
}

export { addDays };
