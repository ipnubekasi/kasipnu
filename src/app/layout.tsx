import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "@/components/ui/sonner";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kas IPNU", template: "%s · Kas IPNU" },
  description: "Sistem Keuangan PC IPNU Kabupaten Bekasi",
  applicationName: "Kas IPNU",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Kas IPNU", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e3a28",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <PwaProvider>{children}</PwaProvider>
        <Toaster />
      </body>
    </html>
  );
}
