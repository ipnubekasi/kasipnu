import { defineConfig, devices } from "@playwright/test";

/**
 * Uji alur utama di peramban. Memerlukan aplikasi yang berjalan dan terhubung ke Supabase
 * (lokal atau project uji) serta akun Bendahara dengan data contoh dimuat.
 *   E2E_BASE_URL=http://127.0.0.1:3000 E2E_EMAIL=... E2E_PASSWORD=... npx playwright test
 * Jangan jalankan terhadap database produksi: uji ini membuat transaksi.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "ponsel", use: { ...devices["Pixel 7"] } },
  ],
});
