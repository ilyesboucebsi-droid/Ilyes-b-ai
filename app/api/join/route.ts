import { NextRequest, NextResponse } from "next/server";
import { getPlatformState, redisClient, saveJoinRequest } from "@/lib/admin";
import { Ratelimit } from "@upstash/ratelimit";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limiter = new Ratelimit({ redis: redisClient(), limiter: Ratelimit.slidingWindow(3, "1 h"), prefix: "ilyesb:join" });
    if (!(await limiter.limit(ip)).success) return NextResponse.json({ error: "تم بلوغ عدد طلبات الانضمام المسموح. حاول لاحقاً." }, { status: 429 });
    const state = await getPlatformState();
    if (!state.joinEnabled || state.paused || state.maintenance) return NextResponse.json({ error: "الانضمام غير متاح مؤقتاً." }, { status: 403 });
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 160) : "";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "أدخل اسماً وبريداً إلكترونياً صحيحاً." }, { status: 400 });
    await saveJoinRequest({ name, email, message });
    return NextResponse.json({ ok: true, message: "تم استلام طلب الانضمام. هذه خطوة تسجيل اهتمام وليست إنشاء حساب دخول." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر إرسال الطلب." }, { status: 503 });
  }
}