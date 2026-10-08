import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Memuat halaman" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-card" />)}
      </div>
      <div className="rounded-card border border-line bg-surface p-4">
        {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="mb-3 h-8 last:mb-0" />)}
      </div>
      <span className="sr-only">Memuat data</span>
    </div>
  );
}
