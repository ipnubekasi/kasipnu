"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Field, fieldAria } from "@/components/ui/field";

/** Dialog konfirmasi, dengan kolom alasan opsional untuk tindakan yang wajib beralasan. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, tone = "primary", onConfirm, pending, reason, children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onConfirm: (reason: string) => void | Promise<void>;
  pending?: boolean;
  reason?: { label: string; placeholder?: string; required?: boolean };
  children?: React.ReactNode;
}) {
  const [text, setText] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  // Kosongkan isian setiap kali dialog dibuka (pola penyesuaian state saat render).
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setText("");
      setTouched(false);
    }
  }
  const missing = Boolean(reason?.required) && text.trim().length === 0;
  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
        </DialogHeader>
        {(reason || children) && (
          <DialogBody className="space-y-4">
            {children}
            {reason && (
              <Field label={reason.label} htmlFor="confirm-reason" required={reason.required} error={touched && missing ? `${reason.label} wajib diisi.` : null}>
                <Textarea {...fieldAria("confirm-reason", touched && missing ? "x" : null)} value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} rows={3} autoFocus />
              </Field>
            )}
          </DialogBody>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Batal</Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={pending}
            onClick={() => {
              setTouched(true);
              if (missing) return;
              void onConfirm(text.trim());
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
