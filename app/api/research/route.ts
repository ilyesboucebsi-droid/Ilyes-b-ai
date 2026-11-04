import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { getPlatformState } from "@/lib/admin";

export const runtime = "nodejs";

type Source = "semantic_scholar" | "openalex";
type Paper = {
  title: string; authors: string; year: string; journal: string; abstract: string;
  url: string; doi: string; citations: number | null; sources: Source[];
};

const SOURCE_LABELS: Record<Source, string> = {
  semantic_scholar: "Semantic Scholar",
  openalex: "OpenAlex"
};

async function checkLimit(req: NextRequest): Promise<"allowed" | "limited"> {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  // لا نجعل غياب خدمة Redis المجانية سبباً لتعطيل البحث؛ تبقى الحماية عند توفرها.
  if (!url || !token) return "allowed";
  try {
    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 m"), prefix: "ilyes-ai:free-research" });
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
    return (await limiter.limit(ip)).success ? "allowed" : "limited";
  } catch { return "allowed"; }
}

function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(str).filter(Boolean).join(", ");
  return "";
}
function doiOf(value: unknown): string {
  return str(value).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase();
}
function normalize(p: Partial<Paper>, source: Source): Paper | null {
  const title = str(p.title).trim();
  if (!title) return null;
  return {
    title, authors: str(p.authors), year: str(p.year), journal: str(p.journal),
    abstract: str(p.abstract), url: str(p.url), doi: doiOf(p.doi),
    citations: typeof p.citations === "number" ? p.citations : null, sources: [source]
  };
}
function mergePapers(groups: { source: Source; papers: Paper[] }[]): Paper[] {
  const merged = new Map<string, Paper>();
  for (const group of groups) for (const paper of group.papers) {
    const key = paper.doi ? "doi:" + paper.doi : "title:" + paper.title.toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, " ").trim();
    const old = merged.get(key);
    if (!old) merged.set(key, paper);
    else {
      old.sources = Array.from(new Set([...old.sources, ...paper.sources]));
      old.abstract ||= paper.abstract; old.url ||= paper.url; old.authors ||= paper.authors;
      old.year ||= paper.year; old.journal ||= paper.journal; old.doi ||= paper.doi;
      if (paper.citations !== null && (old.citations === null || paper.citations > old.citations)) old.citations = paper.citations;
    }
  }
  return Array.from(merged.values()).sort((a, b) => (b.citations ?? -1) - (a.citations ?? -1));
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(16000) });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

async function searchSemanticScholar(query: string): Promise<Paper[]> {
  const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  url.searchParams.set("query", query); url.searchParams.set("limit", "8");
  url.searchParams.set("fields", "title,authors,year,venue,abstract,url,externalIds,citationCount");
  const data = await fetchJson(url.toString(), { headers: { Accept: "application/json" } });
  return (data.data || []).map((p: any) => normalize({
    title: p.title, authors: (p.authors || []).map((a: any) => a.name).join(", "),
    year: p.year, journal: p.venue, abstract: p.abstract, url: p.url,
    doi: p.externalIds?.DOI, citations: p.citationCount
  }, "semantic_scholar")).filter(Boolean) as Paper[];
}

async function searchOpenAlex(query: string): Promise<Paper[]> {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query); url.searchParams.set("per-page", "8");
  url.searchParams.set("select", "id,doi,title,publication_year,authorships,primary_location,cited_by_count,open_access");
  const data = await fetchJson(url.toString(), { headers: { Accept: "application/json" } });
  return (data.results || []).map((p: any) => normalize({
    title: p.title, authors: (p.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean).join(", "),
    year: p.publication_year, journal: p.primary_location?.source?.display_name,
    abstract: "", url: p.doi || p.id, doi: p.doi, citations: p.cited_by_count
  }, "openalex")).filter(Boolean) as Paper[];
}

async function analyzeWithGemini(instructions: string, input: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("مفتاح Gemini المجاني غير مضبوط.");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [{ text: input }] }],
      generationConfig: { maxOutputTokens: 3000, temperature: 0.4 }
    }),
    signal: AbortSignal.timeout(45000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "تعذر تحليل الدراسات عبر Gemini.");
  const answer = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  if (!answer.trim()) throw new Error("لم يصل تحليل من Gemini.");
  return answer.trim();
}

async function analyzeWithGroq(instructions: string, input: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("مفتاح Groq المجاني غير مضبوط.");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      messages: [{ role: "system", content: instructions }, { role: "user", content: input }],
      max_completion_tokens: 3000, temperature: 0.4
    }),
    signal: AbortSignal.timeout(45000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "تعذر تحليل الدراسات عبر Groq.");
  const answer = data?.choices?.[0]?.message?.content || "";
  if (!answer.trim()) throw new Error("لم يصل تحليل من Groq.");
  return answer.trim();
}

