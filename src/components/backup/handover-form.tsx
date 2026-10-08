"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Member } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useAction } from "@/components/app/hooks";

export function HandoverForm({ orgId, members }: { orgId: string; members: Member[] }) {
  const { run, pending } = useAction();
  const active = members.filter((m) => m.status === "aktif");
  const treasurers = active.filter((m) => m.roles.includes("bendahara"));
  const [next, setNext] = React.useState("");
  const [old, setOld] = React.useState(treasurers[0]?.id ?? "");
  const [oldAction, setOldAction] = React.useState<"pembaca" | "cabut" | "tetap">("pembaca");
  const [admin, setAdmin] = React.useState(true);
  const [note, setNote] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const nextM = active.find((m) => m.id === next);
  const oldM = active.find((m) => m.id === old);
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Pastikan bendahara penerus sudah memiliki akun. Bila belum, tambahkan di <Link href="/pengaturan/anggota" className="text-accent underline">Anggota dan hak akses</Link>.</li>
        <li>Unduh paket serah terima di bawah dan serahkan bersama dokumen fisik.</li>
        <li>Alihkan akses: penerus mendapat role Bendahara, akses bendahara lama diturunkan atau dicabut.</li>
      </ol>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Bendahara penerus" htmlFor="ho-next" required>
          <Select id="ho-next" value={next} onChange={(e) => setNext(e.target.value)}>
            <option value="">Pilih anggota</option>
            {active.map((m) => <option key={m.id} value={m.id}>{m.full_name} ({m.email})</option>)}
          </Select>
        </Field>
        <Field label="Bendahara lama" htmlFor="ho-old">
          <Select id="ho-old" value={old} onChange={(e) => setOld(e.target.value)}>
            <option value="">Tidak ada</option>
            {treasurers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Akses bendahara lama setelah serah terima" htmlFor="ho-action">
          <Select id="ho-action" value={oldAction} onChange={(e) => setOldAction(e.target.value as typeof oldAction)}>
            <option value="pembaca">Menjadi Pembaca (hanya melihat)</option>
            <option value="cabut">Dicabut seluruhnya</option>
            <option value="tetap">Tetap seperti sekarang</option>
          </Select>
        </Field>
        <Field label="Catatan serah terima" htmlFor="ho-note"><Input id="ho-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Misalnya: serah terima di Rapat Pleno 12 Oktober" /></Field>
      </div>
      <div className="flex items-start gap-2.5">
        <Checkbox id="ho-admin" checked={admin} onChange={(e) => setAdmin(e.target.checked)} className="mt-0.5" />
        <Label htmlFor="ho-admin" className="font-normal">Jadikan penerus juga Admin Organisasi</Label>
      </div>
      {next && next === old && <Alert tone="warn">Penerus dan bendahara lama adalah orang yang sama.</Alert>}
      <Button variant="primary" disabled={!next || next === old} onClick={() => setConfirm(true)}>Alihkan Akses Bendahara</Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Konfirmasi serah terima"
        description={<><strong>{nextM?.full_name}</strong> akan menjadi Bendahara{admin ? " dan Admin" : ""}.{oldM && oldAction !== "tetap" ? <> Akses <strong>{oldM.full_name}</strong> akan {oldAction === "cabut" ? "dicabut" : "diturunkan menjadi Pembaca"}.</> : null} Seluruh transaksi, jurnal, dan bukti tetap milik organisasi dan tidak berpindah.</>}
        confirmLabel="Alihkan akses"
        pending={pending}
        onConfirm={() => run(() => createClient().rpc("handover_treasurer", { p_org: orgId, p_new_member_id: next, p_old_member_id: old || null, p_old_action: oldAction, p_make_admin: admin, p_note: note }), { success: "Serah terima tercatat", onSuccess: () => setConfirm(false) })}
      />
    </div>
  );
}
