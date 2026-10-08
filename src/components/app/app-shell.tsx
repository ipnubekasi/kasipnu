"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Archive, Bell, BookOpenText, ChevronDown, FileBarChart, FlaskConical, FolderKanban, HeartPulse, LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus, Settings, UserRound, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { NAV, ROLE_LABEL } from "@/lib/labels";
import type { Role } from "@/lib/types";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navigasi utama" className="space-y-0.5">
      {NAV.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors",
              active ? "bg-accent-soft font-medium text-primary" : "text-muted hover:bg-subtle hover:text-ink",
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
      <div className="my-2 border-t border-line" />
      <Link
        href="/kesehatan"
        onClick={onNavigate}
        aria-current={isActive(pathname, "/kesehatan") ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors",
          isActive(pathname, "/kesehatan") ? "bg-accent-soft font-medium text-primary" : "text-muted hover:bg-subtle hover:text-ink",
        )}
      >
        <HeartPulse className="size-[18px] shrink-0" aria-hidden />
        Kesehatan Keuangan
      </Link>
    </nav>
  );
}

function Brand({ orgShortName, logoUrl, orgName }: { orgShortName: string; logoUrl: string | null; orgName: string }) {
  return (
    <Link href="/ringkasan" className="flex items-center gap-2.5 rounded-control px-1 py-1">
      <OrgLogo src={logoUrl} name={orgName} size={34} />
      <span className="min-w-0 leading-tight">
        <span className="block text-[15px] font-semibold text-ink">Kas IPNU</span>
        <span className="block truncate text-[12px] text-muted">{orgShortName}</span>
      </span>
    </Link>
  );
}

export function AppShell(props: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const section = NAV.find((n) => isActive(pathname, n.href))?.label ?? Object.entries(EXTRA_TITLES).find(([k]) => isActive(pathname, k))?.[1] ?? "Kas IPNU";

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const hideFab = /^\/kas\/(baru|impor)|\/ubah$|^\/jurnal\/penyesuaian/.test(pathname);

  return (
    <div className="min-h-dvh">
      <a href="#konten" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-white">
        Lompat ke konten
      </a>

      {/* Sidebar desktop: 240 px */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-line px-3">
          <Brand {...props} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList pathname={pathname} />
        </div>
        <div className="border-t border-line p-3 text-[12px] text-muted">
          <p className="truncate font-medium text-ink">{props.orgName}</p>
          <p className="truncate">{props.termName ?? "Periode kepengurusan belum diatur"}</p>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur-sm sm:px-5">
          <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogTrigger className="inline-flex size-10 items-center justify-center rounded-control text-ink hover:bg-subtle lg:hidden" aria-label="Buka menu">
              <Menu className="size-5" />
            </DialogTrigger>
            <DialogContent side="left" aria-describedby={undefined}>
              <DialogTitle className="sr-only">Menu</DialogTitle>
              <div className="flex h-14 items-center border-b border-line px-3 pr-12">
                <Brand {...props} />
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <NavList pathname={pathname} onNavigate={() => setMenuOpen(false)} />
              </div>
              <div className="border-t border-line p-3 text-[12px] text-muted">
                <p className="truncate font-medium text-ink">{props.orgName}</p>
                <p className="truncate">{props.termName ?? "Periode kepengurusan belum diatur"}</p>
              </div>
            </DialogContent>
          </Dialog>

          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{section}</p>

          {props.termName && (
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-subtle px-2.5 py-1 text-[12px] text-muted md:inline-flex" title="Periode kepengurusan aktif">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              Periode aktif: <span className="font-medium text-ink">{props.termName}</span>
            </span>
          )}

          <Link
            href="/notifikasi"
            aria-label={props.unread > 0 ? `Notifikasi, ${props.unread} belum dibaca` : "Notifikasi"}
            className="relative inline-flex size-10 items-center justify-center rounded-control text-ink hover:bg-subtle"
          >
            <Bell className="size-5" aria-hidden />
            {props.unread > 0 && (
              <span className="tnum absolute top-1 right-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] leading-[18px] font-semibold text-white">
                {props.unread > 99 ? "99+" : props.unread}
              </span>
            )}
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-10 items-center gap-2 rounded-control px-2 text-sm hover:bg-subtle" aria-label="Menu pengguna">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-white" aria-hidden>
                {props.userName.trim().slice(0, 1).toUpperCase()}
              </span>
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
        </header>

        {props.isDemo && (
          <div className="no-print flex flex-wrap items-center gap-2 border-b border-warn-line bg-warn-soft px-4 py-2 text-[13px] text-ink sm:px-5">
            <FlaskConical className="size-4 shrink-0 text-warn" aria-hidden />
            <span><strong className="font-medium">Mode demo.</strong> Semua angka di aplikasi ini adalah data contoh, bukan keuangan organisasi.</span>
            <Link href="/pengaturan/backup" className="font-medium text-warn underline underline-offset-2">Hapus data contoh</Link>
          </div>
        )}

        <main id="konten" className="mx-auto w-full max-w-[1400px] px-4 pt-5 pb-28 sm:px-5 lg:pb-12">
          {props.children}
        </main>
      </div>

      {/* Navigasi bawah untuk ponsel */}
      <nav aria-label="Navigasi cepat" className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {[
          { href: "/ringkasan", label: "Ringkasan", icon: LayoutDashboard },
          { href: "/kas", label: "Kas", icon: Wallet },
        ].map((i) => (
          <MobileTab key={i.href} {...i} active={isActive(pathname, i.href) && !pathname.startsWith("/kas/baru")} />
        ))}
        <div className="flex items-start justify-center">
          {props.canWrite && !hideFab ? (
            <Link href="/kas/baru" aria-label="Catat transaksi" className="-mt-5 inline-flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-pop ring-4 ring-canvas active:bg-primary-hover">
              <Plus className="size-6" aria-hidden />
            </Link>
          ) : (
            <span className="h-14" />
          )}
        </div>
        <MobileTab href="/program" label="Program" icon={FolderKanban} active={isActive(pathname, "/program")} />
        <button type="button" onClick={() => setMenuOpen(true)} className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted">
          <MoreHorizontal className="size-5" aria-hidden />
          Lainnya
        </button>
      </nav>
    </div>
  );
}

function MobileTab({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "font-medium text-primary" : "text-muted")}>
      <Icon className="size-5" aria-hidden />
      {label}
    </Link>
  );
}
