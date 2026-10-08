import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { OrgForm } from "@/components/settings/org-form";
import { getAppContext } from "@/lib/context";

export const metadata: Metadata = { title: "Profil organisasi" };

export default async function OrgSettingsPage() {
  const ctx = await getAppContext();
  const logo = ctx.org.logo_path ? (await ctx.supabase.storage.from("bukti").createSignedUrl(ctx.org.logo_path, 3600)).data?.signedUrl ?? null : null;
  const t = ctx.activeTerm;
  const termSigners = [
    { role: "Ketua", name: t?.chair_name ?? "" },
    { role: "Bendahara", name: t?.treasurer_name ?? "" },
  ];
  return (
    <>
      <PageHeader title="Profil dan Logo" description="Nama dan logo yang tampil di aplikasi dan laporan." />
      <OrgForm org={ctx.org} logoUrl={logo} isAdmin={ctx.isAdmin} canWrite={ctx.canWrite} termSigners={termSigners} />
    </>
  );
}
