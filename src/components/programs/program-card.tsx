import Link from "next/link";
import { CalendarDays, UserRound } from "@/components/ui/icons";
import { HealthBadge } from "@/components/app/badges";
import { Money } from "@/components/app/money";
import { PROGRAM_STATUS_LABEL } from "@/lib/labels";
import { formatDate, formatPercent } from "@/lib/format";
import type { Program } from "@/lib/types";

/** Warna sampul: tetap dalam palet hijau dan kuning, dipilih tetap dari id program. */
const COVERS = [
  ["#14503a", "#0e3a28"],
  ["#15724a", "#0f5a3a"],
  ["#1c5c4f", "#123f37"],
  ["#4a6b1f", "#34500f"],
  ["#8a6d00", "#6a5300"],
] as const;

function coverFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COVERS[h % COVERS.length];
}

export function ProgramCard({ program: p, budget, expense, balance, health }: { program: Program; budget: number; expense: number; balance: number; health?: string | null }) {
  const [from, to] = coverFor(p.id);
  const pct = budget > 0 ? Math.min(100, (expense / budget) * 100) : null;
  const date = p.start_date ? formatDate(p.start_date) : "Tanggal belum ditentukan";
  return (
    <Link href={`/program/${p.id}`} className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-[transform,box-shadow] duration-200 ease-out active:scale-[0.97] active:shadow-soft motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)]:hover:z-10 [@media(hover:hover)]:hover:scale-[1.04] [@media(hover:hover)]:hover:shadow-pop motion-reduce:[@media(hover:hover)]:hover:scale-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <div className="relative flex h-36 flex-col justify-between overflow-hidden p-4 text-white" style={{ background: `linear-gradient(160deg, ${from} 0%, ${to} 100%)` }}>
        <svg aria-hidden className="pointer-events-none absolute -right-8 -bottom-12 size-48 opacity-[0.12]" viewBox="0 0 200 200" fill="none" stroke="#fff" strokeWidth="1.5">
          <circle cx="100" cy="100" r="30" /><circle cx="100" cy="100" r="55" /><circle cx="100" cy="100" r="80" />
        </svg>
        <div className="relative flex items-start justify-between gap-2">
          <span className="rounded-md bg-white/15 px-2 py-0.5 text-[12px] font-medium tracking-wide">{p.code}</span>
          <span className="rounded-md bg-pill px-2 py-0.5 text-[12px] font-medium text-pill-ink">{PROGRAM_STATUS_LABEL[p.status]}</span>
        </div>
        <h3 className="relative line-clamp-2 text-lg leading-snug font-semibold tracking-tight text-balance">{p.name}</h3>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden />{date}</span>
          {p.pic_name && <span className="inline-flex items-center gap-1.5"><UserRound className="size-4" aria-hidden />{p.pic_name}</span>}
          {(health === "kritis" || health === "perlu_perhatian") && <HealthBadge status={health} />}
        </div>
        <dl className="grid grid-cols-3 gap-2 border-t border-line pt-3">
          <div><dt className="text-[12px] text-muted">Anggaran</dt><dd className="mt-0.5 text-sm font-medium"><Money value={budget} dashZero /></dd></div>
          <div><dt className="text-[12px] text-muted">Terpakai</dt><dd className="mt-0.5 text-sm font-medium"><Money value={expense} dashZero /></dd></div>
          <div><dt className="text-[12px] text-muted">Sisa dana</dt><dd className="mt-0.5 text-sm font-semibold"><Money value={balance} tone="auto" /></dd></div>
        </dl>
        {pct !== null && (
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
            <p className="mt-1 text-[12px] text-muted">{formatPercent((expense / budget) * 100)} dari anggaran</p>
          </div>
        )}
      </div>
    </Link>
  );
}
