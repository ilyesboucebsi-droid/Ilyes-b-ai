import { NextRequest, NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/admin";
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  clearAdminCookie(response);
  return response;
}