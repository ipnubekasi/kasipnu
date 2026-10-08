import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";

/** Nominal rupiah: angka tabular. Pengeluaran berwarna merah dan tetap diberi tanda minus bila negatif. */
export function Money({
  value, tone, className, dashZero = false, sign = false,
}: {
  value: number | null | undefined;
  tone?: "in" | "out" | "muted" | "auto";
  className?: string;
  dashZero?: boolean;
  sign?: boolean;
}) {
  const v = Number(value ?? 0);
  if (dashZero && v === 0) return <span className={cn("tnum text-faint", className)}>-</span>;
  const color = tone === "in" ? "text-accent" : tone === "out" ? "text-danger" : tone === "muted" ? "text-muted" : tone === "auto" && v < 0 ? "text-danger" : "";
  return <span className={cn("tnum whitespace-nowrap", color, className)}>{sign && v > 0 ? "+" : ""}{formatRupiah(v)}</span>;
}
