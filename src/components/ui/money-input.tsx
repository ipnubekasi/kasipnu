"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatNumber, parseRupiah } from "@/lib/format";
import { Input } from "./input";

/** Masukan nominal rupiah: pemisah ribuan otomatis, angka tabular, rata kanan. */
export function MoneyInput({
  value, onChange, className, allowNegative = false, ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: number | null;
  onChange: (v: number | null) => void;
  allowNegative?: boolean;
}) {
  const [text, setText] = React.useState(value === null ? "" : formatNumber(value));
  const last = React.useRef(value);
  React.useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value === null ? "" : formatNumber(value));
    }
  }, [value]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted" aria-hidden>Rp</span>
      <Input
        inputMode="numeric"
        autoComplete="off"
        className={cn("tnum pl-9 text-right", className)}
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(allowNegative ? /[^\d-]/g : /[^\d]/g, "");
          const neg = allowNegative && raw.startsWith("-");
          const digits = raw.replace(/-/g, "");
          if (!digits) {
            setText(neg ? "-" : "");
            last.current = null;
            onChange(null);
            return;
          }
          const n = (parseRupiah(digits) ?? 0) * (neg ? -1 : 1);
          setText((neg ? "-" : "") + formatNumber(Math.abs(n)));
          last.current = n;
          onChange(n);
        }}
        {...props}
      />
    </div>
  );
}
