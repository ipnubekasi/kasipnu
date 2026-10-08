#!/usr/bin/env node
/**
 * Mengunduh seluruh isi bucket "bukti" ke folder lokal, beserta manifest.
 * Pemakaian:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SECRET_KEY=sb_secret_xxx node scripts/backup-storage.mjs ./backup-bukti
 * Secret key hanya dipakai di komputer pengurus yang melakukan backup; jangan dibagikan.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const out = path.resolve(process.argv[2] ?? `backup-bukti-${new Date().toISOString().slice(0, 10)}`);
if (!url || !key) {
  console.error("Isi SUPABASE_URL dan SUPABASE_SECRET_KEY.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function walk(prefix) {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from("bukti").list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data) {
      const p = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await walk(p)));
      else files.push(p);
    }
    if (data.length < 1000) break;
  }
  return files;
}

const files = await walk("");
console.log(`${files.length} berkas ditemukan.`);
const manifest = [];
for (const [i, p] of files.entries()) {
  const { data, error } = await supabase.storage.from("bukti").download(p);
  if (error) {
    console.error(`Gagal: ${p}: ${error.message}`);
    continue;
  }
  const buf = Buffer.from(await data.arrayBuffer());
  const dest = path.join(out, p);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  manifest.push({ path: p, bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex"), type: data.type });
  if ((i + 1) % 25 === 0) console.log(`${i + 1}/${files.length}`);
}
await fs.writeFile(path.join(out, "manifest.json"), JSON.stringify({ created_at: new Date().toISOString(), bucket: "bukti", files: manifest }, null, 2));
console.log(`Selesai. ${manifest.length} berkas disimpan di ${out}`);
