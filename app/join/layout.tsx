import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "طلب الانضمام",
  description: "أرسل طلب اهتمامك للانضمام إلى مجتمع ILYES AI ومتابعة تحديثات المنصة.",
  robots: { index: false, follow: true }
};

export default function JoinLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
