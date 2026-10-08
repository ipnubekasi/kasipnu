import { cn } from "@/lib/utils";

/**
 * Logo organisasi. Bila logo belum diunggah (Pengaturan > Organisasi), tampil
 * lambang IPNU bawaan aplikasi ini.
 */
export function OrgLogo({ src, name, size = 36, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src || "/logo-ipnu.png"} alt={`Logo ${name}`} width={size} height={size} className={cn("shrink-0 rounded-full object-contain", src && "rounded-xl", className)} style={{ width: size, height: size }} />;
}
