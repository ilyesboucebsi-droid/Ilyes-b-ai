import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { getPlatformState } from "@/lib/admin";

export const runtime = "nodejs";

type Msg = { role: "user" | "assistant"; content: string; images?: string[] };
type Provider = "openai" | "claude" | "gemini" | "groq";
const PROVIDERS: Provider[] = ["openai", "claude", "gemini", "groq"];

const SYSTEM_INSTRUCTION = [
  "أنت ILYES.B AI، مساعد عربي/إنجليزي متعدد المجالات. أجب بلغة المستخدم، بدقة ووضوح، وبنبرة طبيعية محترمة. لا تدّعِ أنك إنسان أو تملك تجارب شخصية.",
  "المصداقية ومصادر المعلومات:",
  "1. لا تختلق مصادر أو مراجع أو روابط أو اقتباسات أو أرقام مواد أو تواريخ أو إحصاءات. لا تقل إنك بحثت أو تحققت أو استخدمت أداة إلا إذا حدث ذلك فعلاً في الطلب الحالي.",
  "2. لا تذكر تاريخاً لتحديث بيانات تدريبك ولا تدّعِ أن معلوماتك محدثة حتى تاريخ معين ما لم تكن لديك معلومة موثوقة بذلك.",
  "3. ميّز بين المعرفة العامة والاستنتاج والمعلومة التي تم التحقق منها بمصدر مباشر. إذا لم تكن متأكداً، قل ذلك بوضوح وحدد ما يحتاج إلى تحقق.",
  "4. لا توحِ بأن إجاباتك مستندة تلقائياً إلى Consensus أو إلى دراسات محكمة. المحادثة العادية لا تستدعي Consensus. خدمة Consensus تُستخدم فقط عند استدعاء مسار البحث الأكاديمي في الموقع بنجاح؛ عند سؤال المستخدم، اشرح هذا الفرق بدقة.",
  "5. لا تصف Consensus بأنه إجماع الخبراء عندما يكون المقصود خدمة البحث الأكاديمي المسماة Consensus. ولا تقل إنك استخدمت الخدمة في إجابة سابقة ما لم تكن قد استُدعيت فعلياً.",
  "6. عند سؤال المستخدم هل يثق بإجاباتك، قل إنك أداة مساعدة قد تخطئ أو تقدم معلومات غير محدثة، وإن درجة التحقق تعتمد على نوع السؤال والمصادر التي استُخدمت. لا تدّعِ دقة 100%.",
  "القانون والتحليل القانوني:",
  "1. حدّد الدولة والفرع القانوني والنص الواجب التطبيق. إذا لم يحدد المستخدم الدولة ولم يحسمها السياق، فاسأله قبل إعطاء حكم خاص بدولة. لا تخلط بين القانون المدني والجزائي والإداري.",
  "2. عند اعتماد القانون الجزائري، اعتمد التشريع الجزائري النافذ وتعديلاته، ولا تنقل أحكاماً من قوانين دول أخرى. لا تختلق أرقام المواد أو نصوصها أو تواريخها. اذكر المادة فقط إذا كنت واثقاً من رقمها ومضمونها، وإلا صرّح بالحاجة إلى التحقق من النص الرسمي المحيّن.",
  "3. ميّز بين المفاهيم القانونية المتقاربة ولا تستعملها كمترادفات. في القانون الجزائي ميّز خصوصاً بين العقوبات الأصلية والتكميلية والتبعية (مع بيان الوضع التاريخي إذا كان التقسيم ملغى في النص الحالي)، وتدابير الأمن، والتدابير الإجرائية، والمصادرة والحجز، والتعويض المدني. لا تصف إجراءً بأنه عقوبة دون سند قانوني.",
  "4. حلّل المسائل بمنهج واضح: الوقائع ذات الصلة، الإشكالية، القاعدة القانونية، تطبيقها على الوقائع، ثم النتيجة. ميّز بين النص التشريعي والرأي الفقهي والاستنتاج، وبيّن الخلاف عند وجوده دون ادعاء الإجماع.",
  "5. لا تدّعِ مراجعة الجريدة الرسمية أو الأحكام القضائية أو قاعدة تشريعية ما لم يتم الوصول إليها فعلاً. نتائج Consensus دراسات أكاديمية وليست مصدراً رسمياً للتشريع أو القضاء.",
  "6. قدّم المساعدة القانونية للتثقيف والدراسة، لا كاستشارة مهنية نهائية في نزاع واقعي.",
  "الدراسة والكتابة الجامعية:",
  "1. أجب عن جميع أجزاء السؤال ولا تسقط أي قيد. التزم بنوع العمل ومستوى الطالب المطلوب. إذا طلب المستخدم مقالة، فاكتب مقالة مترابطة لا تقريراً: مقدمة تمهيدية تنتهي بإشكالية وخطة، عرض تحليلي، وخاتمة تجيب عن الإشكالية.",
  "2. لا تفرط في العناوين أو الجداول أو القوائم. استخدم الفقرات المترابطة والانتقالات المنطقية، ولا تستخدم الجدول إلا إذا كان التصنيف أو المقارنة يستفيدان منه فعلاً.",
  "3. تجنب العبارات الإنشائية العامة والتكرار والحشو. يجب أن تضيف كل فقرة قاعدة أو تفسيراً أو تطبيقاً أو نتيجة جديدة. اربط التعريف بالتحليل ثم بمثال قانوني صحيح متى كان ذلك مناسباً.",
  "4. عرّف المصطلحات بدقة، واستعمل التعبير الفني الصحيح، وتجنب الترجمة الحرفية والتعبيرات الغريبة. عند تناول القانون الجزائري، استند إلى النصوص الجزائرية النافذة ولا تذكر المواد إلا بعد التحقق.",
  "5. اجعل الخاتمة خلاصة لما أثبته التحليل، لا إعادة للمقدمة أو سرداً للعناوين. لا تضف توصيات عامة لا يقتضيها الموضوع.",
  "6. استخدم لغة عربية طبيعية مباشرة تناسب المستوى الجامعي المطلوب، دون تصنع أو مبالغة أو أخطاء متعمدة. لا تعد بأن النص لن يُكتشف بواسطة أدوات كشف الذكاء الاصطناعي.",
  "7. لا تحذف أي قيد أو استثناء أو مصطلح فني مهم. إذا كان السؤال أو المستند ناقصاً، اطلب الجزء اللازم بدلاً من اختراع محتواه.",
  "السلوك العام:",
  "أجب عن المطلوب مباشرة. اسأل سؤالاً توضيحياً واحداً فقط عندما تكون معلومة أساسية مفقودة. لا تبالغ في الثقة، ولا تخفِ حدود الأدوات أو الخدمات المتاحة."
].join("\n");

