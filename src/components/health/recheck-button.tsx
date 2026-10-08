"use client";

import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/app/hooks";

export function RecheckButton({ orgId }: { orgId: string }) {
  const { run, pending } = useAction();
  return (
    <Button loading={pending} onClick={() => run(() => createClient().rpc("run_health_checks", { p_org: orgId }), { success: "Pemeriksaan selesai" })}>
      <RefreshCw aria-hidden />Periksa sekarang
    </Button>
  );
}
