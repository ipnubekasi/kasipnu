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
        "rounded-[32px] border border-white/80 bg-white/75 p-6 shadow-pop backdrop-blur-2xl sm:p-8",
        "[&_input:not([type=checkbox])]:h-12 [&_input:not([type=checkbox])]:rounded-2xl [&_input:not([type=checkbox])]:border-white [&_input:not([type=checkbox])]:bg-[#eef5f0]/80 [&_input:not([type=checkbox])]:shadow-[inset_0_0_0_1px_rgb(14_58_40/0.06)]",
        "[&_input:focus-visible]:bg-white",
      )}
    >
      {tab && (
        <div role="tablist" aria-label="Masuk atau daftar" className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-subtle p-1">
          {([["masuk", "Masuk", "/login"], ["daftar", "Daftar", "/daftar"]] as const).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              role="tab"
              aria-selected={tab === key}
              className={cn("flex h-10 items-center justify-center rounded-full text-sm font-medium transition-all", tab === key ? "bg-white text-primary shadow-soft" : "text-muted hover:text-ink")}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 mb-6 text-sm text-muted">{subtitle}</p>}
      {!subtitle && <div className="mb-6" />}
      {children}
    </div>
  );
}
