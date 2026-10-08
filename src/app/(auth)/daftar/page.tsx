import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Daftar" };

export default function SignupPage() {
  return (
    <AuthCard title="Daftar" subtitle="Buat akun untuk mulai memakai Kas IPNU. Akses data ditentukan oleh Admin Organisasi.">
      <SignupForm />
    </AuthCard>
  );
}
