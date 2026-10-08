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

type Errors = { name?: string; email?: string; password?: string; confirm?: string; form?: string };

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<Errors>({});
  const [pending, setPending] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (name.trim().length < 2) next.name = "Nama lengkap wajib diisi.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Masukkan alamat email yang valid.";
    if (password.length < 8) next.password = "Password minimal 8 karakter.";
    if (confirm !== password) next.confirm = "Konfirmasi password tidak sama.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setPending(true);
    try {
      const { data, error } = await createClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/ringkasan`,
        },
      });
      if (error) {
        const msg = /already registered|already been registered/i.test(error.message)
          ? "Email ini sudah terdaftar. Silakan masuk, atau gunakan Lupa password."
          : /signups? not allowed|signup is disabled/i.test(error.message)
            ? "Pendaftaran sedang ditutup. Minta Admin Organisasi membuatkan akun Anda."
            : /rate limit|too many|security purposes/i.test(error.message)
              ? "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi."
              : /password/i.test(error.message)
                ? "Password terlalu lemah. Gunakan kombinasi huruf dan angka yang lebih panjang."
                : /fetch/i.test(error.message)
                  ? "Tidak dapat terhubung ke server. Periksa koneksi internet Anda."
                  : "Pendaftaran belum berhasil. Coba lagi beberapa saat lagi.";
        setErrors({ form: msg });
        return;
      }
      if (data.session) {
        router.replace("/ringkasan");
        router.refresh();
        return;
      }
      // Email yang sudah terdaftar tidak dibedakan oleh Supabase demi keamanan; tampilkan arahan yang sama.
      setSentTo(email.trim());
    } catch {
      setErrors({ form: "Tidak dapat terhubung ke server. Periksa koneksi internet Anda." });
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="space-y-4">
        <Alert tone="ok">
          Pendaftaran diterima. Jika email konfirmasi diperlukan, tautannya dikirim ke <strong>{sentTo}</strong>. Buka tautan itu, lalu masuk.
        </Alert>
        <p className="text-center text-sm">
          <Link href="/login" className="text-accent underline-offset-4 hover:underline">Ke halaman masuk</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {errors.form && <Alert tone="danger">{errors.form}</Alert>}
      <Field label="Nama lengkap" htmlFor="name" error={errors.name}>
        <Input {...fieldAria("name", errors.name)} type="text" autoComplete="name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email}>
        <Input {...fieldAria("email", errors.email)} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password}>
        <PasswordInput {...fieldAria("password", errors.password)} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Ulangi password" htmlFor="confirm" error={errors.confirm}>
        <PasswordInput {...fieldAria("confirm", errors.confirm)} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>Daftar</Button>
    </form>
  );
}
