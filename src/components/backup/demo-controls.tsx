"use client";

import * as React from "react";
import { FlaskConical, Trash2 } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useAction } from "@/components/app/hooks";

export function DemoControls({ orgId, isDemo, canLoad }: { orgId: string; isDemo: boolean; canLoad: boolean }) {
  const { run, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  if (!isDemo && !canLoad) return <p className="text-sm text-muted">Data contoh hanya bisa dimuat pada organisasi yang masih kosong.</p>;
  return (
    <>
      <p className="text-sm text-muted">
        {isDemo
          ? "Mode demo aktif. Semua data saat ini hanya contoh. Hapus sebelum mencatat keuangan sebenarnya."
          : "Muat contoh program dan transaksi untuk mencoba aplikasi."}
      </p>
      <Button variant={isDemo ? "dangerOutline" : "secondary"} className="mt-3" onClick={() => setOpen(true)}>
        {isDemo ? <><Trash2 aria-hidden />Hapus data contoh</> : <><FlaskConical aria-hidden />Muat data contoh</>}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={isDemo ? "Hapus seluruh data contoh?" : "Muat data contoh?"}
        description={isDemo ? "Semua transaksi, program, dan notifikasi dihapus. Organisasi kembali kosong." : "Aplikasi akan menampilkan penanda Mode demo di setiap halaman sampai data contoh dihapus."}
        confirmLabel={isDemo ? "Hapus data contoh" : "Muat data contoh"}
        tone={isDemo ? "danger" : "primary"}
        pending={pending}
        onConfirm={() => run(() => createClient().rpc(isDemo ? "clear_demo_data" : "load_demo_data", { p_org: orgId }), { success: isDemo ? "Data contoh dihapus" : "Data contoh dimuat", onSuccess: () => setOpen(false) })}
      />
    </>
  );
}
