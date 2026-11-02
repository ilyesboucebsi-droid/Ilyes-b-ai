"use client";

import { useEffect, useState, type FormEvent } from "react";

type Engine = "auto" | "openai" | "claude" | "gemini" | "groq";
type Message = { role: "user" | "assistant"; content: string; engine?: string; images?: string[] };
type Paper = { title: string; authors: string; year: string; journal: string; abstract: string; url: string; doi: string; citations: number | null };
type Prompt = { id: string; text: string };
type Status = { providers: Record<"openai" | "claude" | "gemini" | "groq", boolean>; consensus: boolean; rateLimitConfigured: boolean };

const DEFAULT_PROMPTS: Prompt[] = [
  { id: "explain", text: "اشرح لي هذا الموضوع ببساطة" },
  { id: "rewrite", text: "أعد صياغة النص بأسلوب أكاديمي طبيعي" },
  { id: "law", text: "حلّل مسألة قانونية وفق القانون الجزائري" },
  { id: "summary", text: "لخّص هذا النص مع الحفاظ على الأفكار الأساسية" }
];

const ENGINE_LABELS: Record<string, string> = {
  hybrid: "OpenAI + Claude · إجابة مدمجة",
  openai: "OpenAI",
  claude: "Claude",
  gemini: "Gemini",
  groq: "Groq"
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const [provider, setProvider] = useState<Engine>("auto");
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [busy, setBusy] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchQuery, setResearchQuery] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [researchAnalysis, setResearchAnalysis] = useState("");
  const [researchAnalysisError, setResearchAnalysisError] = useState("");
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>(DEFAULT_PROMPTS);
  const [promptsLoaded, setPromptsLoaded] = useState(false);
  const [managePrompts, setManagePrompts] = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    fetch("/api/status").then(r => r.json()).then(setStatus).catch(() => setStatus(null));
    try {
      const saved = localStorage.getItem("ilyesb-quick-prompts");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setPrompts(parsed.filter((p: any) => p && typeof p.id === "string" && typeof p.text === "string").slice(0, 12));
      }
    } catch {}
    setPromptsLoaded(true);
  }, []);

  useEffect(() => {
    if (promptsLoaded) localStorage.setItem("ilyesb-quick-prompts", JSON.stringify(prompts));
  }, [prompts, promptsLoaded]);

  async function send(text = input) {
    const value = text.trim();
    if ((!value && !attachedImage) || busy) return;
    const imageForRequest = attachedImage;
    const messageText = value || (lang === "ar" ? "حلّل هذه الصورة واستخرج النص الظاهر فيها بدقة، مع الحفاظ على ترتيب الفقرات." : "Analyze this image and accurately extract all visible text, preserving paragraph order.");
    const next: Message[] = [...messages, { role: "user", content: messageText, ...(imageForRequest ? { images: [imageForRequest] } : {}) }];
    setMessages(next);
    setInput("");
    setAttachedImage(null);
    setImageError("");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12).map((message, index, list) => ({ ...message, ...(index === list.length - 1 ? {} : { images: undefined }) })), provider })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر إكمال الطلب");
      setMessages([...next, { role: "assistant", content: data.reply, engine: data.engine || "auto" }]);
    } catch (e) {
      setMessages(messages);
      setInput(value);
      if (imageForRequest) setAttachedImage(imageForRequest);
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setBusy(false);
    }
  }

  async function selectImage(file?: File) {
    setImageError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError(lang === "ar" ? "الصيغ المدعومة: JPG وPNG وWEBP." : "Supported formats: JPG, PNG and WEBP.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setImageError(lang === "ar" ? "حجم الصورة الأصلية كبير جداً (الحد 12 ميغابايت)." : "Original image is too large (12 MB maximum).");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(value => value ? resolve(value) : reject(new Error("compress")), "image/jpeg", 0.78)
      );
      if (blob.size > 1_400_000) throw new Error("large");
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") setAttachedImage(reader.result);
        else setImageError(lang === "ar" ? "تعذر تجهيز الصورة." : "Could not prepare the image.");
      };
      reader.onerror = () => setImageError(lang === "ar" ? "تعذر قراءة الصورة." : "Could not read the image.");
      reader.readAsDataURL(blob);
      if (provider !== "auto" && provider !== "gemini") setProvider("auto");
    } catch {
      setImageError(lang === "ar" ? "تعذر ضغط الصورة. جرّب صورة أصغر أو بصيغة أخرى." : "Could not compress the image. Try a smaller image or another format.");
    }
  }

  async function copyAnswer(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(current => current === index ? null : current), 1800);
    } catch {
      setError(lang === "ar" ? "تعذر نسخ الإجابة. تحقق من إذن الحافظة في المتصفح." : "Could not copy the answer. Check clipboard permissions.");
    }
  }

  async function searchPapers(e: FormEvent) {
    e.preventDefault();
    const query = researchQuery.trim();
    if (query.length < 3 || researchBusy) return;
    setResearchBusy(true);
    setResearchError("");
    setPapers([]);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تنفيذ البحث الأكاديمي");
      setPapers(data.papers || []);
      if (!data.papers?.length) setResearchError(lang === "ar" ? "لم تظهر نتائج لهذه العبارة. جرّب كلمات مفتاحية أدق." : "No results found. Try more focused keywords.");
    } catch (e) {
      setResearchError(e instanceof Error ? e.message : "حدث خطأ أثناء البحث");
    } finally {
      setResearchBusy(false);
    }
  }

  function dictate() {
    const w = window as typeof window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) {
      setError(lang === "ar" ? "الإملاء الصوتي غير مدعوم في هذا المتصفح." : "Voice input is not supported in this browser.");
      return;
    }
    const rec = new Recognition();
    rec.lang = lang === "ar" ? "ar-DZ" : "en-US";
    rec.onresult = (event: any) => setInput(old => old + event.results[0][0].transcript);
    rec.onerror = () => setError(lang === "ar" ? "تعذر التقاط الصوت. تحقق من إذن الميكروفون." : "Could not capture audio. Check microphone permission.");
    rec.start();
  }

  function addPrompt(e: FormEvent) {
    e.preventDefault();
    const text = newPrompt.trim();
    if (!text || prompts.length >= 12) return;
    setPrompts(old => [...old, { id: "custom-" + Date.now(), text }]);
    setNewPrompt("");
  }

  function savePrompt(id: string) {
    const value = editingText.trim();
    if (!value) return;
    setPrompts(old => old.map(p => p.id === id ? { ...p, text: value } : p));
    setEditingId(null);
    setEditingText("");
  }

  const providerReady = (name: "openai" | "claude" | "gemini" | "groq") => status?.providers?.[name] ?? false;
  const readyCount = status ? Object.values(status.providers).filter(Boolean).length : 0;

  return (
    <main className="app-shell" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar glass">
        <div className="brand">
          <div className="brand-mark"><span>IB</span><i>✦</i></div>
          <div><strong>ILYES.B <em>AI</em></strong><small>{lang === "ar" ? "مساحة ذكية للمعرفة والإبداع" : "A smarter space for knowledge and creativity"}</small></div>
        </div>
        <div className="toolbar">
          <label className="engine-picker">
            <span>✧</span>
            <select aria-label="AI engine" value={provider} onChange={e => setProvider(e.target.value as Engine)}>
              <option value="auto">{lang === "ar" ? "تلقائي · دمج عند توافر المحركين" : "Auto · Hybrid when available"}</option>
              <option value="openai" disabled={!providerReady("openai")}>OpenAI{providerReady("openai") ? " ✓" : " · غير مهيأ"}</option>
              <option value="claude" disabled={!providerReady("claude")}>Claude{providerReady("claude") ? " ✓" : " · غير مهيأ"}</option>
              <option value="gemini" disabled={!providerReady("gemini")}>Gemini{providerReady("gemini") ? " ✓" : " · غير مهيأ"}</option>
              <option value="groq" disabled={!providerReady("groq")}>Groq{providerReady("groq") ? " ✓" : " · غير مهيأ"}</option>
            </select>
          </label>
          <button className={"tool-button research-toggle " + (researchOpen ? "active" : "")} onClick={() => setResearchOpen(v => !v)}>⌕ <span>{lang === "ar" ? "بحث أكاديمي" : "Research"}</span></button>
          <button className="tool-button" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang === "ar" ? "EN" : "عربي"}</button>
          {messages.length > 0 && <button className="tool-button new-chat" onClick={() => { setMessages([]); setError(""); }}>＋ <span>{lang === "ar" ? "محادثة جديدة" : "New chat"}</span></button>}
        </div>
      </header>

      <section className="status-row" aria-live="polite">
        <span className="status-label"><i className={status ? "status-dot online" : "status-dot"} />{status ? (lang === "ar" ? readyCount + " من 4 محركات مهيأة" : readyCount + " of 4 engines configured") : (lang === "ar" ? "جارٍ فحص الخدمات…" : "Checking services…")}</span>
        <span className="status-note">{status ? (status.consensus ? (lang === "ar" ? "البحث الأكاديمي مهيأ" : "Academic search configured") : (lang === "ar" ? "البحث الأكاديمي غير مهيأ" : "Academic search not configured")) : (lang === "ar" ? "قد يستغرق الفحص لحظات" : "This may take a moment")}</span>
      </section>

      {researchOpen && <section className="research-panel glass">
        <div className="panel-heading"><div><span className="eyebrow">ACADEMIC DISCOVERY</span><h2>{lang === "ar" ? "البحث العلمي عبر Consensus" : "Academic search with Consensus"}</h2></div><button className="close-button" onClick={() => setResearchOpen(false)} aria-label="Close">×</button></div>
        <p>{lang === "ar" ? "هذه الخاصية وحدها تستدعي خدمة Consensus للبحث عن الدراسات والأوراق العلمية. المحادثة العادية لا تستخدم Consensus تلقائياً." : "This dedicated feature calls Consensus to find academic papers. Normal chat does not use Consensus automatically."}</p>
        <form onSubmit={searchPapers} className="research-form">
          <input value={researchQuery} onChange={e => setResearchQuery(e.target.value)} placeholder={lang === "ar" ? "مثال: أثر الذكاء الاصطناعي على المسؤولية المدنية" : "e.g. AI and civil liability"} />
          <button className="primary-button" disabled={researchBusy || researchQuery.trim().length < 3}>{researchBusy ? "…" : (lang === "ar" ? "ابحث عن دراسات" : "Search papers")}</button>
        </form>
        {researchError && <div className="inline-error">{researchError}</div>}
        {researchAnalysis && <section className="research-analysis">
          <div className="panel-heading"><div><span className="eyebrow">OPENAI ANALYSIS</span><h3>{lang === "ar" ? "تحليل OpenAI للدراسات" : "OpenAI analysis of the studies"}</h3></div><small>{lang === "ar" ? "مبني على نتائج Consensus" : "Based on Consensus results"}</small></div>
          <div className="research-analysis-content">{researchAnalysis}</div>
        </section>}
        {researchAnalysisError && papers.length > 0 && <div className="inline-error">{researchAnalysisError}</div>}
        {papers.length > 0 && <div className="paper-list">{papers.map((p, i) => <article className="paper-card" key={i}>
          <b>{p.title}</b>
          <small>{[p.authors, p.year, p.journal].filter(Boolean).join(" · ")}</small>
          {p.abstract && <p>{p.abstract}</p>}
          <small>{p.citations !== null ? (lang === "ar" ? "الاستشهادات: " : "Citations: ") + p.citations : ""}{p.doi ? " · DOI: " + p.doi : ""}</small>
          {p.url && <a href={p.url} target="_blank" rel="noreferrer">{lang === "ar" ? "فتح الدراسة ↗" : "Open paper ↗"}</a>}
        </article>)}</div>}
        <small className="research-footnote">{lang === "ar" ? "تحقّق من بيانات الدراسة والنص الكامل قبل الاستشهاد بها. استخدام البحث يخضع لحصة حساب Consensus." : "Verify paper details and full text before citing. Searches count toward your Consensus allowance."}</small>
      </section>}

      <section className={"conversation-area " + (messages.length ? "has-messages" : "")}>
        {messages.length === 0 ? <div className="welcome">
          <span className="eyebrow">{lang === "ar" ? "ذكاء متعدد المحركات" : "MULTI-ENGINE INTELLIGENCE"}</span>
          <h1>{lang === "ar" ? <>أهلاً بك في <span>ILYES.B AI</span></> : <>Welcome to <span>ILYES.B AI</span></>}</h1>
          <p className="welcome-copy">{lang === "ar" ? "اسأل، ابحث، اكتب، وتعلّم. مساعد واحد يجمع أدوات متعددة في تجربة بسيطة." : "Ask, research, write and learn. Multiple AI engines in one clear workspace."}</p>

          <div className="quick-heading"><span>{lang === "ar" ? "أوامر جاهزة" : "QUICK PROMPTS"}</span><button className="quick-toggle" onClick={() => { setShowQuickPrompts(v => !v); setManagePrompts(false); }}>{showQuickPrompts ? (lang === "ar" ? "إخفاء الأوامر ▲" : "Hide prompts ▲") : (lang === "ar" ? "عرض الأوامر الجاهزة ▼" : "Show prompts ▼")}</button></div>
          {showQuickPrompts && <><div className="quick-prompts">{prompts.map(p => <button key={p.id} onClick={() => send(p.text)}><span>✧</span>{p.text}<i>↗</i></button>)}</div><div className="prompt-manage-link"><button onClick={() => setManagePrompts(v => !v)}>{managePrompts ? (lang === "ar" ? "إغلاق الإدارة" : "Close manager") : (lang === "ar" ? "تخصيص الأوامر وتعديلها" : "Manage prompts")}</button></div></>}
          {managePrompts && <div className="prompt-manager">
            <form onSubmit={addPrompt} className="add-prompt-form"><input value={newPrompt} onChange={e => setNewPrompt(e.target.value)} placeholder={lang === "ar" ? "اكتب أمراً سريعاً جديداً…" : "Add a new quick prompt…"} /><button className="primary-button" disabled={!newPrompt.trim() || prompts.length >= 12}>＋</button></form>
            {prompts.map(p => <div className="prompt-edit-row" key={p.id}>
              {editingId === p.id ? <><input value={editingText} onChange={e => setEditingText(e.target.value)} /><button onClick={() => savePrompt(p.id)}>{lang === "ar" ? "حفظ" : "Save"}</button><button onClick={() => setEditingId(null)}>{lang === "ar" ? "إلغاء" : "Cancel"}</button></> : <><span>{p.text}</span><button onClick={() => { setEditingId(p.id); setEditingText(p.text); }}>{lang === "ar" ? "تعديل" : "Edit"}</button><button className="delete-prompt" onClick={() => setPrompts(old => old.filter(item => item.id !== p.id))}>{lang === "ar" ? "حذف" : "Delete"}</button></>}
            </div>)}
            <small>{lang === "ar" ? "تُحفظ الأوامر على هذا الجهاز والمتصفح، ويمكنك تعديلها أو حذفها لاحقاً." : "Prompts are saved in this browser and can be edited or deleted anytime."}</small>
          </div>}
        </div> : <div className="messages-list">{messages.map((m, i) => <article key={i} className={"message-card " + m.role}>
          <div className="message-heading"><div className="message-avatar">{m.role === "user" ? "أ" : "✦"}</div><div><b>{m.role === "user" ? (lang === "ar" ? "أنت" : "You") : "ILYES.B AI"}</b>{m.role === "assistant" && m.engine && <small>{ENGINE_LABELS[m.engine] || m.engine}</small>}</div></div>
          {m.images?.map((src, imageIndex) => <img key={imageIndex} className="message-image" src={src} alt={lang === "ar" ? "الصورة المرفقة" : "Attached image"} />)}
          {m.content && <div className="message-content">{m.content}</div>}
          {m.role === "assistant" && <button type="button" className="copy-button" onClick={() => copyAnswer(m.content, i)}>{copiedIndex === i ? "✓ " + (lang === "ar" ? "تم النسخ" : "Copied") : "▢ " + (lang === "ar" ? "نسخ الإجابة" : "Copy answer")}</button>}
        </article>)}{busy && <div className="thinking"><span /><span /><span />{lang === "ar" ? "جارٍ إعداد الإجابة…" : "Preparing your answer…"}</div>}</div>}
      </section>

      {error && <div className="error-banner"><span>!</span>{error}<button onClick={() => setError("")}>×</button></div>}
      <div className="composer-wrap">
        <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
          <input id="image-upload" className="hidden-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { selectImage(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          <button type="button" className="search-side-button" onClick={() => setResearchOpen(v => !v)} title={lang === "ar" ? "البحث الأكاديمي" : "Academic search"} aria-label="Academic search">⌕ <span>{lang === "ar" ? "بحث" : "Search"}</span></button>
          <button type="button" className="image-button" onClick={() => document.getElementById("image-upload")?.click()} title={lang === "ar" ? "إرفاق صورة" : "Attach image"} aria-label="Attach image">▧</button>
          <button type="button" className="voice-button" onClick={dictate} title={lang === "ar" ? "إملاء صوتي" : "Voice input"} aria-label="Voice input">♩</button>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={lang === "ar" ? "اكتب سؤالك أو الصق النص هنا…" : "Ask anything or paste your text…"} rows={1} />
          <button className="send-button" disabled={busy || (!input.trim() && !attachedImage)} aria-label="Send">{busy ? "…" : "↑"}</button>
        </form>
        {attachedImage && <div className="attachment-preview"><img src={attachedImage} alt={lang === "ar" ? "معاينة الصورة" : "Image preview"} /><span>{lang === "ar" ? "صورة جاهزة للإرسال" : "Image ready to send"}</span><button type="button" onClick={() => setAttachedImage(null)} aria-label="Remove image">×</button></div>}
        {imageError && <div className="inline-error">{imageError}</div>}
        <div className="composer-hint"><span>{lang === "ar" ? "Enter للإرسال · Shift + Enter لسطر جديد" : "Enter to send · Shift + Enter for a new line"}</span><span>{lang === "ar" ? "قد تخطئ نماذج الذكاء الاصطناعي؛ راجع المعلومات المهمة." : "AI can make mistakes. Verify important information."}</span></div>
      </div>
      <footer className="site-footer"><span>ILYES.B AI</span><i>•</i>{lang === "ar" ? "معرفة أوسع، وقرار أوعى." : "Broader knowledge. Better judgment."}</footer>
    </main>
  );
}