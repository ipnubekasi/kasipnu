import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Atur password" };

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/lupa-password");
  return (
    <AuthCard title="Atur password" subtitle="Buat password baru untuk akun Anda. Setelah tersimpan, Anda akan diminta masuk kembali.">
      <PasswordForm />
    </AuthCard>
  );
}
