import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, dateInPastMonth, expectError, post, setupOrg, summary, today, type Org, type TestDb } from "./harness";

let db: TestDb;
let org: Org;
let pembacaAdmin: string;

beforeAll(async () => {
  db = await createTestDb();
  org = await setupOrg(db);
  pembacaAdmin = await createUser(db, "bendahara2@uji.test");
  await db.rpc(org.admin, "add_member_by_email", { p_org: org.id, p_email: "bendahara2@uji.test", p_full_name: "Bendahara Dua", p_position: null, p_roles: ["bendahara"] });
  await post(db, org, { kind: "saldo_awal", entry_date: dateInPastMonth(3, 1), amount: 5_000_000, fund_id: org.umum, account_id: org.bank, description: "Saldo awal bank" });
});
afterAll(async () => {
  await db.close();
});

describe("Kriteria penerimaan: periode tertutup menolak pembukuan baru", () => {
  const closed = dateInPastMonth(2, 15);
  const [y, m] = closed.split("-").map(Number);

  it("periode berjalan belum dapat ditutup; periode dengan draft belum dapat ditutup", async () => {
    const [ty, tm] = today().split("-").map(Number);
    await expectError(db.rpc(org.admin, "close_period", { p_org: org.id, p_year: ty, p_month: tm }), /belum berakhir/);
    const draft = await db.rpc(org.admin, "save_draft", { p_org: org.id, p_payload: { kind: "pengeluaran", entry_date: closed, amount: 10_000, fund_id: org.umum, account_id: org.bank, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Draft lama" }, p_entry_id: null, p_idempotency_key: null });
    await expectError(db.rpc(org.admin, "close_period", { p_org: org.id, p_year: y, p_month: m }), /Masih ada 1 draft/);
    await db.rpc(org.admin, "delete_draft", { p_entry_id: draft });
  });

  it("setelah ditutup, pembukuan bertanggal di periode itu ditolak di database", async () => {
    const inside = await post(db, org, { kind: "pengeluaran", entry_date: closed, amount: 100_000, fund_id: org.umum, account_id: org.bank, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Sebelum ditutup" });
    await db.rpc(org.admin, "close_period", { p_org: org.id, p_year: y, p_month: m });
    await expectError(post(db, org, { kind: "pengeluaran", entry_date: closed, amount: 5_000, fund_id: org.umum, account_id: org.bank, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Susulan" }), /sudah ditutup/);
    await expectError(post(db, org, { kind: "transfer", entry_date: closed, amount: 5_000, fund_id: org.umum, account_id: org.bank, to_fund_id: org.umum, to_account_id: org.kas, description: "Susulan" }), /sudah ditutup/);
    // Draft masih boleh disimpan, tetapi tidak dapat dibukukan.
    const d = await db.rpc(org.admin, "save_draft", { p_org: org.id, p_payload: { kind: "pemasukan", entry_date: closed, amount: 5_000, fund_id: org.umum, account_id: org.bank, category_id: org.cat("pemasukan", "Iuran"), description: "Draft di periode tertutup" }, p_entry_id: null, p_idempotency_key: null });
    await expectError(db.rpc(org.admin, "post_entry", { p_entry_id: d }), /sudah ditutup/);
    const bulk = await db.rpc(org.admin, "post_entries", { p_ids: [d] });
    expect(bulk[0].ok).toBe(false);
    expect(bulk[0].error).toMatch(/sudah ditutup/);
    await db.rpc(org.admin, "delete_draft", { p_entry_id: d });
    // Pembalikan tidak boleh bertanggal di periode tertutup, tetapi boleh bertanggal hari ini.
    await expectError(db.rpc(org.admin, "reverse_entry", { p_entry_id: inside.id, p_reason: "Koreksi", p_date: closed, p_create_replacement: false }), /sudah ditutup/);
    const rev = await db.rpc(org.admin, "reverse_entry", { p_entry_id: inside.id, p_reason: "Koreksi", p_date: null, p_create_replacement: false });
    expect(rev.reversal_ref).toMatch(/^JB-/);
    // Periode lain tetap terbuka.
    const ok = await post(db, org, { kind: "pengeluaran", entry_date: dateInPastMonth(1, 5), amount: 5_000, fund_id: org.umum, account_id: org.bank, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Bulan lalu" });
    expect(ok.ref_no).toMatch(/^KK-/);
  });

  it("pembukaan kembali memerlukan role Admin, alasan, dan tercatat di audit log", async () => {
    await expectError(db.rpc(pembacaAdmin, "reopen_period", { p_org: org.id, p_year: y, p_month: m, p_reason: "Perlu koreksi" }), /tidak memiliki hak/);
    await expectError(db.rpc(org.admin, "reopen_period", { p_org: org.id, p_year: y, p_month: m, p_reason: " " }), /Alasan pembukaan/);
    await db.rpc(org.admin, "reopen_period", { p_org: org.id, p_year: y, p_month: m, p_reason: "Ada kuitansi tertinggal" });
    const row = (await db.sql(`select status, reopen_reason from public.closed_periods where organization_id = $1 and year = $2 and month = $3`, [org.id, y, m]))[0];
    expect(row.status).toBe("dibuka");
    expect(row.reopen_reason).toBe("Ada kuitansi tertinggal");
    const ok = await post(db, org, { kind: "pengeluaran", entry_date: closed, amount: 7_000, fund_id: org.umum, account_id: org.bank, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Kuitansi tertinggal" });
    expect(ok.ref_no).toMatch(/^KK-/);
    const actions = (await db.sql(`select action, details from public.audit_logs where organization_id = $1 and entity_type = 'closed_periods' order by id`, [org.id]));
    expect(actions.map((a) => a.action)).toEqual(["tutup_periode", "buka_periode"]);
    expect(actions[1].details.alasan).toBe("Ada kuitansi tertinggal");
    await db.rpc(org.admin, "close_period", { p_org: org.id, p_year: y, p_month: m });
    await expectError(post(db, org, { kind: "pengeluaran", entry_date: closed, amount: 1, fund_id: org.umum, account_id: org.bank, category_id: org.cat("pengeluaran", "Konsumsi"), description: "x" }), /sudah ditutup/);
  });
});

describe("Kriteria penerimaan: impor ulang tidak menggandakan data", () => {
  const rows = () => [
    { row_no: 2, hash: "hash-a", kind: "pemasukan", entry_date: dateInPastMonth(1, 3), amount: 250_000, fund_id: org.umum, account_id: org.bank, category_id: org.cat("pemasukan", "Iuran"), description: "Iuran PAC A" },
    { row_no: 3, hash: "hash-b", kind: "pengeluaran", entry_date: dateInPastMonth(1, 4), amount: 80_000, fund_id: org.umum, account_id: org.bank, category_id: org.cat("pengeluaran", "Transportasi"), description: "Bensin" },
    { row_no: 4, hash: "hash-c", kind: "pengeluaran", entry_date: dateInPastMonth(1, 4), amount: 80_000, fund_id: org.umum, account_id: org.bank, category_id: org.cat("pengeluaran", "Transportasi"), description: "Bensin" },
  ];

  it("impor masuk sebagai draft dan tidak memengaruhi saldo sampai dibukukan", async () => {
    const before = (await summary(db, org)).closing;
    const res = await db.rpc(org.admin, "import_transactions", { p_org: org.id, p_file_name: "kas-2025.xlsx", p_file_hash: "file-1", p_mapping: { tanggal: "Tanggal" }, p_rows: rows() });
    expect(res).toMatchObject({ total: 3, imported: 3, duplicates: 0 });
    expect((await summary(db, org)).closing).toBe(before);
    const drafts = await db.sql(`select status from public.journal_entries where import_batch_id = $1`, [res.batch_id]);
    expect(drafts.every((d) => d.status === "draft")).toBe(true);
  });

  it("unggahan ulang berkas yang sama tidak menambah satu baris pun", async () => {
    const n = (await db.sql(`select count(*)::int as n from public.journal_entries where organization_id = $1`, [org.id]))[0].n;
    const res = await db.rpc(org.admin, "import_transactions", { p_org: org.id, p_file_name: "kas-2025.xlsx", p_file_hash: "file-1", p_mapping: {}, p_rows: rows() });
    expect(res).toMatchObject({ total: 3, imported: 0, duplicates: 3 });
    expect((await db.sql(`select count(*)::int as n from public.journal_entries where organization_id = $1`, [org.id]))[0].n).toBe(n);
    const check = await db.rpc(org.admin, "check_import_rows", { p_org: org.id, p_rows: [...rows(), { row_no: 9, hash: "hash-baru", kind: "pengeluaran", entry_date: dateInPastMonth(1, 4), amount: 80_000 }] });
    expect(check.filter((c: any) => c.already_imported).map((c: any) => c.row_no)).toEqual([2, 3, 4]);
    // Baris baru dengan tanggal, jenis, dan nominal sama dilaporkan sebagai kemungkinan duplikat.
    expect(check.find((c: any) => c.row_no === 9).similar.length).toBe(2);
  });

  it("draft impor yang tidak valid tidak dibukukan; yang valid dibukukan", async () => {
    const res = await db.rpc(org.admin, "import_transactions", { p_org: org.id, p_file_name: "rusak.csv", p_file_hash: "file-2", p_mapping: {}, p_rows: [
      { row_no: 2, hash: "hash-x", kind: "pengeluaran", entry_date: dateInPastMonth(1, 6), amount: 30_000, fund_id: org.umum, account_id: org.bank, category_id: null, description: "Tanpa kategori" },
      { row_no: 3, hash: "hash-y", kind: "pengeluaran", entry_date: dateInPastMonth(1, 6), amount: 40_000, fund_id: org.umum, account_id: org.bank, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Valid" },
    ] });
    const ids = (await db.sql(`select id from public.journal_entries where import_batch_id = $1 order by amount`, [res.batch_id])).map((r) => r.id);
    const before = (await summary(db, org)).closing;
    const out = await db.rpc(org.admin, "post_entries", { p_ids: ids });
    expect(out.filter((o: any) => o.ok)).toHaveLength(1);
    expect(out.find((o: any) => !o.ok).error).toMatch(/Kategori wajib dipilih/);
    expect((await summary(db, org)).closing).toBe(before - 40_000);
    await expectError(db.rpc(org.admin, "import_transactions", { p_org: org.id, p_file_name: "a.csv", p_file_hash: "f", p_mapping: {}, p_rows: [{ row_no: 2, hash: "h", kind: "saldo", entry_date: today(), amount: 1 }] }), /jenis transaksi tidak valid/);
  });
});

describe("Rekonsiliasi", () => {
  it("selisih tidak pernah disesuaikan otomatis; koreksi dicatat sebagai transaksi eksplisit", async () => {
    const book = (await summary(db, org, null, org.bank)).closing;
    const recon = await db.rpc(org.admin, "start_reconciliation", { p_org: org.id, p_account: org.bank, p_statement_date: today(), p_statement_balance: book - 2_500, p_notes: null });
    await expectError(db.rpc(org.admin, "start_reconciliation", { p_org: org.id, p_account: org.bank, p_statement_date: today(), p_statement_balance: 0, p_notes: null }), /belum selesai/);
    const lines = await db.sql(`select l.id from public.journal_lines l where l.account_id = $1`, [org.bank]);
    const n = await db.rpc(org.admin, "set_reconciled", { p_recon_id: recon, p_line_ids: lines.map((l) => l.id), p_matched: true });
    expect(n).toBe(lines.length);
    await expectError(db.rpc(org.admin, "complete_reconciliation", { p_recon_id: recon, p_notes: null }), /Masih ada selisih Rp2\.500/);
    // Saldo buku tidak berubah oleh proses rekonsiliasi.
    expect((await summary(db, org, null, org.bank)).closing).toBe(book);
    // Koreksi eksplisit: biaya administrasi bank.
    await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 2_500, fund_id: org.umum, account_id: org.bank, category_id: org.cat("pengeluaran", "Selisih kurang kas"), description: "Biaya administrasi bank" });
    const done = await db.rpc(org.admin, "complete_reconciliation", { p_recon_id: recon, p_notes: null });
    expect(done.difference).toBe(0);
    expect(done.book_balance).toBe(book - 2_500);
    await expectError(db.rpc(org.admin, "set_reconciled", { p_recon_id: recon, p_line_ids: lines.map((l) => l.id), p_matched: false }), /sudah selesai/);
    const tasks = (await db.sql(`select public.pending_tasks($1) as t`, [org.id]))[0].t;
    expect(tasks.open_reconciliations).toBe(0);
  });
});

describe("Program, RAB, dan pengembalian sisa dana", () => {
  it("anggaran bukan saldo; sisa anggaran dan sisa dana adalah angka yang berbeda", async () => {
    const pid = await db.rpc(org.admin, "save_program", { p_org: org.id, p_program_id: null, p_payload: { code: "LAKMUD", name: "LAKMUD", status: "berjalan" } });
    const fund = (await db.sql(`select fund_id from public.programs where id = $1`, [pid]))[0].fund_id;
    const budget = (await db.sql(`select id from public.budgets where program_id = $1`, [pid]))[0].id;
    await db.as(org.admin, (q) => q(`insert into public.budget_items (organization_id, budget_id, kind, name, category_id, quantity, unit_price, amount) values ($1, $2, 'pengeluaran', 'Konsumsi', $3, 10, 100000, 1000000)`, [org.id, budget, org.cat("pengeluaran", "Konsumsi")]));
    let ps = (await db.sql(`select * from public.program_summary($1) where program_id = $2`, [org.id, pid]))[0];
    expect(Number(ps.budget_expense)).toBe(1_000_000);
    expect(Number(ps.fund_balance)).toBe(0);

    await post(db, org, { kind: "transfer", entry_date: today(), amount: 600_000, fund_id: org.umum, account_id: org.bank, to_fund_id: fund, to_account_id: org.bank, description: "Alokasi LAKMUD" });
    await post(db, org, { kind: "pemasukan", entry_date: today(), amount: 200_000, fund_id: fund, account_id: org.bank, category_id: org.cat("pemasukan", "Sponsor"), description: "Sponsor LAKMUD" });
    await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 450_000, fund_id: fund, account_id: org.bank, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Konsumsi LAKMUD" });
    ps = (await db.sql(`select * from public.program_summary($1) where program_id = $2`, [org.id, pid]))[0];
    expect(Number(ps.transfer_in)).toBe(600_000);
    expect(Number(ps.income)).toBe(200_000);
    expect(Number(ps.expense)).toBe(450_000);
    expect(Number(ps.fund_balance)).toBe(350_000);
    expect(Number(ps.budget_expense) - Number(ps.expense)).toBe(550_000);

    // Program dengan saldo tidak dapat diarsipkan; sisa dana dikembalikan lewat transfer.
    await expectError(db.rpc(org.admin, "save_program", { p_org: org.id, p_program_id: pid, p_payload: { code: "LAKMUD", name: "LAKMUD", status: "diarsipkan" } }), /masih memiliki saldo dana Rp350\.000/);
    await post(db, org, { kind: "transfer", entry_date: today(), amount: 350_000, fund_id: fund, account_id: org.bank, to_fund_id: org.umum, to_account_id: org.bank, description: "Pengembalian sisa dana LAKMUD" });
    ps = (await db.sql(`select * from public.program_summary($1) where program_id = $2`, [org.id, pid]))[0];
    expect(Number(ps.fund_balance)).toBe(0);
    expect(Number(ps.transfer_out)).toBe(350_000);
    await db.rpc(org.admin, "save_program", { p_org: org.id, p_program_id: pid, p_payload: { code: "LAKMUD", name: "LAKMUD", status: "diarsipkan" } });
    await expectError(post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 1, fund_id: fund, account_id: org.bank, category_id: org.cat("pengeluaran", "Konsumsi"), description: "x" }), /sudah diarsipkan/);
    // Program yang diarsipkan tetap dapat dilihat.
    expect((await db.as(org.admin, (q) => q(`select count(*)::int as n from public.journal_entries where fund_id = $1 or to_fund_id = $1`, [fund])))[0].n).toBe(4);
    await expectError(db.rpc(org.admin, "delete_program", { p_program_id: pid }), /tidak dapat dihapus/);
  });
});

describe("Mode demo memerlukan tindakan eksplisit", () => {
  it("data contoh tidak dapat dimuat pada organisasi yang sudah memiliki transaksi", async () => {
    await expectError(db.rpc(org.admin, "load_demo_data", { p_org: org.id }), /hanya dapat dimuat pada organisasi yang belum memiliki transaksi/);
    await expectError(db.rpc(org.admin, "clear_demo_data", { p_org: org.id }), /tidak dalam mode demo/);
  });
});
