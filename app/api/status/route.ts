import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    providers: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      claude: Boolean(process.env.ANTHROPIC_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      groq: Boolean(process.env.GROQ_API_KEY)
    },
    consensus: Boolean(process.env.consensus_api_key || process.env.CONSENSUS_API_KEY)
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}