"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Archive, ArrowUpRight, Bell, BookOpenText, ChevronDown, ChevronLeft, ChevronRight, FileBarChart, FlaskConical, FolderKanban, HeartPulse, Home, LayoutDashboard, LogOut, MoreHorizontal, Plus, RefreshCw, Search, Settings, UserRound, Wallet } from "@/components/ui/icons";
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
type IconC = React.ComponentType<{ className?: string }>;

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

/* Status sidebar (lebar atau ringkas) disimpan di perangkat, per peramban. */
const SIDEBAR_KEY = "kas-ipnu:sidebar-ringkas";
const sidebarListeners = new Set<() => void>();
function subscribeSidebar(cb: () => void) {
  sidebarListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    sidebarListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readSidebar() {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}
function writeSidebar(v: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0");
  } catch {
    /* penyimpanan diblokir: status hanya berlaku sementara */
  }
  sidebarListeners.forEach((f) => f());
}

/** Memindahkan penanda (pil) ke posisi sebuah butir menu. */
function place(marker: HTMLElement | null, target: HTMLElement | null, nav: HTMLElement | null) {
  if (!marker || !target || !nav) return;
  const n = nav.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  marker.style.transform = `translate(${t.left - n.left}px, ${t.top - n.top}px)`;
  marker.style.width = `${t.width}px`;
  marker.style.height = `${t.height}px`;
}

type LinkSpec = { href: string; label: string; icon: IconC; badge?: number };

