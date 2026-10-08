import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, dateInPastMonth, post, setupOrg, today, type Org, type TestDb } from "./harness";

let db: TestDb;
let org: Org;

const health = async (o: Org, day = today()) => (await db.sql(`select private.compute_health($1, $2::date) as h`, [o.id, day]))[0].h;
const run = async (o: Org, day = today()) => (await db.sql(`select private.run_health($1, 'manual', $2::date) as h`, [o.id, day]))[0].h;
const openNotifs = async (o: Org) => db.sql(`select id, condition_key, severity, reminder_count from public.notifications where organization_id = $1 and kind = 'kondisi' and resolved_at is null order by condition_key`, [o.id]);
const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

/**
 * Organisasi dengan tiga bulan lengkap riwayat: pengeluaran rutin Rp1.000.000 dan
 * pemasukan Rp1.000.000 per bulan (tanpa defisit), sehingga saldo Kas Umum = saldoAwal.
 */
async function orgWithHistory(email: string, saldoAwal = 4_000_000) {
  const o = await setupOrg(db, email);
  await post(db, o, { kind: "saldo_awal", entry_date: dateInPastMonth(4, 1), amount: saldoAwal, fund_id: o.umum, account_id: o.kas, description: "Saldo awal" });
  for (const m of [3, 2, 1]) {
    await post(db, o, { kind: "pemasukan", entry_date: dateInPastMonth(m, 5), amount: 1_000_000, fund_id: o.umum, account_id: o.kas, category_id: o.cat("pemasukan", "Iuran"), description: `Iuran ${m} bulan lalu` });
    await post(db, o, { kind: "pengeluaran", entry_date: dateInPastMonth(m, 10), amount: 1_000_000, fund_id: o.umum, account_id: o.kas, category_id: o.cat("pengeluaran", "Kesekretariatan"), description: `Operasional ${m} bulan lalu` });
  }
  return o;
}

beforeAll(async () => {
  db = await createTestDb();
  // Satu organisasi per instance aplikasi; untuk uji, setiap skenario memakai database yang sama
  // dengan organisasi berbeda yang dibuat langsung agar saling terisolasi.
});
afterAll(async () => {
  await db.close();
});

// bootstrap_organization hanya mengizinkan satu organisasi. Uji memerlukan beberapa
// organisasi terisolasi, jadi data organisasi sebelumnya dibersihkan lewat mode pembersihan uji.
beforeEach(async () => {
  await db.sql(`
    do $$ begin
      perform set_config('kas.purge_demo', 'on', true);
      perform set_config('kas.skip_audit', 'on', true);
      perform set_config('kas.defer_health', 'on', true);
      delete from public.notification_reads; delete from public.notifications; delete from public.health_checks;
      update public.cash_needs set paid_entry_id = null, plan_id = null, status = 'dibatalkan';
      delete from public.cash_needs; delete from public.journal_lines;
      update public.journal_entries set reverses_id = null, reversed_by_id = null, replaces_id = null;
      delete from public.journal_entries; delete from public.ref_counters; delete from public.budget_items; delete from public.budgets;
      delete from public.programs; delete from public.categories; delete from public.funds; delete from public.accounts;
      delete from public.organization_members; delete from public.management_terms;
      alter table public.audit_logs disable trigger audit_logs_no_change;
      delete from public.audit_logs;
      alter table public.audit_logs enable trigger audit_logs_no_change;
      delete from public.organizations; delete from auth.users;
    end $$;`);
});

