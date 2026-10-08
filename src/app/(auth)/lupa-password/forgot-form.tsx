"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ForgotForm() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Masukkan alamat email yang valid.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/confirm?next=/atur-password`,
      });
      if (err && /rate limit|too many|security purposes/i.test(err.message)) {
        setError("Permintaan terlalu sering. Tunggu sekitar satu menit lalu coba lagi.");
        return;
      }
      // Tidak membedakan email terdaftar atau tidak, agar daftar akun tidak dapat ditebak.
      setSent(true);
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi internet Anda.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert tone="ok" title="Periksa email Anda">
          Jika <strong>{email.trim()}</strong> terdaftar, tautan untuk mengatur ulang password sudah dikirim. Tautan berlaku terbatas; periksa juga folder spam.
        </Alert>
        <Button asChild className="w-full" size="lg"><Link href="/login">Kembali ke halaman masuk</Link></Button>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="Email" htmlFor="email" error={error}>
        <Input {...fieldAria("email", error)} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>Kirim tautan atur ulang</Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-accent underline-offset-4 hover:underline">Kembali ke halaman masuk</Link>
      </p>
    </form>
  );
}
