import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { InitScript } from "@/components/system/InitScript";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Obok",
  description: "Twój dzień, obok ciebie.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Skrypt startu ustawia na <html> plan i czasy sekwencji przed hydracją (data-boot, zmienne CSS).
    <html lang="pl" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        <InitScript />
        {children}
      </body>
    </html>
  );
}
