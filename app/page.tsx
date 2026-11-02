"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type Paper = { title: string; authors: string; year: string; journal: string; abstract: string; url: string; doi: string; citations: number | null };

const quick = [
  "اشرح لي هذا الموضوع ببساطة",
  "أعد صياغة النص بأسلوب أكاديمي طبيعي",
  "حلّل مسألة قانونية وفق القانون الجزائري",
  "لخّص هذا النص مع الحفاظ على الأفكار الأساسية"
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState("auto");
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchQuery, setResearchQuery] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchError, setResearchError] = useState("");

  async function send(text = input) {
    const value = text.trim();
    if (!value || busy) return;
    const next: Message[] = [...messages, { role: "user", content: value }];
    setMessages(next); setInput(""); setBusy(true); setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, provider })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر إكمال الطلب");
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally { setBusy(false); }
  }

  async function searchPapers(e: React.FormEvent) {
    e.preventDefault();
    const query = researchQuery.trim();
    if (query.length < 3 || researchBusy) return;
    setResearchBusy(true); setResearchError(""); setPapers([]);
    try {
      const res = await fetch("/api/research", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تنفيذ البحث الأكاديمي");
      setPapers(data.papers || []);
      if (!data.papers?.length) setResearchError("لم يعثر البحث على نتائج. جرّب صياغة أخرى أو استخدم كلمات مفتاحية باللغة الإنجليزية.");
    } catch (e) {
      setResearchError(e instanceof Error ? e.message : "حدث خطأ أثناء البحث");
    } finally { setResearchBusy(false); }
  }

  function dictate() {
    const w = window as typeof window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) { setError("الإملاء الصوتي غير مدعوم في هذا المتصفح."); return; }
    const rec = new Recognition(); rec.lang = lang === "ar" ? "ar-DZ" : "en-US";
    rec.onresult = (event: any) => setInput((old) => old + event.results[0][0].transcript);
    rec.onerror = () => setError("تعذر التقاط الصوت. تحقق من إذن الميكروفون.");
    rec.start();
  }

  return (
    <main className="shell" dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">B</span><div><strong>ILYES.B AI</strong><small>{lang === "ar" ? "مساعدك الذكي" : "Your AI assistant"}</small></div></div>
        <div className="tools">
          <select aria-label="AI engine" value={provider} onChange={e => setProvider(e.target.value)}>
            <option value="auto">{lang === "ar" ? "اختيار تلقائي" : "Auto select"}</option>
            <option value="gemini">Gemini</option><option value="groq">Groq</option>
          </select>
          <button className="lang" onClick={() => setResearchOpen(v => !v)}>{lang === "ar" ? "بحث أكاديمي" : "Academic search"}</button>
          <button className="lang" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang === "ar" ? "EN" : "عربي"}</button>
        </div>
      </header>

      {researchOpen && <section className="research">
        <h2>{lang === "ar" ? "البحث الأكاديمي — Consensus" : "Academic research — Consensus"}</h2>
        <p>{lang === "ar" ? "ابحث عن الدراسات والأوراق العلمية. اكتب موضوعك، ويفضّل استخدام كلمات مفتاحية دقيقة." : "Search academic papers and studies using a focused query."}</p>
        <form onSubmit={searchPapers} className="research-form">
          <input value={researchQuery} onChange={e => setResearchQuery(e.target.value)} placeholder={lang === "ar" ? "مثال: أثر الذكاء الاصطناعي على المسؤولية المدنية" : "e.g. AI and civil liability"} />
          <button className="send" disabled={researchBusy || researchQuery.trim().length < 3}>{researchBusy ? "…" : (lang === "ar" ? "ابحث" : "Search")}</button>
        </form>
        {researchError && <div className="error">{researchError}</div>}
        {papers.length > 0 && <div className="paper-list">{papers.map((p,i) => <article className="paper" key={i}>
          <b>{p.title}</b>
          <small>{[p.authors,p.year,p.journal].filter(Boolean).join(" • ")}</small>
          {p.abstract && <p>{p.abstract}</p>}
          <small>{p.citations !== null ? (lang === "ar" ? "الاستشهادات: " : "Citations: ") + p.citations : ""}{p.doi ? " • DOI: " + p.doi : ""}</small>
          {p.url && <a href={p.url} target="_blank" rel="noreferrer">{lang === "ar" ? "فتح الدراسة" : "Open paper"}</a>}
        </article>)}</div>}
        <small className="research-note">{lang === "ar" ? "ملاحظة: البحث يستهلك من حصة Consensus الشهرية. تحقّق من بيانات الدراسة ومصدرها قبل الاستشهاد بها." : "Searches use your monthly Consensus allowance. Verify paper details before citing."}</small>
      </section>}

      <section className="chat">
        {messages.length === 0 ? <div className="welcome">
          <div className="orb">✦</div><h1>{lang === "ar" ? "مرحباً بك في ILYES.B AI" : "Welcome to ILYES.B AI"}</h1>
          <p>{lang === "ar" ? "مساعد متعدد المحركات للبحث والكتابة والتعلّم." : "A multi-engine assistant for research, writing and learning."}</p>
          <div className="quick">{quick.map(q => <button key={q} onClick={() => send(q)}>{lang === "ar" ? q : "Try a quick prompt"}</button>)}</div>
        </div> : <div className="messages">{messages.map((m,i) => <article key={i} className={m.role}><b>{m.role === "user" ? (lang === "ar" ? "أنت" : "You") : "ILYES.B AI"}</b><p>{m.content}</p></article>)}{busy && <div className="typing">يفكر...</div>}</div>}
      </section>
      {error && <div className="error">{error}</div>}
      <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
        <button type="button" className="icon" onClick={dictate} title="Voice input">🎙</button>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if(e.key==="Enter" && !e.shiftKey){e.preventDefault();send();} }} placeholder={lang === "ar" ? "اكتب رسالتك هنا..." : "Write your message..."} rows={1} />
        <button className="send" disabled={busy || !input.trim()}>{busy ? "…" : "➤"}</button>
      </form>
      <footer>قد تخطئ الإجابات؛ تحقّق من المعلومات القانونية والمهمة قبل الاعتماد عليها.</footer>
    </main>
  );
}
