import Link from "next/link";
import { SearchX } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/states";

export default function NotFound() {
  return (
    <div className="rounded-card border border-line bg-surface">
      <EmptyState
        icon={SearchX}
        title="Data tidak ditemukan"
        description="Halaman atau data yang Anda cari tidak ada, sudah dihapus, atau Anda tidak memiliki akses ke sana."
        action={<Button asChild variant="primary"><Link href="/ringkasan">Kembali ke Ringkasan</Link></Button>}
      />
    </div>
  );
}
