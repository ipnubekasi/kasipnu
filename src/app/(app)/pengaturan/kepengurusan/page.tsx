import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { TermsManager } from "@/components/settings/terms-manager";
import { getAppContext } from "@/lib/context";

export const metadata: Metadata = { title: "Periode kepengurusan" };

export default async function TermsPage() {
  const ctx = await getAppContext();
  return (
    <>
      <PageHeader title="Periode Kepengurusan" description="Masa khidmat dan nama pengurus untuk tanda tangan laporan." />
      <TermsManager orgId={ctx.org.id} terms={ctx.terms} isAdmin={ctx.isAdmin} />
    </>
  );
}
