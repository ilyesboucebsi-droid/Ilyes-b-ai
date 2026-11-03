import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

async function checkLimit(req: NextRequest) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(8, "1 m"), prefix: "ilyesb:translate" });
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
    return (await limiter.limit(ip)).success;
  } catch { return false; }
}

async function translateWith(provider: "openai" | "claude" | "gemini" | "groq", text: string, target: string) {
  const instruction = "Translate the supplied text faithfully into " + target + ". Preserve meaning, legal and technical terminology, names, numbers, citations, paragraph structure and tone. Do not summarize, explain, omit, or add information. If a term has no exact equivalent, use the accepted translation and retain the original term in parentheses when useful. Return only the translation.";
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OpenAI غير مهيأ");
    const r = await fetch("https://api.openai.com/v1/responses", { method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer "+key}, body:JSON.stringify({model:process.env.OPENAI_MODEL || "gpt-6.1-sol", instructions:instruction, input:text, max_output_tokens:5000}), signal:AbortSignal.timeout(45000) });
    const d:any=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d?.error?.message || "OpenAI translation failed");
    const blocks=Array.isArray(d.output)?d.output.flatMap((x:any)=>Array.isArray(x.content)?x.content:[]):[];
    const out=typeof d.output_text==="string"?d.output_text:blocks.filter((x:any)=>x.type==="output_text").map((x:any)=>x.text||"").join("\n");
    if(!out.trim()) throw new Error("لم يصل نص مترجم");
    return out.trim();
  }
  if (provider === "claude") {
    const key=process.env.ANTHROPIC_API_KEY; if(!key) throw new Error("Claude غير مهيأ");
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:process.env.CLAUDE_MODEL||"claude-sonnet-5-5",system:instruction,messages:[{role:"user",content:text}],max_tokens:5000}),signal:AbortSignal.timeout(45000)});
    const d:any=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d?.error?.message||"Claude translation failed");
    const out=(d.content||[]).filter((x:any)=>x.type==="text").map((x:any)=>x.text).join("\n"); if(!out.trim()) throw new Error("لم يصل نص مترجم"); return out.trim();
  }
  if (provider === "gemini") {
    const key=process.env.GEMINI_API_KEY; if(!key) throw new Error("Gemini غير مهيأ");
    const model=process.env.GEMINI_MODEL||"gemini-3.8-flash";
    const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({systemInstruction:{parts:[{text:instruction}]},contents:[{role:"user",parts:[{text}]}],generationConfig:{maxOutputTokens:5000,temperature:0.1}}),signal:AbortSignal.timeout(45000)});
    const d:any=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d?.error?.message||"Gemini translation failed");
    const out=d.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("")||""; if(!out.trim()) throw new Error("لم يصل نص مترجم"); return out.trim();
  }
  const key=process.env.GROQ_API_KEY; if(!key) throw new Error("Groq غير مهيأ");
  const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},body:JSON.stringify({model:process.env.GROQ_MODEL||"openai/gpt-oss-20b",messages:[{role:"system",content:instruction},{role:"user",content:text}],max_completion_tokens:5000,temperature:0.1}),signal:AbortSignal.timeout(45000)});
  const d:any=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d?.error?.message||"Groq translation failed");
  const out=d.choices?.[0]?.message?.content||""; if(!out.trim()) throw new Error("لم يصل نص مترجم"); return out.trim();
}

export async function POST(req: NextRequest) {
  try {
    if (!(await checkLimit(req))) return NextResponse.json({error:"تعذر التحقق من حد الاستخدام أو تم بلوغه. حاول لاحقاً."},{status:429});
    const body=await req.json();
    const text=typeof body.text==="string"?body.text.trim():"";
    const target=typeof body.target==="string"?body.target.slice(0,80):"Arabic";
    if(!text || text.length>12000) return NextResponse.json({error:"النص مطلوب ويجب ألا يتجاوز 12000 حرف."},{status:400});
    const order:("openai"|"claude"|"gemini"|"groq")[]=["openai","claude","gemini","groq"];
    const failures:string[]=[];
    for(const provider of order) {
      const configured=provider==="openai"?process.env.OPENAI_API_KEY:provider==="claude"?process.env.ANTHROPIC_API_KEY:provider==="gemini"?process.env.GEMINI_API_KEY:process.env.GROQ_API_KEY;
      if(!configured) continue;
      try { return NextResponse.json({translation:await translateWith(provider,text,target),provider}); }
      catch(e) { failures.push(provider+": "+(e instanceof Error?e.message:"failed")); }
    }
    return NextResponse.json({error:"تعذر إتمام الترجمة عبر المحركات المتاحة. "+failures.slice(0,2).join(" | ")},{status:503});
  } catch { return NextResponse.json({error:"حدث خطأ أثناء الترجمة."},{status:500}); }
}
