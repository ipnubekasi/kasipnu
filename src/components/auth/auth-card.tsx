import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Kartu kaca untuk halaman masuk dan daftar.
 * `tab` menampilkan pengalih Masuk / Daftar di bagian atas.
 */
export function AuthCard({ title, subtitle, tab, children }: { title: string; subtitle?: string; tab?: "masuk" | "daftar"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-white/70 bg-white/70 p-5 shadow-[0_24px_60px_-24px_rgb(14_58_40/0.35)] backdrop-blur-xl sm:p-6",
        "[&_input:not([type=checkbox])]:h-11 [&_input:not([type=checkbox])]:rounded-xl [&_input:not([type=checkbox])]:border-white [&_input:not([type=checkbox])]:bg-[#eef5f0]/80 [&_input:not([type=checkbox])]:shadow-[inset_0_0_0_1px_rgb(14_58_40/0.06)]",
        "[&_input:focus-visible]:bg-white",
      )}
    >
      {tab && (
        <div role="tablist" aria-label="Masuk atau daftar" className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-subtle p-1">
          {([["masuk", "Masuk", "/login"], ["daftar", "Daftar", "/daftar"]] as const).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              role="tab"
              aria-selected={tab === key}
              className={cn("flex h-9 items-center justify-center rounded-full text-sm font-medium transition-all", tab === key ? "bg-white text-primary shadow-soft" : "text-muted hover:text-ink")}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 mb-5 text-sm text-muted">{subtitle}</p>}
      {!subtitle && <div className="mb-5" />}
      {children}
    </div>
  );
}