function isConfigured(provider: Provider) {
  const keys: Record<Provider, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    claude: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    groq: process.env.GROQ_API_KEY
  };
  return Boolean(keys[provider]);
}

async function checkLimit(req: NextRequest): Promise<"allowed" | "limited" | "unavailable"> {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return "unavailable";
  try {
    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(12, "1 m"), prefix: "ilyesb:chat" });
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
    return (await limiter.limit(ip)).success ? "allowed" : "limited";
  } catch {
    return "unavailable";
  }
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

function providerError(data: any, fallback: string) {
  const message = data?.error?.message || data?.message || data?.detail;
  return typeof message === "string" ? message.slice(0, 500) : fallback;
}

async function enrichWithConsensus(messages: Msg[]): Promise<{ messages: Msg[]; papers: any[]; used: boolean }> {
  const last = messages[messages.length - 1];
  const key = process.env.CONSENSUS_API_KEY || process.env.consensus_api_key;
  const q = last?.content?.trim() || "";
  const relevant = q.length >= 35 && /[؟?]|ما هو|ما هي|لماذا|كيف|هل|اشرح|حلل|قارن|ناقش|دراسة|دراسات|بحث|أبحاث|علمي|أكاديمي|تأثير|فعالية|أسباب|نتائج|research|study|evidence|effect|impact|analysis|legal|law/i.test(q);
  if (!key || !relevant || last?.images?.length) return { messages, papers: [], used: false };
  try {
    const u = new URL("https://api.consensus.app/v1/search");
    u.searchParams.set("query", q.slice(0, 500));
    u.searchParams.set("page_size", "5");
    const r = await fetch(u.toString(), { headers: { "x-api-key": key, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { messages, papers: [], used: false };
    const d = await r.json();
    const rows = Array.isArray(d) ? d : d.results || d.papers || d.items || d.data || [];
    const papers = (Array.isArray(rows) ? rows : []).slice(0, 5).map((p: any) => ({
      title: String(p.title || p.paper_title || p.name || ""),
      authors: Array.isArray(p.authors) ? p.authors.map((a: any) => typeof a === "string" ? a : a.name || "").join(", ") : String(p.author_names || ""),
      year: String(p.year || p.publication_year || ""),
      abstract: String(p.abstract || p.summary || p.snippet || "").slice(0, 1400),
      url: String(p.url || p.paper_url || p.link || ""),
      doi: String(p.doi || "")
    })).filter((p: any) => p.title);
    if (!papers.length) return { messages, papers: [], used: true };
    const material = papers.map((p: any, i: number) => "[" + (i + 1) + "] " + p.title + " (" + p.year + ") " + p.authors + "\n" + p.abstract + "\n" + (p.url || p.doi)).join("\n\n");
    const enriched = messages.map((m, i) => i === messages.length - 1 ? {
      ...m,
      content: m.content + "\n\nنتائج بحث أكاديمي مسترجعة آلياً من Consensus. استخدمها فقط إذا كانت ذات صلة، ولا تعتبرها مصدراً رسمياً للقانون أو القضاء، ولا تخترع تفاصيل غير واردة. أشر إلى رقم الدراسة عند الاستناد إليها:\n" + material
    } : m);
    return { messages: enriched, papers, used: true };
  } catch {
    return { messages, papers: [], used: false };
  }
}

async function askOpenAI(messages: Msg[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("مفتاح OpenAI غير مضبوط في إعدادات الخادم.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-6.1-sol",
      reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || "medium" },
      instructions: SYSTEM_INSTRUCTION,
      input: messages.map(m => ({ role: m.role, content: m.content.slice(0, 12000) })),
      max_output_tokens: 2048
    }),
    signal: AbortSignal.timeout(35000)
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(providerError(data, "تعذر الاتصال بمحرك OpenAI."));
  const blocks = Array.isArray(data.output) ? data.output.flatMap((item: any) => Array.isArray(item.content) ? item.content : []) : [];
  const answer = typeof data.output_text === "string" ? data.output_text : blocks.filter((b: any) => b.type === "output_text" && typeof b.text === "string").map((b: any) => b.text).join("\n");
  if (!answer.trim()) throw new Error("لم يصل رد نصي من OpenAI.");
  return answer.trim();
}

async function askClaude(messages: Msg[]) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("مفتاح Claude غير مضبوط في إعدادات الخادم.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
      system: SYSTEM_INSTRUCTION,
      messages: messages.map(m => ({ role: m.role, content: m.content.slice(0, 12000) })),
      max_tokens: 2048
    }),
    signal: AbortSignal.timeout(60000)
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(providerError(data, "تعذر الاتصال بمحرك Claude."));
  const answer = Array.isArray(data.content) ? data.content.filter((b: any) => b.type === "text").map((b: any) => b.text || "").join("\n") : "";
  if (!answer.trim()) throw new Error("لم يصل رد نصي من Claude.");
  return answer.trim();
}

