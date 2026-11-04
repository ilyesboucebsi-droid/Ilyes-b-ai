import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { redisClient } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    const body = await req.json();
    const visitorId = typeof body.visitorId === "string" ? body.visitorId : "";
    const path = typeof body.path === "string" ? body.path : "";
    if (visitorId.length < 16 || visitorId.length > 100 || !path.startsWith("/") || path.length > 140 || path.startsWith("/api") || path.startsWith("/admin")) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const redis = redisClient();
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const visitor = createHash("sha256").update(visitorId).digest("hex");
    const ua = req.headers.get("user-agent") || "";
    const device = /tablet|ipad/i.test(ua) ? "لوحي" : /mobile|android|iphone/i.test(ua) ? "هاتف" : "حاسوب";
    let referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 100) : "";
    if (referrer === req.nextUrl.hostname) referrer = "";

    await Promise.all([
      redis.incr("ilyesb:analytics:views:" + day),
      redis.expire("ilyesb:analytics:views:" + day, 60 * 60 * 24 * 45),
      redis.sadd("ilyesb:analytics:visitors:" + day, visitor),
      redis.expire("ilyesb:analytics:visitors:" + day, 60 * 60 * 24 * 45),
      redis.sadd("ilyesb:analytics:visitors:30d", visitor),
      redis.expire("ilyesb:analytics:visitors:30d", 60 * 60 * 24 * 35),
      redis.lpush("ilyesb:analytics:events", JSON.stringify({ at: now.toISOString(), path, referrer, device, visitor })),
      redis.ltrim("ilyesb:analytics:events", 0, 4999)
    ]);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
