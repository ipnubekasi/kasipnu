/**
 * Harness uji database.
 *
 * Menjalankan migration yang sama persis dengan produksi di atas:
 *   - PGlite (PostgreSQL dalam proses, tanpa instalasi), bawaan; atau
 *   - PostgreSQL asli bila TEST_DATABASE_URL diisi (mendukung uji konkurensi).
 *
 * Lingkungan Supabase (schema auth, storage, role authenticated) ditiru oleh
 * tests/db/supabase-stub.sql. Identitas pengguna disimulasikan seperti
 * PostgREST: `set local role authenticated` dan `request.jwt.claims`.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

type Row = Record<string, any>;
type Runner = (sql: string, params?: unknown[]) => Promise<Row[]>;

const root = path.resolve(__dirname, "../..");
const migrationsDir = path.join(root, "supabase/migrations");

export function migrationFiles(): string[] {
  return fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(migrationsDir, f));
}

export type TestDb = {
  kind: "pglite" | "postgres";
  /** Menjalankan SQL sebagai pemilik database (melewati RLS). */
  sql: Runner;
  /** Menjalankan SQL sebagai pengguna login tertentu, di dalam satu transaction. */
  as: <T>(userId: string | null, fn: (q: Runner) => Promise<T>, role?: "authenticated" | "anon") => Promise<T>;
  /** Memanggil fungsi RPC sebagai pengguna. */
  rpc: (userId: string | null, fn: string, args?: Record<string, unknown>) => Promise<any>;
  /** Koneksi tambahan untuk uji konkurensi (hanya PostgreSQL asli). */
  connect?: () => Promise<{ sql: Runner; rpc: TestDb["rpc"]; end: () => Promise<void> }>;
  close: () => Promise<void>;
};

const JSON_PARAMS = new Set(["p_rows", "p_payload", "p_mapping", "p_value"]);

