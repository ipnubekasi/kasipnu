import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-hover",
        secondary: "border border-line-strong bg-surface text-ink shadow-[0_1px_0_rgb(14_58_40/0.03)] hover:bg-subtle",
        ghost: "text-ink hover:bg-subtle",
        danger: "bg-danger text-white hover:bg-danger/90",
        dangerOutline: "border border-danger-line bg-surface text-danger hover:bg-danger-soft",
        link: "h-auto p-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px]",
        md: "h-11 px-4.5 sm:h-10",
        lg: "h-12 px-5 text-[15px]",
        icon: "size-11 sm:size-10",
        iconSm: "size-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

function Button({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? children : (
        <>
          {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
