"use client";

import * as React from "react";
import { Pencil, ShieldOff, UserPlus } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import type { Member, Role } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormDialog, type FieldDef } from "@/components/app/form-dialog";
import { useAction } from "@/components/app/hooks";

const ROLE_OPTIONS = [
  { value: "admin", label: ROLE_LABEL.admin, group: "Pengaturan, akun pengguna, buka kembali periode, serah terima." },
  { value: "bendahara", label: ROLE_LABEL.bendahara, group: "Mencatat, membatalkan, impor, cocokkan kas." },
  { value: "pembaca", label: ROLE_LABEL.pembaca, group: "Melihat data dan laporan tanpa mengubah." },
];

export function MembersManager({ orgId, members, isAdmin, selfUserId, inviteEnabled }: { orgId: string; members: Member[]; isAdmin: boolean; selfUserId: string; inviteEnabled: boolean }) {
  const supabase = createClient();
  const { run, pending } = useAction();
  const [add, setAdd] = React.useState(false);
  const [edit, setEdit] = React.useState<Member | null>(null);
  const [revoke, setRevoke] = React.useState<Member | null>(null);

  const baseFields: FieldDef[] = [
    { name: "full_name", label: "Nama lengkap", required: true },
    { name: "position", label: "Jabatan", placeholder: "Misalnya: Ketua, Wakil Bendahara" },
    { name: "roles", label: "Hak akses", type: "checks", required: true, options: ROLE_OPTIONS },
  ];

  return (
    <>
      {!isAdmin && <Alert tone="info" className="mb-4">Hanya Admin Organisasi yang dapat menambah anggota atau mengubah hak akses.</Alert>}
      <div className="mb-4 flex justify-end">
        {isAdmin && <Button variant="primary" onClick={() => setAdd(true)}><UserPlus aria-hidden />Tambah Anggota</Button>}
      </div>
      <Card>
        <Table>
          <THead><TR className="hover:bg-transparent"><TH>Nama</TH><TH>Email</TH><TH>Jabatan</TH><TH>Hak akses</TH><TH>Status</TH><TH /></TR></THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id} className={m.status === "dicabut" ? "text-muted" : ""}>
                <TD className="font-medium">{m.full_name}{m.user_id === selfUserId && <Badge className="ml-2">Anda</Badge>}</TD>
                <TD>{m.email}</TD>
                <TD>{m.position ?? "-"}</TD>
                <TD><span className="flex flex-wrap gap-1">{m.roles.map((r) => <Badge key={r} tone={r === "pembaca" ? "neutral" : "outline"}>{ROLE_LABEL[r]}</Badge>)}</span></TD>
                <TD>
                  {m.status === "aktif" ? <Badge tone="ok">Aktif</Badge> : <Badge>Dicabut</Badge>}
                  {m.status === "dicabut" && <span className="mt-0.5 block text-[12px]">{formatDateTime(m.revoked_at)}{m.revoke_reason ? ` · ${m.revoke_reason}` : ""}</span>}
                </TD>
                <TD className="text-right whitespace-nowrap">
                  {isAdmin && m.status === "aktif" && (
                    <>
                      <Button size="iconSm" variant="ghost" aria-label={`Ubah akses ${m.full_name}`} onClick={() => setEdit(m)}><Pencil aria-hidden /></Button>
                      <Button size="iconSm" variant="ghost" aria-label={`Cabut akses ${m.full_name}`} onClick={() => setRevoke(m)}><ShieldOff aria-hidden /></Button>
                    </>
                  )}
                  {isAdmin && m.status === "dicabut" && <Button size="sm" onClick={() => setEdit(m)}>Pulihkan</Button>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">
          Data keuangan dimiliki organisasi, bukan akun pribadi. Mencabut akses seseorang tidak menghapus transaksi yang pernah ia catat; namanya tetap tercatat pada jejak pencatatan.
        </p>
      </Card>

      <FormDialog
        open={add}
        onOpenChange={setAdd}
        title="Tambah anggota"
        description={inviteEnabled
          ? "Bila email belum memiliki akun, undangan untuk membuat password dikirim otomatis ke email tersebut."
          : "Akun harus sudah dibuat di Supabase (Authentication, Add user) sebelum ditambahkan di sini. Undangan otomatis aktif setelah SUPABASE_SECRET_KEY diisi di server."}
        fields={[{ name: "email", label: "Email akun", type: "email", required: true }, ...baseFields]}
        initial={{ roles: ["pembaca"] }}
        submitLabel={inviteEnabled ? "Tambah dan undang" : "Tambah"}
        onSubmit={async (v) => {
          if (inviteEnabled) {
            const res = await fetch("/api/admin/undang", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: v.email, full_name: v.full_name, position: v.position ?? null, roles: v.roles }) });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) return { message: body.message ?? "Anggota tidak dapat ditambahkan.", hint: body.hint };
            toast.success(body.invited ? "Undangan dikirim dan anggota ditambahkan" : "Anggota ditambahkan");
          } else {
            const { error } = await supabase.rpc("add_member_by_email", { p_org: orgId, p_email: v.email, p_full_name: v.full_name, p_position: v.position ?? null, p_roles: v.roles });
            if (error) return error;
            toast.success("Anggota ditambahkan");
          }
          setAdd(false);
          await run(async () => ({ data: true }));
          return null;
        }}
      />
      <FormDialog
        open={Boolean(edit)}
        onOpenChange={(v) => !v && setEdit(null)}
        title={edit?.status === "dicabut" ? `Pulihkan akses ${edit.full_name}` : `Ubah akses ${edit?.full_name ?? ""}`}
        fields={baseFields}
        initial={edit ? { full_name: edit.full_name, position: edit.position ?? "", roles: edit.roles } : {}}
        onSubmit={async (v) => {
          const res = edit!.status === "dicabut"
            ? await supabase.rpc("add_member_by_email", { p_org: orgId, p_email: edit!.email, p_full_name: v.full_name, p_position: v.position ?? null, p_roles: v.roles })
            : await supabase.rpc("update_member", { p_member_id: edit!.id, p_full_name: v.full_name, p_position: v.position ?? null, p_roles: v.roles as Role[] });
          if (res.error) return res.error;
          toast.success("Hak akses disimpan");
          setEdit(null);
          await run(async () => ({ data: true }));
          return null;
        }}
      />
      <ConfirmDialog
        open={Boolean(revoke)}
        onOpenChange={(v) => !v && setRevoke(null)}
        title={`Cabut akses ${revoke?.full_name}?`}
        description="Pengguna ini tidak bisa lagi membuka data. Akses bisa dipulihkan kapan saja."
        confirmLabel="Cabut akses"
        tone="danger"
        pending={pending}
        reason={{ label: "Alasan pencabutan", required: true, placeholder: "Misalnya: masa khidmat berakhir" }}
        onConfirm={(reason) => run(() => supabase.rpc("revoke_member", { p_member_id: revoke!.id, p_reason: reason }), { success: "Akses dicabut", onSuccess: () => setRevoke(null) })}
      />
    </>
  );
}
