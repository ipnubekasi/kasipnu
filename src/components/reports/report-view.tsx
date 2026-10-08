"use client";

import * as React from "react";
import Link from "next/link";
import { FileSpreadsheet, FileText, Table2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { formatDate, formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import { downloadBlob, toCsv, toPdf, toXlsx } from "@/lib/reports/export";
import type { Cell, Col, ReportData, Row } from "@/lib/reports/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function screenCell(col: Col, v: Cell): React.ReactNode {
  if (v === null || v === undefined || v === "") return col.type === "money" ? <span className="text-faint">-</span> : "";
  switch (col.type) {
    case "money":
      return <span className={Number(v) < 0 ? "text-danger" : ""}>{formatNumber(Number(v))}</span>;
    case "number":
      return formatNumber(Number(v));
    case "percent":
      return `${String(v).replace(".", ",")}%`;
    case "date":
      return formatDate(String(v));
    default:
      return String(v);
  }
}
const numeric = (c: Col) => c.type === "money" || c.type === "number" || c.type === "percent";

/** Tombol ekspor. Ketiganya memakai objek laporan yang sama dengan tampilan layar. */
export function ExportButtons({ report, size = "md" }: { report: ReportData; size?: "sm" | "md" }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  async function run(kind: "pdf" | "xlsx" | "csv") {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "pdf") downloadBlob(await toPdf(report), `${report.fileName}.pdf`, "application/pdf");
      if (kind === "xlsx") downloadBlob(await toXlsx(report), `${report.fileName}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      if (kind === "csv") downloadBlob(toCsv(report), `${report.fileName}.csv`, "text/csv;charset=utf-8");
      toast.success(`${kind.toUpperCase()} diunduh`, { description: `${report.fileName}.${kind}` });
    } catch {
      toast.error("Ekspor gagal dibuat.", { description: "Muat ulang halaman lalu coba lagi. Bila data sangat banyak, persempit periode." });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size={size} variant="primary" loading={busy === "pdf"} onClick={() => run("pdf")}><FileText aria-hidden />PDF</Button>
      <Button size={size} loading={busy === "xlsx"} onClick={() => run("xlsx")}><FileSpreadsheet aria-hidden />XLSX</Button>
      <Button size={size} loading={busy === "csv"} onClick={() => run("csv")}><Table2 aria-hidden />CSV</Button>
    </div>
  );
}

export function ReportView({ report, hideHeader = false }: { report: ReportData; hideHeader?: boolean }) {
  return (
    <div className="space-y-4">
      {!hideHeader && (
        <Card>
          <CardContent className="space-y-3">
            <div>
              <p className="text-[13px] text-muted">{report.orgName}</p>
              <h2 className="text-lg font-semibold text-ink">{report.title}</h2>
              <p className="text-sm text-muted">Periode: {report.periodLabel} · Lingkup: {report.scopeLabel}</p>
            </div>
            {report.summary.length > 0 && (
              <dl className="grid max-w-md gap-x-6 gap-y-1 border-t border-line pt-3 text-sm" data-testid="report-summary">
                {report.summary.map((s) => (
                  <div key={s.label} className={cn("flex items-baseline justify-between gap-4", s.strong && "border-t border-line pt-1 font-semibold")}>
                    <dt className={s.strong ? "text-ink" : "text-muted"}>{s.label}</dt>
                    <dd className="tnum" data-label={s.label}>{s.type === "money" ? formatRupiah(Number(s.value)) : String(s.value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="text-[12px] text-faint">Dibuat {formatDateTime(report.generatedAt)}. Ekspor memuat angka yang sama dengan tampilan ini.</p>
          </CardContent>
        </Card>
      )}

      {report.sections.map((sec, si) => (
        <Card key={si} className="overflow-hidden">
          {(sec.title || sec.note) && (
            <div className="border-b border-line px-4 py-3 sm:px-5">
              {sec.title && <h3 className="text-[15px] font-semibold text-ink">{sec.title}</h3>}
              {sec.note && <p className="mt-0.5 text-[13px] text-muted">{sec.note}</p>}
            </div>
          )}
          {sec.rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted sm:px-5">{sec.emptyText ?? "Tidak ada data."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="border-b border-line bg-subtle/60 text-[12px] tracking-wide text-muted uppercase">
                  <tr>
                    {sec.columns.map((c) => (
                      <th key={c.key} scope="col" className={cn("h-9 px-3 font-medium whitespace-nowrap first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5", numeric(c) ? "text-right" : "text-left")}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((row: Row, ri) => {
                    const firstText = sec.columns.findIndex((c) => (!c.type || c.type === "text") && String(row[c.key] ?? "") !== "");
                    return (
                      <tr key={ri} className={cn("border-b border-line last:border-0", row._bold && "bg-subtle/40 font-medium")}>
                        {sec.columns.map((c, ci) => (
                          <td key={c.key} className={cn("px-3 py-2 align-top first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5", numeric(c) ? "tnum text-right whitespace-nowrap" : c.type === "date" ? "tnum whitespace-nowrap" : "", row._indent && ci === firstText && "pl-8 sm:pl-10")}>
                            {row._href && c.key === "ref" && row.ref ? <Link href={String(row._href)} className="text-primary underline-offset-2 hover:underline">{String(row.ref)}</Link> : screenCell(c, row[c.key])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
                {sec.totals && (
                  <tfoot className="border-t border-line-strong bg-subtle/60 font-semibold">
                    <tr>
                      {sec.columns.map((c) => (
                        <td key={c.key} className={cn("px-3 py-2.5 first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5", numeric(c) ? "tnum text-right whitespace-nowrap" : "")} data-total={c.key}>{screenCell(c, sec.totals![c.key])}</td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
      ))}

      {report.notes.length > 0 && (
        <div className="rounded-card border border-line bg-surface px-4 py-3 text-[13px] text-muted sm:px-5">
          <p className="mb-1 font-medium text-ink">Catatan</p>
          <ul className="list-disc space-y-0.5 pl-4">{report.notes.map((nt) => <li key={nt}>{nt}</li>)}</ul>
        </div>
      )}
      {report.signature && report.signature.signers.length > 0 && (
        <p className="text-[13px] text-muted">PDF menyertakan area tanda tangan: {report.signature.signers.map((s) => `${s.role}${s.name ? " (" + s.name + ")" : ""}`).join(", ")}. Atur di Pengaturan, Profil dan logo.</p>
      )}
    </div>
  );
}