function buildHelpers(run: Runner) {
  const as: TestDb["as"] = async (userId, fn, role = "authenticated") => {
    await run("begin");
    try {
      await run(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify(userId ? { sub: userId, role } : { role }),
      ]);
      await run(`set local role ${role}`);
      const out = await fn(run);
      await run("commit");
      return out;
    } catch (e) {
      await run("rollback");
      throw e;
    }
  };
  const rpc: TestDb["rpc"] = async (userId, fn, args = {}) => {
    const keys = Object.keys(args);
    const call = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`;
    const params = keys.map((k) => {
      const v = (args as any)[k];
      const isJson = JSON_PARAMS.has(k) || (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date));
      return isJson && v !== null ? JSON.stringify(v) : v;
    });
    const rows = await as(userId, (q) => q(call, params));
    return rows[0]?.result;
  };
  return { as, rpc };
}

export async function createTestDb(): Promise<TestDb> {
  const stub = fs.readFileSync(path.join(__dirname, "supabase-stub.sql"), "utf8");
  const files = migrationFiles();
  const url = process.env.TEST_DATABASE_URL;

  if (url) {
    const { Client } = await import("pg");
    const admin = new Client({ connectionString: url });
    await admin.connect();
    const name = `kas_uji_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await admin.query(`create database ${name}`);
    const dbUrl = new URL(url);
    dbUrl.pathname = `/${name}`;
    const open = async () => {
      const c = new Client({ connectionString: dbUrl.toString() });
      await c.connect();
      const run: Runner = async (sql, params) => (await c.query(sql, params as any[])).rows;
      return { c, run };
    };
    const main = await open();
    await main.c.query(stub);
    for (const f of files) await main.c.query(fs.readFileSync(f, "utf8"));
    const extra: Array<{ end: () => Promise<void> }> = [];
    return {
      kind: "postgres",
      sql: main.run,
      ...buildHelpers(main.run),
      connect: async () => {
        const o = await open();
        const h = { sql: o.run, rpc: buildHelpers(o.run).rpc, end: () => o.c.end() };
        extra.push(h);
        return h;
      },
      close: async () => {
        for (const e of extra) await e.end().catch(() => {});
        await main.c.end();
        await admin.query(`drop database if exists ${name} with (force)`);
        await admin.end();
      },
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(stub);
  for (const f of files) await db.exec(fs.readFileSync(f, "utf8"));
  const run: Runner = async (sql, params) => (await db.query(sql, params as any[])).rows as Row[];
  return { kind: "pglite", sql: run, ...buildHelpers(run), close: () => db.close() };
}

/** Membuat pengguna Auth tiruan. */
export async function createUser(db: TestDb, email: string): Promise<string> {
  const rows = await db.sql(`insert into auth.users (email) values ($1) returning id`, [email]);
  return rows[0].id;
}

export type Org = {
  id: string;
  admin: string;
  umum: string;
  kas: string;
  bank: string;
  cat: (kind: "pemasukan" | "pengeluaran", name: string) => string;
};

/** Menyiapkan organisasi baru dengan pengguna pertama sebagai Admin + Bendahara. */
export async function setupOrg(db: TestDb, email = "bendahara@uji.test"): Promise<Org> {
  const admin = await createUser(db, email);
  const id = await db.rpc(admin, "bootstrap_organization", {
    p_name: "PC IPNU Kabupaten Bekasi",
    p_short_name: "PC IPNU Kab. Bekasi",
    p_city: "Bekasi",
    p_full_name: "Bendahara Uji",
    p_position: "Bendahara",
    p_term_name: "Masa Khidmat Uji",
    p_term_start: "2025-01-01",
    p_term_end: null,
  });
  const umum = (await db.sql(`select id from public.funds where organization_id = $1 and kind = 'umum'`, [id]))[0].id;
  const kas = (await db.sql(`select id from public.accounts where organization_id = $1 and code = '1-1100'`, [id]))[0].id;
  const bank = (
    await db.sql(
      `insert into public.accounts (organization_id, code, name, type, is_cash, cash_kind, bank_name)
       values ($1, '1-1200', 'Bank Uji', 'aset', true, 'bank', 'Bank Uji') returning id`,
      [id],
    )
  )[0].id;
  const cats = await db.sql(`select id, kind, name from public.categories where organization_id = $1`, [id]);
  return {
    id,
    admin,
    umum,
    kas,
    bank,
    cat: (kind, name) => {
      const c = cats.find((x) => x.kind === kind && x.name === name);
      if (!c) throw new Error(`Kategori ${kind}/${name} tidak ada`);
      return c.id;
    },
  };
}

export function today(offsetDays = 0): string {
  const now = new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return now.toISOString().slice(0, 10);
}

/** Tanggal pada bulan lengkap sebelumnya: monthsAgo = 1 berarti bulan lalu. */
export function dateInPastMonth(monthsAgo: number, day = 10): string {
  const t = new Date(today() + "T00:00:00Z");
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - monthsAgo, day));
  return d.toISOString().slice(0, 10);
}

export async function post(db: TestDb, org: Org, payload: Record<string, unknown>, user = org.admin, key: string | null = null) {
  return db.rpc(user, "save_and_post", { p_org: org.id, p_payload: payload, p_entry_id: null, p_idempotency_key: key });
}

export async function summary(db: TestDb, org: Org, fund: string | null = null, account: string | null = null, from = "2000-01-01", to = today()) {
  const rows = await db.sql(`select * from public.cash_summary($1, $2, $3, $4, $5)`, [org.id, from, to, fund, account]);
  const r = rows[0];
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])) as Record<string, number>;
}

export async function expectError(p: Promise<unknown>, pattern: RegExp | string) {
  let err: any = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  if (!err) throw new Error(`Diharapkan gagal dengan ${pattern}, tetapi berhasil`);
  const msg = String(err.message ?? err);
  if (typeof pattern === "string" ? !msg.includes(pattern) : !pattern.test(msg)) {
    throw new Error(`Pesan galat tidak sesuai. Diharapkan ${pattern}, diterima: ${msg}`);
  }
  return err;
}
