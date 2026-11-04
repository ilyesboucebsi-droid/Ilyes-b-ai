import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession, redisClient } from "@/lib/admin";

export const runtime = "nodejs";
const IMAGE_KEY = "ilyesb:platform:background:image";
const META_KEY = "ilyesb:platform:background:meta";

export async function GET(req: NextRequest) {
  if (!hasAdminSession(req)) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  try {
    const meta = await redisClient().get<{ enabled: boolean; updatedAt: string }>(META_KEY);
    return NextResponse.json(meta || { enabled: false, updatedAt: null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "تعذر قراءة إعدادات الخلفية." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (!hasAdminSession(req)) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  try {
    const body = await req.json();
    const redis = redisClient();
    const current = await redis.get<{ enabled: boolean; updatedAt: string }>(META_KEY);
    const action = body?.action;
    if (action === "upload") {
      const image = body?.image;
      if (typeof image !== "string" || !/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 1_650_000) {
        return NextResponse.json({ error: "الصورة غير صالحة أو يتجاوز حجمها الحد المسموح (1.2 ميغابايت بعد الضغط)." }, { status: 400 });
      }
      await redis.set(IMAGE_KEY, image);
      const meta = { enabled: true, updatedAt: new Date().toISOString() };
      await redis.set(META_KEY, meta);
      return NextResponse.json(meta, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "enable" || action === "disable") {
      if (action === "enable" && !(await redis.exists(IMAGE_KEY))) return NextResponse.json({ error: "ارفع صورة خلفية أولاً." }, { status: 400 });
      const meta = { enabled: action === "enable", updatedAt: current?.updatedAt || new Date().toISOString() };
      await redis.set(META_KEY, meta);
      return NextResponse.json(meta, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "إجراء غير معروف." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "تعذر حفظ إعداد الخلفية. تحقق من اتصال قاعدة البيانات." }, { status: 503 });
  }
}
