"use client";

import * as React from "react";
import { Eye, EyeOff } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";

export function PasswordInput(props: Omit<React.ComponentProps<"input">, "type">) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} className="h-12 pr-12" {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
        aria-pressed={show}
        className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-ink"
      >
        {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
