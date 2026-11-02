import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ILYES.B AI",
  description: "مساعدك الذكي بالعربية والإنجليزية",
  applicationName: "ILYES.B AI"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}