import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { MembersManager } from "@/components/settings/members-manager";
import { getAppContext } from "@/lib/context";
import type { Member } from "@/lib/types";

export const metadata: Metadata = { title: "Anggota dan hak akses" };

export default async function MembersPage() {
  const ctx = await getAppContext();
  const { data } = await ctx.supabase.from("organization_members").select("*").eq("organization_id", ctx.org.id).order("status").order("granted_at");
  const inviteEnabled = Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  return (
    <>
      <PageHeader title="Anggota dan Hak Akses" description="Pengurus yang bisa membuka aplikasi ini." />
      <MembersManager orgId={ctx.org.id} members={(data ?? []) as Member[]} isAdmin={ctx.isAdmin} selfUserId={ctx.userId} inviteEnabled={inviteEnabled} />
    </>
  );
}
