import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Daftar" };

export default function SignupPage() {
  return (
    <AuthCard tab="daftar" title="Buat akun baru" subtitle="Akses data ditentukan oleh Admin Organisasi setelah Anda mendaftar.">
      <SignupForm />
    </AuthCard>
  );
}
