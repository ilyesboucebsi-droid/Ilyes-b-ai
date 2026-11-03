import { NextRequest, NextResponse } from "next/server";
import { getAdminAudit, getJoinRequests, getPlatformState, hasAdminSession } from "@/lib/admin";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  if (!hasAdminSession(req)) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  try {
    const [state, requests, audit] = await Promise.all([getPlatformState(), getJoinRequests(), getAdminAudit()]);
    return NextResponse.json({ state, requests, audit }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر قراءة بيانات الإدارة." }, { status: 503 });
  }
}