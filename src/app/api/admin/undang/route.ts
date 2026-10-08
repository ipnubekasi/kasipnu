import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Mengundang akun baru lalu menambahkannya sebagai anggota.
 * Secret key hanya dipakai di sini (server) dan hanya setelah pemanggil terbukti Admin.
 * Penambahan keanggotaan tetap memakai sesi pemanggil, sehingga RLS dan pemeriksaan role berlaku.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ message: "Sesi tidak ditemukan. Silakan masuk kembali." }, { status: 401 });

  const { data: state } = await supabase.rpc("instance_state");
  const roles: string[] = state?.membership?.roles ?? [];
  if (!roles.includes("admin")) return NextResponse.json({ message: "Hanya Admin Organisasi yang dapat mengundang anggota." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const fullName = String(body?.full_name ?? "").trim();
  const reqRoles: string[] = Array.isArray(body?.roles) ? body.roles : [];
  if (!/^\S+@\S+\.\S+$/.test(email) || !fullName || reqRoles.length === 0) {
    return NextResponse.json({ message: "Email, nama lengkap, dan hak akses wajib diisi." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Undangan otomatis belum dikonfigurasi.", hint: "Isi SUPABASE_SECRET_KEY di server, atau buat akun lewat Dashboard Supabase." }, { status: 501 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  let invited = false;
  const inv = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/confirm?next=/atur-password`, data: { full_name: fullName } });
  if (inv.error) {
    if (!/already.*registered|already exists|email_exists/i.test(inv.error.message)) {
      return NextResponse.json({ message: "Undangan tidak dapat dikirim.", hint: "Periksa pengaturan email (SMTP) di Supabase Auth, lalu coba lagi." }, { status: 502 });
    }
  } else {
    invited = true;
  }

  const { error } = await supabase.rpc("add_member_by_email", {
    p_org: state.membership.organization_id, p_email: email, p_full_name: fullName, p_position: body?.position ?? null, p_roles: reqRoles,
  });
  if (error) return NextResponse.json({ message: error.message, hint: error.hint }, { status: 400 });
  return NextResponse.json({ ok: true, invited });
}