describe("20.A/B: ketahanan kas dan pemisahan dana", () => {
  it("ketahanan kas = dana umum tersedia dibagi rata-rata pengeluaran rutin tiga bulan lengkap terakhir", async () => {
    org = await orgWithHistory("a@uji.test", 2_400_000);
    const h = await health(org);
    expect(h.general.cash_balance).toBe(2_400_000);
    expect(h.general.avg_basis).toBe("riwayat");
    expect(h.general.avg_monthly).toBe(1_000_000);
    expect(h.general.runway_months).toBe(2.4);
    expect(h.general.status).toBe("perlu_perhatian");
    expect(h.general.target_additional).toBe(600_000);
    expect(h.general.recommendation).toContain("Kas operasional cukup untuk sekitar 2,4 bulan");
    expect(h.general.recommendation).toContain("Rp600.000");
    expect(h.general.actions).toContain("Menagih iuran yang belum diterima");
  });

  it("setiap angka indikator dapat ditelusuri ke data sumber", async () => {
    org = await orgWithHistory("b@uji.test");
    const h = await health(org);
    for (const m of h.general.months_used) {
      const rows = await db.sql(
        `select coalesce(sum(e.amount), 0)::bigint as v from public.journal_entries e join public.categories c on c.id = e.category_id
         where e.organization_id = $1 and e.fund_id = $2 and e.kind = 'pengeluaran' and e.status = 'dibukukan' and c.is_routine and not e.is_one_off
           and date_trunc('month', e.entry_date) = $3::date`, [org.id, org.umum, m.month]);
      expect(Number(rows[0].v)).toBe(m.amount);
    }
    const total = h.general.months_used.reduce((t: number, m: any) => t + m.amount, 0);
    expect(Math.round(total / 3)).toBe(h.general.avg_monthly);
    const ledger = await db.sql(`select coalesce(sum(l.debit - l.credit), 0)::bigint as v from public.journal_lines l join public.accounts a on a.id = l.account_id where l.fund_id = $1 and a.is_cash`, [org.umum]);
    expect(Number(ledger[0].v)).toBe(h.general.cash_balance);
    expect(h.general.available).toBe(h.general.cash_balance - h.general.open_obligations);
    expect(h.rule_version).toBe(1);
  });

  it("dana program terikat tidak meningkatkan ketahanan Kas Umum", async () => {
    org = await orgWithHistory("c@uji.test", 2_000_000);
    const before = await health(org);
    const pid = await db.rpc(org.admin, "save_program", { p_org: org.id, p_program_id: null, p_payload: { code: "BAKSOS", name: "Bakti Sosial", status: "berjalan" } });
    const fund = (await db.sql(`select fund_id from public.programs where id = $1`, [pid]))[0].fund_id;
    await post(db, org, { kind: "pemasukan", entry_date: today(), amount: 50_000_000, fund_id: fund, account_id: org.kas, category_id: org.cat("pemasukan", "Donasi"), description: "Donasi terikat program" });
    const after = await health(org);
    expect(after.general.cash_balance).toBe(before.general.cash_balance);
    expect(after.general.available).toBe(before.general.available);
    expect(after.general.runway_months).toBe(before.general.runway_months);
    expect(after.general.restricted_balance).toBe(50_000_000);
    expect(after.general.status).toBe(before.general.status);
  });

  it("transfer internal dan saldo awal tidak dianggap pemasukan eksternal", async () => {
    org = await orgWithHistory("d@uji.test");
    const bank = (await db.sql(`select id from public.accounts where organization_id = $1 and code = '1-1200'`, [org.id]))[0].id;
    const pid = await db.rpc(org.admin, "save_program", { p_org: org.id, p_program_id: null, p_payload: { code: "RAKER", name: "Rapat Kerja", status: "berjalan" } });
    const fund = (await db.sql(`select fund_id from public.programs where id = $1`, [pid]))[0].fund_id;
    const flowNow = async () => (await health(org)).general.flow.at(-1);
    const f0 = await flowNow();
    await post(db, org, { kind: "transfer", entry_date: today(), amount: 500_000, fund_id: org.umum, account_id: org.kas, to_fund_id: org.umum, to_account_id: bank, description: "Setor ke bank" });
    await post(db, org, { kind: "transfer", entry_date: today(), amount: 300_000, fund_id: org.umum, account_id: org.kas, to_fund_id: fund, to_account_id: org.kas, description: "Alokasi program" });
    await post(db, org, { kind: "transfer", entry_date: today(), amount: 100_000, fund_id: fund, account_id: org.kas, to_fund_id: org.umum, to_account_id: org.kas, description: "Pengembalian sisa dana" });
    await post(db, org, { kind: "saldo_awal", entry_date: today(), amount: 250_000, fund_id: org.umum, account_id: bank, description: "Saldo awal rekening baru" });
    const f1 = await flowNow();
    expect(f1.income).toBe(f0.income);
    expect(f1.expense).toBe(f0.expense);
    // Pengeluaran program dan pengeluaran sekali terjadi tidak mengaburkan kebutuhan rutin.
    const avg0 = (await health(org)).general.avg_monthly;
    await post(db, org, { kind: "pengeluaran", entry_date: dateInPastMonth(1, 20), amount: 9_000_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "Perlengkapan"), description: "Beli proyektor", is_one_off: true });
    await post(db, org, { kind: "pengeluaran", entry_date: dateInPastMonth(1, 21), amount: 150_000, fund_id: fund, account_id: org.kas, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Konsumsi program" });
    await post(db, org, { kind: "pengeluaran", entry_date: dateInPastMonth(1, 22), amount: 700_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "Sosial"), description: "Santunan (kategori tidak rutin)" });
    expect((await health(org)).general.avg_monthly).toBe(avg0);
  });

  it("kewajiban yang sudah dibayar tidak dikurangi lagi, dan rencana yang sudah menjadi kewajiban tidak dihitung ganda", async () => {
    org = await orgWithHistory("e@uji.test", 3_000_000);
    const plan = (await db.as(org.admin, (q) => q(`insert into public.cash_needs (organization_id, name, fund_id, kind, amount, due_date) values ($1, 'Sewa sekretariat', $2, 'rencana', 600000, $3) returning id`, [org.id, org.umum, addDays(today(), 10)])))[0].id;
    let h = await health(org);
    expect(h.general.needs30.plans).toBe(600_000);
    expect(h.general.open_obligations).toBe(0);
    expect(h.general.available).toBe(3_000_000);

    // Rencana yang sama menjadi kewajiban: hanya dihitung satu kali.
    const need = (await db.as(org.admin, (q) => q(`insert into public.cash_needs (organization_id, name, fund_id, kind, amount, due_date, plan_id) values ($1, 'Tagihan sewa sekretariat', $2, 'kewajiban', 600000, $3, $4) returning id`, [org.id, org.umum, addDays(today(), 10), plan])))[0].id;
    h = await health(org);
    expect(h.general.needs30.total).toBe(600_000);
    expect(h.general.needs30.obligations).toBe(600_000);
    expect(h.general.needs30.plans).toBe(0);
    expect(h.general.open_obligations).toBe(600_000);
    expect(h.general.available).toBe(2_400_000);

    // Dibayar: kas berkurang oleh pengeluaran yang dibukukan, kewajiban tidak dikurangi lagi.
    await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 600_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "Sewa tempat"), description: "Bayar sewa sekretariat", need_id: need });
    h = await health(org);
    expect((await db.sql(`select status, paid_entry_id is not null as linked from public.cash_needs where id = $1`, [need]))[0]).toEqual({ status: "dibayar", linked: true });
    expect(h.general.cash_balance).toBe(2_400_000);
    expect(h.general.open_obligations).toBe(0);
    expect(h.general.available).toBe(2_400_000);
    expect(h.general.needs30.total).toBe(0);

    // Pembayaran dibalik: kewajiban terbuka kembali, tetap tanpa penghitungan ganda.
    const pay = (await db.sql(`select paid_entry_id from public.cash_needs where id = $1`, [need]))[0].paid_entry_id;
    await db.rpc(org.admin, "reverse_entry", { p_entry_id: pay, p_reason: "Salah bayar", p_date: null, p_create_replacement: false });
    h = await health(org);
    expect(h.general.cash_balance).toBe(3_000_000);
    expect(h.general.open_obligations).toBe(600_000);
    expect(h.general.available).toBe(2_400_000);
  });

  it("pemasukan yang baru direncanakan tidak dihitung sebagai kas tersedia, hanya sebagai skenario terpisah", async () => {
    org = await orgWithHistory("f@uji.test", 2_400_000);
    await db.as(org.admin, (q) => q(`insert into public.cash_needs (organization_id, name, fund_id, kind, direction, amount, due_date) values
      ($1, 'Kegiatan Harlah', $2, 'kewajiban', 'keluar', 3100000, $3), ($1, 'Iuran PAC', $2, 'rencana', 'masuk', 500000, $3)`, [org.id, org.umum, addDays(today(), 20)]));
    const h = await health(org);
    expect(h.general.cash_balance).toBe(2_400_000);
    expect(h.general.needs30.total).toBe(3_100_000);
    expect(h.general.needs30.shortfall).toBe(700_000);
    expect(h.general.needs30.planned_income).toBe(500_000);
    expect(h.general.needs30.shortfall_if_income).toBe(200_000);
    expect(h.general.status).toBe("kritis");
    const alert = h.alerts.find((a: any) => a.key === "kebutuhan_30:umum");
    expect(alert.body).toBe("Saldo Kas Umum Rp2.400.000, sedangkan kebutuhan 30 hari mendatang Rp3.100.000. Kekurangan Rp700.000.");
    expect(alert.action_label).toBe("Lihat Kebutuhan");
  });
});

