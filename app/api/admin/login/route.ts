import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { adminConfigured, createAdminSession, redisClient, setAdminCookie, verifyAdminPassword } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
    if (!adminConfigured()) return NextResponse.json({ error: "إعداد الإدارة غير مكتمل. راجع متغيرات البيئة في Vercel." }, { status: 503 });
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limiter = new Ratelimit({ redis: redisClient(), limiter: Ratelimit.slidingWindow(5, "10 m"), prefix: "ilyesb:admin-login" });
    if (!(await limiter.limit(ip)).success) return NextResponse.json({ error: "محاولات كثيرة. حاول بعد عشر دقائق." }, { status: 429 });
    const body = await req.json();
    if (!verifyAdminPassword(body.password)) return NextResponse.json({ error: "كلمة المرور غير صحيحة." }, { status: 401 });
    const response = NextResponse.json({ ok: true });
    setAdminCookie(response, createAdminSession());
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تسجيل الدخول." }, { status: 503 });
  }
}