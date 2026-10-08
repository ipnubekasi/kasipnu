import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { DemoControls } from "@/components/backup/demo-controls";
import { HandoverForm } from "@/components/backup/handover-form";
import { HandoverPackage } from "@/components/backup/handover-package";
import { getAppContext, getMaster } from "@/lib/context";
import type { Member } from "@/lib/types";

export const metadata: Metadata = { title: "Backup dan serah terima" };

export default async function BackupPage() {
  const ctx = await getAppContext();
  const master = await getMaster();
  const [members, entries] = await Promise.all([
    ctx.supabase.from("organization_members").select("*").eq("organization_id", ctx.org.id).order("full_name"),
    ctx.supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id),
  ]);
  const isDemo = Boolean(ctx.org.settings?.is_demo);
  return (
    <>
      <PageHeader title="Backup dan Serah Terima" description="Menjaga arsip lintas periode kepengurusan dan memindahkan tanggung jawab kepada bendahara berikutnya tanpa kehilangan riwayat." />
      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle>Paket serah terima</CardTitle></CardHeader>
          <CardContent><HandoverPackage org={ctx.org} master={master} term={ctx.activeTerm} userName={ctx.member.full_name} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pengalihan akses bendahara</CardTitle></CardHeader>
          <CardContent>
            {ctx.isAdmin ? <HandoverForm orgId={ctx.org.id} members={(members.data ?? []) as Member[]} /> : <Alert tone="info">Pengalihan akses dilakukan oleh Admin Organisasi.</Alert>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Backup database</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <p>Backup penuh mencakup dua bagian: database PostgreSQL (seluruh tabel, fungsi, dan kebijakan) dan isi bucket Storage <code className="rounded bg-subtle px-1">bukti</code>. Ekspor PDF atau paket ZIP bukan backup database.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Paket gratis Supabase tidak memiliki backup harian otomatis yang bisa dipulihkan; paket Pro menyimpan 7 hari terakhir (Dashboard, Database, Backups). Apa pun paketnya, jalankan backup manual minimal sebulan sekali.</li>
              <li>Simpan salinan mandiri minimal sebulan sekali: <code className="rounded bg-subtle px-1">supabase db dump</code> untuk database dan skrip <code className="rounded bg-subtle px-1">npm run backup:storage</code> untuk lampiran.</li>
              <li>Uji pemulihan pada project percobaan setidaknya sekali per periode kepengurusan.</li>
            </ul>
            <p>Langkah lengkap ada di dokumen <strong className="text-ink">05 Backup Pemulihan dan Serah Terima</strong> pada source code.</p>
          </CardContent>
        </Card>
        {ctx.isAdmin && ctx.canWrite && (
          <Card>
            <CardHeader><CardTitle>Mode demo</CardTitle></CardHeader>
            <CardContent><DemoControls orgId={ctx.org.id} isDemo={isDemo} canLoad={!entries.count && master.programs.length === 0} /></CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
