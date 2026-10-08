import * as React from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-control border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-faint transition-colors focus-visible:border-accent focus-visible:outline-[3px] focus-visible:outline-offset-0 focus-visible:outline-accent/20 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted aria-invalid:border-danger sm:px-3 sm:text-sm";

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  const dateLike = type === "date" || type === "time" || type === "month" || type === "datetime-local";
  return <input type={type} className={cn(fieldBase, "h-11 sm:h-10", dateLike && "block min-w-0 max-w-full appearance-none text-left [&::-webkit-date-and-time-value]:text-left", className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
}

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        fieldBase,
        "h-11 sm:h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235b665f%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <input type="checkbox" className={cn("size-[18px] shrink-0 rounded-md border-line-strong accent-primary", className)} {...props} />;
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-ink", className)} {...props} />;
}

export { Input, Textarea, Select, Checkbox, Label };
