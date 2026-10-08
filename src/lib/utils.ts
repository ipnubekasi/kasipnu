import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uuid(): string {
  return crypto.randomUUID();
}

/** Mengambil satu nilai dari searchParams Next.js. */
export function param(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Menyusun query string dari objek, melewati nilai kosong. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function sum<T>(rows: T[], pick: (r: T) => number): number {
  return rows.reduce((t, r) => t + (pick(r) || 0), 0);
}

export function groupBy<T, K extends string>(rows: T[], key: (r: T) => K): Record<K, T[]> {
  return rows.reduce(
    (acc, r) => {
      (acc[key(r)] ||= []).push(r);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}
