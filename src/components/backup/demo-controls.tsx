"use client";

import * as React from "react";
import { FlaskConical, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useAction } from "@/components/app/hooks";

export function DemoControls({ orgId, isDemo, canLoad }: { orgId: string; isDemo: boolean; canLoad: boolean }) {
  const { run, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  if (!isDemo && !canLoad) return <p className="text-sm text-muted">Data contoh hanya dapat dimuat pada organisasi yang belum memiliki transaksi atau program. Organisasi ini sudah berisi data nyata.</p>;
  return (
    <>
      <p className="text-sm text-muted">
        {isDemo
          ? "Mode demo aktif. Semua transaksi, program, dan kebutuhan kas saat ini adalah data contoh. Hapus data contoh sebelum mulai mencatat keuangan sebenarnya."
          : "Muat contoh program MAKESTA, LAKMUD, rapat kerja, dan kegiatan sosial beserta transaksi lima bulan terakhir untuk mencoba aplikasi. Data contoh tidak pernah dimuat tanpa tindakan ini."}
      </p>
      <Button variant={isDemo ? "dangerOutline" : "secondary"} className="mt-3" onClick={() => setOpen(true)}>
        {isDemo ? <><Trash2 aria-hidden />Hapus data contoh</> : <><FlaskConical aria-hidden />Muat data contoh</>}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={isDemo ? "Hapus seluruh data contoh?" : "Muat data contoh?"}
        description={isDemo ? "Semua transaksi, program, RAB, kebutuhan kas, dan notifikasi akan dihapus sehingga organisasi kembali kosong. Audit log tetap tersimpan." : "Aplikasi akan menampilkan penanda Mode demo di setiap halaman sampai data contoh dihapus."}
        confirmLabel={isDemo ? "Hapus data contoh" : "Muat data contoh"}
        tone={isDemo ? "danger" : "primary"}
        pending={pending}
        onConfirm={() => run(() => createClient().rpc(isDemo ? "clear_demo_data" : "load_demo_data", { p_org: orgId }), { success: isDemo ? "Data contoh dihapus" : "Data contoh dimuat", onSuccess: () => setOpen(false) })}
      />
    </>
  );
}
