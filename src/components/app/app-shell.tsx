"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Archive, Bell, BookOpenText, ChevronDown, FileBarChart, FlaskConical, FolderKanban, HeartPulse, LayoutDashboard, LogOut, MoreHorizontal, Plus, RefreshCw, Settings, UserRound, Wallet } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { NAV, ROLE_LABEL } from "@/lib/labels";
import type { Role } from "@/lib/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InstallCard } from "@/components/pwa/install-card";
import { usePwa } from "@/components/pwa/pwa-provider";
import { OrgLogo } from "./org-logo";

const ICONS = { LayoutDashboard, Wallet, FolderKanban, BookOpenText, FileBarChart, Archive, Settings } as const;

const EXTRA_TITLES: Record<string, string> = {
  "/kesehatan": "Kesehatan Keuangan",
  "/notifikasi": "Notifikasi",
};

type ShellProps = {
  orgName: string;
  orgShortName: string;
  logoUrl: string | null;
  termName: string | null;
  userName: string;
  userEmail: string;
  roles: Role[];
  unread: number;
  isDemo: boolean;
  canWrite: boolean;
  children: React.ReactNode;
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Satu butir navigasi sidebar: pil putih lembut saat aktif. */
function SideLink({ href, label, icon: Icon, active, badge, onNavigate }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; active: boolean; badge?: number; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-11 items-center gap-3 rounded-full px-4 text-[14px] transition-all duration-150",
        active ? "bg-[#f2fbf5] font-semibold text-side shadow-[0_8px_20px_-10px_rgb(0_0_0/0.5)]" : "text-side-ink hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon className={cn("size-[20px] shrink-0", active ? "text-accent" : "text-side-ink/80 group-hover:text-white")} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="tnum inline-flex min-w-[22px] items-center justify-center rounded-full bg-[#f6c48a] px-1.5 text-[11px] leading-[20px] font-semibold text-[#5a2e00]">{badge > 99 ? "99+" : badge}</span>
      ) : null}
    </Link>
  );
}

function NavList({ pathname, unread, onNavigate }: { pathname: string; unread: number; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navigasi utama" className="space-y-1">
      {NAV.map((item) => (
        <SideLink key={item.href} href={item.href} label={item.label} icon={ICONS[item.icon]} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
      ))}
      <div className="mx-3 my-3 border-t border-side-line" />
      <SideLink href="/kesehatan" label="Kesehatan Keuangan" icon={HeartPulse} active={isActive(pathname, "/kesehatan")} onNavigate={onNavigate} />
      <SideLink href="/notifikasi" label="Notifikasi" icon={Bell} active={isActive(pathname, "/notifikasi")} badge={unread} onNavigate={onNavigate} />
    </nav>
  );
}

