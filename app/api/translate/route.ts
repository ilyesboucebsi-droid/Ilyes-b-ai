import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

async function checkLimit(req: NextRequest): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return true;
  try {
    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(8, "1 m"), prefix: "ilyes-ai:free-translate" });
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
    return (await limiter.limit(ip)).success;
  } catch { return true; }
}

async function translateWithGemini(text: string, target: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("مفتاح Gemini المجاني غير مضبوط.");
  const instruction = "Translate the supplied text faithfully into " + target + ". Preserve meaning, legal and technical terminology, names, numbers, citations, paragraph structure and tone. Do not summarize, explain, omit, or add information. If a term has no exact equivalent, use the accepted translation and retain the original term in parentheses when useful. Return only the translation.";
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instruction }] },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 5000, temperature: 0.1 }
    }),
    signal: AbortSignal.timeout(45000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "تعذر الاتصال بـ Gemini.");
  const output = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
  if (!output.trim()) throw new Error("لم يصل نص مترجم من Gemini.");
  return output.trim();
}

async function translateWithGroq(text: string, target: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("مفتاح Groq المجاني غير مضبوط.");
  const instruction = "Translate the supplied text faithfully into " + target + ". Preserve meaning, legal and technical terminology, names, numbers, citations, paragraph structure and tone. Do not summarize, explain, omit, or add information. Return only the translation.";
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      messages: [{ role: "system", content: instruction }, { role: "user", content: text }],
      max_completion_tokens: 5000, temperature: 0.1
    }),
    signal: AbortSignal.timeout(45000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "تعذر الاتصال بـ Groq.");
  const output = data?.choices?.[0]?.message?.content || "";
  if (!output.trim()) throw new Error("لم يصل نص مترجم من Groq.");
  return output.trim();
}

export async function POST(req: NextRequest) {
  try {
    if (!(await checkLimit(req))) return NextResponse.json({ error: "تم بلوغ حد الترجمة المؤقت. حاول لاحقاً." }, { status: 429 });
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const target = typeof body.target === "string" ? body.target.slice(0, 80) : "Arabic";
    if (!text || text.length > 12000) return NextResponse.json({ error: "النص مطلوب ويجب ألا يتجاوز 12000 حرف." }, { status: 400 });

    const failures: string[] = [];
    if (process.env.GEMINI_API_KEY) {
      try { return NextResponse.json({ translation: await translateWithGemini(text, target), provider: "gemini" }); }
      catch (error) { failures.push("Gemini: " + (error instanceof Error ? error.message : "تعذر الاتصال")); }
    }
    if (process.env.GROQ_API_KEY) {
      try { return NextResponse.json({ translation: await translateWithGroq(text, target), provider: "groq" }); }
      catch (error) { failures.push("Groq: " + (error instanceof Error ? error.message : "تعذر الاتصال")); }
    }
    return NextResponse.json({ error: "لم تتوفر خدمة ترجمة مجانية حالياً. تحقق من مفاتيح Gemini وGroq وحصصهما المجانية. " + failures.join(" | ") }, { status: 503 });
  } catch {
    return NextResponse.json({ error: "حدث خطأ أثناء الترجمة." }, { status: 500 });
  }
}
