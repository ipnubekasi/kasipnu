"use client";

export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return (
    <html lang="id">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, color: "#17211B" }}>
        <h1 style={{ fontSize: 18 }}>Aplikasi mengalami gangguan</h1>
        <p style={{ color: "#5B665F" }}>Muat ulang halaman. Jika masih terjadi, hubungi Admin Organisasi.</p>
        <button onClick={() => retry()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff" }}>
          Coba lagi
        </button>
      </body>
    </html>
  );
}