function Brand({ orgShortName, logoUrl, orgName }: { orgShortName: string; logoUrl: string | null; orgName: string }) {
  return (
    <Link href="/ringkasan" className="flex items-center gap-3 rounded-2xl px-1 py-1">
      <OrgLogo src={logoUrl} name={orgName} size={42} className="ring-2 ring-white/20" />
      <span className="min-w-0 leading-tight">
        <span className="block text-[17px] font-semibold tracking-tight text-white">Kas IPNU</span>
        <span className="block truncate text-[12px] text-side-ink/80">{orgShortName}</span>
      </span>
    </Link>
  );
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#1a8556] to-side text-[13px] font-semibold text-white", className)} aria-hidden>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AppShell(props: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { updateReady, applyUpdate } = usePwa();
  // Lembar "Lainnya" otomatis tertutup bila halaman berpindah.
  const [sheetFor, setSheetFor] = React.useState<string | null>(null);
  const sheetOpen = sheetFor === pathname;
  const setSheetOpen = (v: boolean) => setSheetFor(v ? pathname : null);
  const section = NAV.find((n) => isActive(pathname, n.href))?.label ?? Object.entries(EXTRA_TITLES).find(([k]) => isActive(pathname, k))?.[1] ?? "Kas IPNU";

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const hideFab = /^\/kas\/(baru|impor)|\/ubah$|^\/jurnal\/penyesuaian/.test(pathname);
  const periodLine = props.termName ?? "Periode kepengurusan belum diatur";

  return (
    <div className="min-h-dvh">
      <a href="#konten" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-white">
        Lompat ke konten
      </a>

      {/* Sidebar desktop: panel hijau mengambang */}
      <aside className="no-print fixed top-3 bottom-3 left-3 z-30 hidden w-[17rem] flex-col overflow-hidden rounded-[28px] bg-gradient-to-b from-side-2 to-side text-side-ink shadow-pop lg:flex">
        <div className="px-4 pt-5 pb-4">
          <Brand {...props} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <NavList pathname={pathname} unread={props.unread} />
        </div>
        <div className="space-y-3 p-3">
          <InstallCard tone="side" />
          <div className="rounded-2xl bg-white/[0.06] px-4 py-3 text-[12px] ring-1 ring-white/10">
            <p className="truncate font-medium text-white">{props.orgName}</p>
            <p className="truncate text-side-ink/80">{periodLine}</p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[18.5rem]">
        <header className="no-print safe-top sticky top-0 z-20 bg-canvas/75 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-2.5 px-4 sm:px-6">
            <Link href="/ringkasan" className="lg:hidden" aria-label="Ke Ringkasan">
              <OrgLogo src={props.logoUrl} name={props.orgName} size={36} />
            </Link>

            <p className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight text-ink sm:text-[19px]">{section}</p>

            {props.termName && (
              <span className="hidden items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[12px] text-muted shadow-soft md:inline-flex" title="Periode kepengurusan aktif">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                Periode aktif: <span className="font-medium text-ink">{props.termName}</span>
              </span>
            )}

            <Link
              href="/notifikasi"
              aria-label={props.unread > 0 ? `Notifikasi, ${props.unread} belum dibaca` : "Notifikasi"}
              className="relative inline-flex size-11 items-center justify-center rounded-full bg-surface text-ink shadow-soft transition-transform active:scale-95 lg:size-10"
            >
              <Bell className="size-5" aria-hidden />
              {props.unread > 0 && (
                <span className="tnum absolute -top-0.5 -right-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] leading-[18px] font-semibold text-white ring-2 ring-canvas">
                  {props.unread > 99 ? "99+" : props.unread}
                </span>
              )}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-11 items-center gap-2 rounded-full bg-surface pr-1.5 pl-1.5 text-sm shadow-soft transition-transform active:scale-95 sm:pr-3 lg:h-10" aria-label="Menu pengguna">
                <Avatar name={props.userName} />
                <span className="hidden max-w-36 truncate font-medium sm:block">{props.userName}</span>
                <ChevronDown className="hidden size-4 text-muted sm:block" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <span className="block text-sm font-medium text-ink">{props.userName}</span>
                  <span className="block truncate">{props.userEmail}</span>
                  <span className="mt-1 block">{props.roles.map((r) => ROLE_LABEL[r]).join(", ")}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/atur-password"><UserRound />Ganti password</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/pengaturan"><Settings />Pengaturan</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem tone="danger" onSelect={signOut}><LogOut />Keluar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {updateReady && (
          <div className="no-print mx-4 mb-2 flex items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-[13px] text-white shadow-soft sm:mx-6">
            <RefreshCw className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">Versi baru Kas IPNU sudah tersedia.</span>
            <button type="button" onClick={applyUpdate} className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-side">Muat ulang</button>
          </div>
        )}

        {props.isDemo && (
          <div className="no-print mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-2xl border border-warn-line bg-warn-soft px-4 py-2.5 text-[13px] text-ink sm:mx-6">
            <FlaskConical className="size-4 shrink-0 text-warn" aria-hidden />
            <span><strong className="font-medium">Mode demo.</strong> Semua angka di aplikasi ini adalah data contoh, bukan keuangan organisasi.</span>
            <Link href="/pengaturan/backup" className="font-medium text-warn underline underline-offset-2">Hapus data contoh</Link>
          </div>
        )}

        <main id="konten" className="mx-auto w-full max-w-[1400px] px-4 pt-3 pb-36 sm:px-6 lg:pt-4 lg:pb-12">
          {props.children}
        </main>
      </div>

      {/* Navigasi bawah ponsel: pulau melayang dengan tombol catat di tengah */}
      <nav
        aria-label="Navigasi cepat"
        className="no-print fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-30 grid grid-cols-5 items-center rounded-[28px] border border-white/70 bg-white/85 p-1.5 shadow-pop backdrop-blur-xl lg:hidden"
      >
        <MobileTab href="/ringkasan" label="Ringkasan" icon={LayoutDashboard} active={isActive(pathname, "/ringkasan")} />
        <MobileTab href="/kas" label="Kas" icon={Wallet} active={isActive(pathname, "/kas") && !pathname.startsWith("/kas/baru")} />
        <div className="flex items-center justify-center">
          {props.canWrite && !hideFab ? (
            <Link href="/kas/baru" aria-label="Catat transaksi" className="-mt-8 inline-flex size-[58px] items-center justify-center rounded-full bg-gradient-to-b from-[#1f9a63] to-primary text-white shadow-[0_14px_28px_-8px_rgb(21_114_74/0.75)] ring-[5px] ring-canvas transition-transform active:scale-95">
              <Plus className="size-7" aria-hidden />
            </Link>
          ) : (
            <span className="h-14" />
          )}
        </div>
        <MobileTab href="/program" label="Program" icon={FolderKanban} active={isActive(pathname, "/program")} />
        <MobileTab label="Lainnya" icon={MoreHorizontal} active={sheetOpen} onClick={() => setSheetOpen(true)} />
      </nav>

      {/* Lembar "Lainnya" untuk ponsel */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent side="bottom" aria-describedby={undefined} className="lg:hidden">
          <DialogTitle className="sr-only">Menu lainnya</DialogTitle>
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
            <div className="flex items-center gap-3 rounded-3xl bg-accent-soft p-3.5">
              <Avatar name={props.userName} className="size-11 text-[15px]" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[15px] font-semibold text-ink">{props.userName}</p>
                <p className="truncate text-[12px] text-muted">{props.roles.map((r) => ROLE_LABEL[r]).join(", ")}</p>
                <p className="truncate text-[12px] text-muted">{periodLine}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {[
                { href: "/jurnal", label: "Jurnal & Buku Besar", icon: BookOpenText },
                { href: "/laporan", label: "Laporan", icon: FileBarChart },
                { href: "/arsip", label: "Arsip Bukti", icon: Archive },
                { href: "/kesehatan", label: "Kesehatan Keuangan", icon: HeartPulse },
                { href: "/notifikasi", label: "Notifikasi", icon: Bell, badge: props.unread },
                { href: "/pengaturan", label: "Pengaturan", icon: Settings },
              ].map(({ href, label, icon: Icon, badge }) => (
                <Link key={href} href={href} onClick={() => setSheetOpen(false)} aria-current={isActive(pathname, href) ? "page" : undefined}
                  className={cn("relative flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-3xl border px-2 py-3 text-center text-[12px] leading-tight transition-transform active:scale-95", isActive(pathname, href) ? "border-accent-line bg-accent-soft font-semibold text-primary" : "border-line bg-surface text-ink")}>
                  <Icon className="size-6 text-accent" aria-hidden />
                  {label}
                  {badge ? <span className="tnum absolute top-2 right-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] leading-[18px] font-semibold text-white">{badge > 99 ? "99+" : badge}</span> : null}
                </Link>
              ))}
            </div>

            <InstallCard tone="light" className="mt-4" />

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Link href="/atur-password" onClick={() => setSheetOpen(false)} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line-strong bg-surface text-sm font-medium text-ink active:scale-[0.98]">
                <UserRound className="size-5 text-muted" aria-hidden />Ganti password
              </Link>
              <button type="button" onClick={signOut} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-danger-line bg-danger-soft text-sm font-medium text-danger active:scale-[0.98]">
                <LogOut className="size-5" aria-hidden />Keluar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MobileTab({ href, label, icon: Icon, active, onClick }: { href?: string; label: string; icon: React.ComponentType<{ className?: string }>; active: boolean; onClick?: () => void }) {
  const cls = cn("flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[22px] text-[11px] transition-colors active:scale-95", active ? "bg-accent-soft font-semibold text-primary" : "text-muted");
  const inner = (
    <>
      <Icon className={cn("size-[22px]", active && "text-accent")} aria-hidden />
      {label}
    </>
  );
  return href ? (
    <Link href={href} aria-current={active ? "page" : undefined} className={cls}>{inner}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{inner}</button>
  );
}