async function askGemini(messages: Msg[]) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("مفتاح Gemini غير مضبوط في إعدادات الخادم.");
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      ...(m.content ? [{ text: m.content.slice(0, 12000) }] : []),
      ...(m.images || []).map((image) => {
        const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
        if (!match) throw new Error("صيغة الصورة غير مدعومة.");
        return { inlineData: { mimeType: match[1], data: match[2] } };
      })
    ]
  }));
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents,
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
    }),
    signal: AbortSignal.timeout(60000)
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(providerError(data, "تعذر الاتصال بمحرك Gemini."));
  const answer = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
  if (!answer.trim()) throw new Error("لم يصل رد نصي من Gemini.");
  return answer.trim();
}

async function askGroq(messages: Msg[]) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("مفتاح Groq غير مضبوط في إعدادات الخادم.");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        ...messages.map(m => ({ role: m.role, content: m.content.slice(0, 12000) }))
      ],
      max_completion_tokens: 2048,
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(60000)
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(providerError(data, "تعذر الاتصال بمحرك Groq."));
  const answer = data.choices?.[0]?.message?.content || "";
  if (!answer.trim()) throw new Error("لم يصل رد نصي من Groq.");
  return answer.trim();
}

async function ask(provider: Provider, messages: Msg[]) {
  if (provider === "openai") return askOpenAI(messages);
  if (provider === "claude") return askClaude(messages);
  if (provider === "gemini") return askGemini(messages);
  return askGroq(messages);
}

async function askHybrid(messages: Msg[]) {
  if (!isConfigured("openai")) {
    throw new Error("وضع تعاون المحركات يحتاج إلى ضبط OPENAI_API_KEY ليقوم GPT بدمج الإجابات.");
  }
  // استدعاء المحركات الأخرى المهيأة بالتوازي، ثم تسليم مخرجاتها إلى GPT لصياغة إجابة موحدة.
  const peers = (["claude", "gemini", "groq"] as Provider[]).filter(isConfigured);
  const results = await Promise.allSettled(peers.map(async (provider) => ({
    provider,
    reply: await ask(provider, messages)
  })));
  const contributions = results.flatMap((result, index) => result.status === "fulfilled"
    ? [result.value]
    : []);
  const failures = results.flatMap((result, index) => result.status === "rejected"
    ? [peers[index] + ": " + (result.reason instanceof Error ? result.reason.message : "تعذر الاتصال")]
    : []);
  if (!contributions.length && peers.length) {
    // لا نخفي فشل بقية المحركات: يجيب GPT منفرداً مع توضيح المحركات التي تعذر تشغيلها.
    const reply = await askOpenAI(messages);
    return { reply, engine: "openai", collaboration: { used: false, contributors: [], failures } };
  }
  const synthesisMessages: Msg[] = [
    ...messages,
    {
      role: "user",
      content: "مهمتك الآن دمج مساهمات نماذج الذكاء الاصطناعي التالية في إجابة واحدة دقيقة ومتماسكة. اعتبرها آراء مساعدة لا حقائق مؤكدة؛ تحقق من الاتساق والمنطق، واحذف التكرار، واذكر مواضع عدم اليقين أو الاختلاف عند أهميتها. لا تنسب معلومة إلى مصدر لم يرد في السياق، ولا تخترع مراجع. حافظ على لغة المستخدم ومستوى التفصيل المناسب.\n\n" +
        contributions.map((item, index) => "مساهمة " + (index + 1) + " من " + item.provider + ":\n" + item.reply).join("\n\n") +
        (failures.length ? "\n\nمحركات تعذر تشغيلها: " + failures.join(" | ") : "")
    }
  ];
  const reply = await askOpenAI(synthesisMessages);
  return {
    reply,
    engine: "hybrid",
    collaboration: { used: contributions.length > 0, contributors: contributions.map(item => item.provider), failures }
  };
}

async function askAuto(messages: Msg[]) {
  // الوضع التلقائي يبقى سريعاً ويستخدم محركاً واحداً؛ تعاون المحركات متاح بالاختيار الصريح.
  const order: Provider[] = ["openai", "groq", "gemini", "claude"];
  return askFallback(messages, order);
}

async function askFallback(messages: Msg[], order: Provider[]) {
  const failures: string[] = [];
  for (const provider of order) {
    if (!isConfigured(provider)) continue;
    try {
      return { reply: await ask(provider, messages), engine: provider };
    } catch (error) {
      failures.push(provider + ": " + (error instanceof Error ? error.message : "تعذر الاتصال"));
    }
  }
  if (!failures.length) throw new Error("لم يتم إعداد أي محرك. أضف مفتاح OpenAI أو Claude أو Gemini أو Groq في إعدادات Vercel.");
  throw new Error("تعذر الحصول على إجابة من المحركات المتاحة. " + failures.slice(0, 3).join(" | "));
}

export async function POST(req: NextRequest) {
  try {
    try {
      const platform = await getPlatformState();
      if (platform.paused || platform.maintenance) return NextResponse.json({ error: platform.maintenance ? "المنصة في وضع الصيانة مؤقتاً. حاول لاحقاً." : "تم إيقاف المنصة مؤقتاً." }, { status: 503 });
    } catch { /* Preserve existing service if platform-state storage is temporarily unreachable. */ }
    const limitState = await checkLimit(req);
    if (limitState !== "allowed") {
      return NextResponse.json(
        { error: limitState === "limited" ? "تم بلوغ حد الطلبات مؤقتاً. حاول بعد دقيقة." : "خدمة الحماية غير متاحة حالياً. يرجى المحاولة لاحقاً." },
        { status: limitState === "limited" ? 429 : 503 }
      );
    }
    const body = await req.json();
    const messages = body.messages as Msg[];
    const requested = typeof body.provider === "string" ? body.provider : "auto";
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 24) {
      return NextResponse.json({ error: "صيغة المحادثة غير صحيحة." }, { status: 400 });
    }
    if (messages.some(m => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || (m.images !== undefined && (!Array.isArray(m.images) || m.images.length > 1 || m.images.some((img: unknown) => typeof img !== "string" || img.length > 1_900_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(img))))) || messages[messages.length - 1].role !== "user") {
      return NextResponse.json({ error: "الرسائل غير صالحة أو أن الصورة تتجاوز الحجم المسموح." }, { status: 400 });
    }
    if (messages.reduce((n, m) => n + m.content.length, 0) > 60000) {
      return NextResponse.json({ error: "المحادثة طويلة جداً؛ ابدأ محادثة جديدة." }, { status: 413 });
    }

    const imageCount = messages.reduce((count, message) => count + (message.images?.length || 0), 0);
    const imageBytes = messages.reduce((total, message) => total + (message.images || []).reduce((sum, image) => sum + image.length, 0), 0);
    if (imageCount > 1 || imageBytes > 1_900_000) {
      return NextResponse.json({ error: "أرسل صورة واحدة في كل طلب، بحجم مضغوط لا يتجاوز الحد المسموح." }, { status: 413 });
    }
    const hasImages = imageCount > 0;
    if (hasImages) {
      if (!isConfigured("gemini")) {
        return NextResponse.json({ error: "ميزة الصور تحتاج إلى تهيئة مفتاح Gemini في إعدادات الخادم." }, { status: 503 });
      }
      // الصور تُحلل عبر Gemini تلقائياً مهما كان المحرك المحدد في القائمة.
      return NextResponse.json({ reply: await askGemini(messages), engine: "gemini" });
    }
    if (requested === "hybrid") {
      const research = await enrichWithConsensus(messages);
      const result = await askHybrid(research.messages);
      return NextResponse.json({ ...result, consensusUsed: research.used, consensusPapers: research.papers });
    }
    if (requested === "auto") {
      const research = await enrichWithConsensus(messages);
      const result = await askAuto(research.messages);
      return NextResponse.json({ ...result, consensusUsed: research.used, consensusPapers: research.papers });
    }
    if (!PROVIDERS.includes(requested as Provider)) {
      return NextResponse.json({ error: "محرك الذكاء الاصطناعي المحدد غير معروف." }, { status: 400 });
    }
    const provider = requested as Provider;
    if (!isConfigured(provider)) {
      return NextResponse.json({ error: "هذا المحرك غير مهيأ بعد. اختر محركاً آخر أو الوضع التلقائي." }, { status: 503 });
    }
    // إذا تعطل المحرك المختار مؤقتاً، جرّب المحركات المهيأة الأخرى بدلاً من إنهاء المحادثة.
    const research = await enrichWithConsensus(messages);
    const result = await askFallback(research.messages, [provider, ...PROVIDERS.filter(item => item !== provider)]);
    return NextResponse.json({ ...result, consensusUsed: research.used, consensusPapers: research.papers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع في الخادم.";
    const status = /مفتاح|غير مهيأ|خدمة الحماية|لم يتم إعداد/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}