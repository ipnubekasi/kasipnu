import * as React from "react";
import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom border-collapse text-sm", className)} {...props} />
    </div>
  );
}
function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("border-b border-line bg-subtle/60 text-[12px] uppercase tracking-wide text-muted", className)} {...props} />;
}
function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
function TFoot({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot className={cn("border-t border-line-strong bg-subtle/60 font-medium", className)} {...props} />;
}
function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line transition-colors hover:bg-subtle/50", className)} {...props} />;
}
function TH({ className, ...props }: React.ComponentProps<"th">) {
  return <th scope="col" className={cn("h-9 px-3 text-left align-middle font-medium whitespace-nowrap first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5", className)} {...props} />;
}
function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-3 py-2.5 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5", className)} {...props} />;
}

export { Table, THead, TBody, TFoot, TR, TH, TD };
