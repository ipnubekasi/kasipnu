import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectError, setupOrg, type Org, type TestDb } from "./harness";

let db: TestDb;
let org: Org;

beforeAll(async () => {
  db = await createTestDb();
  org = await setupOrg(db);
});
afterAll(async () => {
  await db.close();
});

describe("Mode demo", () => {
  it("organisasi baru kosong: tidak ada transaksi contoh yang dibuat otomatis", async () => {
    expect((await db.sql(`select count(*)::int as n from public.journal_entries`))[0].n).toBe(0);
    expect((await db.sql(`select count(*)::int as n from public.programs`))[0].n).toBe(0);
  });

  it("memuat data contoh menghasilkan buku besar yang seimbang dan menandai mode demo", async () => {
    await db.rpc(org.admin, "load_demo_data", { p_org: org.id });
    const s = (await db.sql(`select settings from public.organizations where id = $1`, [org.id]))[0].settings;
    expect(s.is_demo).toBe(true);
    expect((await db.sql(`select count(*)::int as n from public.programs`))[0].n).toBe(4);
    expect((await db.sql(`select count(*)::int as n from public.journal_entries where status = 'dibukukan'`))[0].n).toBeGreaterThan(30);
    const bad = await db.sql(`select entry_id from public.journal_lines group by entry_id, fund_id having sum(debit) <> sum(credit)`);
    expect(bad).toHaveLength(0);
    const tb = (await db.sql(`select coalesce(sum(debit), 0)::bigint as d, coalesce(sum(credit), 0)::bigint as c from public.journal_lines`))[0];
    expect(Number(tb.d)).toBe(Number(tb.c));
    const h = await db.rpc(org.admin, "health_status", { p_org: org.id });
    expect(["aman", "perlu_perhatian", "kritis"]).toContain(h.general.status);
    await expectError(db.rpc(org.admin, "load_demo_data", { p_org: org.id }), /hanya dapat dimuat/);
  });

  it("menghapus data contoh mengembalikan organisasi ke keadaan kosong tanpa menghapus audit log", async () => {
    await db.rpc(org.admin, "clear_demo_data", { p_org: org.id });
    for (const t of ["journal_entries", "journal_lines", "programs", "budget_items", "cash_needs", "notifications"]) {
      expect((await db.sql(`select count(*)::int as n from public.${t}`))[0].n, t).toBe(0);
    }
    expect((await db.sql(`select count(*)::int as n from public.funds`))[0].n).toBe(1);
    expect((await db.sql(`select settings from public.organizations where id = $1`, [org.id]))[0].settings.is_demo).toBeUndefined();
    const actions = (await db.sql(`select action from public.audit_logs where organization_id = $1`, [org.id])).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["muat_data_contoh", "hapus_data_contoh"]));
    await expectError(db.rpc(org.admin, "clear_demo_data", { p_org: org.id }), /tidak dalam mode demo/);
  });
});
