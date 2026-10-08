"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMonth, formatMonthShort, formatRupiah } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/app/money";

// Pasangan warna sudah divalidasi untuk buta warna (deutan/protan) dan kontras terhadap latar putih.
// Identitas seri juga dibawa legenda dan tampilan tabel, bukan warna saja.
export const SERIES = { income: "#15724a", expense: "#d4a900" } as const;

type Row = { month: string; income: number; expense: number };

function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${(n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (a >= 1_000) return `${(n / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return String(n);
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-control border border-line bg-surface px-3 py-2 text-[13px] shadow-pop">
      <p className="mb-1 font-medium text-ink">{formatMonth(r.month)}</p>
      <p className="flex items-center justify-between gap-6"><span className="flex items-center gap-1.5 text-muted"><i className="size-2.5 rounded-sm" style={{ background: SERIES.income }} />Pemasukan</span><span className="tnum text-ink">{formatRupiah(r.income)}</span></p>
      <p className="flex items-center justify-between gap-6"><span className="flex items-center gap-1.5 text-muted"><i className="size-2.5 rounded-sm" style={{ background: SERIES.expense }} />Pengeluaran</span><span className="tnum text-ink">{formatRupiah(r.expense)}</span></p>
      <p className="mt-1 flex items-center justify-between gap-6 border-t border-line pt-1"><span className="text-muted">Selisih</span><span className="tnum font-medium text-ink">{formatRupiah(r.income - r.expense)}</span></p>
    </div>
  );
}

export function CashFlowChart({ data }: { data: Row[] }) {
  const [table, setTable] = React.useState(false);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex gap-4 text-[13px] text-muted" aria-label="Legenda">
          <li className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: SERIES.income }} aria-hidden />Pemasukan</li>
          <li className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: SERIES.expense }} aria-hidden />Pengeluaran</li>
        </ul>
        <Button size="sm" variant="ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? "Lihat grafik" : "Lihat tabel"}</Button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead className="text-[12px] text-muted uppercase">
            <tr className="border-b border-line"><th className="py-1.5 text-left font-medium">Bulan</th><th className="text-right font-medium">Pemasukan</th><th className="text-right font-medium">Pengeluaran</th><th className="text-right font-medium">Selisih</th></tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.month} className="border-b border-line last:border-0">
                <td className="py-1.5">{formatMonth(r.month)}</td>
                <td className="num"><Money value={r.income} /></td>
                <td className="num"><Money value={r.expense} /></td>
                <td className="num"><Money value={r.income - r.expense} tone="auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-56 w-full" role="img" aria-label={`Grafik pemasukan dan pengeluaran per bulan. ${data.map((r) => `${formatMonth(r.month)}: pemasukan ${formatRupiah(r.income)}, pengeluaran ${formatRupiah(r.expense)}`).join(". ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="month" tickFormatter={formatMonthShort} tickLine={false} axisLine={{ stroke: "#D1D5DB" }} tick={{ fontSize: 12, fill: "#5B665F" }} />
              <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={48} tick={{ fontSize: 12, fill: "#5B665F" }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F3F5F4" }} />
              <Bar dataKey="income" name="Pemasukan" fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              <Bar dataKey="expense" name="Pengeluaran" fill={SERIES.expense} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
