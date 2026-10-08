import "server-only";
import { integrationsEnabledByEnv } from "./flags";
import { IntegrationDisabledError, type BankAdapter, type PaymentAdapter } from "./types";

// Belum ada penyedia yang didaftarkan. Tambahkan adapter konkret di sini pada tahap aktivasi.
const BANKS: Record<string, BankAdapter> = {};
const PAYMENTS: Record<string, PaymentAdapter> = {};

export function getBankAdapter(provider: string): BankAdapter {
  if (!integrationsEnabledByEnv()) throw new IntegrationDisabledError();
  const a = BANKS[provider];
  if (!a) throw new Error(`Penyedia bank "${provider}" belum tersedia.`);
  return a;
}

export function getPaymentAdapter(provider: string): PaymentAdapter {
  if (!integrationsEnabledByEnv()) throw new IntegrationDisabledError();
  const a = PAYMENTS[provider];
  if (!a) throw new Error(`Penyedia pembayaran "${provider}" belum tersedia.`);
  return a;
}
