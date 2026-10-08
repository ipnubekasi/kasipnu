import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldOff } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "Belum memiliki akses" };

export default async function NoAccessPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const { data: state } = await supabase.rpc("instance_state");
  if (state?.membership) redirect("/ringkasan");
  if (state && !state.has_organization) redirect("/siapkan");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-card border border-line bg-surface p-6 text-center">
        <span className="mx-auto mb-3 inline-flex size-11 items-center justify-center rounded-full bg-subtle text-muted">
          <ShieldOff className="size-5" aria-hidden />
        </span>
        <h1 className="text-base font-semibold text-ink">{state?.revoked ? "Akses Anda sudah dicabut" : "Akun Anda belum memiliki akses"}</h1>
        <p className="mt-2 text-sm text-muted">
          Anda masuk sebagai <strong className="text-ink">{String(data.claims.email ?? "")}</strong>, tetapi akun ini {state?.revoked ? "tidak lagi" : "belum"} terdaftar sebagai pengurus yang berhak membuka data keuangan.
        </p>
        <p className="mt-2 text-sm text-muted">Hubungi Admin Organisasi untuk meminta akses, lalu masuk kembali.</p>
        <div className="mt-5 flex justify-center"><SignOutButton /></div>
      </div>
    </main>
  );
}
