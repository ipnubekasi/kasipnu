import { NextResponse } from "next/server";
import { integrationsEnabledByEnv } from "@/lib/integrations/flags";

/**
 * Titik penerima webhook pembayaran. Selama integrasi nonaktif, setiap permintaan
 * DITOLAK secara eksplisit (HTTP 503) dan tidak ada event yang disimpan, sehingga
 * penyedia tahu event tidak diterima, bukan diterima lalu diabaikan.
 */
async function reject() {
  return NextResponse.json(
    { ok: false, code: "integrasi_nonaktif", message: "Integrasi bank dan QRIS belum aktif. Event tidak diterima." },
    { status: 503, headers: { "Retry-After": "86400" } },
  );
}

export async function POST() {
  if (!integrationsEnabledByEnv()) return reject();
  // Implementasi verifikasi tanda tangan dan pencatatan event dibuat pada tahap aktivasi.
  return NextResponse.json({ ok: false, code: "belum_diimplementasikan", message: "Penyedia belum dikonfigurasi." }, { status: 501 });
}

export const GET = reject;
export const PUT = reject;
