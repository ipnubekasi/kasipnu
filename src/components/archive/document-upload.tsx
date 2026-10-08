"use client";

import * as React from "react";
import { Upload } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { uploadAttachment } from "@/lib/attachments";
import type { Program } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { useAction } from "@/components/app/hooks";
import { AttachmentPicker } from "@/components/transactions/attachment-picker";

export function DocumentUpload({ orgId, programs, maxMb }: { orgId: string; programs: Program[]; maxMb: number }) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [title, setTitle] = React.useState("");
  const [programId, setProgramId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { run, pending } = useAction();
  return (
    <div className="space-y-4">
      <Alert tone="info" title="Dokumen arsip bukan transaksi">
        Laporan lama, SK, atau rekening koran dalam bentuk PDF disimpan sebagai arsip dokumen saja. Isinya tidak otomatis menjadi transaksi. Untuk memasukkan transaksi historis, gunakan Impor dari CSV atau XLSX.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Judul dokumen" htmlFor="doc-title" required error={error}>
          <Input {...fieldAria("doc-title", error)} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Misalnya: LPJ Bendahara 2024" maxLength={150} />
        </Field>
        <Field label="Terkait program" htmlFor="doc-program" help="Opsional.">
          <Select id="doc-program" value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">Tidak terkait program</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
      </div>
      <AttachmentPicker files={files} onChange={setFiles} maxMb={maxMb} disabled={pending} compact />
      <Button
        variant="primary"
        loading={pending}
        disabled={files.length === 0}
        onClick={() => {
          if (!title.trim()) return setError("Judul dokumen wajib diisi.");
          setError(null);
          void run(async () => {
            const supabase = createClient();
            for (const [i, file] of files.entries()) {
              const res = await uploadAttachment(supabase, { orgId, kind: "dokumen", programId: programId || null, file, title: files.length > 1 ? `${title.trim()} (${i + 1})` : title.trim() });
              if (res.error) return { error: res.error };
            }
            return { data: files.length };
          }, { success: (n: number) => `${n} dokumen diarsipkan`, onSuccess: () => { setFiles([]); setTitle(""); } });
        }}
      >
        <Upload aria-hidden />Unggah ke arsip
      </Button>
    </div>
  );
}
