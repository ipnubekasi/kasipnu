import { OrgLogo } from "@/components/app/org-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-bg relative min-h-dvh">
      <div className="safe-top relative mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col justify-center px-4 py-8 sm:px-8 lg:px-12">
        {/* Merek: melayang di kiri atas pada layar lebar, di atas kartu pada ponsel */}
        <div className="mb-6 flex justify-center lg:absolute lg:top-8 lg:left-12 lg:mb-0">
          <div className="inline-flex items-center gap-3 rounded-full bg-white/80 py-2 pr-5 pl-2 shadow-soft">
            <OrgLogo name="PC IPNU Kabupaten Bekasi" size={40} />
            <div className="leading-tight">
              <p className="text-[16px] font-semibold tracking-tight text-ink">Kas IPNU</p>
              <p className="text-[12px] text-muted">PC IPNU Kabupaten Bekasi</p>
            </div>
          </div>
        </div>

        {/*
          Dua kolom berawal dari garis atas yang sama. Kolom kiri diberi jarak atas
          setinggi pengalih tab + padding kartu, sehingga narasi sejajar dengan judul
          "Selamat datang kembali" di dalam kartu.
        */}
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_440px] lg:gap-20">
          <div className="hidden lg:block lg:pt-[7rem]">
            <p className="text-[13px] font-medium tracking-wide text-primary uppercase">Sistem keuangan organisasi</p>
            <h2 className="mt-3 max-w-[400px] text-[36px] leading-[1.14] font-semibold tracking-tight text-balance text-ink">
              Buku kas yang tertib, dari catatan pertama sampai LPJ.
            </h2>
            <p className="mt-4 max-w-[370px] text-[16px] leading-relaxed text-ink/80">
              Catat pemasukan dan pengeluaran, kelola dana tiap program, lalu susun laporan dari satu tempat.
            </p>
          </div>

          <div className="mx-auto w-full max-w-[440px]">
            {children}
            <p className="mt-6 text-center text-[12px] text-ink/60">Sistem Keuangan PC IPNU Kabupaten Bekasi</p>
          </div>
        </div>
      </div>
    </main>
  );
}
