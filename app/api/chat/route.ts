import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

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
  "القانون:",
  "1. حدّد الدولة أو النظام القانوني المقصود. إذا لم يحدده المستخدم ولم يحسمه السياق، فاسأله قبل إعطاء حكم خاص بدولة.",
  "2. عند اعتماد القانون الجزائري، لا تخلطه بقوانين دول أخرى. لا تخترع مواد أو نصوصاً أو تعديلات. إذا لم تكن واثقاً من رقم المادة ومضمونها، صرّح بذلك ولا تجزم.",
  "3. ميّز بين البطلان المطلق والنسبي وقابلية الإبطال، وبين الغلط والتدليس والإكراه وغيرها. حلّل الوقائع وفق المسألة والقاعدة والتطبيق والنتيجة.",
  "4. وضّح الخلاف الفقهي أو القضائي عند وجوده، ولا تعرض رأياً واحداً على أنه إجماع. لا تدّعِ مراجعة الجريدة الرسمية أو الأحكام القضائية ما لم يحدث ذلك.",
  "5. قدّم المساعدة القانونية للتثقيف والدراسة، لا كاستشارة مهنية نهائية في نزاع واقعي.",
  "الدراسة والكتابة:",
  "1. في الأنشطة الجامعية أجب عن جميع أجزاء السؤال، واحترم المنهجية المطلوبة، واكتب بمستوى الطالب الذي يحدده المستخدم دون تكلف أو حشو.",
  "2. عند إعادة الصياغة، حافظ على المعنى وجميع الأفكار المهمة، وأعد بناء الجمل وتدفقها بصورة طبيعية. لا تختلق تجارب أو آراء أو وقائع، ولا تتعمد الأخطاء، ولا تعد بأن النص لن يُكتشف بواسطة أدوات كشف الذكاء الاصطناعي.",
  "3. لا تحذف أي قيد أو استثناء أو مصطلح فني مهم. إذا كان النص ناقصاً، اطلب الجزء اللازم بدلاً من اختراع محتواه.",
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

async function askOpenAI(messages: Msg[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("مفتاح OpenAI غير مضبوط في إعدادات الخادم.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      instructions: SYSTEM_INSTRUCTION,
      input: messages.map(m => ({ role: m.role, content: m.content.slice(0, 12000) })),
      max_output_tokens: 2048
    }),
    signal: AbortSignal.timeout(60000)
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

async function askAuto(messages: Msg[]) {
  const hasOpenAI = isConfigured("openai");
  const hasClaude = isConfigured("claude");

  // عند توافر المفتاحين، يعمل OpenAI وClaude بالتوازي ثم يدمج OpenAI المسودتين.
  if (hasOpenAI && hasClaude) {
    const [openaiResult, claudeResult] = await Promise.allSettled([
      askOpenAI(messages),
      askClaude(messages)
    ]);
    if (openaiResult.status === "fulfilled" && claudeResult.status === "fulfilled") {
      const originalQuestion = messages[messages.length - 1]?.content || "";
      const synthesis: Msg[] = [
        ...messages.slice(-10),
        {
          role: "user",
          content: [
            "المطلوب: اكتب إجابة نهائية واحدة للسؤال الأصلي، بعد مراجعة المسودتين أدناه.",
            "السؤال الأصلي: " + originalQuestion,
            "مسودة OpenAI:\n" + openaiResult.value,
            "مسودة Claude:\n" + claudeResult.value,
            "ادمج نقاط القوة، واحذف التكرار، وصحح التناقضات الظاهرة دون اختراع حقائق. لا تذكر للمستخدم أنك تلقيت مسودتين، ولا تنسب معلومة إلى مصدر لم يُستخدم."
          ].join("\n\n")
        }
      ];
      try {
        return { reply: await askOpenAI(synthesis), engine: "hybrid" };
      } catch {
        return { reply: openaiResult.value, engine: "openai" };
      }
    }
    if (openaiResult.status === "fulfilled") return { reply: openaiResult.value, engine: "openai" };
    if (claudeResult.status === "fulfilled") return { reply: claudeResult.value, engine: "claude" };
    // Both primary models failed; avoid retrying them and risking duplicate charges.
    return askFallback(messages, ["gemini", "groq"]);
  }

  return askFallback(messages, ["openai", "claude", "gemini", "groq"]);
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
    if (requested === "auto") {
      const result = await askAuto(messages);
      return NextResponse.json(result);
    }
    if (!PROVIDERS.includes(requested as Provider)) {
      return NextResponse.json({ error: "محرك الذكاء الاصطناعي المحدد غير معروف." }, { status: 400 });
    }
    const provider = requested as Provider;
    if (!isConfigured(provider)) {
      return NextResponse.json({ error: "هذا المحرك غير مهيأ بعد. اختر محركاً آخر أو الوضع التلقائي." }, { status: 503 });
    }
    // إذا تعطل المحرك المختار مؤقتاً، جرّب المحركات المهيأة الأخرى بدلاً من إنهاء المحادثة.
    return NextResponse.json(await askFallback(messages, [provider, ...PROVIDERS.filter(item => item !== provider)]));
  } catch (error) {
    const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع في الخادم.";
    const status = /مفتاح|غير مهيأ|خدمة الحماية|لم يتم إعداد/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}