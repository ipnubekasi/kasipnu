import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Account, Category, Fund, Master, Organization, Program, Role, Term } from "@/lib/types";

/**
 * Konteks aplikasi untuk satu permintaan: sesi, keanggotaan, organisasi, periode.
 * Semua halaman di dalam (app) memanggil fungsi ini. Pengguna tanpa sesi diarahkan
 * ke /login, pengguna tanpa keanggotaan ke /tanpa-akses atau /siapkan.
 * Pemeriksaan ini untuk pengalaman pengguna; pengamanan sesungguhnya ada di RLS.
 */
export const getAppContext = cache(async () => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) redirect("/login");

  const { data: state, error } = await supabase.rpc("instance_state");
  if (error) throw new Error(`Tidak dapat memuat status akun: ${error.message}`);
  if (!state?.membership) redirect(state?.has_organization ? "/tanpa-akses" : "/siapkan");

  const orgId = state.membership.organization_id as string;
  const [orgRes, termRes] = await Promise.all([
    supabase.from("organizations").select("id, name, short_name, address, city, logo_path, settings").eq("id", orgId).single(),
    supabase.from("management_terms").select("*").eq("organization_id", orgId).order("start_date", { ascending: false }),
  ]);
  if (orgRes.error || !orgRes.data) throw new Error("Tidak dapat memuat data organisasi.");

  const roles = (state.membership.roles ?? []) as Role[];
  const terms = (termRes.data ?? []) as Term[];
  return {
    supabase,
    userId: claims.sub as string,
    email: (claims.email as string | undefined) ?? (state.membership.email as string),
    org: orgRes.data as Organization,
    member: state.membership as { member_id: string; full_name: string; email: string; position: string | null },
    roles,
    isAdmin: roles.includes("admin"),
    canWrite: roles.includes("bendahara"),
    terms,
    activeTerm: terms.find((t) => t.status === "aktif") ?? null,
  };
});

export type AppContext = Awaited<ReturnType<typeof getAppContext>>;

/** Data master yang dipakai hampir semua halaman. Di-cache per permintaan. */
export const getMaster = cache(async (): Promise<Master> => {
  const { supabase, org } = await getAppContext();
  const [a, f, p, c] = await Promise.all([
    supabase.from("accounts").select("*").eq("organization_id", org.id).order("code"),
    supabase.from("funds").select("*").eq("organization_id", org.id).order("kind", { ascending: false }).order("name"),
    supabase.from("programs").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }),
    supabase.from("categories").select("*").eq("organization_id", org.id).order("kind").order("sort_order").order("name"),
  ]);
  const err = a.error || f.error || p.error || c.error;
  if (err) throw new Error(`Tidak dapat memuat data master: ${err.message}`);
  const accounts = (a.data ?? []) as Account[];
  const funds = (f.data ?? []) as Fund[];
  const generalFund = funds.find((x) => x.kind === "umum");
  if (!generalFund) throw new Error("Dana Kas Umum belum tersedia. Hubungi Admin Organisasi.");
  return {
    accounts,
    cashAccounts: accounts.filter((x) => x.is_cash),
    funds,
    generalFund,
    programs: (p.data ?? []) as Program[],
    categories: (c.data ?? []) as Category[],
  };
});
