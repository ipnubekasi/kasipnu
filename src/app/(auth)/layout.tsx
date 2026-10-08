export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[400px]">{children}</div>
      <p className="mt-8 text-center text-[12px] text-faint">Aplikasi internal. Akun dibuat atau diundang oleh Admin Organisasi.</p>
    </main>
  );
}
