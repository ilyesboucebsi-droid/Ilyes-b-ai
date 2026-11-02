import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";

async function checkLimit(req: NextRequest): Promise<"allowed" | "limited" | "unavailable"> {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return "unavailable";
  try {
    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 m"), prefix: "ilyesb:research" });
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
    return (await limiter.limit(ip)).success ? "allowed" : "limited";
  } catch {
    return "unavailable";
  }
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const limitState = await checkLimit(req);
    if (limitState !== "allowed") {
      return NextResponse.json(
        { error: limitState === "limited" ? "تم بلوغ حد البحث مؤقتاً. حاول بعد دقيقة." : "خدمة الحماية غير متاحة حالياً. يرجى المحاولة لاحقاً." },
        { status: limitState === "limited" ? 429 : 503 }
      );
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
    let analysis: string | null = null;
    let analysisError: string | null = null;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      analysisError = "مفتاح OpenAI غير مضبوط؛ عُرضت نتائج Consensus دون تحليل.";
    } else if (papers.length > 0) {
      try {
        const sourceMaterial = papers.map((p: any, i: number) => [
          `[${i + 1}] العنوان: ${p.title}`,
          `المؤلفون: ${p.authors || "غير متاح"}`,
          `السنة: ${p.year || "غير متاحة"}`,
          `المجلة: ${p.journal || "غير متاحة"}`,
          `الملخص: ${(p.abstract || "لا يوجد ملخص متاح.").slice(0, 3500)}`,
          `DOI: ${p.doi || "غير متاح"}`,
          `الرابط: ${p.url || "غير متاح"}`
        ].join("\n")).join("\n\n");

        const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + openaiKey },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-6.1-sol",
      reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || "medium" },
            instructions: "أنت مساعد بحث أكاديمي. حلّل الدراسات المقدمة فقط، وأجب بلغة سؤال المستخدم. قارن النتائج وبيّن أوجه الاتفاق والاختلاف وحدود الأدلة. استخدم إحالات مرقمة [1] [2] تطابق الدراسات المقدمة. لا تختلق نتائج أو بيانات أو مراجع، ولا تنسب للدراسة ما لا يثبته عنوانها أو ملخصها. إذا كانت الملخصات غير كافية فصرّح بذلك. اجعل الإجابة منظمة وموجزة.",
            input: `سؤال البحث: ${query}\n\nالدراسات التي أعادها Consensus:\n${sourceMaterial}\n\nقدّم تحليلاً نقدياً يستند حصراً إلى المعلومات أعلاه، مع التنبيه إلى حدود الملخصات المتاحة.`,
            max_output_tokens: 2200
          }),
          signal: AbortSignal.timeout(60000)
        });
        const result = await openaiResponse.json();
        if (!openaiResponse.ok) {
          const detail = result?.error?.message || result?.message || "تعذر إكمال تحليل OpenAI.";
          throw new Error(typeof detail === "string" ? detail : "تعذر إكمال تحليل OpenAI.");
        }
        const blocks = Array.isArray(result.output) ? result.output.flatMap((item: any) => Array.isArray(item.content) ? item.content : []) : [];
        const answer = typeof result.output_text === "string"
          ? result.output_text
          : blocks.filter((b: any) => b.type === "output_text" && typeof b.text === "string").map((b: any) => b.text).join("\n");
        if (!answer.trim()) throw new Error("لم يصل رد تحليلي من OpenAI.");
        analysis = answer.trim();
      } catch (error) {
        analysisError = error instanceof Error ? error.message : "تعذر تحليل الدراسات عبر OpenAI.";
      }
    }

    return NextResponse.json({
      papers,
      total: data.total ?? data.total_results ?? papers.length,
      analysis,
      analysisEngine: analysis ? "openai" : null,
      analysisError
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "حدث خطأ أثناء البحث الأكاديمي.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
