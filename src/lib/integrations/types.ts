/**
 * Kontrak adapter integrasi. Belum ada implementasi penyedia konkret; implementasi
 * dibuat setelah dokumentasi dan akses API bank atau penyedia QRIS tersedia.
 * Struktur ini sengaja tidak terikat pada bank atau penyedia tertentu.
 */

export type Money = { amount: number; currency: "IDR" };

export type BankBalance = { externalAccountId: string; balance: Money; asOf: string };

export type BankStatementLine = {
  externalId: string;
  postedDate: string;
  description: string;
  /** Positif = uang masuk ke rekening, negatif = uang keluar. */
  amount: number;
  balanceAfter?: number;
  raw: unknown;
};

/** Adapter bank: hanya membaca saldo dan mutasi. Tidak ada operasi tulis ke bank. */
export interface BankAdapter {
  readonly provider: string;
  getBalance(connectionId: string): Promise<BankBalance>;
  listStatement(connectionId: string, from: string, to: string, cursor?: string): Promise<{ lines: BankStatementLine[]; nextCursor?: string }>;
}

export type PaymentRequestInput = {
  referenceId: string;
  amount: number;
  purpose: string;
  payerName?: string;
  expiresInMinutes: number;
};

export type PaymentStatus = "menunggu" | "dibayar" | "kedaluwarsa" | "dibatalkan" | "gagal";

export type VerifiedWebhook = {
  eventId: string;
  type: "pembayaran" | "refund" | "pencairan" | "lainnya";
  externalPaymentId?: string;
  externalSettlementId?: string;
  payload: unknown;
};

/**
 * Adapter penyedia pembayaran (QRIS). Tiga hal dipisahkan:
 * 1. Pembayaran berhasil (uang tercatat di saldo penyedia, pemasukan).
 * 2. Dana pada penyedia (akun kas jenis dompet digital/penyedia).
 * 3. Pencairan ke rekening bank, yang dicatat sebagai TRANSFER, bukan pemasukan kedua.
 */
export interface PaymentAdapter {
  readonly provider: string;
  createPaymentRequest(connectionId: string, input: PaymentRequestInput): Promise<{ externalId: string; qrPayload: string; expiresAt: string }>;
  getPaymentStatus(connectionId: string, externalId: string): Promise<{ status: PaymentStatus; paidAt?: string; gross?: number; fee?: number }>;
  /** Wajib memverifikasi tanda tangan; melempar galat bila tidak valid. */
  verifyWebhook(headers: Headers, rawBody: string): Promise<VerifiedWebhook>;
  listSettlements(connectionId: string, from: string, to: string): Promise<{ externalId: string; settledAt: string; gross: number; fee: number; net: number }[]>;
}

export class IntegrationDisabledError extends Error {
  constructor() {
    super("Integrasi bank dan QRIS belum aktif.");
    this.name = "IntegrationDisabledError";
  }
}
