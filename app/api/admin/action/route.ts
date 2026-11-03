import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { redisClient } from "@/lib/admin";
import { auditAdminAction, getPlatformState, hasAdminSession, savePlatformState, verifyAdminPassword } from "@/lib/admin";
import type { PlatformState } from "@/lib/admin";
export const runtime = "nodejs";
const ACTIONS = ["pause", "resume", "maintenance_on", "maintenance_off", "join_on", "join_off"] as const;
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  if (!hasAdminSession(req)) return NextResponse.json({ error: "انتهت جلسة الإدارة. سجّل الدخول مجدداً." }, { status: 401 });
  try {
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limiter = new Ratelimit({ redis: redisClient(), limiter: Ratelimit.slidingWindow(6, "10 m"), prefix: "ilyesb:admin-actions" });
    if (!(await limiter.limit(ip)).success) return NextResponse.json({ error: "محاولات كثيرة. انتظر قليلاً قبل إعادة المحاولة." }, { status: 429 });
    const body = await req.json();
    if (!verifyAdminPassword(body.password)) return NextResponse.json({ error: "كلمة المرور غير صحيحة. لم يُنفذ أي تغيير." }, { status: 401 });
    if (!ACTIONS.includes(body.action)) return NextResponse.json({ error: "الإجراء غير معروف." }, { status: 400 });
    const state: PlatformState = await getPlatformState();
    if (body.action === "pause") state.paused = true;
    if (body.action === "resume") state.paused = false;
    if (body.action === "maintenance_on") state.maintenance = true;
    if (body.action === "maintenance_off") state.maintenance = false;
    if (body.action === "join_on") state.joinEnabled = true;
    if (body.action === "join_off") state.joinEnabled = false;
    state.updatedAt = new Date().toISOString();
    await savePlatformState(state);
    await auditAdminAction(body.action);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تنفيذ الإجراء." }, { status: 503 });
  }
}