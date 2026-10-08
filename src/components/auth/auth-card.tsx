import { OrgLogo } from "@/components/app/org-logo";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <OrgLogo name="PC IPNU Kabupaten Bekasi" size={52} className="mb-3" />
        <p className="text-xl font-semibold tracking-tight text-ink">Kas IPNU</p>
        <p className="text-sm text-muted">PC IPNU Kabupaten Bekasi</p>
      </div>
      <h1 className="text-base font-semibold text-ink">{title}</h1>
      {subtitle && <p className="mt-1 mb-5 text-sm text-muted">{subtitle}</p>}
      {!subtitle && <div className="mb-5" />}
      {children}
    </div>
  );
}
