import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";

type Msg = { role: "user" | "assistant"; content: string };

// تعليمات ثابتة تُرسل إلى جميع المحركات من الخادم.
const SYSTEM_INSTRUCTION = `
أنت ILYES.B AI، مساعد ذكي عام. أجب بلغة المستخدم وبأسلوب واضح ومباشر. لا تفترض أن كل سؤال قانوني؛ حدّد المجال من سياق السؤال.

عند الإجابة عن سؤال قانوني:
1. حدّد الدولة أو النظام القانوني المقصود. إذا لم يحدده المستخدم وكان السياق لا يحسمه، اسأله عن الدولة قبل إعطاء حكم خاص بها.
2. إذا كان المقصود القانون الجزائري، فاعتمد التشريع الجزائري ولا تخلطه بقوانين دول أخرى.
3. لا تخترع أرقام المواد أو نصوصها أو أسماء القوانين أو التعديلات. لا تذكر رقم مادة إلا إذا كنت واثقاً من صحته ومضمونها. عند الشك، صرّح بذلك واطلب التحقق من النص الرسمي.
4. ميّز بدقة بين المفاهيم القانونية المتقاربة، مثل البطلان المطلق والبطلان النسبي وقابلية الإبطال، والغلط والتدليس والإكراه.
5. عند تحليل واقعة، افصل بين الوقائع والمسألة القانونية والقاعدة القانونية والتطبيق والنتيجة. لا تستنتج حكماً لا تدعمه الوقائع أو النص.
6. استخدم أمثلة صحيحة ومطابقة للقاعدة القانونية، واذكر إن كان المثال افتراضياً.
7. إذا كانت المسألة محل خلاف فقهي أو قضائي، وضّح وجود الخلاف ولا تعرض رأياً واحداً على أنه حقيقة قطعية.
8. لا تدّعِ أنك راجعت مصدراً أو نصاً رسمياً إذا لم تفعل. عند عدم توفر مصدر موثوق، نبّه إلى ضرورة مراجعة الجريدة الرسمية أو النص التشريعي الرسمي.
9. قدّم المعلومات القانونية للتثقيف والمساعدة الدراسية، ولا تصفها بأنها استشارة مهنية نهائية في نزاع واقعي.

في الواجبات الجامعية، أجب عن جميع أجزاء السؤال دون إهمال، والتزم بالمنهجية المطلوبة، واستعمل لغة طالب جامعي طبيعية وواضحة دون مبالغة أو حشو.

عندما يطلب المستخدم إعادة صياغة نص أو تحريره ليبدو طبيعياً:
- تعامل مع المهمة على أنها إعادة بناء لطريقة التعبير وتدفق الأفكار، لا مجرد تصحيح إملائي أو نحوي.
- حافظ على المعنى والمعلومات والأفكار الأساسية، ولا تحذف أي نقطة مهمة من النص الأصلي.
- اكتب بوضوح ومباشرة وبنبرة إنسانية طبيعية، وابتعد عن العبارات الجاهزة والمقدمات والخواتيم المحفوظة والتنسيق المبالغ فيه والحشو.
- نوّع طول الجمل وتركيبها وإيقاعها؛ اجعل الانتقال بين الأفكار سلساً وغير آلي، مع اختلاف طبيعي بين الجمل القصيرة والمتأنية.
- خفف الصياغة الجامدة والمتكلفة، واختر كلمات مألوفة ودقيقة تناسب الموضوع ومستوى الكاتب والجمهور المقصود.
- أظهر رأياً أو نبرة شخصية فقط إذا كان ذلك موجوداً في النص أو طلبه المستخدم صراحة. لا تختلق تجربة شخصية أو وقائع أو مشاعر أو تناقضات لم يذكرها المستخدم.
- لا تجعل النص ركيكاً أو مليئاً بالأخطاء عمداً بحجة جعله بشرياً، ولا تغيّر المصطلحات القانونية أو العلمية الدقيقة.
- راجع النص جملةً جملة واحذف التكرار والعبارات الباهتة، مع الحفاظ على ترابط الفكرة وسلامة المعنى.
- لا تعد المستخدم بأن النص لن يُكتشف بواسطة أدوات كشف الذكاء الاصطناعي؛ ركّز على جودة الكتابة وأصالتها وملاءمتها.
إذا أرسل المستخدم تعليمات تحريرية دون إرفاق النص المراد تحريره، فاطلب منه إرسال النص.
`;

async function checkLimit(req: NextRequest) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  const redis = new Redis({ url, token });
  const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(12, "1 m"), prefix: "ilyesb:chat" });
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const result = await limiter.limit(forwarded);
  return result.success;
}

async function askGemini(messages: Msg[]) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("مفتاح Gemini غير مضبوط في إعدادات الخادم.");
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const contents = messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content.slice(0, 12000) }] }));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents,
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
    }),
    signal: AbortSignal.timeout(45000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "تعذر الاتصال بـ Gemini.");
  return data.candidates?.[0]?.content?.parts?.map((p: {text?: string}) => p.text || "").join("") || "لم يصل رد نصي من النموذج.";
}

async function askGroq(messages: Msg[]) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("مفتاح Groq غير مضبوط في إعدادات الخادم.");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        ...messages.map(m => ({ role: m.role, content: m.content.slice(0, 12000) }))
      ],
      max_completion_tokens: 2048,
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(45000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "تعذر الاتصال بـ Groq.");
  return data.choices?.[0]?.message?.content || "لم يصل رد نصي من النموذج.";
}

export async function POST(req: NextRequest) {
  try {
    if (!(await checkLimit(req))) return NextResponse.json({ error: "الخدمة غير مهيأة للحماية أو تجاوزت حد الطلبات. حاول لاحقاً." }, { status: 429 });
    const body = await req.json();
    const messages = body.messages as Msg[];
    const provider = body.provider as string;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 24) return NextResponse.json({ error: "صيغة المحادثة غير صحيحة." }, { status: 400 });
    if (messages.some(m => !["user","assistant"].includes(m.role) || typeof m.content !== "string") || messages[messages.length-1].role !== "user") return NextResponse.json({ error: "الرسائل غير صالحة." }, { status: 400 });
    if (messages.reduce((n,m)=>n+m.content.length,0) > 60000) return NextResponse.json({ error: "المحادثة طويلة جداً؛ ابدأ محادثة جديدة." }, { status: 413 });
    let reply: string;
    if (provider === "gemini") reply = await askGemini(messages);
    else if (provider === "groq") reply = await askGroq(messages);
    else {
      try { reply = process.env.GEMINI_API_KEY ? await askGemini(messages) : await askGroq(messages); }
      catch (first) {
        try { reply = process.env.GROQ_API_KEY ? await askGroq(messages) : (() => { throw first; })(); }
        catch { throw first; }
      }
    }
    return NextResponse.json({ reply });
  } catch (e) {
    const message = e instanceof Error ? e.message : "حدث خطأ في الخادم.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
