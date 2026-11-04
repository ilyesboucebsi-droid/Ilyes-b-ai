import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import AnalyticsTracker from "@/components/analytics-tracker";
import "./globals.css";

const siteUrl = "https://ilyes-b-ai.vercel.app";
const siteName = "ILYES AI";
const siteDescription =
  "منصة ذكاء اصطناعي مفتوحة للمحادثة والبحث الأكاديمي، تساعد الطلاب والباحثين على تنظيم الأفكار والوصول إلى المعرفة والمراجع.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ILYES AI | منصة الذكاء الاصطناعي والبحث الأكاديمي",
    template: "%s | ILYES AI"
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    "ILYES AI", "الذكاء الاصطناعي", "البحث الأكاديمي", "مساعد أكاديمي",
    "البحث العلمي", "تحليل النصوص", "مصادر علمية", "طلاب الجامعات",
    "Artificial Intelligence", "Academic Research"
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName,
    locale: "ar_DZ",
    title: "ILYES AI | منصة الذكاء الاصطناعي والبحث الأكاديمي",
    description: siteDescription,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "ILYES AI - Academic research and artificial intelligence" }]
  },
  twitter: {
    card: "summary_large_image",
    images: ["/opengraph-image"],
    title: "ILYES AI | منصة الذكاء الاصطناعي والبحث الأكاديمي",
    description: siteDescription
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  }
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  alternateName: "ILYES.B AI",
  url: siteUrl,
  inLanguage: ["ar", "en"],
  description: siteDescription
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c")
          }}
        />
        {children}
        <AnalyticsTracker />
        <Analytics />
      </body>
    </html>
  );
}
