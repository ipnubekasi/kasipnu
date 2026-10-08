import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { EntryStatusBadge, EvidenceBadge, KindBadge } from "@/components/app/badges";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { AttachmentManager } from "@/components/transactions/attachment-manager";
import { EntryActions } from "@/components/transactions/entry-actions";
import { getAppContext, getMaster } from "@/lib/context";
import { formatDateLong, formatDateTime } from "@/lib/format";
import { KIND_LABEL } from "@/lib/labels";
import type { Attachment, Entry } from "@/lib/types";
import { param } from "@/lib/utils";

export const metadata: Metadata = { title: "Detail transaksi" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 py-2 text-sm sm:grid-cols-[170px_minmax(0,1fr)]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

export default async function EntryDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await getAppContext();
  const { supabase, org } = ctx;
  const back = param(sp.kembali)?.startsWith("/") ? param(sp.kembali)! : "/kas";

  const { data: entryData } = await supabase.from("journal_entries").select("*").eq("id", id).maybeSingle();
  if (!entryData) notFound();
  const entry = entryData as Entry;
  const master = await getMaster();

  const relatedIds = [entry.reverses_id, entry.reversed_by_id, entry.replaces_id].filter(Boolean) as string[];
  const [linesRes, attRes, membersRes, relatedRes, replacedByRes, logsRes, needRes] = await Promise.all([
    supabase.from("journal_lines").select("id, line_no, account_id, fund_id, debit, credit, memo").eq("entry_id", id).order("line_no"),
    supabase.from("attachments").select("*").eq("entry_id", id).order("uploaded_at"),
    supabase.from("organization_members").select("user_id, full_name").eq("organization_id", org.id),
    relatedIds.length ? supabase.from("journal_entries").select("id, ref_no, status, kind").in("id", relatedIds) : Promise.resolve({ data: [] }),
    supabase.from("journal_entries").select("id, ref_no, status").eq("replaces_id", id),
    supabase.from("audit_logs").select("id, action, actor_name, summary, created_at").eq("organization_id", org.id).eq("entity_type", "journal_entries").eq("entity_id", id).order("created_at"),
    supabase.from("cash_needs").select("id, name").eq("paid_entry_id", id),
  ]);

  const lines = linesRes.data ?? [];
  const attachments = (attRes.data ?? []) as Attachment[];
  const who = (uid: string | null) => (membersRes.data ?? []).find((m) => m.user_id === uid)?.full_name ?? "Pengguna";
  const rel = (rid: string | null) => (relatedRes.data ?? []).find((r) => r.id === rid);
  const acc = (aid: string | null) => master.accounts.find((a) => a.id === aid);
  const fund = (fid: string | null) => master.funds.find((f) => f.id === fid);
  const category = master.categories.find((c) => c.id === entry.category_id);
  const isTransfer = entry.kind === "transfer" || (entry.kind === "pembalikan" && entry.to_fund_id);
  const totalDebit = lines.reduce((t, l) => t + Number(l.debit), 0);
  const totalCredit = lines.reduce((t, l) => t + Number(l.credit), 0);
  const needsEvidence = entry.kind === "pemasukan" || entry.kind === "pengeluaran" || entry.kind === "transfer";

  return (
    <>
      <PageHeader
        title={entry.ref_no ?? "Draft transaksi"}
        back={{ href: back, label: "Kembali ke daftar" }}
        actions={ctx.canWrite ? <EntryActions entry={entry} backHref={back} /> : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={entry.kind} />
          <EntryStatusBadge status={entry.status} />
          {(entry.kind === "pemasukan" || entry.kind === "pengeluaran") && <EvidenceBadge status={entry.evidence_status} count={attachments.filter((a) => a.status === "aktif").length} />}
          {entry.is_noncash && <Badge tone="outline">Nonkas</Badge>}
        </div>
      </PageHeader>

      <div className="mb-4 space-y-3">
        {entry.status === "draft" && (
          <Alert tone="warn" title="Draft belum memengaruhi saldo atau laporan">
            Periksa isiannya, lalu tekan Bukukan. Nomor referensi diberikan saat dibukukan.
          </Alert>
        )}
        {entry.status === "dibalik" && (
          <Alert tone="info" title={`Transaksi ini sudah dibalik oleh ${who(entry.reversed_by)} pada ${formatDateTime(entry.reversed_at)}`}>
            Alasan: {entry.reversal_reason}.{" "}
            {rel(entry.reversed_by_id) && <Link className="font-medium text-accent underline underline-offset-2" href={`/kas/${entry.reversed_by_id}`}>Lihat jurnal pembalikan {rel(entry.reversed_by_id)!.ref_no}</Link>}
            {(replacedByRes.data ?? []).map((r) => (
              <span key={r.id}>{" · "}<Link className="font-medium text-accent underline underline-offset-2" href={`/kas/${r.id}`}>Transaksi pengganti {r.ref_no ?? "(draft)"}</Link></span>
            ))}
          </Alert>
        )}
        {entry.kind === "pembalikan" && rel(entry.reverses_id) && (
          <Alert tone="info" title="Jurnal pembalikan">
            Jurnal ini membatalkan <Link className="font-medium text-accent underline underline-offset-2" href={`/kas/${entry.reverses_id}`}>{rel(entry.reverses_id)!.ref_no}</Link>. Keduanya tetap tersimpan sebagai riwayat.
          </Alert>
        )}
        {entry.replaces_id && rel(entry.replaces_id) && entry.status !== "draft" && (
          <Alert tone="info">Transaksi ini menggantikan <Link className="font-medium text-accent underline underline-offset-2" href={`/kas/${entry.replaces_id}`}>{rel(entry.replaces_id)!.ref_no}</Link> yang sudah dibalik.</Alert>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card>
            <CardContent>
              <p className="text-[13px] text-muted">{KIND_LABEL[entry.kind]} · {formatDateLong(entry.entry_date)}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                <Money value={entry.amount} tone={entry.status !== "dibukukan" ? "muted" : entry.kind === "pemasukan" || entry.kind === "saldo_awal" ? "in" : entry.kind === "pengeluaran" ? "out" : undefined} />
              </p>
              <p className="mt-2 text-[15px] text-ink">{entry.description || <span className="text-faint">(tanpa uraian)</span>}</p>
              <dl className="mt-4 divide-y divide-line border-t border-line">
                {isTransfer ? (
                  <>
                    <Row label="Dana">{fund(entry.fund_id)?.name ?? "-"}{entry.to_fund_id !== entry.fund_id && <> → {fund(entry.to_fund_id)?.name}</>}</Row>
                    <Row label="Rekening">{acc(entry.account_id)?.name ?? "-"}{entry.to_account_id !== entry.account_id ? <> → {acc(entry.to_account_id)?.name}</> : <span className="text-muted"> (uang tidak berpindah rekening)</span>}</Row>
                  </>
                ) : entry.kind !== "penyesuaian" ? (
                  <>
                    <Row label="Dana/program">{fund(entry.fund_id)?.name ?? <span className="text-warn">Belum dipilih</span>}</Row>
                    <Row label={entry.kind === "pengeluaran" ? "Dibayar dari" : "Diterima di"}>{acc(entry.account_id)?.name ?? <span className="text-warn">Belum dipilih</span>}</Row>
                    {(entry.kind === "pemasukan" || entry.kind === "pengeluaran" || entry.category_id) && <Row label="Kategori">{category?.name ?? <span className="text-warn">Belum dipilih</span>}</Row>}
                    {entry.counterparty && <Row label={entry.kind === "pengeluaran" ? "Penerima" : "Pemberi"}>{entry.counterparty}</Row>}
                  </>
                ) : null}
                {entry.is_one_off && <Row label="Sifat">Pengeluaran besar sekali terjadi (tidak dihitung sebagai biaya rutin)</Row>}
                {(needRes.data ?? []).map((n) => <Row key={n.id} label="Kebutuhan kas">Pembayaran untuk <Link href="/kesehatan?tab=kebutuhan" className="text-accent underline underline-offset-2">{n.name}</Link></Row>)}
                {entry.notes && <Row label="Catatan"><span className="whitespace-pre-wrap">{entry.notes}</span></Row>}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Jurnal</CardTitle>
              {lines.length > 0 && <span className="text-[13px] text-muted">Dibuat otomatis saat dibukukan</span>}
            </CardHeader>
            {lines.length === 0 ? (
              <CardContent className="text-sm text-muted">Jurnal debit dan kredit dibuat saat transaksi ini dibukukan. Draft tidak memiliki jurnal.</CardContent>
            ) : (
              <Table>
                <THead>
                  <TR className="hover:bg-transparent"><TH>Akun</TH><TH>Dana</TH><TH className="text-right">Debit</TH><TH className="text-right">Kredit</TH></TR>
                </THead>
                <TBody>
                  {lines.map((l) => (
                    <TR key={l.id}>
                      <TD className={Number(l.credit) > 0 ? "pl-8 sm:pl-10" : ""}>
                        <span className="tnum text-muted">{acc(l.account_id)?.code}</span> {acc(l.account_id)?.name}
                        {l.memo && <span className="block text-[12px] text-muted">{l.memo}</span>}
                      </TD>
                      <TD className="whitespace-nowrap">{fund(l.fund_id)?.name}</TD>
                      <TD className="num"><Money value={l.debit} dashZero /></TD>
                      <TD className="num"><Money value={l.credit} dashZero /></TD>
                    </TR>
                  ))}
                </TBody>
                <TFoot>
                  <TR className="hover:bg-transparent">
                    <TD colSpan={2}>Jumlah {totalDebit === totalCredit && <Badge tone="ok" className="ml-2">Seimbang</Badge>}</TD>
                    <TD className="num"><Money value={totalDebit} /></TD>
                    <TD className="num"><Money value={totalCredit} /></TD>
                  </TR>
                </TFoot>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Bukti transaksi</CardTitle></CardHeader>
            <CardContent>
              <AttachmentManager
                orgId={org.id}
                entryId={entry.id}
                attachments={attachments}
                canWrite={ctx.canWrite && entry.kind !== "pembalikan"}
                maxMb={org.settings?.attachment?.max_mb ?? 10}
                evidenceStatus={entry.evidence_status}
                evidenceReason={entry.evidence_reason}
                entryPosted={entry.status !== "draft"}
                showEvidenceControl={needsEvidence}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Jejak pencatatan</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ol className="space-y-2.5">
                <li><span className="text-muted">Dibuat oleh</span> {who(entry.created_by)}<span className="block text-[12px] text-muted">{formatDateTime(entry.created_at)}</span></li>
                {entry.posted_at && <li><span className="text-muted">Dibukukan oleh</span> {who(entry.posted_by)}<span className="block text-[12px] text-muted">{formatDateTime(entry.posted_at)}</span></li>}
                {entry.reversed_at && <li><span className="text-muted">Dibalik oleh</span> {who(entry.reversed_by)}<span className="block text-[12px] text-muted">{formatDateTime(entry.reversed_at)}</span></li>}
              </ol>
              {(logsRes.data ?? []).length > 0 && (
                <details className="border-t border-line pt-3">
                  <summary className="text-[13px] text-muted hover:text-ink">Audit log ({logsRes.data!.length})</summary>
                  <ul className="mt-2 space-y-2 text-[13px]">
                    {logsRes.data!.map((l) => (
                      <li key={l.id}>
                        {l.summary}
                        <span className="block text-[12px] text-muted">{l.actor_name} · {formatDateTime(l.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
