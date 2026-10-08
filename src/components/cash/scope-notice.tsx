import { Alert } from "@/components/ui/alert";
import { formatRupiah } from "@/lib/format";

/** Keterangan wajib pada tampilan gabungan agar saldo program tidak dianggap dana bebas. */
export function CombinedNotice({ general, restricted }: { general?: number; restricted?: number }) {
  return (
    <Alert tone="warn" title="Tampilan gabungan organisasi" className="mb-4">
      Angka di halaman ini mencakup dana program yang terikat pada tujuannya.
      {typeof general === "number" && typeof restricted === "number" ? (
        <> Dari saldo yang tampil, <strong>{formatRupiah(general)}</strong> adalah Kas Umum dan <strong>{formatRupiah(restricted)}</strong> adalah dana program.</>
      ) : null}{" "}
      Hanya Kas Umum yang bebas digunakan untuk operasional. Transfer internal sudah dieliminasi.
    </Alert>
  );
}