export async function POST(req: NextRequest) {
  try {
    try {
      const platform = await getPlatformState();
      if (platform.paused || platform.maintenance) return NextResponse.json({ error: platform.maintenance ? "المنصة في وضع الصيانة مؤقتاً. حاول لاحقاً." : "تم إيقاف المنصة مؤقتاً." }, { status: 503 });
    } catch { /* لا نعطل الوظائف العامة عند تعذر قراءة حالة المنصة. */ }

    const limitState = await checkLimit(req);
    if (limitState === "limited") return NextResponse.json({ error: "تم بلوغ حد البحث المؤقت. حاول بعد دقيقة." }, { status: 429 });

    const body = await req.json();
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (query.length < 3 || query.length > 500) return NextResponse.json({ error: "اكتب عبارة بحث من 3 إلى 500 حرف." }, { status: 400 });

    const allowed: Source[] = ["semantic_scholar", "openalex"];
    const requested: Source[] = Array.isArray(body.sources)
      ? allowed.filter(source => body.sources.includes(source))
      : allowed;
    const selected = requested.length ? requested : allowed;

    const jobs: Record<Source, () => Promise<Paper[]>> = {
      semantic_scholar: () => searchSemanticScholar(query),
      openalex: () => searchOpenAlex(query)
    };
    const settled = await Promise.all(selected.map(async source => {
      try { return { source, papers: await jobs[source](), ok: true, error: null as string | null }; }
      catch (e) { return { source, papers: [] as Paper[], ok: false, error: e instanceof Error ? e.message : "تعذر الاتصال" }; }
    }));
    const papers = mergePapers(settled.filter(x => x.ok).map(x => ({ source: x.source, papers: x.papers }))).slice(0, 20);
    const sources = settled.map(x => ({
      id: x.source, name: SOURCE_LABELS[x.source], status: x.ok ? (x.papers.length ? "success" : "empty") : "error",
      count: x.papers.length, error: x.error
    }));

    let analysis: string | null = null;
    let analysisEngine: string | null = null;
    let analysisError: string | null = null;
    if (papers.length) {
      const sourceMaterial = papers.map((p, i) => [
        "[" + (i + 1) + "] العنوان: " + p.title, "المؤلفون: " + (p.authors || "غير متاح"),
        "السنة: " + (p.year || "غير متاحة"), "المجلة: " + (p.journal || "غير متاحة"),
        "المصادر: " + p.sources.map(s => SOURCE_LABELS[s]).join("، "),
        "الملخص: " + (p.abstract || "لا يوجد ملخص متاح.").slice(0, 1800),
        "DOI: " + (p.doi || "غير متاح"), "الرابط: " + (p.url || "غير متاح")
      ].join("\\n")).join("\\n\\n");
      const instructions = "أنت مساعد بحث أكاديمي دقيق. حلّل الدراسات المعروضة فقط، وأجب بلغة سؤال المستخدم. قارن النتائج وبيّن الاتفاق والاختلاف وحدود الأدلة، واستخدم إحالات [1] [2] المطابقة لقائمة الدراسات. لا تختلق بيانات أو مراجع أو استنتاجات. صرّح بنقص الملخصات عند الحاجة. إذا كان السؤال قانونياً، فلا تعتبر الدراسات مصدراً رسمياً للتشريع أو الأحكام، ولا تخترع أرقام مواد أو تنسب إليها أحكاماً غير متحققة. استخدم عربية طبيعية مباشرة.";
      const input = "سؤال البحث: " + query + "\\n\\nالدراسات التي عثر عليها محركا البحث المجانيان:\\n" + sourceMaterial + "\\n\\nقدّم تحليلاً نقدياً يستند حصراً إلى المعلومات أعلاه، مع التنبيه إلى حدود البيانات المتاحة.";
      const attempts: Array<{ name: string; run: () => Promise<string> }> = [
        { name: "Gemini", run: () => analyzeWithGemini(instructions, input) },
        { name: "Groq", run: () => analyzeWithGroq(instructions, input) }
      ];
      const errors: string[] = [];
      for (const attempt of attempts) {
        try {
          analysis = await attempt.run();
          analysisEngine = attempt.name.toLowerCase();
          break;
        } catch (e) {
          errors.push(attempt.name + ": " + (e instanceof Error ? e.message : "تعذر التحليل"));
        }
      }
      if (!analysis) analysisError = "تعذر تحليل الدراسات عبر الحصص المجانية المتاحة. " + errors.join("؛ ");
    } else {
      analysisError = "لم تُرجع محركات البحث دراسات قابلة للتحليل.";
    }

    return NextResponse.json({
      papers, total: papers.length, analysis, analysisEngine,
      analysisError, sources, selectedSources: selected
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "حدث خطأ أثناء البحث الأكاديمي.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
