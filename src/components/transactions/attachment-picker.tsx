"use client";

import * as React from "react";
import { Camera, FileText, Paperclip, Trash2, UploadCloud } from "@/components/ui/icons";
import { ACCEPT, validateFile } from "@/lib/attachments";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Pemilih bukti: seret dan lepas, pilih berkas, atau ambil foto dari kamera ponsel.
 * Berkas belum diunggah di sini; komponen induk mengunggahnya setelah transaksi tersimpan.
 */
export function AttachmentPicker({
  files, onChange, maxMb, disabled, compact,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  maxMb: number;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [errors, setErrors] = React.useState<string[]>([]);
  const [over, setOver] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const camRef = React.useRef<HTMLInputElement>(null);
  const previews = React.useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);
  React.useEffect(() => () => previews.forEach((p) => p && URL.revokeObjectURL(p)), [previews]);

  function add(list: FileList | File[] | null) {
    if (!list) return;
    const errs: string[] = [];
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      const e = validateFile(f, maxMb);
      if (e) errs.push(e);
      else if (!files.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) ok.push(f);
    }
    setErrors(errs);
    if (ok.length) onChange([...files, ...ok]);
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) add(e.dataTransfer.files); }}
        className={cn(
          "rounded-control border border-dashed border-line-strong bg-subtle/50 text-center transition-colors",
          compact ? "px-3 py-3" : "px-4 py-5",
          over && "border-accent bg-accent-soft",
          disabled && "opacity-60",
        )}
      >
        {!compact && <UploadCloud className="mx-auto mb-1.5 size-6 text-faint" aria-hidden />}
        <p className="text-sm text-muted">
          <span className="hidden sm:inline">Seret berkas ke sini, atau </span>pilih kuitansi, nota, atau bukti transfer.
        </p>
        <div className="mt-2.5 flex flex-wrap justify-center gap-2">
          <Button type="button" size="sm" disabled={disabled} onClick={() => fileRef.current?.click()}><Paperclip aria-hidden />Pilih berkas</Button>
          <Button type="button" size="sm" disabled={disabled} onClick={() => camRef.current?.click()} className="sm:hidden"><Camera aria-hidden />Ambil foto</Button>
        </div>
        <p className="mt-2 text-[12px] text-faint">JPG, PNG, atau PDF. Maksimal {maxMb} MB per berkas.</p>
        <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {errors.map((e) => <p key={e} role="alert" className="text-[13px] text-danger">{e}</p>)}
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}`} className="flex items-center gap-3 rounded-control border border-line bg-surface p-2">
              {previews[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[i]!} alt="" className="size-10 shrink-0 rounded object-cover" />
              ) : (
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded bg-subtle text-muted"><FileText className="size-5" aria-hidden /></span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{f.name}</span>
                <span className="tnum block text-[12px] text-muted">{formatBytes(f.size)} · belum diunggah</span>
              </span>
              <Button type="button" variant="ghost" size="iconSm" disabled={disabled} aria-label={`Batalkan ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
