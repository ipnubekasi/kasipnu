import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/app/page-header";
import { HealthSettingsForm } from "@/components/settings/simple-forms";
import { getAppContext } from "@/lib/context";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Kesehatan dan notifikasi" };

export default async function HealthSettingsPage() {
  const ctx = await getAppContext();
  const { data: sched } = await ctx.supabase.rpc("ensure_daily_check", { p_org: ctx.org.id });
  return (
    <>
      <PageHeader title="Kesehatan dan Notifikasi" description="Batas peringatan dan pengecekan otomatis." />
      <div className="space-y-5">
        {sched?.scheduler_configured ? (
          <Alert tone="ok" title="Pemeriksaan berkala harian aktif">
            Penjadwal database menjalankan pemeriksaan setiap hari. Pemeriksaan terjadwal terakhir: {formatDateTime(sched.last_scheduled_at)}.
          </Alert>
        ) : (
          <Alert tone="warn" title="Pemeriksaan berkala terjadwal belum dikonfigurasi">
            Saat ini pemeriksaan harian berjalan ketika ada pengurus yang membuka aplikasi (paling banyak sekali per hari), dan setiap kali ada pencatatan, pembatalan, atau perubahan kebutuhan kas dan anggaran. Agar tetap berjalan walaupun aplikasi tidak dibuka, aktifkan pg_cron di Supabase atau Vercel Cron sesuai panduan deployment.
            {sched?.last_check_at ? ` Pemeriksaan terakhir: ${formatDateTime(sched.last_check_at)}.` : ""}
          </Alert>
        )}
        <HealthSettingsForm orgId={ctx.org.id} settings={ctx.org.settings ?? {}} canEdit={ctx.canWrite || ctx.isAdmin} />
        <Alert tone="info" title="Notifikasi email dan push">
          Notifikasi dalam aplikasi selalu aktif. Email dan push notification adalah fitur opsional yang belum diaktifkan pada versi ini; aplikasi tidak mengirim pesan apa pun kepada anggota, donatur, atau sponsor.
        </Alert>
      </div>
    </>
  );
}
