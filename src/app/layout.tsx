import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Coach EDN",
    template: "%s | Coach EDN",
  },
  description:
    "Plataforma de treinamento natural baseada na metodologia da Escola dos Naturais (EDN). Progressao inteligente, IA coach e tracking completo.",
  keywords: ["fisiculturismo natural", "treino", "musculacao", "EDN", "Escola dos Naturais", "Jayme De Lamadrid"],
  authors: [{ name: "Coach EDN" }],
  creator: "Coach EDN",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Coach EDN",
    startupImage: [
      { url: "/icons/icon-512.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/icons/icon-512.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" },
    ],
  },
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/icons/favicon-32.png",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    title: "Coach EDN",
    description:
      "Plataforma de treinamento natural baseada na metodologia EDN. Progressao inteligente, IA coach e tracking completo.",
    siteName: "Coach EDN",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body className="bg-zinc-950 text-zinc-100 font-sans antialiased">
        <PwaRegister />
        <Providers>
          {children}
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: "#0D1117",
                border: "1px solid #2C3E4A",
                color: "#F0F4F6",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
