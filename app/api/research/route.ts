import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";

type Source = "consensus" | "semantic_scholar" | "openalex";
type Paper = {
  title: string; authors: string; year: string; journal: string; abstract: string;
  url: string; doi: string; citations: number | null; sources: Source[];
};

const SOURCE_LABELS: Record<Source, string> = {
  consensus: "Consensus",
  semantic_scholar: "Semantic Scholar",
  openalex: "OpenAlex"
};

async function checkLimit(req: NextRequest): Promise<"allowed" | "limited" | "unavailable"> {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return "unavailable";
  try {
    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 m"), prefix: "ilyesb:research" });
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
    return (await limiter.limit(ip)).success ? "allowed" : "limited";
  } catch { return "unavailable"; }
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
    const key = paper.doi ? "doi:" + paper.doi : "title:" + paper.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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

async function searchConsensus(query: string): Promise<Paper[]> {
  const key = process.env.consensus_api_key || process.env.CONSENSUS_API_KEY;
  if (!key) throw new Error("مفتاح Consensus غير مضبوط");
  const url = new URL("https://api.consensus.app/v1/search");
  url.searchParams.set("query", query); url.searchParams.set("page_size", "8");
  url.searchParams.set("include_semantic_score", "true");
  const data = await fetchJson(url.toString(), { headers: { "x-api-key": key, Accept: "application/json" } });
  const rows = Array.isArray(data) ? data : data.results || data.papers || data.items || data.data || [];
  return (Array.isArray(rows) ? rows : []).map((p: any) => normalize({
    title: p.title || p.paper_title || p.name, authors: p.authors || p.author_names || p.author,
    year: p.year || p.publication_year || p.pub_year, journal: p.journal || p.venue || p.journal_name,
    abstract: p.abstract || p.summary || p.snippet, url: p.url || p.paper_url || p.link || p.open_access_url,
    doi: p.doi, citations: p.citation_count ?? p.citations
  }, "consensus")).filter(Boolean) as Paper[];
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

export async function POST(req: NextRequest) {
  try {
    const limitState = await checkLimit(req);
    if (limitState !== "allowed") return NextResponse.json(
      { error: limitState === "limited" ? "تم بلوغ حد البحث مؤقتاً. حاول بعد دقيقة." : "خدمة الحماية غير متاحة حالياً. يرجى المحاولة لاحقاً." },
      { status: limitState === "limited" ? 429 : 503 }
    );
    const body = await req.json();
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (query.length < 3 || query.length > 500) return NextResponse.json({ error: "اكتب عبارة بحث من 3 إلى 500 حرف." }, { status: 400 });

    const allowed: Source[] = ["consensus", "semantic_scholar", "openalex"];
    const requested: Source[] = Array.isArray(body.sources)
      ? allowed.filter(source => body.sources.includes(source))
      : allowed;
    if (!requested.length) return NextResponse.json({ error: "اختر محرك بحث واحداً على الأقل." }, { status: 400 });

    const jobs: Record<Source, () => Promise<Paper[]>> = {
      consensus: () => searchConsensus(query),
      semantic_scholar: () => searchSemanticScholar(query),
      openalex: () => searchOpenAlex(query)
    };
    const settled = await Promise.all(requested.map(async source => {
      try { return { source, papers: await jobs[source](), ok: true, error: null as string | null }; }
      catch (e) { return { source, papers: [] as Paper[], ok: false, error: e instanceof Error ? e.message : "تعذر الاتصال" }; }
    }));
    const papers = mergePapers(settled.filter(x => x.ok).map(x => ({ source: x.source, papers: x.papers }))).slice(0, 20);
    const sourceStatuses = settled.map(x => ({
      id: x.source, name: SOURCE_LABELS[x.source], status: x.ok ? (x.papers.length ? "success" : "empty") : "error",
      count: x.papers.length, error: x.error
    }));

    let analysis: string | null = null;
    let analysisError: string | null = null;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) analysisError = "مفتاح OpenAI غير مضبوط؛ عُرضت نتائج البحث دون تحليل.";
    else if (papers.length) {
      try {
        const sourceMaterial = papers.map((p, i) => [
          `[${i + 1}] العنوان: ${p.title}`, `المؤلفون: ${p.authors || "غير متاح"}`,
          `السنة: ${p.year || "غير متاحة"}`, `المجلة: ${p.journal || "غير متاحة"}`,
          `المصادر: ${p.sources.map(s => SOURCE_LABELS[s]).join("، ")}`,
          `الملخص: ${(p.abstract || "لا يوجد ملخص متاح.").slice(0, 2200)}`,
          `DOI: ${p.doi || "غير متاح"}`, `الرابط: ${p.url || "غير متاح"}`
        ].join("\n")).join("\n\n");
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + openaiKey },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-6.1-sol",
            reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || "low" },
            instructions: "أنت مساعد بحث أكاديمي دقيق. حلّل الدراسات المعروضة فقط، وأجب بلغة سؤال المستخدم. قارن النتائج وبيّن الاتفاق والاختلاف وحدود الأدلة، واستخدم إحالات [1] [2] المطابقة لقائمة الدراسات. اذكر مصدر كل دراسة عند الحاجة. لا تختلق بيانات أو مراجع أو استنتاجات. صرّح بنقص الملخصات عند الحاجة. إذا كان السؤال قانونياً، فلا تعتبر الدراسات مصدراً رسمياً للتشريع أو الأحكام، ولا تخترع أرقام مواد أو تنسب إليها أحكاماً غير متحققة. استخدم عربية طبيعية مباشرة.",
            input: `سؤال البحث: ${query}\n\nالدراسات التي عثر عليها محركات البحث المحددة:\n${sourceMaterial}\n\nقدّم تحليلاً نقدياً يستند حصراً إلى المعلومات أعلاه، مع التنبيه إلى حدود البيانات المتاحة.`,
            max_output_tokens: 1600
          }),
          signal: AbortSignal.timeout(30000)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error?.message || "تعذر إكمال تحليل OpenAI.");
        const blocks = Array.isArray(result.output) ? result.output.flatMap((item: any) => Array.isArray(item.content) ? item.content : []) : [];
        const answer = typeof result.output_text === "string" ? result.output_text : blocks.filter((b: any) => b.type === "output_text" && typeof b.text === "string").map((b: any) => b.text).join("\n");
        if (!answer.trim()) throw new Error("لم يصل رد تحليلي من OpenAI.");
        analysis = answer.trim();
      } catch (e) { analysisError = e instanceof Error ? e.message : "تعذر تحليل الدراسات عبر OpenAI."; }
    }

    return NextResponse.json({
      papers, total: papers.length, analysis, analysisEngine: analysis ? "openai" : null,
      analysisError, sources: sourceStatuses, selectedSources: requested
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "حدث خطأ أثناء البحث الأكاديمي.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
