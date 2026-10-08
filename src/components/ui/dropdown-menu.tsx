"use client";

import * as React from "react";
import { DropdownMenu as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";

const DropdownMenu = Primitive.Root;
const DropdownMenuTrigger = Primitive.Trigger;

function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn("z-50 min-w-48 rounded-lg border border-line/80 bg-surface p-1.5 shadow-pop data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95", className)}
        {...props}
      />
    </Primitive.Portal>
  );
}
function DropdownMenuItem({ className, tone, ...props }: React.ComponentProps<typeof Primitive.Item> & { tone?: "danger" }) {
  return (
    <Primitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-subtle [&_svg]:size-4 [&_svg]:text-muted",
        tone === "danger" && "text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}
function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Primitive.Label>) {
  return <Primitive.Label className={cn("px-2.5 py-1.5 text-[12px] text-muted", className)} {...props} />;
}
function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator };
