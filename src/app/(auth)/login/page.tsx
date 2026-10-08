import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { param } from "@/lib/utils";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

const NOTICES: Record<string, string> = {
  "password-diubah": "Password berhasil diubah. Silakan masuk dengan password baru.",
  keluar: "Anda sudah keluar.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <AuthCard title="Masuk" subtitle="Pencatatan keuangan yang rapi untuk keberlanjutan organisasi.">
      <LoginForm next={param(sp.lanjut)} notice={NOTICES[param(sp.info) ?? ""]} />
    </AuthCard>
  );
}
