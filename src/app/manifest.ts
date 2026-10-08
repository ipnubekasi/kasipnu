import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/ringkasan",
    name: "Kas IPNU, Sistem Keuangan PC IPNU Kabupaten Bekasi",
    short_name: "Kas IPNU",
    description: "Pencatatan keuangan organisasi yang rapi, dari genggaman bendahara.",
    lang: "id",
    dir: "ltr",
    start_url: "/ringkasan",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f7f4",
    theme_color: "#0e3a28",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Catat transaksi", short_name: "Catat", url: "/kas/baru", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Ringkasan", url: "/ringkasan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Kas Umum", url: "/kas", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Program", url: "/program", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
