import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb, expectError, post, setupOrg, summary, today, type Org, type TestDb } from "./harness";

let db: TestDb;
let org: Org;
let programFund: string;
let programId: string;

beforeAll(async () => {
  db = await createTestDb();
  org = await setupOrg(db);
});
afterAll(async () => {
  await db.close();
});

const saldo = async (fund: string | null = null, account: string | null = null) => (await summary(db, org, fund, account)).closing;

describe("Kriteria penerimaan: saldo dan arus kas", () => {
  it("saldo awal Rp1.000.000 dan pemasukan Rp500.000 menghasilkan saldo Rp1.500.000", async () => {
    const sa = await post(db, org, { kind: "saldo_awal", entry_date: today(), amount: 1_000_000, fund_id: org.umum, account_id: org.kas, description: "Saldo awal kas" });
    expect(sa.ref_no).toMatch(/^SA-\d{4}-0001$/);
    const km = await post(db, org, { kind: "pemasukan", entry_date: today(), amount: 500_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pemasukan", "Iuran"), description: "Iuran PAC" });
    expect(km.ref_no).toMatch(/^KM-\d{4}-0001$/);
    expect(await saldo()).toBe(1_500_000);
    const s = await summary(db, org, org.umum);
    // Saldo awal bukan pemasukan periode berjalan.
    expect(s.opening_entries).toBe(1_000_000);
    expect(s.income).toBe(500_000);
  });

  it("pengeluaran Rp200.000 menghasilkan saldo Rp1.300.000", async () => {
    const kk = await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 200_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "ATK dan cetak"), description: "Beli ATK" });
    expect(kk.ref_no).toMatch(/^KK-\d{4}-0001$/);
    expect(await saldo()).toBe(1_300_000);
  });

  it("transfer Rp300.000 dari kas umum ke dana program: dana umum turun, dana program naik, gabungan tetap Rp1.300.000", async () => {
    programId = await db.rpc(org.admin, "save_program", { p_org: org.id, p_program_id: null, p_payload: { code: "MAKESTA", name: "MAKESTA", status: "berjalan" } });
    programFund = (await db.sql(`select fund_id from public.programs where id = $1`, [programId]))[0].fund_id;
    const tr = await post(db, org, { kind: "transfer", entry_date: today(), amount: 300_000, fund_id: org.umum, account_id: org.kas, to_fund_id: programFund, to_account_id: org.kas, description: "Alokasi dana MAKESTA" });
    expect(tr.ref_no).toMatch(/^TR-\d{4}-0001$/);
    expect(await saldo(org.umum)).toBe(1_000_000);
    expect(await saldo(programFund)).toBe(300_000);
    expect(await saldo()).toBe(1_300_000);
    // Saldo rekening total tidak berubah oleh transfer antardana.
    expect(await saldo(null, org.kas)).toBe(1_300_000);
    // Pada laporan dana: Transfer Keluar/Masuk, bukan pendapatan atau beban.
    const umum = await summary(db, org, org.umum);
    const prog = await summary(db, org, programFund);
    expect(umum.transfer_out).toBe(300_000);
    expect(umum.income).toBe(500_000);
    expect(umum.expense).toBe(200_000);
    expect(prog.transfer_in).toBe(300_000);
    expect(prog.income).toBe(0);
    // Pada laporan gabungan transfer internal tereliminasi.
    const all = await summary(db, org);
    expect(all.transfer_in).toBe(0);
    expect(all.transfer_out).toBe(0);
  });

  it("pengeluaran program Rp100.000 menghasilkan saldo gabungan Rp1.200.000", async () => {
    await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 100_000, fund_id: programFund, account_id: org.kas, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Konsumsi MAKESTA" });
    expect(await saldo()).toBe(1_200_000);
    expect(await saldo(programFund)).toBe(200_000);
    expect(await saldo(org.umum)).toBe(1_000_000);
  });

  it("transfer antarrekening tidak menambah pemasukan atau beban", async () => {
    const before = await summary(db, org);
    const tbBefore = await db.sql(`select coalesce(sum(t.debit - t.credit), 0)::bigint as v from public.trial_balance($1, '2000-01-01', $2, null) t join public.accounts a on a.id = t.account_id where a.type in ('pendapatan', 'beban')`, [org.id, today()]);
    await post(db, org, { kind: "transfer", entry_date: today(), amount: 400_000, fund_id: org.umum, account_id: org.kas, to_fund_id: org.umum, to_account_id: org.bank, description: "Setor tunai ke bank" });
    const after = await summary(db, org);
    const tbAfter = await db.sql(`select coalesce(sum(t.debit - t.credit), 0)::bigint as v from public.trial_balance($1, '2000-01-01', $2, null) t join public.accounts a on a.id = t.account_id where a.type in ('pendapatan', 'beban')`, [org.id, today()]);
    expect(after.income).toBe(before.income);
    expect(after.expense).toBe(before.expense);
    expect(after.closing).toBe(1_200_000);
    expect(Number(tbAfter[0].v)).toBe(Number(tbBefore[0].v));
    expect(await saldo(null, org.kas)).toBe(800_000);
    expect(await saldo(null, org.bank)).toBe(400_000);
    // Pada lingkup satu rekening transfer tampil sebagai transfer keluar/masuk.
    expect((await summary(db, org, null, org.kas)).transfer_out).toBe(400_000);
    expect((await summary(db, org, null, org.bank)).transfer_in).toBe(400_000);
  });

  it("rumus rekonsiliasi berlaku pada setiap lingkup", async () => {
    for (const [fund, account] of [[null, null], [org.umum, null], [programFund, null], [null, org.kas], [null, org.bank], [org.umum, org.kas]] as const) {
      const s = await summary(db, org, fund, account);
      expect(s.opening_before + s.opening_entries + s.income - s.expense + s.transfer_in - s.transfer_out + s.adjustment).toBe(s.closing);
    }
  });

  it("draft tidak memengaruhi saldo", async () => {
    const id = await db.rpc(org.admin, "save_draft", { p_org: org.id, p_payload: { kind: "pemasukan", entry_date: today(), amount: 9_999_999, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pemasukan", "Donasi"), description: "Draft donasi" }, p_entry_id: null, p_idempotency_key: null });
    expect(await saldo()).toBe(1_200_000);
    const lines = await db.sql(`select count(*)::int as n from public.journal_lines where entry_id = $1`, [id]);
    expect(lines[0].n).toBe(0);
    const row = (await db.sql(`select status, ref_no from public.journal_entries where id = $1`, [id]))[0];
    expect(row.status).toBe("draft");
    expect(row.ref_no).toBeNull();
    // Draft dapat dihapus tanpa jejak di buku besar.
    await db.rpc(org.admin, "delete_draft", { p_entry_id: id });
    expect(await saldo()).toBe(1_200_000);
  });
});

describe("Kriteria penerimaan: integritas jurnal", () => {
  it("setiap jurnal yang dibukukan seimbang, secara total dan per dana", async () => {
    const bad = await db.sql(`select entry_id from public.journal_lines group by entry_id, fund_id having sum(debit) <> sum(credit)`);
    expect(bad).toHaveLength(0);
    const empty = await db.sql(`select e.id from public.journal_entries e where e.status <> 'draft' and (select count(*) from public.journal_lines l where l.entry_id = e.id) < 2`);
    expect(empty).toHaveLength(0);
  });

  it("jurnal penyesuaian yang tidak seimbang ditolak", async () => {
    const beban = (await db.sql(`select id from public.accounts where organization_id = $1 and code = '5-9000'`, [org.id]))[0].id;
    const utang = (await db.sql(`select id from public.accounts where organization_id = $1 and code = '2-1000'`, [org.id]))[0].id;
    await expectError(
      post(db, org, { kind: "penyesuaian", entry_date: today(), description: "Tidak seimbang", lines: [
        { account_id: beban, fund_id: org.umum, debit: 100_000, credit: 0 },
        { account_id: utang, fund_id: org.umum, debit: 0, credit: 90_000 },
      ] }),
      /tidak seimbang/i,
    );
    // Seimbang total tetapi tidak seimbang per dana juga ditolak.
    await expectError(
      post(db, org, { kind: "penyesuaian", entry_date: today(), description: "Beda dana", lines: [
        { account_id: beban, fund_id: org.umum, debit: 100_000, credit: 0 },
        { account_id: utang, fund_id: programFund, debit: 0, credit: 100_000 },
      ] }),
      /tidak seimbang/i,
    );
    // Yang seimbang diterima, bernomor JU, dan ditandai nonkas.
    const ok = await post(db, org, { kind: "penyesuaian", entry_date: today(), description: "Pengakuan utang cetak", lines: [
      { account_id: beban, fund_id: org.umum, debit: 100_000, credit: 0 },
      { account_id: utang, fund_id: org.umum, debit: 0, credit: 100_000 },
    ] });
    expect(ok.ref_no).toMatch(/^JU-/);
    const e = (await db.sql(`select is_noncash from public.journal_entries where id = $1`, [ok.id]))[0];
    expect(e.is_noncash).toBe(true);
    // Jurnal nonkas tidak masuk arus kas.
    expect(await saldo()).toBe(1_200_000);
  });

  it("constraint database menolak baris jurnal tidak seimbang walaupun disisipkan langsung", async () => {
    const e = (await db.sql(`select id from public.journal_entries where organization_id = $1 and kind = 'pemasukan' limit 1`, [org.id]))[0];
    await db.sql("begin");
    let failed = false;
    try {
      await db.sql(`select set_config('kas.posting', 'on', true)`);
      await db.sql(`insert into public.journal_lines (organization_id, entry_id, line_no, account_id, fund_id, debit, credit) values ($1, $2, 99, $3, $4, 5000, 0)`, [org.id, e.id, org.kas, org.umum]);
      await db.sql("commit");
    } catch (err: any) {
      failed = true;
      expect(String(err.message)).toMatch(/tidak seimbang/i);
      await db.sql("rollback");
    }
    expect(failed).toBe(true);
  });

  it("baris jurnal dan transaksi yang dibukukan tidak dapat diubah atau dihapus, bahkan oleh pemilik database", async () => {
    const e = (await db.sql(`select id from public.journal_entries where organization_id = $1 and status = 'dibukukan' limit 1`, [org.id]))[0];
    await expectError(db.sql(`update public.journal_lines set debit = debit + 1 where entry_id = $1 and debit > 0`, [e.id]), /tidak dapat diubah/);
    await expectError(db.sql(`delete from public.journal_lines where entry_id = $1`, [e.id]), /tidak dapat dihapus/);
    await expectError(db.sql(`insert into public.journal_lines (organization_id, entry_id, line_no, account_id, fund_id, debit) values ($1, $2, 50, $3, $4, 1)`, [org.id, e.id, org.kas, org.umum]), /proses pembukuan/);
    await expectError(db.sql(`update public.journal_entries set amount = amount + 1 where id = $1`, [e.id]), /tidak dapat diubah/);
    await expectError(db.sql(`delete from public.journal_entries where id = $1`, [e.id]), /tidak dapat dihapus/);
    await expectError(db.rpc(org.admin, "save_draft", { p_org: org.id, p_payload: { kind: "pemasukan", entry_date: today(), amount: 1 }, p_entry_id: e.id, p_idempotency_key: null }), /tidak dapat diubah/);
  });

  it("nominal nol, negatif, atau pecahan ditolak", async () => {
    for (const amount of [0, -5000, 1000.5]) {
      await expectError(post(db, org, { kind: "pemasukan", entry_date: today(), amount, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pemasukan", "Iuran"), description: "x" }), /Nominal/);
    }
  });

  it("kategori harus sesuai jenis transaksi dan rekening harus akun kas", async () => {
    await expectError(post(db, org, { kind: "pemasukan", entry_date: today(), amount: 1000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "Konsumsi"), description: "x" }), /bukan kategori pemasukan/);
    const beban = (await db.sql(`select id from public.accounts where organization_id = $1 and code = '5-9000'`, [org.id]))[0].id;
    await expectError(post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 1000, fund_id: org.umum, account_id: beban, category_id: org.cat("pengeluaran", "Konsumsi"), description: "x" }), /kas atau rekening/);
    await expectError(post(db, org, { kind: "transfer", entry_date: today(), amount: 1000, fund_id: org.umum, account_id: org.kas, to_fund_id: org.umum, to_account_id: org.kas, description: "x" }), /tidak boleh sama/);
    await expectError(post(db, org, { kind: "pengeluaran", entry_date: today(1), amount: 1000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "Konsumsi"), description: "x" }), /melebihi hari ini/);
  });
});

describe("Kriteria penerimaan: double-submit dan penomoran", () => {
  it("double-submit dengan kunci idempotensi yang sama tidak membuat transaksi ganda", async () => {
    const key = randomUUID();
    const payload = { kind: "pemasukan", entry_date: today(), amount: 50_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pemasukan", "Donasi"), description: "Donasi klik ganda" };
    const a = await post(db, org, payload, org.admin, key);
    const b = await post(db, org, payload, org.admin, key);
    expect(b.id).toBe(a.id);
    expect(b.ref_no).toBe(a.ref_no);
    expect(b.already_posted).toBe(true);
    const n = await db.sql(`select count(*)::int as n from public.journal_entries where organization_id = $1 and idempotency_key = $2`, [org.id, key]);
    expect(n[0].n).toBe(1);
    const lines = await db.sql(`select count(*)::int as n from public.journal_lines where entry_id = $1`, [a.id]);
    expect(lines[0].n).toBe(2);
    expect(await saldo()).toBe(1_250_000);
  });

  it("membukukan ulang transaksi yang sama tidak membuat jurnal kedua", async () => {
    const id = await db.rpc(org.admin, "save_draft", { p_org: org.id, p_payload: { kind: "pengeluaran", entry_date: today(), amount: 50_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "Transportasi"), description: "Transport" }, p_entry_id: null, p_idempotency_key: null });
    const a = await db.rpc(org.admin, "post_entry", { p_entry_id: id });
    const b = await db.rpc(org.admin, "post_entry", { p_entry_id: id });
    expect(b.ref_no).toBe(a.ref_no);
    const lines = await db.sql(`select count(*)::int as n from public.journal_lines where entry_id = $1`, [id]);
    expect(lines[0].n).toBe(2);
    expect(await saldo()).toBe(1_200_000);
  });

  it("nomor referensi unik dan berurutan per awalan dan tahun", async () => {
    const refs = (await db.sql(`select ref_no from public.journal_entries where organization_id = $1 and ref_no is not null`, [org.id])).map((r) => r.ref_no as string);
    expect(new Set(refs).size).toBe(refs.length);
    const km = refs.filter((r) => r.startsWith("KM-")).map((r) => Number(r.split("-")[2])).sort((x, y) => x - y);
    expect(km).toEqual(km.map((_, i) => i + 1));
  });

  it("permintaan bersamaan dengan kunci yang sama menghasilkan satu transaksi, dan penomoran bersamaan tetap unik", async (ctx) => {
    if (!db.connect) return ctx.skip();
    const conns = await Promise.all(Array.from({ length: 6 }, () => db.connect!()));
    const key = randomUUID();
    const payload = { kind: "pemasukan", entry_date: today(), amount: 10_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pemasukan", "Donasi"), description: "Bersamaan" };
    const before = await saldo();
    const same = await Promise.all(conns.map((c) => c.rpc(org.admin, "save_and_post", { p_org: org.id, p_payload: payload, p_entry_id: null, p_idempotency_key: key })));
    expect(new Set(same.map((r) => r.id)).size).toBe(1);
    expect(new Set(same.map((r) => r.ref_no)).size).toBe(1);
    expect(await saldo()).toBe(before + 10_000);
    const many = await Promise.all(conns.map((c) => c.rpc(org.admin, "save_and_post", { p_org: org.id, p_payload: payload, p_entry_id: null, p_idempotency_key: randomUUID() })));
    expect(new Set(many.map((r) => r.ref_no)).size).toBe(conns.length);
    expect(await saldo()).toBe(before + 10_000 * (1 + conns.length));
    // Kembalikan saldo agar uji berikutnya tetap pada angka yang diketahui.
    for (const r of [same[0], ...many]) await db.rpc(org.admin, "reverse_entry", { p_entry_id: r.id, p_reason: "Uji konkurensi", p_date: null, p_create_replacement: false });
    expect(await saldo()).toBe(before);
  });
});

describe("Kriteria penerimaan: pembalikan", () => {
  it("pembalikan menjaga riwayat dan memperbaiki saldo", async () => {
    const before = await summary(db, org, org.umum);
    const wrong = await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 750_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Salah nominal" });
    expect((await summary(db, org, org.umum)).closing).toBe(before.closing - 750_000);
    const rev = await db.rpc(org.admin, "reverse_entry", { p_entry_id: wrong.id, p_reason: "Nominal salah", p_date: null, p_create_replacement: true });
    expect(rev.reversal_ref).toMatch(/^JB-/);
    const after = await summary(db, org, org.umum);
    expect(after.closing).toBe(before.closing);
    // Pembalikan pengeluaran mengurangi pengeluaran, bukan menambah pemasukan.
    expect(after.expense).toBe(before.expense);
    expect(after.income).toBe(before.income);
    const orig = (await db.sql(`select status, reversed_by_id, reversal_reason, ref_no, amount from public.journal_entries where id = $1`, [wrong.id]))[0];
    expect(orig.status).toBe("dibalik");
    expect(orig.reversed_by_id).toBe(rev.reversal_id);
    expect(orig.reversal_reason).toBe("Nominal salah");
    expect(Number(orig.amount)).toBe(750_000);
    // Baris jurnal asal tetap ada, dan pembalikan adalah kebalikan persisnya.
    const lines = await db.sql(`select entry_id, account_id, fund_id, debit, credit from public.journal_lines where entry_id in ($1, $2) order by entry_id, line_no`, [wrong.id, rev.reversal_id]);
    expect(lines).toHaveLength(4);
    const o = lines.filter((l) => l.entry_id === wrong.id);
    const r = lines.filter((l) => l.entry_id === rev.reversal_id);
    o.forEach((l, i) => {
      expect(Number(r[i].debit)).toBe(Number(l.credit));
      expect(Number(r[i].credit)).toBe(Number(l.debit));
      expect(r[i].account_id).toBe(l.account_id);
    });
    // Transaksi pengganti dibuat sebagai draft yang merujuk transaksi asal.
    const repl = (await db.sql(`select status, replaces_id from public.journal_entries where id = $1`, [rev.replacement_id]))[0];
    expect(repl.status).toBe("draft");
    expect(repl.replaces_id).toBe(wrong.id);
    await db.rpc(org.admin, "delete_draft", { p_entry_id: rev.replacement_id });
    // Membalik dua kali tidak membuat jurnal pembalikan kedua.
    const again = await db.rpc(org.admin, "reverse_entry", { p_entry_id: wrong.id, p_reason: "Nominal salah", p_date: null, p_create_replacement: false });
    expect(again.already_reversed).toBe(true);
    expect(again.reversal_id).toBe(rev.reversal_id);
    await expectError(db.rpc(org.admin, "reverse_entry", { p_entry_id: rev.reversal_id, p_reason: "x", p_date: null, p_create_replacement: false }), /tidak dapat dibalik/);
    await expectError(db.rpc(org.admin, "reverse_entry", { p_entry_id: (await post(db, org, { kind: "pemasukan", entry_date: today(), amount: 1, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pemasukan", "Lainnya"), description: "tanpa alasan" })).id, p_reason: "  ", p_date: null, p_create_replacement: false }), /Alasan pembalikan/);
  });

  it("jejak pembuat, pembuku, dan pembalik tersimpan dan tercatat di audit log", async () => {
    const e = (await db.sql(`select created_by, posted_by, reversed_by from public.journal_entries where organization_id = $1 and status = 'dibalik' limit 1`, [org.id]))[0];
    expect(e.created_by).toBe(org.admin);
    expect(e.posted_by).toBe(org.admin);
    expect(e.reversed_by).toBe(org.admin);
    const actions = (await db.sql(`select distinct action from public.audit_logs where organization_id = $1`, [org.id])).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["bukukan", "balik", "hapus_draft", "siapkan_organisasi"]));
    await expectError(db.sql(`update public.audit_logs set summary = 'diubah' where organization_id = $1`, [org.id]), /Audit log tidak dapat diubah/);
    await expectError(db.sql(`delete from public.audit_logs where organization_id = $1`, [org.id]), /Audit log tidak dapat diubah/);
  });
});

describe("Daftar transaksi mengikuti buku besar", () => {
  it("jumlah masuk dan keluar pada daftar sama dengan ringkasan kas pada lingkup yang sama", async () => {
    for (const fund of [null, org.umum, programFund]) {
      const rows = await db.sql(`select * from public.list_transactions(p_org => $1, p_fund => $2, p_statuses => array['dibukukan','dibalik'], p_limit => 1000)`, [org.id, fund]);
      const s = await summary(db, org, fund);
      const sumIn = rows.reduce((t, r) => t + Number(r.cash_in), 0);
      const sumOut = rows.reduce((t, r) => t + Number(r.cash_out), 0);
      expect(sumIn - sumOut).toBe(s.closing);
      expect(Number(rows[0].sum_in) - Number(rows[0].sum_out)).toBe(s.closing);
    }
  });
});
