import { formatDateNumeric, formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import type { Cell, Col, ReportData, Row, Section } from "./types";

/** Teks sel untuk PDF dan CSV. Tampilan layar memakai aturan yang sama (lihat ReportView). */
export function cellText(col: Col, v: Cell, forCsv = false): string {
  if (v === null || v === undefined || v === "") return "";
  switch (col.type) {
    case "money":
      return forCsv ? String(Math.round(Number(v))) : formatNumber(Number(v));
    case "number":
      return forCsv ? String(v) : formatNumber(Number(v));
    case "percent":
      return `${String(v).replace(".", ",")}%`;
    case "date":
      return formatDateNumeric(String(v));
    default:
      return String(v);
  }
}

const isNumeric = (c: Col) => c.type === "money" || c.type === "number" || c.type === "percent";

function csvEscape(s: string, sep: string): string {
  return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV untuk data tabular. Pemisah titik koma dan BOM UTF-8 agar langsung terbaca
 * oleh Excel berbahasa Indonesia. Nominal ditulis sebagai angka polos tanpa pemisah ribuan.
 */
export function toCsv(r: ReportData): string {
  const sep = ";";
  const lines: string[] = [];
  const push = (cells: string[]) => lines.push(cells.map((c) => csvEscape(c, sep)).join(sep));
  push([r.orgName]);
  push([r.title]);
  push(["Periode", r.periodLabel]);
  push(["Lingkup", r.scopeLabel]);
  push(["Dibuat", formatDateTime(r.generatedAt)]);
  lines.push("");
  for (const s of r.summary) push([s.label, s.type === "money" ? String(Math.round(Number(s.value))) : String(s.value)]);
  for (const sec of r.sections) {
    lines.push("");
    if (sec.title) push([sec.title]);
    push(sec.columns.map((c) => c.label));
    for (const row of sec.rows) push(sec.columns.map((c) => cellText(c, row[c.key], true)));
    if (sec.totals) push(sec.columns.map((c) => cellText(c, sec.totals![c.key], true)));
  }
  if (r.notes.length) {
    lines.push("");
    push(["Catatan"]);
    for (const nt of r.notes) push([nt]);
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export async function toXlsx(r: ReportData): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kas IPNU";
  wb.created = new Date(r.generatedAt);
  const ws = wb.addWorksheet("Laporan", { views: [{ showGridLines: false }] });
  const maxCols = Math.max(2, ...r.sections.map((s) => s.columns.length));
  const moneyFmt = '#,##0;[Red]-#,##0';
  const font = { name: "Calibri", size: 11 };

  const title = ws.addRow([r.orgName]);
  title.font = { ...font, bold: true, size: 14 };
  ws.addRow([r.title]).font = { ...font, bold: true, size: 12 };
  ws.addRow([`Periode: ${r.periodLabel}`]).font = font;
  ws.addRow([`Lingkup: ${r.scopeLabel}`]).font = font;
  ws.addRow([`Dibuat: ${formatDateTime(r.generatedAt)}`]).font = { ...font, color: { argb: "FF5B665F" } };
  ws.addRow([]);

  for (const s of r.summary) {
    const row = ws.addRow([s.label, s.type === "money" ? Math.round(Number(s.value)) : String(s.value)]);
    row.font = { ...font, bold: Boolean(s.strong) };
    if (s.type === "money") row.getCell(2).numFmt = moneyFmt;
    row.getCell(2).alignment = { horizontal: "right" };
  }

  const widths: number[] = Array.from({ length: maxCols }, () => 10);
  for (const sec of r.sections) {
    ws.addRow([]);
    if (sec.title) ws.addRow([sec.title]).font = { ...font, bold: true };
    if (sec.note) ws.addRow([sec.note]).font = { ...font, italic: true, color: { argb: "FF5B665F" } };
    const head = ws.addRow(sec.columns.map((c) => c.label));
    head.eachCell((cell, i) => {
      cell.font = { ...font, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F5F4" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
      cell.alignment = { horizontal: isNumeric(sec.columns[i - 1]) ? "right" : "left", vertical: "middle", wrapText: true };
    });
    const writeRow = (row: Row, bold: boolean) => {
      const x = ws.addRow(sec.columns.map((c) => {
        const v = row[c.key];
        if (v === null || v === undefined || v === "") return null;
        if (c.type === "money" || c.type === "number") return Number(v);
        if (c.type === "percent") return Number(v) / 100;
        if (c.type === "date") return new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
        return String(v);
      }));
      x.eachCell({ includeEmpty: true }, (cell, i) => {
        const c = sec.columns[i - 1];
        if (!c) return;
        cell.font = { ...font, bold: bold || Boolean(row._bold) };
        if (c.type === "money") cell.numFmt = moneyFmt;
        if (c.type === "number") cell.numFmt = "#,##0";
        if (c.type === "percent") cell.numFmt = "0.0%";
        if (c.type === "date") cell.numFmt = "dd/mm/yyyy";
        cell.alignment = { horizontal: isNumeric(c) ? "right" : "left", vertical: "top", wrapText: !isNumeric(c) && c.type !== "date", indent: row._indent && i === 1 ? 2 : 0 };
        if (bold) cell.border = { top: { style: "thin", color: { argb: "FF9CA3AF" } } };
      });
    };
    if (sec.rows.length === 0 && sec.emptyText) ws.addRow([sec.emptyText]).font = { ...font, italic: true, color: { argb: "FF5B665F" } };
    for (const row of sec.rows) writeRow(row, false);
    if (sec.totals) writeRow(sec.totals, true);
    sec.columns.forEach((c, i) => {
      const w = Math.round((c.width ?? 3) * 6);
      widths[i] = Math.max(widths[i], Math.min(w, 60), isNumeric(c) ? 16 : 10);
    });
  }
  if (r.notes.length) {
    ws.addRow([]);
    ws.addRow(["Catatan"]).font = { ...font, bold: true };
    for (const nt of r.notes) ws.addRow([nt]).font = { ...font, color: { argb: "FF5B665F" } };
  }
  if (r.signature && r.signature.signers.length) {
    ws.addRow([]);
    ws.addRow([`${r.signature.city ? r.signature.city + ", " : ""}${r.signature.date}`]).font = font;
    ws.addRow(r.signature.signers.map((s) => s.role)).font = font;
    ws.addRow([]);
    ws.addRow([]);
    ws.addRow(r.signature.signers.map((s) => s.name || "(.........................)")).font = { ...font, bold: true };
  }
  widths[0] = Math.max(widths[0], 24);
  ws.columns = widths.map((w) => ({ width: w }));
  ws.pageSetup = { paperSize: 9, orientation: r.landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

/**
 * PDF siap cetak. Seluruh isi berupa teks yang dapat dipilih dan dicari (bukan gambar).
 * Setiap halaman memuat tanggal pembuatan dan nomor halaman.
 */
export async function toPdf(r: ReportData): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: r.landscape ? "landscape" : "portrait", unit: "mm", format: "a4", compress: false });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const INK: [number, number, number] = [23, 33, 27];
  const MUTED: [number, number, number] = [91, 102, 95];
  const LINE: [number, number, number] = [209, 213, 219];
  let y = M + 2;

  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...INK);
  doc.text(r.orgName, M, y);
  y += 6.5;
  doc.setFontSize(11.5);
  doc.text(doc.splitTextToSize(r.title, W - 2 * M), M, y);
  y += 5.5;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  doc.text(`Periode: ${r.periodLabel}`, M, y);
  y += 4.4;
  doc.text(`Lingkup: ${r.scopeLabel}`, M, y);
  y += 3;
  doc.setDrawColor(...LINE).setLineWidth(0.3).line(M, y, W - M, y);
  y += 4;

  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  if (r.summary.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      tableWidth: Math.min(110, W - 2 * M),
      theme: "plain",
      body: r.summary.map((s) => [s.label, s.type === "money" ? formatRupiah(Number(s.value)) : String(s.value)]),
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: { top: 0.9, bottom: 0.9, left: 0, right: 0 }, textColor: INK },
      columnStyles: { 0: { cellWidth: 60, textColor: MUTED }, 1: { halign: "right" } },
      didParseCell: (d) => {
        if (r.summary[d.row.index]?.strong) d.cell.styles.fontStyle = "bold";
      },
    });
    y = lastY() + 5;
  }

  for (const sec of r.sections) {
    if (y > H - 40) {
      doc.addPage();
      y = M + 2;
    }
    if (sec.title) {
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK);
      doc.text(doc.splitTextToSize(sec.title, W - 2 * M), M, y);
      y += 4.6;
    }
    if (sec.note) {
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
      const lines = doc.splitTextToSize(sec.note, W - 2 * M);
      doc.text(lines, M, y);
      y += lines.length * 3.6 + 0.6;
    }
    if (sec.rows.length === 0) {
      doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(...MUTED);
      doc.text(sec.emptyText ?? "Tidak ada data.", M, y + 1);
      y += 8;
      continue;
    }
    const total = sec.columns.reduce((t, c) => t + (c.width ?? 3), 0);
    const usable = W - 2 * M;
    const columnStyles: Record<number, { cellWidth: number; halign: "left" | "right" }> = {};
    sec.columns.forEach((c, i) => {
      columnStyles[i] = { cellWidth: ((c.width ?? 3) / total) * usable, halign: isNumeric(c) ? "right" : "left" };
    });
    const rows = sec.rows;
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: M + 8, top: M + 2 },
      theme: "plain",
      head: [sec.columns.map((c) => c.label)],
      body: rows.map((row) => sec.columns.map((c) => cellText(c, row[c.key]))),
      foot: sec.totals ? [sec.columns.map((c) => cellText(c, sec.totals![c.key]))] : undefined,
      showFoot: "lastPage",
      styles: { font: "helvetica", fontSize: 8.2, cellPadding: { top: 1.3, bottom: 1.3, left: 1.4, right: 1.4 }, textColor: INK, lineColor: [229, 231, 235], lineWidth: { bottom: 0.1 } as unknown as number, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [243, 245, 244], textColor: MUTED, fontStyle: "bold", fontSize: 7.8, lineWidth: { bottom: 0.3 } as unknown as number, lineColor: LINE },
      footStyles: { fillColor: [243, 245, 244], textColor: INK, fontStyle: "bold", lineWidth: { top: 0.3 } as unknown as number, lineColor: [156, 163, 175] },
      columnStyles,
      didParseCell: (d) => {
        if (d.section === "head" || d.section === "foot") d.cell.styles.halign = columnStyles[d.column.index]?.halign ?? "left";
        if (d.section !== "body") return;
        const row = rows[d.row.index];
        if (row?._bold) d.cell.styles.fontStyle = "bold";
        if (row?._indent) {
          const first = sec.columns.findIndex((c) => (!c.type || c.type === "text") && String(row[c.key] ?? "") !== "");
          if (d.column.index === first) d.cell.styles.cellPadding = { top: 1.3, bottom: 1.3, left: 5, right: 1.4 };
        }
        const col = sec.columns[d.column.index];
        if (col?.type === "money" && Number(row?.[col.key]) < 0) d.cell.styles.textColor = [185, 28, 28];
      },
    });
    y = lastY() + 6;
  }

  if (r.notes.length) {
    if (y > H - 30) {
      doc.addPage();
      y = M + 2;
    }
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...INK);
    doc.text("Catatan", M, y);
    y += 4;
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    for (const nt of r.notes) {
      const lines = doc.splitTextToSize(`- ${nt}`, W - 2 * M);
      if (y + lines.length * 3.6 > H - M - 8) {
        doc.addPage();
        y = M + 2;
      }
      doc.text(lines, M, y);
      y += lines.length * 3.6 + 0.8;
    }
    y += 3;
  }

  if (r.signature && r.signature.signers.length) {
    const need = 44;
    if (y + need > H - M - 8) {
      doc.addPage();
      y = M + 2;
    }
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...INK);
    doc.text(`${r.signature.city ? r.signature.city + ", " : ""}${r.signature.date}`, W - M, y + 4, { align: "right" });
    const cols = r.signature.signers.length;
    const cw = (W - 2 * M) / cols;
    r.signature.signers.forEach((s, i) => {
      const cx = M + cw * i + cw / 2;
      doc.setFont("helvetica", "normal").text(s.role, cx, y + 12, { align: "center" });
      doc.setFont("helvetica", "bold").text(s.name || "(.................................)", cx, y + 36, { align: "center" });
      if (s.name) {
        const tw = doc.getTextWidth(s.name);
        doc.setDrawColor(...INK).setLineWidth(0.2).line(cx - tw / 2, y + 37, cx + tw / 2, y + 37);
      }
    });
  }

  const pages = doc.getNumberOfPages();
  const stamp = `Dibuat ${formatDateTime(r.generatedAt)} · Kas IPNU`;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(M, H - M + 1, W - M, H - M + 1);
    doc.text(stamp, M, H - M + 5);
    doc.text(`Halaman ${i} dari ${pages}`, W - M, H - M + 5, { align: "right" });
  }
  return doc.output("arraybuffer");
}

export function sectionTotals(sec: Section): Row | undefined {
  return sec.totals;
}

export function downloadBlob(data: BlobPart, fileName: string, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
