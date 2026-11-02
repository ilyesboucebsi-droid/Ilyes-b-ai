import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";

async function checkLimit(req: NextRequest) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return process.env.NODE_ENV !== "production";
  const redis = new Redis({ url, token });
  const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 m"), prefix: "ilyesb:research" });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return (await limiter.limit(ip)).success;
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  return "";
}

export async function POST(req: NextRequest) {
  try {
    if (!(await checkLimit(req))) {
      return NextResponse.json({ error: "تعذر تنفيذ البحث الآن أو تجاوزت حد الطلبات. حاول لاحقاً." }, { status: 429 });
    }
    const body = await req.json();
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (query.length < 3 || query.length > 500) {
      return NextResponse.json({ error: "اكتب عبارة بحث من 3 إلى 500 حرف." }, { status: 400 });
    }

    const key = process.env.consensus_api_key || process.env.CONSENSUS_API_KEY;
    if (!key) return NextResponse.json({ error: "مفتاح Consensus غير مضبوط في إعدادات الخادم." }, { status: 503 });

    const url = new URL("https://api.consensus.app/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("page_size", "8");
    url.searchParams.set("include_semantic_score", "true");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "x-api-key": key, "Accept": "application/json" },
      signal: AbortSignal.timeout(30000)
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = typeof data?.detail === "string" ? data.detail : typeof data?.message === "string" ? data.message : "تعذر إكمال البحث في Consensus.";
      return NextResponse.json({ error: detail }, { status: response.status === 429 ? 429 : 502 });
    }

    const raw = Array.isArray(data) ? data : data.results || data.papers || data.items || data.data || [];
    const papers = (Array.isArray(raw) ? raw : []).slice(0, 8).map((p: any) => ({
      title: text(p.title || p.paper_title || p.name) || "عنوان غير متاح",
      authors: text(p.authors || p.author_names || p.author),
      year: text(p.year || p.publication_year || p.pub_year),
      journal: text(p.journal || p.venue || p.journal_name),
      abstract: text(p.abstract || p.summary || p.snippet),
      url: text(p.url || p.paper_url || p.link || p.open_access_url),
      doi: text(p.doi),
      citations: p.citation_count ?? p.citations ?? null
    }));
    return NextResponse.json({ papers, total: data.total ?? data.total_results ?? papers.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "حدث خطأ أثناء البحث الأكاديمي.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
