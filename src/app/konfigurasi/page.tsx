import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Konfigurasi belum lengkap" };

export default function ConfigPage() {
  if (isSupabaseConfigured()) redirect("/login");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-10">
      <div className="rounded-card border border-warn-line bg-surface p-6">
        <h1 className="text-lg font-semibold text-ink">Aplikasi belum terhubung ke Supabase</h1>
        <p className="mt-2 text-sm text-muted">
          Variabel lingkungan berikut belum diisi, sehingga aplikasi belum dapat menyimpan atau membaca data. Tidak ada data contoh yang ditampilkan.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li><code className="rounded bg-subtle px-1.5 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code></li>
          <li><code className="rounded bg-subtle px-1.5 py-0.5">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code></li>
        </ul>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Salin <code>.env.example</code> menjadi <code>.env.local</code> (lokal) atau isi Environment Variables di Vercel.</li>
          <li>Ambil nilainya dari Dashboard Supabase, menu Project Settings, bagian API Keys.</li>
          <li>Jalankan ulang aplikasi atau lakukan redeploy.</li>
        </ol>
        <p className="mt-4 text-sm text-muted">Langkah lengkap ada di <code>docs/02 Setup Supabase.md</code>.</p>
      </div>
    </main>
  );
}
