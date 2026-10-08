import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { RefSettingsForm } from "@/components/settings/simple-forms";
import { getAppContext } from "@/lib/context";

export const metadata: Metadata = { title: "Nomor referensi" };

export default async function RefPage() {
  const ctx = await getAppContext();
  return (
    <>
      <PageHeader title="Nomor Referensi" description="Awalan dan jumlah digit nomor transaksi." />
      <RefSettingsForm orgId={ctx.org.id} settings={ctx.org.settings ?? {}} isAdmin={ctx.isAdmin} />
    </>
  );
}