function SideNav({ pathname, unread, collapsed }: { pathname: string; unread: number; collapsed: boolean }) {
  const navRef = React.useRef<HTMLElement>(null);
  const pillRef = React.useRef<HTMLSpanElement>(null);
  const hoverRef = React.useRef<HTMLSpanElement>(null);

  const main: LinkSpec[] = NAV.map((i) => ({ href: i.href, label: i.label, icon: ICONS[i.icon] }));
  const more: LinkSpec[] = [
    { href: "/kesehatan", label: "Kesehatan Keuangan", icon: HeartPulse },
    { href: "/notifikasi", label: "Notifikasi", icon: Bell, badge: unread },
  ];

  // Pil kuning meluncur ke menu aktif; ikut bergeser saat sidebar melebar atau meringkas.
  React.useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const sync = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      const pill = pillRef.current;
      if (!pill) return;
      if (active) {
        place(pill, active, nav);
        pill.style.opacity = "1";
      } else {
        pill.style.opacity = "0";
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(nav);
    const t = window.setTimeout(sync, 320);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [pathname, collapsed]);

  function hover(e: React.PointerEvent<HTMLElement>) {
    const el = e.currentTarget;
    const spot = hoverRef.current;
    if (!spot) return;
    if (el.getAttribute("aria-current") === "page") {
      spot.style.opacity = "0";
      return;
    }
    place(spot, el, navRef.current);
    spot.style.opacity = "1";
  }
  const leave = () => {
    if (hoverRef.current) hoverRef.current.style.opacity = "0";
  };

  const renderLink = ({ href, label, icon: Icon, badge }: LinkSpec, index: number) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? label : undefined}
        onPointerEnter={hover}
        style={{ ["--i" as string]: index }}
        className={cn(
          "group/item rise relative z-10 flex h-12 items-center rounded-full text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-pill",
          collapsed ? "mx-auto w-12 justify-center" : "gap-3.5 px-4",
          active ? "font-semibold text-pill-ink" : "text-side-ink hover:text-white",
        )}
      >
        <Icon className={cn("size-[22px] shrink-0 transition-transform duration-200 group-hover/item:scale-110", active ? "text-pill-ink" : "text-side-ink/80 group-hover/item:text-white")} aria-hidden />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
        {badge ? (
          <span className={cn("tnum inline-flex items-center justify-center rounded-full bg-pill font-semibold text-pill-ink", collapsed ? "absolute top-1 right-0.5 min-w-[18px] px-1 text-[10px] leading-[18px]" : "min-w-[22px] px-1.5 text-[11px] leading-[22px]")}>
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
        {collapsed && (
          <span role="tooltip" className="pointer-events-none absolute top-1/2 left-full z-50 ml-4 -translate-y-1/2 translate-x-1 rounded-xl bg-[#06231a] px-3 py-1.5 text-[12px] font-medium whitespace-nowrap text-white opacity-0 shadow-pop transition-all duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-100 group-focus-visible/item:translate-x-0 group-focus-visible/item:opacity-100">
            {label}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav ref={navRef} aria-label="Navigasi utama" onPointerLeave={leave} className="relative">
      <span ref={hoverRef} aria-hidden className="pointer-events-none absolute top-0 left-0 z-0 rounded-full bg-white/[0.09] opacity-0 transition-[transform,width,height,opacity] duration-200 ease-out" />
      <span ref={pillRef} aria-hidden className="pointer-events-none absolute top-0 left-0 z-0 rounded-full bg-pill opacity-0 shadow-[0_10px_26px_-8px_rgb(243_233_92/0.55)] transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" />

      {!collapsed && <p className="px-4 pt-1 pb-2 text-[11px] font-semibold tracking-[0.12em] text-side-ink/70 uppercase">Menu</p>}
      <div className="space-y-1">{main.map((l, i) => renderLink(l, i))}</div>
      {collapsed ? <div className="mx-3 my-3 border-t border-side-line" /> : <p className="px-4 pt-5 pb-2 text-[11px] font-semibold tracking-[0.12em] text-side-ink/70 uppercase">Pantau</p>}
      <div className="space-y-1">{more.map((l, i) => renderLink(l, i + main.length))}</div>
    </nav>
  );
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex size-9 items-center justify-center rounded-md bg-side text-[13px] font-semibold text-white", className)} aria-hidden>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

const TODAY = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

function HeaderSearch() {
  const router = useRouter();
  const ref = React.useRef<HTMLInputElement>(null);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    router.push(`/kas?lingkup=gabungan&periode=semua&cari=${encodeURIComponent(term)}`);
    ref.current?.blur();
  }

  return (
    <form onSubmit={submit} role="search" className="group relative hidden w-full max-w-[340px] md:block">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-faint transition-colors group-focus-within:text-accent" aria-hidden />
      <input
        ref={ref}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari transaksi"
        aria-label="Cari transaksi"
        className="h-10 w-full rounded-lg border border-line bg-white pr-14 pl-10 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:shadow-[0_0_0_3px_rgb(21_114_74/0.12)]"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3.5 hidden -translate-y-1/2 rounded border border-line bg-subtle px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted group-focus-within:hidden lg:block">Ctrl K</kbd>
    </form>
  );
}

export function AppShell(props: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { updateReady, applyUpdate } = usePwa();
  const collapsed = React.useSyncExternalStore(subscribeSidebar, readSidebar, () => false);
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
  const onNewTx = /^\/kas\/(baru|impor)/.test(pathname);

  return (
    <div className="min-h-dvh">
      <a href="#konten" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-white">
        Lompat ke konten
      </a>

      {/* Sidebar desktop: panel hijau tua yang melayang, dapat diringkas */}
      <aside
        className={cn(
          "no-print fixed top-3 bottom-3 left-3 z-30 hidden flex-col rounded-[32px] text-side-ink shadow-pop transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex",
          collapsed ? "w-[5.5rem]" : "w-[17rem]",
        )}
      >
        {/* Latar berlapis: hijau tua, cahaya hijau di kiri atas, semburat kuning di kanan bawah */}
        <div
          aria-hidden
          className="absolute inset-0 overflow-hidden rounded-[inherit]"
          style={{
            background:
              "radial-gradient(120% 55% at 0% 0%, rgb(45 160 108 / 0.42), transparent 62%), radial-gradient(90% 45% at 100% 100%, rgb(243 233 92 / 0.12), transparent 65%), linear-gradient(180deg, #0f4833 0%, #0a3322 55%, #072719 100%)",
          }}
        >
          <svg className="absolute -right-16 -bottom-16 size-64 opacity-[0.07]" viewBox="0 0 200 200" fill="none" stroke="white" strokeWidth="1.2">
            {[30, 50, 70, 90].map((r) => <circle key={r} cx="100" cy="100" r={r} />)}
          </svg>
          <span className="absolute inset-0 rounded-[inherit] ring-1 ring-white/10 ring-inset" />
        </div>

        <div className={cn("relative flex items-center", collapsed ? "flex-col gap-3 px-3 pt-5 pb-3" : "gap-2 px-5 pt-6 pb-4")}>
          <Link href="/ringkasan" aria-label="Kas IPNU, ke Ringkasan" className={cn("group/brand flex min-w-0 items-center gap-3", !collapsed && "flex-1")}>
            <OrgLogo src={props.logoUrl} name={props.orgName} size={44} className="ring-2 ring-white/25 transition-transform duration-500 group-hover/brand:rotate-[-8deg] group-hover/brand:scale-105" />
            {!collapsed && (
              <span className="min-w-0 leading-tight">
                <span className="block text-[18px] font-semibold tracking-tight text-white">Kas IPNU</span>
                <span className="block truncate text-[12px] text-side-ink/75">{props.orgShortName}</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => writeSidebar(!collapsed)}
            aria-label={collapsed ? "Lebarkan sidebar" : "Ringkas sidebar"}
            aria-pressed={collapsed}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-side-ink transition-all hover:bg-white/20 hover:text-white active:scale-90"
          >
            {collapsed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronLeft className="size-4" aria-hidden />}
          </button>
        </div>

        <div className={cn("relative flex-1 px-3 pb-3", collapsed ? "overflow-visible" : "overflow-y-auto")}>
          <SideNav pathname={pathname} unread={props.unread} collapsed={collapsed} />
        </div>

        <div className="relative space-y-3 p-3">
          {props.canWrite ? (
            collapsed ? (
              <Link href="/kas/baru" aria-label="Catat transaksi" className="mx-auto flex size-12 items-center justify-center rounded-full bg-pill text-pill-ink shadow-[0_10px_26px_-8px_rgb(243_233_92/0.55)] transition-transform hover:rotate-90 active:scale-90">
                <Plus className="size-6" aria-hidden />
              </Link>
            ) : (
              <Link
                href="/kas/baru"
                className={cn("group/cta relative block overflow-hidden rounded-[26px] bg-pill p-4 text-pill-ink transition-transform active:scale-[0.98]", onNewTx && "opacity-70")}
              >
                <span className="absolute top-3.5 right-3.5 flex size-10 items-center justify-center rounded-full bg-pill-ink text-pill transition-transform duration-300 group-hover/cta:rotate-45 group-hover/cta:scale-110">
                  <ArrowUpRight className="size-5" aria-hidden />
                </span>
                <span className="relative block pt-9 text-[16px] leading-tight font-semibold">Catat transaksi baru</span>
                <span className="relative mt-1 block text-[12px] font-medium text-pill-ink/75">Pemasukan atau pengeluaran</span>
              </Link>
            )
          ) : (
            !collapsed && (
              <div className="rounded-2xl bg-white/[0.07] px-4 py-3 text-[12px] ring-1 ring-white/10">
                <p className="truncate font-medium text-white">{props.orgName}</p>
                
              </div>
            )
          )}
        </div>
      </aside>

      <div className={cn("transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", collapsed ? "lg:pl-[7rem]" : "lg:pl-[18.5rem]")}>
        <header className="no-print safe-top sticky top-0 z-20 bg-canvas">
          <div className="flex h-[72px] items-center gap-3 px-4 sm:px-6">
            <Link href="/ringkasan" className="lg:hidden" aria-label="Ke Ringkasan">
              <OrgLogo src={props.logoUrl} name={props.orgName} size={40} />
            </Link>

            <div className="min-w-0 flex-1 leading-tight md:flex-none md:basis-[320px]">
              <p suppressHydrationWarning className="hidden truncate text-[12px] text-muted sm:block">{TODAY.format(new Date())}</p>
              <p className="truncate text-[15px] font-semibold text-ink sm:text-[16px]">{props.orgName}</p>
              {props.termName && <p className="truncate text-[12px] text-muted">{props.termName}</p>}
            </div>

            <div className="hidden flex-1 md:flex md:justify-center">
              <HeaderSearch />
            </div>

            <Link
              href="/notifikasi"
              aria-label={props.unread > 0 ? `Notifikasi, ${props.unread} belum dibaca` : "Notifikasi"}
              className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink transition-colors hover:bg-subtle"
            >
              <Bell className="size-5" aria-hidden />
              {props.unread > 0 && (
                <span className="tnum absolute -top-0.5 -right-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] leading-[18px] font-semibold text-white ring-2 ring-white">
                  {props.unread > 99 ? "99+" : props.unread}
                </span>
              )}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-line bg-white pr-1 pl-1 text-sm text-ink transition-colors hover:bg-subtle sm:pr-3" aria-label="Menu pengguna">
                <Avatar name={props.userName} className="size-8" />
                <span className="hidden max-w-32 truncate font-medium lg:block">{props.userName}</span>
                <ChevronDown className="hidden size-4 text-muted lg:block" aria-hidden />
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
          <div className="no-print mx-4 mb-2 flex items-center gap-3 rounded-lg bg-primary px-4 py-3 text-[13px] text-white shadow-soft sm:mx-6">
            <RefreshCw className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">Versi baru Kas IPNU sudah tersedia.</span>
            <button type="button" onClick={applyUpdate} className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-side">Muat ulang</button>
          </div>
        )}

        {props.isDemo && (
          <div className="no-print mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-warn-line bg-warn-soft px-4 py-2.5 text-[13px] text-ink sm:mx-6">
            <FlaskConical className="size-4 shrink-0 text-warn" aria-hidden />
            <span><strong className="font-medium">Mode demo.</strong> Semua angka di aplikasi ini adalah data contoh, bukan keuangan organisasi.</span>
            <Link href="/pengaturan/backup" className="font-medium text-warn underline underline-offset-2">Hapus data contoh</Link>
          </div>
        )}

        <main id="konten" aria-label={section} className="mx-auto w-full max-w-[1400px] px-4 pt-3 pb-40 sm:px-6 lg:pt-4 lg:pb-12">
          {props.children}
        </main>
      </div>

      {/* Navigasi bawah ponsel: pulau melayang dengan tombol catat di tengah */}
      <nav
        aria-label="Navigasi cepat"
        style={{ background: "linear-gradient(180deg, #14503a 0%, #0e3a28 100%)" }}
        className="no-print fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-30 grid grid-cols-5 items-center rounded-[28px] p-1.5 shadow-pop ring-1 ring-white/10 lg:hidden"
      >
        <MobileTab href="/ringkasan" label="Ringkasan" icon={LayoutDashboard} active={isActive(pathname, "/ringkasan")} />
        <MobileTab href="/kas" label="Kas" icon={Wallet} active={isActive(pathname, "/kas") && !pathname.startsWith("/kas/baru")} />
        <div className="flex items-center justify-center">
          {props.canWrite && !hideFab ? (
            <Link href="/kas/baru" aria-label="Catat transaksi" className="-mt-8 inline-flex size-[58px] items-center justify-center rounded-full bg-pill text-pill-ink shadow-[0_12px_26px_-8px_rgb(120 110 10/0.6)] ring-[5px] ring-white transition-transform active:scale-90">
              <Plus className="size-7" aria-hidden />
            </Link>
          ) : (
            <Link href="/ringkasan" aria-label="Beranda, kembali ke Ringkasan" className="-mt-8 inline-flex size-[58px] items-center justify-center rounded-full bg-pill text-pill-ink shadow-[0_12px_26px_-8px_rgb(120_110_10/0.6)] ring-[5px] ring-white transition-transform active:scale-95">
              <Home className="size-7" aria-hidden />
            </Link>
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
            <div className="flex items-center gap-3 rounded-xl bg-accent-soft p-3.5">
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
                  className={cn("relative flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center text-[12px] leading-tight transition-transform active:scale-95", isActive(pathname, href) ? "border-accent-line bg-accent-soft font-semibold text-primary" : "border-line bg-surface text-ink")}>
                  <Icon className="size-6 text-accent" aria-hidden />
                  {label}
                  {badge ? <span className="tnum absolute top-2 right-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] leading-[18px] font-semibold text-white">{badge > 99 ? "99+" : badge}</span> : null}
                </Link>
              ))}
            </div>

            <InstallCard tone="light" className="mt-4" />

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Link href="/atur-password" onClick={() => setSheetOpen(false)} className="flex h-12 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface text-sm font-medium text-ink active:scale-[0.98]">
                <UserRound className="size-5 text-muted" aria-hidden />Ganti password
              </Link>
              <button type="button" onClick={signOut} className="flex h-12 items-center justify-center gap-2 rounded-lg border border-danger-line bg-danger-soft text-sm font-medium text-danger active:scale-[0.98]">
                <LogOut className="size-5" aria-hidden />Keluar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MobileTab({ href, label, icon: Icon, active, onClick }: { href?: string; label: string; icon: IconC; active: boolean; onClick?: () => void }) {
  const cls = cn("flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[22px] text-[11px] transition-colors active:scale-95", active ? "bg-pill font-semibold text-pill-ink" : "text-side-ink");
  const inner = (
    <>
      <Icon className="size-[22px]" aria-hidden />
      {label}
    </>
  );
  return href ? (
    <Link href={href} aria-current={active ? "page" : undefined} className={cls}>{inner}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{inner}</button>
  );
}
