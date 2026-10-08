import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Lupa password" };

export default function ForgotPage() {
  return (
    <AuthCard title="Lupa password" subtitle="Masukkan email akun Anda. Kami kirim tautan untuk membuat password baru.">
      <ForgotForm />
    </AuthCard>
  );
}
