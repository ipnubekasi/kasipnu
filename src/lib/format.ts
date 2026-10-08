/** Format tampilan: Rupiah, tanggal Indonesia, zona waktu Asia/Jakarta. */

export const TIME_ZONE = "Asia/Jakarta";

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export function formatNumber(n: number | null | undefined): string {
  return nf.format(Math.round(Number(n ?? 0)));
}

export function formatRupiah(n: number | null | undefined): string {
  const v = Math.round(Number(n ?? 0));
  return `${v < 0 ? "-" : ""}Rp${nf.format(Math.abs(v))}`;
}

export function formatDecimal(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined) return "";
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** Mengubah teks masukan pengguna menjadi rupiah utuh. "1.500.000", "Rp 1.500.000,00", "1500000". */
export function parseRupiah(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input) : null;
  let s = input.trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/rp\.?/i, "").replace(/[\s()]/g, "").replace(/^-/, "");
  if (!/^[\d.,]+$/.test(s)) return null;
  // Tanda desimal: koma di akhir (",00") atau titik diikuti 1-2 digit di akhir.
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{1,2}$/.test(s) && !/\.\d{3}/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(/[.,]/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(negative ? -n : n);
}

export function todayJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function asUtcDate(d: string): Date {
  return new Date(`${d.slice(0, 10)}T00:00:00Z`);
}

const dfShort = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dfLong = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dfMonth = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
const dfMonthShort = new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit", timeZone: "UTC" });
const dfNumeric = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const dfDateTime = new Intl.DateTimeFormat("id-ID", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE, hour12: false,
});

/** Tanggal akuntansi (YYYY-MM-DD) menjadi "8 Okt 2026". */
export function formatDate(d: string | null | undefined): string {
  return d ? dfShort.format(asUtcDate(d)) : "";
}
export function formatDateLong(d: string | null | undefined): string {
  return d ? dfLong.format(asUtcDate(d)) : "";
}
export function formatDateNumeric(d: string | null | undefined): string {
  return d ? dfNumeric.format(asUtcDate(d)) : "";
}
export function formatMonth(d: string | null | undefined): string {
  return d ? dfMonth.format(asUtcDate(d)) : "";
}
export function formatMonthShort(d: string | null | undefined): string {
  return d ? dfMonthShort.format(asUtcDate(d)) : "";
}
/** Stempel waktu audit ditampilkan dalam WIB. */
export function formatDateTime(ts: string | null | undefined): string {
  return ts ? `${dfDateTime.format(new Date(ts)).replace(".", ":")} WIB` : "";
}

export function addDays(d: string, n: number): string {
  const t = asUtcDate(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export function addMonths(d: string, n: number): string {
  const t = asUtcDate(d);
  const day = t.getUTCDate();
  t.setUTCDate(1);
  t.setUTCMonth(t.getUTCMonth() + n);
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
}
export function startOfMonth(d: string): string {
  return `${d.slice(0, 7)}-01`;
}
export function endOfMonth(d: string): string {
  const t = asUtcDate(startOfMonth(d));
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}
export function isValidDate(d: string | null | undefined): d is string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = asUtcDate(d);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString("id-ID", { maximumFractionDigits: 0 })} KB`;
  return `${(n / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
}

export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n)}%`;
}
