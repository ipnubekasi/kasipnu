#!/usr/bin/env node
/**
 * Mengunggah kembali hasil backup-storage.mjs ke bucket "bukti" pada project Supabase
 * (misalnya project baru hasil pemulihan). Berkas yang sudah ada dilewati.
 * Pemakaian:
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/restore-storage.mjs ./backup-bukti
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const dir = path.resolve(process.argv[2] ?? "");
if (!url || !key || !process.argv[2]) {
  console.error("Pemakaian: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/restore-storage.mjs <folder-backup>");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
let ok = 0, skip = 0, bad = 0;
for (const f of manifest.files) {
  const buf = await fs.readFile(path.join(dir, f.path));
  if (crypto.createHash("sha256").update(buf).digest("hex") !== f.sha256) {
    console.error(`Checksum tidak cocok, dilewati: ${f.path}`);
    bad += 1;
    continue;
  }
  const { error } = await supabase.storage.from("bukti").upload(f.path, buf, { contentType: f.type, upsert: false });
  if (error && /exists|duplicate/i.test(error.message)) skip += 1;
  else if (error) { console.error(`Gagal: ${f.path}: ${error.message}`); bad += 1; }
  else ok += 1;
}
console.log(`Selesai: ${ok} diunggah, ${skip} sudah ada, ${bad} gagal.`);
