"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { PROGRAM_STATUS_LABEL } from "@/lib/labels";
import type { Program } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormDialog, type FieldDef } from "@/components/app/form-dialog";
import { useAction } from "@/components/app/hooks";

const FIELDS: FieldDef[] = [
  { name: "name", label: "Nama program", required: true, placeholder: "Misalnya: MAKESTA Raya 2026" },
  { name: "code", label: "Kode", required: true, half: true, placeholder: "MAKESTA26", help: "Huruf, angka, dan tanda hubung.", validate: (v) => (/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/.test(String(v ?? "").trim()) ? null : "Gunakan 2 sampai 20 huruf, angka, atau tanda hubung.") },
  { name: "status", label: "Status", type: "select", required: true, half: true, options: Object.entries(PROGRAM_STATUS_LABEL).map(([value, label]) => ({ value, label })) },
  { name: "start_date", label: "Tanggal mulai", type: "date", half: true },
  { name: "end_date", label: "Tanggal selesai", type: "date", half: true, validate: (v, all) => (v && all.start_date && String(v) < String(all.start_date) ? "Tidak boleh lebih awal dari tanggal mulai." : null) },
  { name: "pic_name", label: "Penanggung jawab" },
  { name: "description", label: "Deskripsi", type: "textarea" },
];

export function ProgramDialogButton({ orgId, program, openInitially = false }: { orgId: string; program?: Program; openInitially?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(openInitially);
  const [remove, setRemove] = React.useState(false);
  const { run, pending } = useAction();
  const supabase = createClient();
  return (
    <>
      {program ? (
        <Button onClick={() => setOpen(true)}><Pencil aria-hidden />Ubah</Button>
      ) : (
        <Button variant="primary" onClick={() => setOpen(true)}><Plus aria-hidden />Tambah Program</Button>
      )}
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={program ? "Ubah program" : "Tambah program"}
        description={program ? undefined : "Setiap program punya dana sendiri, terpisah dari Kas Umum."}
        fields={program ? FIELDS : FIELDS.filter((f) => f.name !== "status" || true)}
        initial={program ? { ...program, start_date: program.start_date ?? "", end_date: program.end_date ?? "" } : { status: "perencanaan" }}
        onSubmit={async (v) => {
          const { data, error } = await supabase.rpc("save_program", { p_org: orgId, p_program_id: program?.id ?? null, p_payload: { code: String(v.code).trim(), name: v.name, status: v.status, start_date: v.start_date || null, end_date: v.end_date || null, pic_name: v.pic_name ?? null, description: v.description ?? null } });
          if (error) return error;
          toast.success(program ? "Program disimpan" : "Program dibuat", { description: program ? undefined : "Lanjutkan dengan mengisi RAB." });
          setOpen(false);
          if (!program) router.push(`/program/${data}?tab=rab`);
          router.refresh();
          return null;
        }}
      >
        {program && (
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="dangerOutline" onClick={() => setRemove(true)}><Trash2 aria-hidden />Hapus program</Button>
          </div>
        )}
      </FormDialog>
      {program && (
        <ConfirmDialog
          open={remove}
          onOpenChange={setRemove}
          title={`Hapus program ${program.name}?`}
          description="Program yang sudah punya transaksi tidak bisa dihapus. Arsipkan saja."
          confirmLabel="Hapus program"
          tone="danger"
          pending={pending}
          onConfirm={() => run(() => supabase.rpc("delete_program", { p_program_id: program.id }), { success: "Program dihapus", refresh: false, onSuccess: () => { setRemove(false); setOpen(false); router.replace("/program"); router.refresh(); } })}
        />
      )}
    </>
  );
}
