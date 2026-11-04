import { NextResponse } from "next/server";
import { getPlatformState } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  let platform = { paused: false, maintenance: false, joinEnabled: true, updatedAt: null as string | null };
  try { platform = await getPlatformState(); } catch { /* Preserve public status availability if Redis is temporarily unreachable. */ }
  return NextResponse.json({
    providers: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      claude: Boolean(process.env.ANTHROPIC_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      groq: Boolean(process.env.GROQ_API_KEY),
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY)
    },
    consensus: Boolean(process.env.consensus_api_key || process.env.CONSENSUS_API_KEY),
    rateLimitConfigured: Boolean((process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) && (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)),
    paused: platform.paused,
    maintenance: platform.maintenance,
    joinEnabled: platform.joinEnabled
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}