"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, X } from "@/components/ui/icons";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PERIOD_OPTIONS } from "@/lib/scope";
import { useUrlParams } from "./hooks";

/** Select yang nilainya disimpan di URL, sehingga filter bertahan saat kembali dari halaman detail. */
export function UrlSelect({
  name, value, options, label, className, defaultValue = "",
}: {
  name: string;
  value: string;
  options: { value: string; label: string; group?: string }[];
  label: string;
  className?: string;
  defaultValue?: string;
}) {
  const { set, isPending } = useUrlParams();
  const groups = Array.from(new Set(options.map((o) => o.group ?? "")));
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(e) => set({ [name]: e.target.value === defaultValue ? null : e.target.value })}
      className={cn("h-9 w-auto min-w-36 max-w-full", isPending && "opacity-70", className)}
    >
      {groups.map((g) =>
        g ? (
          <optgroup key={g} label={g}>
            {options.filter((o) => (o.group ?? "") === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        ) : (
          options.filter((o) => !o.group).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
        ),
      )}
    </Select>
  );
}

export function ScopeSelect({ value, programs, className }: { value: string; programs: { id: string; name: string; status: string }[]; className?: string }) {
  return (
    <UrlSelect
      name="lingkup"
      label="Lingkup dana"
      value={value}
      defaultValue="umum"
      className={className}
      options={[
        { value: "umum", label: "Kas Umum" },
        ...programs.map((p) => ({ value: p.id, label: p.name, group: p.status === "diarsipkan" ? "Program diarsipkan" : "Program" })),
        { value: "gabungan", label: "Gabungan organisasi" },
      ]}
    />
  );
}

export function PeriodSelect({ value, from, to, defaultKey = "bulan-ini" }: { value: string; from: string; to: string; defaultKey?: string }) {
  const { set } = useUrlParams();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <UrlSelect name="periode" label="Periode" value={value} defaultValue={defaultKey} options={PERIOD_OPTIONS.map((p) => ({ value: p.key, label: p.label }))} />
      {value === "khusus" && (
        <div className="flex items-center gap-1.5">
          <Input type="date" aria-label="Dari tanggal" className="h-9 w-auto" defaultValue={from} max={to} onChange={(e) => e.target.value && set({ dari: e.target.value, periode: "khusus" })} />
          <span className="text-sm text-muted">sampai</span>
          <Input type="date" aria-label="Sampai tanggal" className="h-9 w-auto" defaultValue={to} min={from} onChange={(e) => e.target.value && set({ sampai: e.target.value, periode: "khusus" })} />
        </div>
      )}
    </div>
  );
}

export function UrlSearch({ value, placeholder, name = "cari" }: { value: string; placeholder: string; name?: string }) {
  const { set } = useUrlParams();
  const [text, setText] = React.useState(value);
  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value);
  }
  React.useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => set({ [name]: text.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [text, value, name, set]);
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
      <Input type="search" aria-label={placeholder} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} className="h-9 pr-8 pl-9" />
      {text && (
        <button type="button" onClick={() => setText("")} aria-label="Hapus pencarian" className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:bg-subtle">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const { set, isPending } = useUrlParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Halaman" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm sm:px-5">
      <p className="text-muted">
        <span className="tnum">{from}</span> sampai <span className="tnum">{to}</span> dari <span className="tnum">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={page <= 1 || isPending} onClick={() => set({ hal: page - 1 <= 1 ? null : String(page - 1) }, { resetPage: false })}>
          <ChevronLeft aria-hidden />Sebelumnya
        </Button>
        <span className="tnum text-muted">{page} / {pages}</span>
        <Button size="sm" disabled={page >= pages || isPending} onClick={() => set({ hal: String(page + 1) }, { resetPage: false })}>
          Berikutnya<ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}

/** Tab berbasis tautan, sehingga tab aktif tersimpan di URL. */
export function LinkTabs({ tabs, active, className }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string; className?: string }) {
  return (
    <div className={cn("-mx-4 mb-5 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0", className)}>
      <div role="tablist" className="flex gap-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={t.key === active}
            scroll={false}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
              t.key === active ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
            {typeof t.count === "number" && <span className="tnum rounded-full bg-subtle px-1.5 text-[11px] text-muted">{t.count}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Filter tambahan: di ponsel disembunyikan di balik tombol agar daftar tetap mudah dibaca. */
export function MoreFilters({ active, children }: { active: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" className="md:hidden" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Sembunyikan filter" : `Filter lainnya${active ? ` (${active} aktif)` : ""}`}
      </Button>
      <div className={cn("w-full flex-wrap items-center gap-2 md:flex md:w-auto", open ? "flex" : "hidden")}>{children}</div>
    </>
  );
}
