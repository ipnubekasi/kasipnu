import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { login, PNG_1PX, rupiah } from "./helpers";

test.describe("Alur utama bendahara", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("mencatat pengeluaran dengan bukti, membukukan, lalu membalik", async ({ page }, info) => {
    const label = `Uji E2E ${info.project.name} ${Date.now()}`;
    await page.goto("/kas");
    const before = rupiah(await page.locator("dl dd").last().innerText());

    await page.goto("/kas/baru");
    await page.getByRole("radio", { name: "Pengeluaran" }).click();
    await page.getByLabel("Nominal").fill("12345");
    await page.getByLabel("Dibayar dari").selectOption({ label: "Kas Tunai" });
    await page.getByLabel("Kategori").selectOption({ label: "Konsumsi" });
    await page.getByLabel("Penerima").fill("Warung Uji");
    await page.getByLabel("Uraian").fill(label);
    await page.locator('input[type="file"][multiple]').setInputFiles({ name: "kuitansi.png", mimeType: "image/png", buffer: PNG_1PX });
    await expect(page.getByText("kuitansi.png")).toBeVisible();
    // Preview dampak ke saldo tampil sebelum dibukukan.
    await expect(page.getByText("Dampak ke saldo")).toBeVisible();
    await page.getByRole("button", { name: "Simpan dan Bukukan" }).filter({ visible: true }).first().click();

    await expect(page).toHaveURL(/\/kas\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^KK-\d{4}-\d{4}$/);
    // Bukti benar-benar tersimpan: tampil di daftar lampiran dan status bukti menjadi Lengkap.
    await expect(page.getByRole("button", { name: "Lihat kuitansi.png" })).toBeVisible();
    await expect(page.getByText("Lengkap").first()).toBeVisible();
    await expect(page.getByText("gagal diunggah")).toHaveCount(0);
    await expect(page.getByText("Seimbang")).toBeVisible();
    // Bukti dibuka lewat signed URL berumur pendek.
    await page.getByRole("button", { name: "Lihat kuitansi.png" }).click();
    await expect(page.getByRole("img", { name: "Bukti kuitansi.png" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/kas");
    const after = rupiah(await page.locator("dl dd").last().innerText());
    expect(after).toBe(before - 12345);

    // Pembalikan menjaga riwayat dan mengembalikan saldo.
    await page.getByRole("link", { name: label }).first().click();
    await page.getByRole("button", { name: "Balik" }).click();
    await page.getByLabel("Alasan pembalikan").fill("Uji pembalikan otomatis");
    await page.getByLabel("Buat transaksi pengganti sebagai draft").uncheck();
    await page.getByRole("button", { name: "Balik transaksi" }).click();
    await expect(page.getByText(/sudah dibalik oleh/)).toBeVisible();
    await page.goto("/kas");
    expect(rupiah(await page.locator("dl dd").last().innerText())).toBe(before);
  });

  test("validasi inline mencegah penyimpanan formulir kosong", async ({ page }) => {
    await page.goto("/kas/baru");
    await page.getByRole("button", { name: "Simpan dan Bukukan" }).filter({ visible: true }).first().click();
    await expect(page.getByText("Nominal harus lebih besar dari nol.")).toBeVisible();
    await expect(page.getByText("Uraian wajib diisi, minimal 3 huruf.")).toBeVisible();
    await expect(page).toHaveURL(/\/kas\/baru/);
  });

  test("ekspor CSV Buku Kas Umum sama dengan angka di layar", async ({ page }) => {
    test.skip(test.info().project.name === "ponsel", "Unduhan diuji di desktop");
    await page.goto("/laporan?jenis=buku-kas&periode=semua");
    const screenClosing = rupiah(await page.locator('[data-label="Saldo akhir"]').innerText());
    const screenIncome = rupiah(await page.locator('[data-label="Pemasukan"]').innerText());
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV" }).click();
    const file = await (await download).path();
    const csv = fs.readFileSync(file!, "utf8");
    const line = (label: string) => csv.split(/\r?\n/).find((l) => l.startsWith(label + ";"))!;
    expect(Number(line("Saldo akhir").split(";")[1])).toBe(screenClosing);
    expect(Number(line("Pemasukan").split(";")[1])).toBe(screenIncome);
    for (const kind of ["PDF", "XLSX"]) {
      const d = page.waitForEvent("download");
      await page.getByRole("button", { name: kind }).click();
      expect((await d).suggestedFilename()).toMatch(new RegExp(`\\.${kind.toLowerCase()}$`));
    }
  });

  test("impor CSV masuk sebagai draft dan impor ulang tidak menggandakan", async ({ page }) => {
    test.skip(test.info().project.name === "ponsel", "Impor diuji di desktop");
    const stamp = Date.now();
    // Nominal unik per putaran agar tidak terdeteksi mirip dengan hasil uji sebelumnya.
    const a = 70000 + (stamp % 9973);
    const b = 20000 + (stamp % 7919);
    const csv = `Tanggal;Jenis;Nominal;Uraian;Kategori;Rekening;Dana\n01/09/2026;Pemasukan;${a};Impor uji ${stamp} A;Donasi;Kas Tunai;Kas Umum\n02/09/2026;Pengeluaran;${b};Impor uji ${stamp} B;Konsumsi;Kas Tunai;Kas Umum\n03/09/2026;Pengeluaran;;Baris rusak;Konsumsi;Kas Tunai;Kas Umum\n`;
    const upload = async () => {
      await page.goto("/kas/impor");
      await page.locator('input[type="file"]').setInputFiles({ name: `impor-${stamp}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
      await page.getByRole("button", { name: "Validasi baris" }).click();
    };
    await upload();
    await expect(page.getByText("2 siap diimpor")).toBeVisible();
    await expect(page.getByText("Nominal kosong atau nol")).toBeVisible();
    await page.getByRole("button", { name: /Impor 2 baris sebagai draft/ }).click();
    await expect(page.getByText("2 transaksi masuk sebagai draft")).toBeVisible();

    await upload();
    await expect(page.getByText("2 sudah pernah diimpor")).toBeVisible();
    await expect(page.getByRole("button", { name: /Impor 0 baris/ })).toBeDisabled();
  });

  test("halaman utama dapat dibuka tanpa galat", async ({ page }) => {
    for (const path of ["/ringkasan", "/kas", "/program", "/jurnal", "/laporan", "/arsip", "/kesehatan", "/notifikasi", "/pengaturan/organisasi"]) {
      await page.goto(path);
      await expect(page.getByText("Halaman tidak dapat dimuat")).toHaveCount(0);
      await expect(page.locator("h1")).toBeVisible();
    }
  });
});

test.describe("Akses Pembaca", () => {
  test.skip(!process.env.E2E_READER_EMAIL, "Isi E2E_READER_EMAIL dan E2E_READER_PASSWORD untuk menjalankan uji ini");
  test("pembaca dapat melihat laporan tetapi tidak dapat mencatat", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_READER_EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_READER_PASSWORD!);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page).toHaveURL(/\/ringkasan/);
    await expect(page.getByRole("link", { name: "Catat Transaksi" })).toHaveCount(0);
    await page.goto("/kas/baru");
    await expect(page.getByText("Role Anda tidak dapat mencatat transaksi")).toBeVisible();
    await page.goto("/laporan?jenis=buku-kas");
    await expect(page.getByRole("button", { name: "PDF" })).toBeVisible();
  });
});
