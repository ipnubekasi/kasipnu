import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./states";

export function NoWriteAccess({ what = "mengubah data ini", need = "Bendahara", back = "/ringkasan" }: { what?: string; need?: string; back?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface">
      <EmptyState
        icon={Lock}
        title={`Role Anda tidak dapat ${what}`}
        description={`Tindakan ini memerlukan role ${need}. Anda tetap dapat melihat data dan laporan. Hubungi Admin Organisasi bila memerlukan akses.`}
        action={<Button asChild><Link href={back}>Kembali</Link></Button>}
      />
    </div>
  );
}
