import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-card border border-line/80 bg-surface shadow-card", className)} {...props} />;
}
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-4 py-3.5 sm:px-5", className)} {...props} />;
}
function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-[15px] font-semibold text-ink", className)} {...props} />;
}
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4 sm:p-5", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardContent };
