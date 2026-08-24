import type { Metadata } from "next";
import { fontEn } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "SeanOffice",
  description: "Office tools by Sean: sheets, docs, PDFs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <body
        className={`${fontEn.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
