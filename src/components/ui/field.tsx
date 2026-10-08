import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./input";

/** Bidang formulir: label jelas, bantuan, dan pesan validasi inline yang terhubung ke kontrol. */
export function Field({
  label, htmlFor, error, help, required, className, children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  help?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-[13px] text-danger">{error}</p>
      ) : help ? (
        <p id={`${htmlFor}-help`} className="text-[13px] text-muted">{help}</p>
      ) : null}
    </div>
  );
}

/** Atribut aksesibilitas untuk kontrol di dalam Field. */
export function fieldAria(id: string, error?: string | null) {
  return { id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined } as const;
}
