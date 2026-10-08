import type { SupabaseClient } from "@supabase/supabase-js";
import { uuid } from "./utils";

export const BUCKET = "bukti";
export const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"] as const;
export const ACCEPT = "image/jpeg,image/png,application/pdf";
/** Umur signed URL untuk melihat atau mengunduh bukti (detik). */
export const SIGNED_URL_TTL = 120;

export function validateFile(file: File, maxMb: number): string | null {
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    return `"${file.name}" tidak didukung. Gunakan berkas JPG, PNG, atau PDF.`;
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `"${file.name}" berukuran ${(file.size / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB, melebihi batas ${maxMb} MB. Perkecil ukuran foto atau pindai ulang.`;
  }
  if (file.size === 0) return `"${file.name}" kosong.`;
  return null;
}

function safeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "berkas";
  return ext ? `${base}.${ext}` : base;
}

/**
 * Mengunggah satu berkas ke bucket privat lalu mencatat metadatanya.
 * Jalur berkas selalu diawali ID organisasi; policy Storage menolak jalur lain.
 */
export async function uploadAttachment(
  supabase: SupabaseClient,
  opts: { orgId: string; kind: "bukti" | "dokumen"; entryId?: string | null; programId?: string | null; file: File; title?: string | null; replacesId?: string | null },
): Promise<{ id?: string; error?: { message: string; hint?: string | null } }> {
  const folder = opts.kind === "bukti" ? `bukti/${opts.entryId}` : "dokumen";
  const path = `${opts.orgId}/${folder}/${uuid()}-${safeName(opts.file.name)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, opts.file, { contentType: opts.file.type, upsert: false, cacheControl: "0" });
  if (up.error) {
    const m = up.error.message || "";
    return {
      error: {
        message: /row-level security|unauthorized/i.test(m)
          ? "Anda tidak memiliki hak mengunggah bukti."
          : /exceeded|too large|payload/i.test(m)
            ? `"${opts.file.name}" melebihi batas ukuran penyimpanan.`
            : /mime|not supported/i.test(m)
              ? `Jenis berkas "${opts.file.name}" ditolak penyimpanan. Gunakan JPG, PNG, atau PDF.`
              : `"${opts.file.name}" gagal diunggah. Periksa koneksi lalu coba lagi.`,
      },
    };
  }
  const reg = await supabase.rpc("register_attachment", {
    p_org: opts.orgId,
    p_entry_id: opts.entryId ?? null,
    p_program_id: opts.programId ?? null,
    p_kind: opts.kind,
    p_title: opts.title ?? null,
    p_storage_path: path,
    p_file_name: opts.file.name,
    p_mime_type: opts.file.type,
    p_size_bytes: opts.file.size,
    p_replaces_id: opts.replacesId ?? null,
  });
  if (reg.error) return { error: reg.error };
  return { id: reg.data as string };
}

export async function signedUrl(supabase: SupabaseClient, path: string, download?: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}
