"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const lastPath = useRef("");

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/api") || lastPath.current === pathname) return;
    lastPath.current = pathname;
    try {
      let visitorId = localStorage.getItem("ilyesb_visitor_id");
      if (!visitorId) {
        visitorId = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem("ilyesb_visitor_id", visitorId);
      }
      let referrer = "";
      if (document.referrer) {
        try {
          const host = new URL(document.referrer).hostname;
          if (host !== window.location.hostname) referrer = host;
        } catch { /* ignore invalid referrer */ }
      }
      void fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId, path: pathname, referrer }),
        keepalive: true
      }).catch(() => undefined);
    } catch { /* analytics must never interrupt the app */ }
  }, [pathname]);

  return null;
}
