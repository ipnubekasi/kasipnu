/** Mengubah galat Supabase/PostgREST menjadi pesan yang menjelaskan cara memperbaiki. */
export type FriendlyError = { message: string; hint?: string };

type AnyError = { message?: string; hint?: string | null; code?: string; details?: string | null } | Error | null | undefined;

const BY_CODE: Record<string, FriendlyError> = {
  "42501": { message: "Anda tidak memiliki hak untuk melakukan tindakan ini.", hint: "Minta Admin Organisasi memeriksa role akun Anda." },
  "23505": { message: "Data yang sama sudah ada.", hint: "Periksa kembali kode atau nama yang Anda isi." },
  "23503": { message: "Data ini masih dipakai oleh data lain sehingga tidak dapat dihapus.", hint: "Nonaktifkan data ini sebagai gantinya." },
  "PGRST301": { message: "Sesi Anda sudah berakhir.", hint: "Muat ulang halaman lalu masuk kembali." },
  "28000": { message: "Sesi tidak ditemukan.", hint: "Masuk kembali untuk melanjutkan." },
};

export function friendlyError(error: AnyError): FriendlyError {
  if (!error) return { message: "Terjadi kesalahan yang tidak dikenal.", hint: "Coba lagi beberapa saat lagi." };
  const e = error as { message?: string; hint?: string | null; code?: string };
  const raw = e.message ?? "";
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(raw)) {
    return { message: "Tidak dapat terhubung ke server.", hint: "Periksa koneksi internet, lalu coba lagi. Data yang belum tersimpan tetap ada di formulir." };
  }
  if (/jwt expired|invalid jwt|refresh token/i.test(raw)) return BY_CODE["PGRST301"];
  // Pesan dari fungsi database sudah berbahasa Indonesia dan menjelaskan masalahnya.
  const isOurs = /^[A-ZÀ-Ý][^\n]*[.?!]$/u.test(raw) && !/violates|permission denied|syntax|relation|column|function|operator/i.test(raw);
  if (isOurs) return { message: raw, hint: e.hint ?? undefined };
  if (/row-level security|permission denied/i.test(raw)) return BY_CODE["42501"];
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code];
  return { message: "Permintaan tidak dapat diproses.", hint: raw ? `Rincian teknis: ${raw}` : "Coba lagi. Jika berulang, hubungi Admin Organisasi." };
}
