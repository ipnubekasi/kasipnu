"use client";

import Link from "next/link";
import { ArrowRight, CheckCheck } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/app/badges";
import { useAction } from "@/components/app/hooks";

function DataLine({ data }: { data: Record<string, unknown> }) {
  const from = data.periode_dari as string | undefined;
  const to = data.periode_sampai as string | undefined;
  const asOf = data.per_tanggal as string | undefined;
  if (from && to) return <>Periode perhitungan {formatDate(from)} sampai {formatDate(to)}</>;
  if (asOf) return <>Per {formatDate(asOf)}</>;
  return null;
}

export function NotificationList({ orgId, items }: { orgId: string; items: Notification[] }) {
  const supabase = createClient();
  const { run, pending } = useAction();
  const unread = items.filter((n) => !n.is_read);
  return (
    <>
      {unread.length > 0 && (
        <div className="flex justify-end border-b border-line px-4 py-2.5 sm:px-5">
          <Button size="sm" loading={pending} onClick={() => run(() => supabase.rpc("mark_notifications_read", { p_org: orgId, p_ids: unread.map((n) => n.id) }), { success: "Ditandai sudah dibaca" })}>
            <CheckCheck aria-hidden />Tandai semua dibaca
          </Button>
        </div>
      )}
      <ul className="divide-y divide-line">
        {items.map((n) => (
          <li key={n.id} className={cn("px-4 py-4 sm:px-5", !n.is_read && "bg-accent-soft/40")}>
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={n.severity} />
              {n.scope_label && <span className="text-[13px] font-medium text-ink">{n.scope_label}</span>}
              {!n.is_read && <span className="inline-flex items-center gap-1 text-[12px] font-medium text-primary"><span className="size-1.5 rounded-full bg-primary" aria-hidden />Belum dibaca</span>}
              {n.resolved_at && n.kind === "kondisi" && <span className="text-[12px] text-accent">Selesai: {n.resolved_reason}</span>}
              {n.reminder_count > 0 && !n.resolved_at && <span className="text-[12px] text-muted">Pengingat ke-{n.reminder_count}</span>}
            </div>
            <p className="mt-1.5 text-[15px] font-semibold text-ink">{n.title}</p>
            <p className="mt-0.5 text-sm text-ink">{n.body}</p>
            {n.suggestion && <p className="mt-1 text-sm text-muted">Saran: {n.suggestion}</p>}
            <p className="mt-1.5 text-[12px] text-muted">
              <DataLine data={n.data} />{(n.data.periode_dari || n.data.per_tanggal) ? " · " : ""}Diperiksa {formatDateTime(n.checked_at)} · Muncul {formatDateTime(n.created_at)} · Aturan versi {n.rule_version}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {n.action_href && (
                <Button asChild size="sm" variant={n.resolved_at ? "secondary" : "primary"}>
                  <Link href={n.action_href} onClick={() => { if (!n.is_read) void supabase.rpc("mark_notifications_read", { p_org: orgId, p_ids: [n.id] }); }}>{n.action_label ?? "Lihat"}<ArrowRight aria-hidden /></Link>
                </Button>
              )}
              {!n.is_read && <Button size="sm" variant="ghost" onClick={() => run(() => supabase.rpc("mark_notifications_read", { p_org: orgId, p_ids: [n.id] }))}>Tandai dibaca</Button>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
