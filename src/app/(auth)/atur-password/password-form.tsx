"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { PasswordInput } from "@/components/auth/password-input";

export function PasswordForm() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<{ password?: string; confirm?: string; form?: string }>({});
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (password.length < 10) next.password = "Password minimal 10 karakter.";
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) next.password = "Gunakan kombinasi huruf dan angka.";
    if (confirm !== password) next.confirm = "Konfirmasi password tidak sama.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrors({
          form: /session|jwt|not authenticated/i.test(error.message)
            ? "Tautan sudah kedaluwarsa. Minta tautan baru dari halaman Lupa password."
            : /different from the old|same password/i.test(error.message)
              ? "Password baru harus berbeda dari password lama."
              : /weak|least|pwned/i.test(error.message)
                ? "Password terlalu lemah. Gunakan password yang lebih panjang dan tidak umum."
                : "Password tidak dapat diubah. Coba lagi.",
        });
        return;
      }
      await supabase.auth.signOut();
      router.replace("/login?info=password-diubah");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {errors.form && <Alert tone="danger">{errors.form}</Alert>}
      <Field label="Password baru" htmlFor="password" error={errors.password} help="Minimal 10 karakter, berisi huruf dan angka.">
        <PasswordInput {...fieldAria("password", errors.password)} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      <Field label="Ulangi password baru" htmlFor="confirm" error={errors.confirm}>
        <PasswordInput {...fieldAria("confirm", errors.confirm)} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>Simpan password</Button>
    </form>
  );
}
