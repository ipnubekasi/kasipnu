"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/input";

export const SETTINGS_NAV = [
  { group: "Organisasi", items: [
    { href: "/pengaturan/organisasi", label: "Profil dan logo" },
    { href: "/pengaturan/kepengurusan", label: "Periode kepengurusan" },
    { href: "/pengaturan/anggota", label: "Anggota dan hak akses" },
  ] },
  { group: "Pembukuan", items: [
    { href: "/pengaturan/rekening", label: "Rekening dan kas" },
    { href: "/pengaturan/saldo-awal", label: "Saldo awal" },
    { href: "/pengaturan/kategori", label: "Kategori dan pemetaan akun" },
    { href: "/pengaturan/akun", label: "Daftar akun" },
    { href: "/pengaturan/penomoran", label: "Nomor referensi" },
    { href: "/pengaturan/tutup-periode", label: "Tutup periode" },
  ] },
  { group: "Pengawasan", items: [
    { href: "/pengaturan/kesehatan", label: "Kesehatan dan notifikasi" },
    { href: "/pengaturan/audit", label: "Audit log" },
    { href: "/pengaturan/backup", label: "Backup dan serah terima" },
    { href: "/pengaturan/integrasi", label: "Integrasi Bank & QRIS", badge: "Coming Soon" },
  ] },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <>
      <div className="mb-4 lg:hidden">
        <Select aria-label="Bagian pengaturan" value={pathname} onChange={(e) => router.push(e.target.value)}>
          {SETTINGS_NAV.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((i) => <option key={i.href} value={i.href}>{i.label}</option>)}
            </optgroup>
          ))}
        </Select>
      </div>
      <nav aria-label="Bagian pengaturan" className="hidden w-56 shrink-0 space-y-4 lg:block">
        {SETTINGS_NAV.map((g) => (
          <div key={g.group}>
            <p className="mb-1 px-3 text-[12px] font-semibold tracking-wide text-faint uppercase">{g.group}</p>
            <ul className="space-y-0.5">
              {g.items.map((i) => {
                const active = pathname === i.href;
                return (
                  <li key={i.href}>
                    <Link href={i.href} aria-current={active ? "page" : undefined} className={cn("flex items-center justify-between gap-2 rounded-control px-3 py-1.5 text-sm", active ? "bg-accent-soft font-medium text-primary" : "text-muted hover:bg-subtle hover:text-ink")}>
                      {i.label}
                      {"badge" in i && <span className="rounded-full border border-line bg-subtle px-1.5 text-[10px] whitespace-nowrap text-muted">{i.badge}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
