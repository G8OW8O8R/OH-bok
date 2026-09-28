import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SceneFitScript } from "@/components/scene/SceneFitScript";
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
    <html lang="pl" className={`${inter.variable} h-full`}>
      <head>
        <SceneFitScript />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
