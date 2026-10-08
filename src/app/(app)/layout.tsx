import { AppShell } from "@/components/app/app-shell";
import { getAppContext } from "@/lib/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  const { supabase, org } = ctx;

  // Pemeriksaan harian (paling banyak sekali per tanggal) dan jumlah notifikasi belum dibaca.
  await supabase.rpc("ensure_daily_check", { p_org: org.id });
  const [unreadRes, logoRes] = await Promise.all([
    supabase.rpc("unread_notification_count", { p_org: org.id }),
    org.logo_path ? supabase.storage.from("bukti").createSignedUrl(org.logo_path, 3600) : Promise.resolve({ data: null }),
  ]);

  return (
    <AppShell
      orgName={org.name}
      orgShortName={org.short_name}
      logoUrl={logoRes.data?.signedUrl ?? null}
      termName={ctx.activeTerm?.name ?? null}
      userName={ctx.member.full_name}
      userEmail={ctx.email}
      roles={ctx.roles}
      unread={Number(unreadRes.data ?? 0)}
      isDemo={Boolean(org.settings?.is_demo)}
      canWrite={ctx.canWrite}
    >
      {children}
    </AppShell>
  );
}
