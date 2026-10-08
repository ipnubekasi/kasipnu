import { expect, type Page } from "@playwright/test";

export const EMAIL = process.env.E2E_EMAIL ?? "bendahara@ipnu-bekasi.test";
export const PASSWORD = process.env.E2E_PASSWORD ?? "KasIpnu#2026";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/ringkasan/);
}

/** Mengambil angka rupiah dari teks seperti "Rp1.250.000" atau "-Rp50.000". */
export function rupiah(text: string): number {
  const neg = text.trim().startsWith("-");
  const n = Number(text.replace(/[^\d]/g, ""));
  return neg ? -n : n;
}

/** PNG 1x1 piksel untuk uji unggah bukti. */
export const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