describe("20.C: status", () => {
  it("riwayat tidak cukup menghasilkan status Data Belum Cukup, bukan Aman", async () => {
    org = await setupOrg(db, "g@uji.test");
    await post(db, org, { kind: "saldo_awal", entry_date: today(), amount: 50_000_000, fund_id: org.umum, account_id: org.kas, description: "Saldo awal besar" });
    const h = await health(org);
    expect(h.general.history_sufficient).toBe(false);
    expect(h.general.runway_months).toBeNull();
    expect(h.general.status).toBe("data_belum_cukup");
    // Estimasi berdasarkan anggaran operasional yang diisi bendahara.
    await db.rpc(org.admin, "update_org_settings", { p_org: org.id, p_section: "health", p_value: { monthly_operational_budget: 10_000_000 } });
    const h2 = await health(org);
    expect(h2.general.avg_basis).toBe("anggaran");
    expect(h2.general.runway_months).toBe(5);
    expect(h2.general.status).toBe("aman");
  });

  it("rata-rata pengeluaran nol tidak menghasilkan ketahanan tak terbatas atau status Aman otomatis", async () => {
    org = await setupOrg(db, "h@uji.test");
    await post(db, org, { kind: "saldo_awal", entry_date: dateInPastMonth(5, 1), amount: 9_000_000, fund_id: org.umum, account_id: org.kas, description: "Saldo awal" });
    const h = await health(org);
    expect(h.general.history_sufficient).toBe(true);
    expect(h.general.avg_monthly).toBeNull();
    expect(h.general.runway_months).toBeNull();
    expect(h.general.status).toBe("data_belum_cukup");
  });

  it("saldo negatif tetap memicu status Kritis walaupun data belum cukup", async () => {
    org = await setupOrg(db, "i@uji.test");
    await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 300_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Pengeluaran sebelum ada saldo" });
    const h = await health(org);
    expect(h.general.cash_balance).toBe(-300_000);
    expect(h.general.runway_months).toBeNull();
    expect(h.general.status).toBe("kritis");
    expect(h.general.reasons[0].code).toBe("saldo_negatif");
  });

  it("ambang dapat dikonfigurasi dan kondisi terburuk yang dipakai", async () => {
    org = await orgWithHistory("j@uji.test", 3_500_000);
    expect((await health(org)).general.status).toBe("aman");
    await db.rpc(org.admin, "update_org_settings", { p_org: org.id, p_section: "health", p_value: { target_months: 6, critical_months: 4 } });
    const h = await health(org);
    expect(h.general.runway_months).toBe(3.5);
    expect(h.general.status).toBe("kritis");
    await db.rpc(org.admin, "update_org_settings", { p_org: org.id, p_section: "health", p_value: { target_months: 3, min_balance: 4_000_000 } });
    const h2 = await health(org);
    expect(h2.general.status).toBe("perlu_perhatian");
    expect(h2.general.reasons.map((r: any) => r.code)).toEqual(["saldo_minimum"]);
  });

  it("defisit dua bulan berturut-turut memicu Perlu Perhatian", async () => {
    org = await setupOrg(db, "k@uji.test");
    await post(db, org, { kind: "saldo_awal", entry_date: dateInPastMonth(5, 1), amount: 30_000_000, fund_id: org.umum, account_id: org.kas, description: "Saldo awal" });
    for (const m of [3, 2, 1]) {
      await post(db, org, { kind: "pengeluaran", entry_date: dateInPastMonth(m, 5), amount: 800_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "Kesekretariatan"), description: "Operasional" });
      await post(db, org, { kind: "pemasukan", entry_date: dateInPastMonth(m, 6), amount: m === 3 ? 900_000 : 500_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pemasukan", "Iuran"), description: "Iuran" });
    }
    const h = await health(org);
    expect(h.general.deficit_streak).toBe(2);
    expect(h.general.runway_months).toBeGreaterThan(3);
    expect(h.general.status).toBe("perlu_perhatian");
    expect(h.alerts.map((a: any) => a.key)).toContain("defisit_beruntun:umum");
  });

  it("program: 80% anggaran Perlu Perhatian, lebih dari 100% Kritis, dana kurang untuk kebutuhan berikutnya", async () => {
    org = await orgWithHistory("l@uji.test", 9_000_000);
    const pid = await db.rpc(org.admin, "save_program", { p_org: org.id, p_program_id: null, p_payload: { code: "MAKESTA", name: "MAKESTA", status: "berjalan" } });
    const fund = (await db.sql(`select fund_id from public.programs where id = $1`, [pid]))[0].fund_id;
    const budget = (await db.sql(`select id from public.budgets where program_id = $1`, [pid]))[0].id;
    await db.as(org.admin, (q) => q(`insert into public.budget_items (organization_id, budget_id, kind, name, amount) values ($1, $2, 'pengeluaran', 'Konsumsi', 1000000)`, [org.id, budget]));
    await post(db, org, { kind: "transfer", entry_date: today(), amount: 1_500_000, fund_id: org.umum, account_id: org.kas, to_fund_id: fund, to_account_id: org.kas, description: "Alokasi" });
    const prog = async () => (await health(org)).programs.find((p: any) => p.program_id === pid);
    await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 700_000, fund_id: fund, account_id: org.kas, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Konsumsi 1" });
    expect((await prog()).status).toBe("aman");
    await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 100_000, fund_id: fund, account_id: org.kas, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Konsumsi 2" });
    let p = await prog();
    expect(p.pct_used).toBe(80);
    expect(p.status).toBe("perlu_perhatian");
    // Sisa anggaran tidak sama dengan uang yang tersedia.
    expect(p.budget_remaining).toBe(200_000);
    expect(p.fund_balance).toBe(700_000);
    await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 300_000, fund_id: fund, account_id: org.kas, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Konsumsi 3" });
    p = await prog();
    expect(p.pct_used).toBe(110);
    expect(p.status).toBe("kritis");
    await db.as(org.admin, (q) => q(`insert into public.cash_needs (organization_id, name, fund_id, kind, amount, due_date) values ($1, 'Pelunasan aula', $2, 'kewajiban', 900000, $3)`, [org.id, fund, addDays(today(), 5)]));
    p = await prog();
    expect(p.shortfall).toBe(500_000);
    const keys = (await health(org)).alerts.map((a: any) => a.key);
    expect(keys).toEqual(expect.arrayContaining([`anggaran:${pid}`, `dana_program:${pid}`]));
    // Kebutuhan program tidak mengurangi dana umum tersedia.
    expect((await health(org)).general.open_obligations).toBe(0);
  });
});

describe("20.E/F: notifikasi", () => {
  it("perubahan tanggal memicu pemeriksaan kebutuhan jatuh tempo", async () => {
    org = await orgWithHistory("m@uji.test", 3_500_000);
    await db.as(org.admin, (q) => q(`insert into public.cash_needs (organization_id, name, fund_id, kind, amount, due_date) values ($1, 'Pembayaran sewa', $2, 'kewajiban', 4000000, $3)`, [org.id, org.umum, addDays(today(), 45)]));
    // Hari ini kebutuhan masih di luar jendela 30 hari.
    const now = await run(org, today());
    expect(now.general.needs30.total).toBe(0);
    expect((await openNotifs(org)).map((n) => n.condition_key)).not.toContain("kebutuhan_30:umum");
    // 20 hari kemudian kebutuhan yang sama masuk jendela, tanpa perubahan data apa pun.
    const later = await run(org, addDays(today(), 20));
    expect(later.general.needs30.total).toBe(4_000_000);
    expect(later.general.needs30.shortfall_obligations).toBe(500_000);
    expect(later.general.status).toBe("kritis");
    expect((await openNotifs(org)).find((n) => n.condition_key === "kebutuhan_30:umum")!.severity).toBe("kritis");
  });

  it("notifikasi tidak berulang untuk kondisi yang sama, naik saat memburuk, dan selesai saat teratasi", async () => {
    org = await orgWithHistory("n@uji.test", 2_400_000);
    await run(org);
    await run(org);
    await run(org);
    let open = await openNotifs(org);
    expect(open.filter((n) => n.condition_key === "ketahanan_kas:umum")).toHaveLength(1);
    expect((await db.sql(`select count(*)::int as n from public.notifications where organization_id = $1 and condition_key = 'ketahanan_kas:umum'`, [org.id]))[0].n).toBe(1);
    const firstId = open.find((n) => n.condition_key === "ketahanan_kas:umum")!.id;
    expect(open.find((n) => n.id === firstId)!.severity).toBe("perlu_perhatian");

    // Status dibaca tidak berarti masalah selesai.
    await db.rpc(org.admin, "mark_notifications_read", { p_org: org.id, p_ids: null });
    expect(await db.as(org.admin, (q) => q(`select public.unread_notification_count($1) as n`, [org.id])).then((r) => r[0].n)).toBe(0);
    expect((await openNotifs(org)).some((n) => n.id === firstId)).toBe(true);

    // Kondisi memburuk (di bawah satu bulan): notifikasi baru dengan urgensi lebih tinggi.
    await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 1_900_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "Kesekretariatan"), description: "Pengeluaran besar" });
    open = await openNotifs(org);
    const second = open.find((n) => n.condition_key === "ketahanan_kas:umum")!;
    expect(second.id).not.toBe(firstId);
    expect(second.severity).toBe("kritis");
    expect(await db.as(org.admin, (q) => q(`select public.unread_notification_count($1) as n`, [org.id])).then((r) => r[0].n)).toBeGreaterThan(0);
    const old = (await db.sql(`select resolved_at, resolved_reason from public.notifications where id = $1`, [firstId]))[0];
    expect(old.resolved_at).not.toBeNull();
    expect(old.resolved_reason).toMatch(/memburuk/);

    // Penyebab teratasi: notifikasi ditandai selesai, riwayat tetap tersimpan.
    await post(db, org, { kind: "pemasukan", entry_date: today(), amount: 20_000_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pemasukan", "Donasi"), description: "Donasi besar" });
    expect((await openNotifs(org)).filter((n) => n.condition_key === "ketahanan_kas:umum")).toHaveLength(0);
    const hist = await db.sql(`select resolved_reason, rule_version from public.notifications where organization_id = $1 and condition_key = 'ketahanan_kas:umum' order by created_at`, [org.id]);
    expect(hist).toHaveLength(2);
    expect(hist[1].resolved_reason).toBe("Kondisi sudah teratasi");
    expect(hist.every((x) => x.rule_version === 1)).toBe(true);
  });

  it("pemeriksaan dihitung ulang setelah pembukuan, pembalikan, perubahan kebutuhan kas, dan perubahan anggaran", async () => {
    org = await orgWithHistory("o@uji.test", 5_000_000);
    await run(org);
    expect(await openNotifs(org)).toHaveLength(0);
    const e = await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 5_300_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "Kesekretariatan"), description: "Melebihi saldo" });
    expect((await openNotifs(org)).map((n) => n.condition_key)).toContain("saldo_negatif:umum");
    await db.rpc(org.admin, "reverse_entry", { p_entry_id: e.id, p_reason: "Salah catat", p_date: null, p_create_replacement: false });
    expect((await openNotifs(org)).map((n) => n.condition_key)).not.toContain("saldo_negatif:umum");
    const need = (await db.as(org.admin, (q) => q(`insert into public.cash_needs (organization_id, name, fund_id, kind, amount, due_date) values ($1, 'Tagihan besar', $2, 'kewajiban', 9000000, $3) returning id`, [org.id, org.umum, addDays(today(), 3)])))[0].id;
    expect((await openNotifs(org)).map((n) => n.condition_key)).toEqual(expect.arrayContaining(["kebutuhan_30:umum", "dana_tersedia_negatif:umum"]));
    await db.as(org.admin, (q) => q(`update public.cash_needs set status = 'dibatalkan' where id = $1`, [need]));
    expect(await openNotifs(org)).toHaveLength(0);
    const pid = await db.rpc(org.admin, "save_program", { p_org: org.id, p_program_id: null, p_payload: { code: "P1", name: "Program Satu", status: "berjalan" } });
    const fund = (await db.sql(`select fund_id from public.programs where id = $1`, [pid]))[0].fund_id;
    const budget = (await db.sql(`select id from public.budgets where program_id = $1`, [pid]))[0].id;
    await post(db, org, { kind: "pemasukan", entry_date: today(), amount: 900_000, fund_id: fund, account_id: org.kas, category_id: org.cat("pemasukan", "Sponsor"), description: "Sponsor" });
    await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 850_000, fund_id: fund, account_id: org.kas, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Konsumsi" });
    expect(await openNotifs(org)).toHaveLength(0);
    const item = (await db.as(org.admin, (q) => q(`insert into public.budget_items (organization_id, budget_id, kind, name, amount) values ($1, $2, 'pengeluaran', 'Konsumsi', 1000000) returning id`, [org.id, budget])))[0].id;
    expect((await openNotifs(org)).map((n) => n.condition_key)).toEqual([`anggaran:${pid}`]);
    await db.as(org.admin, (q) => q(`update public.budget_items set amount = 2000000 where id = $1`, [item]));
    expect(await openNotifs(org)).toHaveLength(0);
  });

  it("bukti yang belum lengkap melewati batas waktu memicu satu notifikasi", async () => {
    org = await orgWithHistory("p@uji.test", 9_000_000);
    await run(org, today());
    expect((await openNotifs(org)).map((n) => n.condition_key)).not.toContain("bukti_terlambat");
    await run(org, addDays(today(), 8));
    await run(org, addDays(today(), 9));
    const n = (await openNotifs(org)).filter((x) => x.condition_key === "bukti_terlambat");
    expect(n).toHaveLength(1);
    for (const e of await db.sql(`select id from public.journal_entries where organization_id = $1 and kind in ('pemasukan', 'pengeluaran')`, [org.id])) {
      await db.rpc(org.admin, "set_evidence_status", { p_entry_id: e.id, p_status: "tidak_tersedia", p_reason: "Kuitansi tidak diberikan" });
    }
    await run(org, addDays(today(), 9));
    expect((await openNotifs(org)).map((x) => x.condition_key)).not.toContain("bukti_terlambat");
  });

  it("pengingat ulang memunculkan kembali notifikasi yang belum selesai tanpa membuat notifikasi baru", async () => {
    org = await orgWithHistory("q@uji.test", 2_400_000);
    await run(org);
    await db.rpc(org.admin, "mark_notifications_read", { p_org: org.id, p_ids: null });
    await db.sql(`update public.notifications set last_notified_at = now() - interval '8 days' where organization_id = $1`, [org.id]);
    await run(org);
    const open = await openNotifs(org);
    expect(open.filter((n) => n.condition_key === "ketahanan_kas:umum")).toHaveLength(1);
    expect(open[0].reminder_count).toBe(1);
    expect(await db.as(org.admin, (q) => q(`select public.unread_notification_count($1) as n`, [org.id])).then((r) => r[0].n)).toBeGreaterThan(0);
  });

  it("pemeriksaan harian berjalan satu kali per tanggal dan melaporkan status penjadwal; ringkasan mingguan dibuat sekali", async () => {
    org = await orgWithHistory("r@uji.test", 9_000_000);
    const a = await db.rpc(org.admin, "ensure_daily_check", { p_org: org.id });
    const b = await db.rpc(org.admin, "ensure_daily_check", { p_org: org.id });
    expect(a.ran).toBe(true);
    expect(b.ran).toBe(false);
    expect(b.scheduler_configured).toBe(false);
    expect((await db.sql(`select count(*)::int as n from public.health_checks where organization_id = $1 and source = 'harian'`, [org.id]))[0].n).toBe(1);
    expect(await db.sql(`select public.run_scheduled_checks() as n`).then((r) => r[0].n)).toBe(1);
    const c = await db.rpc(org.admin, "ensure_daily_check", { p_org: org.id });
    expect(c.scheduler_configured).toBe(true);
    const weekly = await db.sql(`select title, body, kind from public.notifications where organization_id = $1 and condition_key like 'ringkasan_mingguan:%'`, [org.id]);
    expect(weekly).toHaveLength(1);
    expect(weekly[0].kind).toBe("info");
    expect(weekly[0].body).toContain("Status kesehatan: Aman");
  });
});
