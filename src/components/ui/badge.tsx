import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "border-line bg-subtle text-muted",
        ok: "border-accent-line bg-accent-soft text-accent",
        warn: "border-warn-line bg-warn-soft text-warn",
        danger: "border-danger-line bg-danger-soft text-danger",
        info: "border-info-line bg-info-soft text-info",
        outline: "border-line-strong bg-surface text-ink",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge };
