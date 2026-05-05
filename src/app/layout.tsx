import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "印象城业绩表 OCR",
  description: "拍照识别营收小票并导出商场业绩表 XLSX",
  applicationName: "印象城业绩表",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "业绩表OCR",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#dc6a7b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
