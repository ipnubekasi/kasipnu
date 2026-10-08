import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export function PageHeader({
  title, description, actions, back, className, children,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-5 space-y-3", className)}>
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {description && <p className="max-w-3xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
