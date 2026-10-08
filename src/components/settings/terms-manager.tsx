"use client";

import * as React from "react";
import { Pencil, Plus } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatDate, todayJakarta } from "@/lib/format";
import type { Term } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FormDialog, type FieldDef } from "@/components/app/form-dialog";
import { useAction } from "@/components/app/hooks";

const FIELDS: FieldDef[] = [
  { name: "name", label: "Nama periode", required: true, placeholder: "Masa Khidmat 2026 sampai 2028" },
  { name: "start_date", label: "Tanggal mulai", type: "date", required: true, half: true },
  { name: "end_date", label: "Tanggal selesai", type: "date", half: true, validate: (v, all) => (v && all.start_date && String(v) < String(all.start_date) ? "Tidak boleh lebih awal dari tanggal mulai." : null) },
  { name: "chair_name", label: "Nama ketua", half: true },
  { name: "secretary_name", label: "Nama sekretaris", half: true },
  { name: "treasurer_name", label: "Nama bendahara", half: true },
  { name: "notes", label: "Catatan", type: "textarea" },
];

export function TermsManager({ orgId, terms, isAdmin }: { orgId: string; terms: Term[]; isAdmin: boolean }) {
  const supabase = createClient();
  const { run } = useAction();
  const [edit, setEdit] = React.useState<Term | null>(null);
  const [fresh, setFresh] = React.useState(false);
  const active = terms.find((t) => t.status === "aktif");

  return (
    <>
      <div className="mb-4 flex justify-end">
        {isAdmin && <Button variant="primary" onClick={() => setFresh(true)}><Plus aria-hidden />Mulai Periode Baru</Button>}
      </div>
      <Card>
        <Table>
          <THead><TR className="hover:bg-transparent"><TH>Periode</TH><TH>Rentang</TH><TH>Ketua</TH><TH>Bendahara</TH><TH>Status</TH><TH /></TR></THead>
          <TBody>
            {terms.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium">{t.name}</TD>
                <TD className="tnum whitespace-nowrap">{formatDate(t.start_date)} sampai {t.end_date ? formatDate(t.end_date) : "sekarang"}</TD>
                <TD>{t.chair_name ?? <span className="text-faint">Belum diisi</span>}</TD>
                <TD>{t.treasurer_name ?? <span className="text-faint">Belum diisi</span>}</TD>
                <TD>{t.status === "aktif" ? <Badge tone="ok">Aktif</Badge> : <Badge>Arsip</Badge>}</TD>
                <TD className="text-right">{isAdmin && <Button size="iconSm" variant="ghost" aria-label={`Ubah ${t.name}`} onClick={() => setEdit(t)}><Pencil aria-hidden /></Button>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">
          Periode lama tetap tersimpan sebagai arsip. Transaksi, jurnal, dan bukti tidak terhapus saat periode berganti; laporan periode lama dapat dibuka kapan saja dari menu Laporan.
        </p>
      </Card>

      <FormDialog
        open={Boolean(edit)}
        onOpenChange={(v) => !v && setEdit(null)}
        title="Ubah periode kepengurusan"
        fields={FIELDS}
        initial={edit ?? {}}
        onSubmit={async (v) => {
          const { error } = await supabase.from("management_terms").update({
            name: v.name.trim(), start_date: v.start_date, end_date: v.end_date || null, chair_name: v.chair_name?.trim() || null,
            secretary_name: v.secretary_name?.trim() || null, treasurer_name: v.treasurer_name?.trim() || null, notes: v.notes?.trim() || null,
          }).eq("id", edit!.id);
          if (error) return error;
          toast.success("Periode disimpan");
          setEdit(null);
          await run(async () => ({ data: true }));
          return null;
        }}
      />
      <FormDialog
        open={fresh}
        onOpenChange={setFresh}
        title="Mulai periode kepengurusan baru"
        description={<>Periode aktif saat ini{active ? <> (<strong>{active.name}</strong>)</> : null} akan diarsipkan. Seluruh data keuangan tetap tersimpan dan dapat dibuka.</>}
        fields={FIELDS.filter((f) => f.name !== "notes")}
        initial={{ start_date: todayJakarta() }}
        submitLabel="Mulai periode baru"
        onSubmit={async (v) => {
          const { error } = await supabase.rpc("start_new_term", { p_org: orgId, p_name: v.name, p_start: v.start_date, p_end: v.end_date || null, p_chair: v.chair_name ?? null, p_secretary: v.secretary_name ?? null, p_treasurer: v.treasurer_name ?? null });
          if (error) return error;
          toast.success("Periode baru dimulai", { description: "Periode sebelumnya sudah diarsipkan." });
          setFresh(false);
          await run(async () => ({ data: true }));
          return null;
        }}
      />
    </>
  );
}
