import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, expectError, post, setupOrg, today, type Org, type TestDb } from "./harness";

let db: TestDb;
let org: Org;
let pembaca: string;
let orangLuar: string;
let penerus: string;
let entryId: string;
const objectPath = () => `${org.id}/bukti/uji-kuitansi.pdf`;

beforeAll(async () => {
  db = await createTestDb();
  org = await setupOrg(db);
  pembaca = await createUser(db, "pembaca@uji.test");
  orangLuar = await createUser(db, "orang.luar@uji.test");
  penerus = await createUser(db, "penerus@uji.test");
  await db.rpc(org.admin, "add_member_by_email", { p_org: org.id, p_email: "pembaca@uji.test", p_full_name: "Pembaca Uji", p_position: "Ketua", p_roles: ["pembaca"] });
  await post(db, org, { kind: "saldo_awal", entry_date: today(), amount: 2_000_000, fund_id: org.umum, account_id: org.kas, description: "Saldo awal" });
  const e = await post(db, org, { kind: "pengeluaran", entry_date: today(), amount: 150_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pengeluaran", "Konsumsi"), description: "Konsumsi rapat" });
  entryId = e.id;
});
afterAll(async () => {
  await db.close();
});

const TABLES = ["organizations", "management_terms", "organization_members", "accounts", "funds", "programs", "categories",
  "budgets", "budget_items", "journal_entries", "journal_lines", "attachments", "import_batches", "reconciliations",
  "closed_periods", "audit_logs", "cash_needs", "notifications", "health_checks", "ref_counters",
  "integration_connections", "payment_requests", "payment_transactions", "webhook_events", "settlements",
  "bank_sync_runs", "bank_statement_entries"];

describe("RLS aktif di seluruh tabel", () => {
  it("semua tabel di schema public mengaktifkan RLS", async () => {
    const rows = await db.sql(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("semua tabel yang diwajibkan tersedia", async () => {
    const rows = (await db.sql(`select tablename from pg_tables where schemaname = 'public'`)).map((r) => r.tablename);
    expect(rows).toEqual(expect.arrayContaining(TABLES));
  });
});

describe("Kriteria penerimaan: pengguna tanpa akses tidak dapat membaca database atau bukti", () => {
  it("pengguna login tanpa keanggotaan melihat nol baris di semua tabel dan tampilan", async () => {
    for (const t of [...TABLES, "v_ledger", "v_open_needs"]) {
      const rows = await db.as(orangLuar, (q) => q(`select count(*)::int as n from public.${t}`));
      expect(rows[0].n, t).toBe(0);
    }
  });

  it("fungsi laporan tidak membocorkan angka kepada pengguna tanpa keanggotaan", async () => {
    const s = await db.as(orangLuar, (q) => q(`select * from public.cash_summary($1, '2000-01-01', $2)`, [org.id, today()]));
    expect(Number(s[0].closing)).toBe(0);
    const l = await db.as(orangLuar, (q) => q(`select * from public.list_transactions(p_org => $1)`, [org.id]));
    expect(l).toHaveLength(0);
    await expectError(db.rpc(orangLuar, "health_status", { p_org: org.id }), /bukan anggota/);
    await expectError(db.rpc(orangLuar, "run_health_checks", { p_org: org.id }), /bukan anggota/);
  });

  it("pengguna tanpa keanggotaan tidak dapat menulis apa pun", async () => {
    await expectError(post(db, org, { kind: "pemasukan", entry_date: today(), amount: 1000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pemasukan", "Iuran"), description: "x" }, orangLuar), /tidak memiliki hak/);
    // Insert yang mengambil sumber dari tabel yang tidak terlihat menyisipkan nol baris.
    await db.as(orangLuar, (q) => q(`insert into public.categories (organization_id, name, kind, account_id) select $1, 'Susupan', 'pemasukan', account_id from public.categories limit 1`, [org.id]));
    expect((await db.sql(`select count(*)::int as n from public.categories where name = 'Susupan'`))[0].n).toBe(0);
    await expectError(db.as(orangLuar, (q) => q(`insert into public.categories (organization_id, name, kind, account_id) values ($1, 'Susupan', 'pemasukan', $2)`, [org.id, org.kas])), /row-level security/);
    await expectError(db.as(orangLuar, (q) => q(`insert into public.cash_needs (organization_id, name, fund_id, kind, amount, due_date) values ($1, 'x', $2, 'rencana', 1, current_date)`, [org.id, org.umum])), /row-level security/);
  });

  it("anon tidak memiliki hak baca maupun eksekusi", async () => {
    await expectError(db.as(null, (q) => q(`select count(*) from public.journal_entries`), "anon"), /permission denied/);
    await expectError(db.as(null, (q) => q(`select public.instance_state()`), "anon"), /permission denied/);
    await expectError(db.as(null, (q) => q(`select * from public.cash_summary($1, '2000-01-01', current_date)`, [org.id]), "anon"), /permission denied/);
  });

  it("bukti di Storage hanya dapat dibaca anggota dan hanya dapat diunggah bendahara", async () => {
    const bucket = (await db.sql(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'bukti'`))[0];
    expect(bucket.public).toBe(false);
    expect(Number(bucket.file_size_limit)).toBe(10 * 1024 * 1024);
    // Pembaca dan orang luar tidak dapat mengunggah.
    await expectError(db.as(pembaca, (q) => q(`insert into storage.objects (bucket_id, name, owner) values ('bukti', $1, $2)`, [objectPath(), pembaca])), /row-level security/);
    await expectError(db.as(orangLuar, (q) => q(`insert into storage.objects (bucket_id, name, owner) values ('bukti', $1, $2)`, [objectPath(), orangLuar])), /row-level security/);
    // Bendahara tidak dapat mengunggah ke folder organisasi lain.
    await expectError(db.as(org.admin, (q) => q(`insert into storage.objects (bucket_id, name, owner) values ('bukti', $1, $2)`, [`00000000-0000-0000-0000-000000000000/bukti/x.pdf`, org.admin])), /row-level security/);
    await db.as(org.admin, (q) => q(`insert into storage.objects (bucket_id, name, owner) values ('bukti', $1, $2)`, [objectPath(), org.admin]));
    // Baca: anggota boleh, orang luar tidak (signed URL memerlukan hak baca ini).
    expect((await db.as(pembaca, (q) => q(`select count(*)::int as n from storage.objects where bucket_id = 'bukti'`)))[0].n).toBe(1);
    expect((await db.as(orangLuar, (q) => q(`select count(*)::int as n from storage.objects where bucket_id = 'bukti'`)))[0].n).toBe(0);
    // Berkas tidak dapat ditimpa atau dihapus pengguna.
    await db.as(org.admin, (q) => q(`delete from storage.objects where bucket_id = 'bukti'`));
    await db.as(org.admin, (q) => q(`update storage.objects set name = name || '.x' where bucket_id = 'bukti'`));
    expect((await db.sql(`select name from storage.objects where bucket_id = 'bukti'`))[0].name).toBe(objectPath());
  });

  it("metadata bukti: unggah, ganti, dan hapus tercatat dengan riwayat dan audit log", async () => {
    const reg = (path: string, replaces: string | null = null, user = org.admin) => db.rpc(user, "register_attachment", {
      p_org: org.id, p_entry_id: entryId, p_program_id: null, p_kind: "bukti", p_title: null, p_storage_path: path,
      p_file_name: "kuitansi.pdf", p_mime_type: "application/pdf", p_size_bytes: 120_000, p_replaces_id: replaces });
    await expectError(reg(objectPath(), null, pembaca), /tidak memiliki hak/);
    await expectError(reg(`${org.id}/bukti/tidak-ada.pdf`), /belum terunggah/);
    await expectError(reg(`lain/${org.id}/x.pdf`), /tidak sesuai dengan organisasi/);
    const a1 = await reg(objectPath());
    expect((await db.sql(`select evidence_status from public.journal_entries where id = $1`, [entryId]))[0].evidence_status).toBe("lengkap");
    // Ukuran di atas batas ditolak.
    await expectError(db.rpc(org.admin, "register_attachment", { p_org: org.id, p_entry_id: entryId, p_program_id: null, p_kind: "bukti", p_title: null, p_storage_path: objectPath(), p_file_name: "besar.pdf", p_mime_type: "application/pdf", p_size_bytes: 11 * 1024 * 1024, p_replaces_id: null }), /melebihi batas 10 MB/);
    // Ganti lampiran: yang lama ditandai diganti, tidak hilang.
    const p2 = `${org.id}/bukti/uji-kuitansi-2.pdf`;
    await db.as(org.admin, (q) => q(`insert into storage.objects (bucket_id, name, owner) values ('bukti', $1, $2)`, [p2, org.admin]));
    const a2 = await db.rpc(org.admin, "register_attachment", { p_org: org.id, p_entry_id: entryId, p_program_id: null, p_kind: "bukti", p_title: null, p_storage_path: p2, p_file_name: "kuitansi-2.pdf", p_mime_type: "application/pdf", p_size_bytes: 90_000, p_replaces_id: a1 });
    const hist = await db.sql(`select id, status, replaces_id from public.attachments where entry_id = $1 order by uploaded_at`, [entryId]);
    expect(hist.find((h) => h.id === a1)!.status).toBe("diganti");
    expect(hist.find((h) => h.id === a2)!.replaces_id).toBe(a1);
    // Menghapus lampiran pada transaksi yang sudah dibukukan memerlukan alasan.
    await expectError(db.rpc(org.admin, "remove_attachment", { p_attachment_id: a2, p_reason: "" }), /Alasan penghapusan/);
    await db.rpc(org.admin, "remove_attachment", { p_attachment_id: a2, p_reason: "Salah berkas" });
    expect((await db.sql(`select evidence_status from public.journal_entries where id = $1`, [entryId]))[0].evidence_status).toBe("belum_ada");
    expect((await db.sql(`select count(*)::int as n from public.attachments where entry_id = $1`, [entryId]))[0].n).toBe(2);
    await db.rpc(org.admin, "set_evidence_status", { p_entry_id: entryId, p_status: "tidak_tersedia", p_reason: "Kuitansi hilang" });
    await expectError(db.rpc(org.admin, "set_evidence_status", { p_entry_id: entryId, p_status: "tidak_tersedia", p_reason: "" }), /Alasan bukti/);
    const actions = (await db.sql(`select action from public.audit_logs where organization_id = $1 and entity_type = 'attachments'`, [org.id])).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["unggah_bukti", "ganti_bukti", "hapus_lampiran"]));
  });
});

describe("Kriteria penerimaan: pembaca tidak dapat mengubah data", () => {
  it("pembaca dapat membaca laporan", async () => {
    const rows = await db.as(pembaca, (q) => q(`select count(*)::int as n from public.journal_entries`));
    expect(rows[0].n).toBeGreaterThan(0);
    const s = await db.as(pembaca, (q) => q(`select * from public.cash_summary($1, '2000-01-01', $2)`, [org.id, today()]));
    expect(Number(s[0].closing)).toBe(1_850_000);
    expect((await db.rpc(pembaca, "health_status", { p_org: org.id })).general).toBeTruthy();
  });

  it("pembaca ditolak pada semua fungsi yang mengubah data", async () => {
    const p = { kind: "pemasukan", entry_date: today(), amount: 1000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pemasukan", "Iuran"), description: "x" };
    const calls: Array<[string, Record<string, unknown>]> = [
      ["save_draft", { p_org: org.id, p_payload: p, p_entry_id: null, p_idempotency_key: null }],
      ["save_and_post", { p_org: org.id, p_payload: p, p_entry_id: null, p_idempotency_key: null }],
      ["post_entry", { p_entry_id: entryId }],
      ["reverse_entry", { p_entry_id: entryId, p_reason: "x", p_date: null, p_create_replacement: false }],
      ["set_evidence_status", { p_entry_id: entryId, p_status: "belum_ada", p_reason: null }],
      ["save_program", { p_org: org.id, p_program_id: null, p_payload: { code: "X1", name: "X" } }],
      ["import_transactions", { p_org: org.id, p_file_name: "a.csv", p_file_hash: "h", p_mapping: {}, p_rows: [{ row_no: 1, hash: "h1", kind: "pemasukan", entry_date: today(), amount: 1 }] }],
      ["start_reconciliation", { p_org: org.id, p_account: org.kas, p_statement_date: today(), p_statement_balance: 0, p_notes: null }],
      ["close_period", { p_org: org.id, p_year: 2025, p_month: 1 }],
      ["reopen_period", { p_org: org.id, p_year: 2025, p_month: 1, p_reason: "x" }],
      ["update_org_settings", { p_org: org.id, p_section: "health", p_value: { target_months: 1 } }],
      ["add_member_by_email", { p_org: org.id, p_email: "orang.luar@uji.test", p_full_name: "X", p_position: null, p_roles: ["admin"] }],
      ["start_new_term", { p_org: org.id, p_name: "Baru", p_start: today(), p_end: null, p_chair: null, p_secretary: null, p_treasurer: null }],
      ["load_demo_data", { p_org: org.id }],
      ["clear_demo_data", { p_org: org.id }],
    ];
    for (const [fn, args] of calls) {
      await expectError(db.rpc(pembaca, fn, args), /tidak memiliki hak/);
    }
    await expectError(db.as(pembaca, (q) => q(`select public.run_scheduled_checks()`)), /permission denied/);
  });

  it("pembaca ditolak pada tulis langsung ke tabel", async () => {
    await expectError(db.as(pembaca, (q) => q(`insert into public.journal_entries (organization_id, kind, flow_class, entry_date, amount) values ($1, 'pemasukan', 'pemasukan', current_date, 1)`, [org.id])), /permission denied/);
    await expectError(db.as(pembaca, (q) => q(`update public.journal_entries set description = 'x'`)), /permission denied/);
    await expectError(db.as(pembaca, (q) => q(`delete from public.journal_lines`)), /permission denied/);
    await expectError(db.as(pembaca, (q) => q(`insert into public.audit_logs (organization_id, action, entity_type, summary) values ($1, 'x', 'x', 'x')`, [org.id])), /permission denied/);
    await expectError(db.as(pembaca, (q) => q(`insert into public.categories (organization_id, name, kind, account_id) values ($1, 'Baru', 'pemasukan', (select account_id from public.categories where kind = 'pemasukan' limit 1))`, [org.id])), /row-level security/);
    await expectError(db.as(pembaca, (q) => q(`insert into public.cash_needs (organization_id, name, fund_id, kind, amount, due_date) values ($1, 'x', $2, 'rencana', 1, current_date)`, [org.id, org.umum])), /row-level security/);
    // Update yang lolos GRANT tetapi tidak lolos RLS mengubah nol baris.
    await db.as(pembaca, (q) => q(`update public.categories set name = name || ' (diubah)'`));
    await db.as(pembaca, (q) => q(`update public.organizations set name = 'Diambil alih'`));
    await db.as(pembaca, (q) => q(`delete from public.accounts`));
    expect((await db.sql(`select count(*)::int as n from public.categories where name like '%(diubah)'`))[0].n).toBe(0);
    expect((await db.sql(`select name from public.organizations where id = $1`, [org.id]))[0].name).toBe("PC IPNU Kabupaten Bekasi");
    expect((await db.sql(`select count(*)::int as n from public.accounts where organization_id = $1`, [org.id]))[0].n).toBeGreaterThan(10);
  });

  it("pengguna tidak dapat menaikkan role sendiri", async () => {
    await expectError(db.as(pembaca, (q) => q(`update public.organization_members set roles = array['admin', 'bendahara']`)), /permission denied/);
    await expectError(db.as(org.admin, (q) => q(`update public.organization_members set roles = array['admin']`)), /permission denied/);
    const me = (await db.sql(`select id from public.organization_members where user_id = $1`, [pembaca]))[0].id;
    await expectError(db.rpc(pembaca, "update_member", { p_member_id: me, p_full_name: "Pembaca", p_position: null, p_roles: ["admin", "bendahara"] }), /tidak memiliki hak/);
    await expectError(db.rpc(orangLuar, "bootstrap_organization", { p_name: "Organisasi Kedua", p_short_name: "OK", p_city: null, p_full_name: "Penyusup", p_position: null, p_term_name: "x", p_term_start: today(), p_term_end: null }), /sudah disiapkan/);
    expect((await db.sql(`select roles from public.organization_members where user_id = $1`, [pembaca]))[0].roles).toEqual(["pembaca"]);
  });

  it("organisasi selalu memiliki minimal satu Admin", async () => {
    const me = (await db.sql(`select id from public.organization_members where user_id = $1`, [org.admin]))[0].id;
    await expectError(db.rpc(org.admin, "update_member", { p_member_id: me, p_full_name: "Bendahara Uji", p_position: null, p_roles: ["bendahara"] }), /minimal satu Admin/);
    await expectError(db.rpc(org.admin, "revoke_member", { p_member_id: me, p_reason: "keluar" }), /minimal satu Admin/);
  });
});

describe("Kriteria penerimaan: pergantian bendahara mempertahankan seluruh arsip", () => {
  it("serah terima memberi akses penerus, mencabut akses lama, dan tidak mengubah satu pun transaksi", async () => {
    const before = await db.sql(`select count(*)::int as entries, (select count(*)::int from public.journal_lines) as lines, (select count(*)::int from public.attachments) as att, (select coalesce(sum(debit), 0)::bigint from public.journal_lines) as total from public.journal_entries`);
    const snapshot = await db.sql(`select id, created_by, posted_by, organization_id, ref_no from public.journal_entries order by id`);
    const newId = await db.rpc(org.admin, "add_member_by_email", { p_org: org.id, p_email: "penerus@uji.test", p_full_name: "Bendahara Penerus", p_position: "Bendahara", p_roles: ["pembaca"] });
    const oldId = (await db.sql(`select id from public.organization_members where user_id = $1`, [org.admin]))[0].id;
    await db.rpc(org.admin, "handover_treasurer", { p_org: org.id, p_new_member_id: newId, p_old_member_id: oldId, p_old_action: "cabut", p_make_admin: true, p_note: "Akhir masa khidmat" });

    const after = await db.sql(`select count(*)::int as entries, (select count(*)::int from public.journal_lines) as lines, (select count(*)::int from public.attachments) as att, (select coalesce(sum(debit), 0)::bigint from public.journal_lines) as total from public.journal_entries`);
    expect(after).toEqual(before);
    expect(await db.sql(`select id, created_by, posted_by, organization_id, ref_no from public.journal_entries order by id`)).toEqual(snapshot);

    // Penerus melihat seluruh arsip dan dapat membukukan.
    const seen = await db.as(penerus, (q) => q(`select count(*)::int as n from public.journal_entries`));
    expect(seen[0].n).toBe(before[0].entries);
    const km = await post(db, org, { kind: "pemasukan", entry_date: today(), amount: 25_000, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pemasukan", "Iuran"), description: "Iuran setelah serah terima" }, penerus);
    expect(km.ref_no).toMatch(/^KM-/);
    // Bendahara lama tidak dapat lagi membaca atau menulis.
    expect((await db.as(org.admin, (q) => q(`select count(*)::int as n from public.journal_entries`)))[0].n).toBe(0);
    await expectError(post(db, org, { kind: "pemasukan", entry_date: today(), amount: 1, fund_id: org.umum, account_id: org.kas, category_id: org.cat("pemasukan", "Iuran"), description: "x" }), /tidak memiliki hak/);
    expect((await db.as(org.admin, (q) => q(`select count(*)::int as n from storage.objects`)))[0].n).toBe(0);
    // Nama pembuat lama tetap tercatat pada transaksi dan audit log.
    const log = await db.sql(`select actor_name from public.audit_logs where organization_id = $1 and action = 'bukukan' order by id limit 1`, [org.id]);
    expect(log[0].actor_name).toBe("Bendahara Uji");
    expect((await db.sql(`select action from public.audit_logs where organization_id = $1 and action = 'serah_terima'`, [org.id]))).toHaveLength(1);
    expect((await db.sql(`select treasurer_name from public.management_terms where organization_id = $1 and status = 'aktif'`, [org.id]))[0].treasurer_name).toBe("Bendahara Penerus");
  });

  it("periode kepengurusan baru mengarsipkan periode lama tanpa menghapus data", async () => {
    const n = (await db.sql(`select count(*)::int as n from public.journal_entries`))[0].n;
    await db.rpc(penerus, "start_new_term", { p_org: org.id, p_name: "Masa Khidmat Berikutnya", p_start: today(), p_end: null, p_chair: "Ketua Baru", p_secretary: null, p_treasurer: "Bendahara Penerus" });
    const terms = await db.sql(`select name, status from public.management_terms where organization_id = $1 order by start_date`, [org.id]);
    expect(terms.map((t) => t.status)).toEqual(["arsip", "aktif"]);
    expect((await db.sql(`select count(*)::int as n from public.journal_entries`))[0].n).toBe(n);
  });
});

describe("Integrasi bank dan QRIS belum aktif", () => {
  it("flag server-side nonaktif secara bawaan dan tabel integrasi menolak tulisan", async () => {
    expect((await db.sql(`select enabled from public.app_feature_flags where key = 'integrasi_bank_qris'`))[0].enabled).toBe(false);
    await expectError(db.sql(`insert into public.integration_connections (organization_id, kind, provider) values ($1, 'bank', 'contoh')`, [org.id]), /belum aktif/);
    await expectError(db.sql(`insert into public.webhook_events (provider, external_event_id) values ('contoh', 'evt-1')`), /belum aktif/);
    await expectError(db.sql(`insert into public.bank_statement_entries (organization_id, account_id, posted_date, amount) values ($1, $2, current_date, 1000)`, [org.id, org.kas]), /belum aktif/);
    await expectError(db.as(penerus, (q) => q(`update public.app_feature_flags set enabled = true`)), /permission denied/);
  });
});
