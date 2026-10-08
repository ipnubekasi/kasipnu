import "server-only";

/**
 * Feature flag server-side integrasi bank dan QRIS. Bawaan NONAKTIF.
 * Aktif hanya bila variabel lingkungan bernilai "true" DAN flag database
 * app_feature_flags.integrasi_bank_qris = true (diubah oleh pengelola sistem).
 */
export function integrationsEnabledByEnv(): boolean {
  return process.env.INTEGRASI_BANK_QRIS_AKTIF === "true";
}
