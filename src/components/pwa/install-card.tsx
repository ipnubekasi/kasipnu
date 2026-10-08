"use client";

import * as React from "react";
import { IoPhonePortraitOutline, IoShareOutline } from "react-icons/io5";
import { cn } from "@/lib/utils";
import { usePwa } from "./pwa-provider";

/** Ajakan memasang aplikasi ke layar utama. Tidak tampil bila sudah terpasang atau tidak didukung. */
export function InstallCard({ tone = "side", className }: { tone?: "side" | "light"; className?: string }) {
  const { canInstall, isIos, isStandalone, install } = usePwa();
  const [showHow, setShowHow] = React.useState(false);
  if (isStandalone || (!canInstall && !isIos)) return null;
  const dark = tone === "side";
  return (
    <div className={cn("rounded-xl p-4", dark ? "bg-white/[0.07] text-side-ink ring-1 ring-white/10" : "bg-accent-soft text-ink ring-1 ring-accent-line", className)}>
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-lg", dark ? "bg-white/10 text-white" : "bg-white text-primary shadow-soft")}>
          <IoPhonePortraitOutline className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 leading-tight">
          <p className={cn("text-[13px] font-semibold", dark ? "text-white" : "text-ink")}>Pasang di HP</p>
          <p className={cn("text-[12px]", dark ? "text-side-ink/80" : "text-muted")}>Buka seperti aplikasi, tanpa Play Store.</p>
        </div>
      </div>
      {canInstall ? (
        <button type="button" onClick={install} className={cn("mt-3 h-10 w-full rounded-lg text-[13px] font-semibold transition-transform active:scale-[0.98]", dark ? "bg-white text-side hover:bg-white/90" : "bg-primary text-white")}>
          Pasang aplikasi
        </button>
      ) : (
        <>
          <button type="button" onClick={() => setShowHow((v) => !v)} aria-expanded={showHow} className={cn("mt-3 h-10 w-full rounded-lg text-[13px] font-semibold transition-transform active:scale-[0.98]", dark ? "bg-white text-side" : "bg-primary text-white")}>
            Lihat caranya
          </button>
          {showHow && (
            <p className={cn("mt-3 flex flex-wrap items-center gap-1 text-[12px] leading-relaxed", dark ? "text-side-ink" : "text-muted")}>
              Di Safari, ketuk <IoShareOutline className="inline size-4" aria-label="Bagikan" />, lalu pilih <strong>Tambah ke Layar Utama</strong>.
            </p>
          )}
        </>
      )}
    </div>
  );
}
