import { Alert } from "@/components/ui/alert";
import { formatRupiah } from "@/lib/format";

/** Keterangan pada tampilan gabungan agar dana program tidak dikira dana bebas. */
export function CombinedNotice({ general, restricted }: { general?: number; restricted?: number }) {
  return (
    <Alert tone="warn" title="Gabungan semua dana" className="mb-4">
      {typeof general === "number" && typeof restricted === "number" ? (
        <>Kas Umum <strong>{formatRupiah(general)}</strong>, dana program <strong>{formatRupiah(restricted)}</strong>. </>
      ) : null}
      Dana program hanya untuk kegiatannya.
    </Alert>
  );
}
