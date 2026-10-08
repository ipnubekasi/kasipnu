"use client";

import Link from "next/link";
import { FileDown, FileUp, MoreHorizontal, Scale } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Aksi tambahan halaman Kas dalam satu menu, supaya kepala halaman tetap bersih. */
export function KasActions({ canWrite, exportHref }: { canWrite: boolean; exportHref: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Menu aksi"><MoreHorizontal aria-hidden />Lainnya</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {canWrite && <DropdownMenuItem asChild><Link href="/kas/impor"><FileUp />Impor data</Link></DropdownMenuItem>}
        <DropdownMenuItem asChild><Link href={exportHref}><FileDown />Unduh laporan</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/kas/rekonsiliasi"><Scale />Cocokkan kas</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
