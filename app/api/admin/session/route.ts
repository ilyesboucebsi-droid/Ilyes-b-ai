import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return NextResponse.json(
    { authenticated: hasAdminSession(req) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
