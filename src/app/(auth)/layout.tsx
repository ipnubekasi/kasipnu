import { OrgLogo } from "@/components/app/org-logo";
import { IoCheckmarkCircle } from "react-icons/io5";

const POINTS = ["Buku kas dan jurnal ganda yang rapi", "Laporan dan LPJ siap cetak", "Bukti transaksi tersimpan aman"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-bg relative min-h-dvh overflow-hidden">
      {/* Pelembut agar kartu dan teks tetap terbaca di atas latar berwarna */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-white/40" aria-hidden />
      <div className="safe-top relative mx-auto grid min-h-dvh w-full max-w-[1240px] items-center gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_440px] lg:gap-16 lg:px-12">
        {/* Merek: kiri di layar lebar, di atas kartu di ponsel */}
        <div className="order-1 flex flex-col items-center gap-5 lg:items-start lg:justify-between lg:self-stretch lg:py-10">
          <div className="inline-flex items-center gap-3 rounded-full bg-white/70 py-2 pr-5 pl-2 shadow-soft backdrop-blur-xl">
            <OrgLogo name="PC IPNU Kabupaten Bekasi" size={44} />
            <div className="leading-tight">
              <p className="text-[17px] font-semibold tracking-tight text-ink">Kas IPNU</p>
              <p className="text-[12px] text-muted">PC IPNU Kabupaten Bekasi</p>
            </div>
          </div>

          <div className="hidden max-w-[460px] rounded-[32px] bg-white/60 p-8 shadow-soft backdrop-blur-xl lg:block">
            <p className="text-[32px] leading-[1.15] font-semibold tracking-tight text-ink">Keuangan organisasi yang rapi, jujur, dan siap diperiksa.</p>
            <ul className="mt-6 space-y-3">
              {POINTS.map((p) => (
                <li key={p} className="flex items-center gap-2.5 text-[15px] text-ink">
                  <IoCheckmarkCircle className="size-5 shrink-0 text-accent" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="order-2 mx-auto w-full max-w-[440px] pb-6">
          {children}
          <p className="mt-6 text-center text-[12px] text-muted">Sistem Keuangan PC IPNU Kabupaten Bekasi</p>
        </div>
      </div>
    </main>
  );
}
