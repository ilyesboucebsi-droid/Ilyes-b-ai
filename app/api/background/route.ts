import { NextResponse } from "next/server";
import { redisClient } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const redis = redisClient();
    const meta = await redis.get<{ enabled: boolean }>("ilyesb:platform:background:meta");
    if (!meta?.enabled) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const image = await redis.get<string>("ilyesb:platform:background:image");
    if (typeof image !== "string") return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const match = /^data:image\/(jpeg|webp|png);base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if (!match) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const mime = match[1] === "jpeg" ? "image/jpeg" : "image/" + match[1];
    return new NextResponse(Buffer.from(match[2], "base64"), {
      headers: { "Content-Type": mime, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
    });
  } catch {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
