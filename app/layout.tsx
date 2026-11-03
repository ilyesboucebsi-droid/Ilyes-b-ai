import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ILYES AI",
  description: "مساعدك الذكي بالعربية والإنجليزية",
  applicationName: "ILYES AI"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}