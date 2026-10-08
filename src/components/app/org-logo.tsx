import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Logo organisasi. Bila logo belum diunggah (Pengaturan > Organisasi), tampil
 * placeholder netral. Sengaja bukan tiruan logo IPNU.
 */
export function OrgLogo({ src, name, size = 36, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={`Logo ${name}`} width={size} height={size} className={cn("rounded-lg object-contain", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      role="img"
      aria-label="Logo organisasi belum diunggah"
      className={cn("inline-flex items-center justify-center rounded-lg border border-accent-line bg-accent-soft text-primary", className)}
      style={{ width: size, height: size }}
    >
      <Landmark style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden />
    </span>
  );
}
