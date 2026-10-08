import * as React from "react";
import { cn } from "@/lib/utils";

/** Keadaan kosong: menjelaskan apa yang belum ada dan langkah berikutnya. */
export function EmptyState({
  icon: Icon, title, description, action, className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {Icon && (
        <span className="mb-3 inline-flex size-11 items-center justify-center rounded-full bg-subtle text-muted">
          <Icon className="size-5" />
        </span>
      )}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
