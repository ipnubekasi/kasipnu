import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Pemeriksaan kesehatan keuangan harian lewat Vercel Cron (alternatif pg_cron).
 * Vercel mengirim header Authorization: Bearer <CRON_SECRET>.
 * Paket Hobby Vercel hanya mengizinkan jadwal sekali per hari; jadwal di vercel.json sudah sesuai.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, message: "Pemeriksaan terjadwal lewat Vercel belum dikonfigurasi: isi CRON_SECRET." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "Tidak berwenang." }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Pemeriksaan terjadwal lewat Vercel belum dikonfigurasi: isi SUPABASE_SECRET_KEY." }, { status: 503 });
  }
  const { data, error } = await admin.rpc("run_scheduled_checks");
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, organizations: data });
}
