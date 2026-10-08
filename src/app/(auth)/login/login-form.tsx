"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/ringkasan";
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<{ email?: string; password?: string; form?: string }>({});
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next_: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next_.email = "Masukkan alamat email yang valid.";
    if (!password) next_.password = "Password wajib diisi.";
    setErrors(next_);
    if (Object.keys(next_).length) return;
    setPending(true);
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        const msg = /invalid login credentials/i.test(error.message)
          ? "Email atau password salah. Periksa kembali, atau gunakan Lupa password."
          : /email not confirmed/i.test(error.message)
            ? "Email belum dikonfirmasi. Buka tautan konfirmasi di email Anda, atau minta Admin mengirim ulang undangan."
            : /rate limit|too many/i.test(error.message)
              ? "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi."
              : /fetch/i.test(error.message)
                ? "Tidak dapat terhubung ke server. Periksa koneksi internet Anda."
                : "Tidak dapat masuk. Coba lagi beberapa saat lagi.";
        setErrors({ form: msg });
        return;
      }
      router.replace(safeNext(next));
      router.refresh();
    } catch {
      setErrors({ form: "Tidak dapat terhubung ke server. Periksa koneksi internet Anda." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {notice && <Alert tone="ok">{notice}</Alert>}
      {errors.form && <Alert tone="danger">{errors.form}</Alert>}
      <Field label="Email" htmlFor="email" error={errors.email}>
        <Input {...fieldAria("email", errors.email)} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password}>
        <PasswordInput {...fieldAria("password", errors.password)} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>Masuk</Button>
      <p className="text-center text-sm">
        <Link href="/lupa-password" className="text-accent underline-offset-4 hover:underline">Lupa password?</Link>
      </p>
    </form>
  );
}
