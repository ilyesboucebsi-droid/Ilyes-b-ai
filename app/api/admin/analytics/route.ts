import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession, redisClient } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasAdminSession(req)) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  try {
    const redis = redisClient();
    const now = new Date();
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      return d.toISOString().slice(0, 10);
    });
    const counts = await Promise.all(days.map(day => redis.get<number>("ilyesb:analytics:views:" + day)));
    const views7 = counts.slice(0, 7).reduce<number>((sum, n) => sum + Number(n ?? 0), 0);
    const views30 = counts.reduce<number>((sum, n) => sum + Number(n ?? 0), 0);
    const unique30 = Number(await redis.scard("ilyesb:analytics:visitors:30d") || 0);
    const raw = await redis.lrange<string>("ilyesb:analytics:events", 0, 4999);
    const events = raw.map(item => {
      try { return typeof item === "string" ? JSON.parse(item) : item; } catch { return null; }
    }).filter(Boolean).filter((item: any) => {
      const time = new Date(item.at).getTime();
      return Number.isFinite(time) && time >= now.getTime() - 30 * 86400000;
    }) as Array<{ at: string; path: string; referrer: string; device: string }>;

    const countBy = (key: "path" | "referrer" | "device") => {
      const map = new Map<string, number>();
      for (const event of events) {
        const value = event[key] || (key === "referrer" ? "مباشر / غير معروف" : "غير معروف");
        map.set(value, (map.get(value) || 0) + 1);
      }
      return Array.from(map, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
    };
    const daily = days.slice(0, 7).reverse().map((day, index) => ({ day, views: Number(counts[6 - index] ?? 0) }));
    return NextResponse.json({
      views7, views30, unique30, pages: countBy("path"), referrers: countBy("referrer"),
      devices: countBy("device"), daily, sampleSize: events.length, updatedAt: now.toISOString()
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "تعذر تحميل إحصائيات الزوار. تحقق من اتصال قاعدة البيانات." }, { status: 503 });
  }
}
