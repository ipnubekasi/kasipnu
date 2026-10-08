import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const TONES = {
  info: { box: "border-info-line bg-info-soft text-ink", icon: Info, color: "text-info" },
  ok: { box: "border-accent-line bg-accent-soft text-ink", icon: CheckCircle2, color: "text-accent" },
  warn: { box: "border-warn-line bg-warn-soft text-ink", icon: AlertTriangle, color: "text-warn" },
  danger: { box: "border-danger-line bg-danger-soft text-ink", icon: XCircle, color: "text-danger" },
} as const;

/** Kotak pesan. Makna selalu dibawa ikon dan teks, bukan warna saja. */
export function Alert({
  tone = "info", title, children, className, action,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-control border px-3.5 py-3 text-sm", t.box, className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", t.color)} aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-muted [&_strong]:text-ink">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
