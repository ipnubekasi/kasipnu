import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrgLogo } from "@/components/app/org-logo";
import { createClient } from "@/lib/supabase/server";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Siapkan organisasi" };

export default async function SetupPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const { data: state } = await supabase.rpc("instance_state");
  if (state?.membership) redirect("/ringkasan");
  if (state?.has_organization) redirect("/tanpa-akses");
  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-center gap-3">
        <OrgLogo name="Kas IPNU" size={44} />
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Siapkan Kas IPNU</h1>
          <p className="text-sm text-muted">Langkah satu kali sebelum mulai mencatat.</p>
        </div>
      </div>
      <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <SetupForm email={String(data.claims.email ?? "")} />
      </div>
    </main>
  );
}
