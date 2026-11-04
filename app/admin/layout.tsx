import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "لوحة إدارة المنصة",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noimageindex: true }
  }
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
