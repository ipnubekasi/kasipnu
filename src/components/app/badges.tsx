import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CheckCircle2, CircleDashed, CircleHelp, CircleSlash, FileCheck2, FileQuestion, FileX2, Flag, PencilLine, RotateCcw, ShieldAlert, ShieldCheck, ShieldQuestion, TriangleAlert, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EVIDENCE_LABEL, HEALTH_LABEL, KIND_LABEL, PROGRAM_STATUS_LABEL, STATUS_LABEL } from "@/lib/labels";
import type { EntryKind, EntryStatus, EvidenceStatus, HealthStatus, ProgramStatus } from "@/lib/types";

// Setiap status membawa ikon dan label, sehingga informasi tidak bergantung pada warna.

export function EntryStatusBadge({ status }: { status: EntryStatus }) {
  const map = {
    draft: { tone: "warn", icon: PencilLine },
    dibukukan: { tone: "ok", icon: CheckCircle2 },
    dibalik: { tone: "neutral", icon: Undo2 },
  } as const;
  const { tone, icon: Icon } = map[status];
  return <Badge tone={tone}><Icon aria-hidden />{STATUS_LABEL[status]}</Badge>;
}

export function EvidenceBadge({ status, count }: { status: EvidenceStatus; count?: number }) {
  const map = {
    lengkap: { tone: "ok", icon: FileCheck2 },
    belum_ada: { tone: "warn", icon: FileQuestion },
    tidak_tersedia: { tone: "neutral", icon: FileX2 },
  } as const;
  const { tone, icon: Icon } = map[status];
  return <Badge tone={tone}><Icon aria-hidden />{EVIDENCE_LABEL[status]}{status === "lengkap" && count && count > 1 ? ` (${count})` : ""}</Badge>;
}

export function KindBadge({ kind }: { kind: EntryKind }) {
  const map = {
    pemasukan: { tone: "ok", icon: ArrowDownLeft },
    pengeluaran: { tone: "danger", icon: ArrowUpRight },
    transfer: { tone: "info", icon: ArrowLeftRight },
    saldo_awal: { tone: "outline", icon: Flag },
    penyesuaian: { tone: "outline", icon: PencilLine },
    pembalikan: { tone: "neutral", icon: RotateCcw },
  } as const;
  const { tone, icon: Icon } = map[kind];
  return <Badge tone={tone}><Icon aria-hidden />{KIND_LABEL[kind]}</Badge>;
}

export function ProgramStatusBadge({ status }: { status: ProgramStatus }) {
  const map = {
    perencanaan: { tone: "info", icon: CircleDashed },
    berjalan: { tone: "ok", icon: CheckCircle2 },
    selesai: { tone: "outline", icon: Flag },
    diarsipkan: { tone: "neutral", icon: CircleSlash },
  } as const;
  const { tone, icon: Icon } = map[status];
  return <Badge tone={tone}><Icon aria-hidden />{PROGRAM_STATUS_LABEL[status]}</Badge>;
}

export const HEALTH_STYLE = {
  aman: { tone: "ok", icon: ShieldCheck, text: "text-accent", box: "border-accent-line bg-accent-soft" },
  perlu_perhatian: { tone: "warn", icon: TriangleAlert, text: "text-warn", box: "border-warn-line bg-warn-soft" },
  kritis: { tone: "danger", icon: ShieldAlert, text: "text-danger", box: "border-danger-line bg-danger-soft" },
  data_belum_cukup: { tone: "neutral", icon: ShieldQuestion, text: "text-muted", box: "border-line bg-subtle" },
} as const;

export function HealthBadge({ status }: { status: HealthStatus }) {
  const { tone, icon: Icon } = HEALTH_STYLE[status];
  return <Badge tone={tone}><Icon aria-hidden />{HEALTH_LABEL[status]}</Badge>;
}

export function SeverityBadge({ severity }: { severity: "info" | "perlu_perhatian" | "kritis" }) {
  if (severity === "kritis") return <Badge tone="danger"><ShieldAlert aria-hidden />Kritis</Badge>;
  if (severity === "perlu_perhatian") return <Badge tone="warn"><TriangleAlert aria-hidden />Perlu perhatian</Badge>;
  return <Badge tone="info"><CircleHelp aria-hidden />Informasi</Badge>;
}
