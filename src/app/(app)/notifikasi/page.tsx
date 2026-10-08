import type { Metadata } from "next";
import Link from "next/link";
import { BellOff } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { LinkTabs, Pagination } from "@/components/app/url-controls";
import { NotificationList } from "@/components/notifications/notification-list";
import { getAppContext } from "@/lib/context";
import type { Notification } from "@/lib/types";
import { param } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifikasi" };
const PAGE_SIZE = 30;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getAppContext();
  const filter = ["aktif", "belum_dibaca", "selesai", "semua"].includes(param(sp.f) ?? "") ? param(sp.f)! : "aktif";
  const page = Math.max(1, Number(param(sp.hal)) || 1);
  const { data, error } = await ctx.supabase.rpc("list_notifications", { p_org: ctx.org.id, p_filter: filter, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
  if (error) throw new Error(error.message);
  const items = (data ?? []) as Notification[];
  return (
    <>
      <PageHeader title="Notifikasi" description="Peringatan dan ringkasan mingguan." />
      <LinkTabs active={filter} tabs={[
        { key: "aktif", label: "Aktif", href: "/notifikasi" },
        { key: "belum_dibaca", label: "Belum dibaca", href: "/notifikasi?f=belum_dibaca" },
        { key: "selesai", label: "Selesai", href: "/notifikasi?f=selesai" },
        { key: "semua", label: "Riwayat lengkap", href: "/notifikasi?f=semua" },
      ]} />
      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={filter === "aktif" ? "Tidak ada notifikasi aktif" : "Tidak ada notifikasi"}
            description={filter === "aktif" ? "Semua kondisi aman." : "Belum ada notifikasi pada kelompok ini."}
            action={<Link href="/kesehatan" className="text-sm font-medium text-accent underline underline-offset-2">Lihat Kesehatan Keuangan</Link>}
          />
        ) : (
          <>
            <NotificationList orgId={ctx.org.id} items={items} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={Number(items[0]?.total_count ?? 0)} />
          </>
        )}
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">Atur ambang dan pengingat ulang di <Link href="/pengaturan/kesehatan" className="text-accent hover:underline">Pengaturan</Link>. Email dan push notification belum diaktifkan.</p>
      </Card>
    </>
  );
}
