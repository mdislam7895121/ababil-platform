import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Platform Factory - Launch Your Business Software in 30 Minutes",
  description: "No code. No mistakes. Preview free. Pay only when you go live. Build custom software for salons, clinics, and delivery businesses.",
  keywords: ["business software", "no code", "salon software", "clinic management", "delivery tracking"],
  openGraph: {
    title: "30 Minutes to Launch Your Business Software",
    description: "No code. No mistakes. Preview free. Pay only when you go live.",
    type: "website",
    siteName: "Platform Factory",
  },
  twitter: {
    card: "summary_large_image",
    title: "30 Minutes to Launch Your Business Software",
    description: "No code. No mistakes. Preview free. Pay only when you go live.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
