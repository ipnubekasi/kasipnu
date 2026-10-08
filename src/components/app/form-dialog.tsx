"use client";

import * as React from "react";
import { friendlyError, type FriendlyError } from "@/lib/errors";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, fieldAria } from "@/components/ui/field";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "email" | "date" | "number" | "money" | "select" | "textarea" | "checkbox" | "checks";
  options?: { value: string; label: string; group?: string }[];
  required?: boolean;
  help?: string;
  placeholder?: string;
  half?: boolean;
  disabled?: boolean | ((v: Values) => boolean);
  hidden?: (v: Values) => boolean;
  validate?: (value: unknown, all: Values) => string | null;
  maxLength?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Values = Record<string, any>;

/**
 * Dialog formulir generik: label jelas, validasi inline, pesan galat yang menjelaskan
 * cara memperbaiki, dan pencegahan kirim ganda.
 */
export function FormDialog({
  open, onOpenChange, title, description, fields, initial, submitLabel = "Simpan", onSubmit, size = "md", children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: React.ReactNode;
  fields: FieldDef[];
  initial: Values;
  submitLabel?: string;
  /** Mengembalikan galat (dari Supabase) atau null bila berhasil. */
  onSubmit: (values: Values) => Promise<unknown | null>;
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
}) {
  const [values, setValues] = React.useState<Values>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<FriendlyError | null>(null);
  const [pending, setPending] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  // Isi ulang hanya saat dialog dibuka (pola penyesuaian state saat render).
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setValues(initial);
      setErrors({});
      setFormError(null);
      setDirty(false);
    }
  }

  const set = (name: string, v: unknown) => {
    setValues((s) => ({ ...s, [name]: v }));
    setDirty(true);
  };
  const visible = fields.filter((f) => !f.hidden?.(values));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const er: Record<string, string> = {};
    for (const f of visible) {
      const v = values[f.name];
      const empty = v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      if (f.required && empty) er[f.name] = `${f.label} wajib diisi.`;
      else if (f.type === "money" && f.required && Number(v) <= 0) er[f.name] = `${f.label} harus lebih besar dari nol.`;
      else if (f.type === "email" && !empty && !/^\S+@\S+\.\S+$/.test(String(v))) er[f.name] = "Format email tidak valid.";
      else if (f.validate) {
        const m = f.validate(v, values);
        if (m) er[f.name] = m;
      }
    }
    setErrors(er);
    if (Object.keys(er).length) {
      document.getElementById(`fd-${Object.keys(er)[0]}`)?.focus();
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      const err = await onSubmit(values);
      if (err) setFormError(friendlyError(err as Error));
    } catch (ex) {
      setFormError(friendlyError(ex as Error));
    } finally {
      setPending(false);
    }
  }

  function requestClose(v: boolean) {
    if (pending) return;
    if (!v && dirty && !window.confirm("Perubahan belum disimpan. Tutup formulir ini?")) return;
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent size={size}>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
          </DialogHeader>
          <DialogBody className="space-y-4">
            {formError && <Alert tone="danger" title={formError.message}>{formError.hint}</Alert>}
            {children}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visible.map((f) => {
                const id = `fd-${f.name}`;
                const disabled = typeof f.disabled === "function" ? f.disabled(values) : f.disabled;
                const err = errors[f.name];
                const wrap = f.half ? "" : "sm:col-span-2";
                if (f.type === "checkbox") {
                  return (
                    <div key={f.name} className={`flex items-start gap-2.5 ${wrap}`}>
                      <Checkbox id={id} checked={Boolean(values[f.name])} disabled={disabled} onChange={(e) => set(f.name, e.target.checked)} className="mt-0.5" />
                      <div>
                        <Label htmlFor={id} className="font-normal">{f.label}</Label>
                        {f.help && <p className="text-[13px] text-muted">{f.help}</p>}
                      </div>
                    </div>
                  );
                }
                if (f.type === "checks") {
                  const arr: string[] = values[f.name] ?? [];
                  return (
                    <fieldset key={f.name} className={wrap}>
                      <legend className="mb-1.5 text-sm font-medium text-ink">{f.label}{f.required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}</legend>
                      <div className="space-y-2">
                        {f.options?.map((o) => (
                          <div key={o.value} className="flex items-start gap-2.5">
                            <Checkbox id={`${id}-${o.value}`} checked={arr.includes(o.value)} disabled={disabled} onChange={(e) => set(f.name, e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))} className="mt-0.5" />
                            <div><Label htmlFor={`${id}-${o.value}`} className="font-normal">{o.label}</Label>{o.group && <p className="text-[13px] text-muted">{o.group}</p>}</div>
                          </div>
                        ))}
                      </div>
                      {err ? <p role="alert" className="mt-1.5 text-[13px] text-danger">{err}</p> : f.help ? <p className="mt-1.5 text-[13px] text-muted">{f.help}</p> : null}
                    </fieldset>
                  );
                }
                return (
                  <Field key={f.name} label={f.label} htmlFor={id} required={f.required} error={err} help={f.help} className={wrap}>
                    {f.type === "select" ? (
                      <Select {...fieldAria(id, err)} value={values[f.name] ?? ""} disabled={disabled} onChange={(e) => set(f.name, e.target.value)}>
                        {!f.required || !values[f.name] ? <option value="">{f.placeholder ?? "Pilih"}</option> : null}
                        {Array.from(new Set((f.options ?? []).map((o) => o.group ?? ""))).map((g) =>
                          g ? (
                            <optgroup key={g} label={g}>{f.options!.filter((o) => (o.group ?? "") === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
                          ) : (
                            f.options!.filter((o) => !o.group).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
                          ),
                        )}
                      </Select>
                    ) : f.type === "textarea" ? (
                      <Textarea {...fieldAria(id, err)} value={values[f.name] ?? ""} disabled={disabled} placeholder={f.placeholder} maxLength={f.maxLength ?? 1000} rows={3} onChange={(e) => set(f.name, e.target.value)} />
                    ) : f.type === "money" ? (
                      <MoneyInput {...fieldAria(id, err)} value={values[f.name] ?? null} disabled={disabled} onChange={(v) => set(f.name, v)} />
                    ) : (
                      <Input {...fieldAria(id, err)} type={f.type ?? "text"} inputMode={f.type === "number" ? "decimal" : undefined} value={values[f.name] ?? ""} disabled={disabled} placeholder={f.placeholder} maxLength={f.maxLength ?? 200} autoComplete="off" onChange={(e) => set(f.name, e.target.value)} />
                    )}
                  </Field>
                );
              })}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => requestClose(false)} disabled={pending}>Batal</Button>
            <Button type="submit" variant="primary" loading={pending}>{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
