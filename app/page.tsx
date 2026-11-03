"use client";

import { useEffect, useState, type FormEvent } from "react";

type Engine = "auto" | "hybrid" | "openai" | "claude" | "gemini" | "groq";
type ChatPaper = { title: string; authors: string; year: string; abstract: string; url: string; doi: string };
type Message = { role: "user" | "assistant"; content: string; engine?: string; images?: string[]; consensusUsed?: boolean; consensusPapers?: ChatPaper[]; collaboration?: { used: boolean; contributors: string[]; failures?: string[] } };
type SearchSource = "consensus" | "semantic_scholar" | "openalex";
type Paper = { title: string; authors: string; year: string; journal: string; abstract: string; url: string; doi: string; citations: number | null; sources: SearchSource[] };
type SearchStatus = { id: SearchSource; name: string; status: "success" | "empty" | "error"; count: number; error: string | null };
type Status = { providers: Record<"openai" | "claude" | "gemini" | "groq", boolean>; consensus: boolean; rateLimitConfigured: boolean; joinEnabled?: boolean; paused?: boolean; maintenance?: boolean };

function cleanAssistantText(value: string) {
  return value
    .replace(/\\*\\*/g, "")
    .replace(/(^|\\s)\\*(?=\\S)|(?<=\\S)\\*(?=\\s|$)/g, "")
    .replace(/__/g, "")
    .replace(/(^|\\s)_(?=\\S)|(?<=\\S)_(?=\\s|$)/g, "");
}

function renderMessageContent(value: string) {
  return cleanAssistantText(value).split(/\\r?\\n/).map((raw, index) => {
    const line = raw.trim();
    if (!line) return <div className="message-paragraph-spacer" key={index} />;
    const markdownHeading = /^#{1,6}\\s+(.+)$/.exec(line);
    const plainHeading = /^(المقدمة|الخاتمة|تمهيد|أولاً|ثانياً|ثالثاً|رابعاً|القضية الأولى|القضية الثانية|المبحث الأول|المبحث الثاني|المطلب الأول|المطلب الثاني|النتيجة)(?:\\s*[:：].*)?$/.test(line);
    if (markdownHeading || plainHeading) {
      return <h3 className="message-content-heading" key={index}>{markdownHeading ? markdownHeading[1] : line}</h3>;
    }
    const bullet = /^[-•]\\s+(.+)$/.exec(line) || /^\\*\\s+(.+)$/.exec(raw);
    return <p className="message-content-paragraph" key={index}>{bullet ? "• " + bullet[1] : line}</p>;
  });
}

const ENGINE_LABELS: Record<string, string> = {
  hybrid: "GPT + تعاون المحركات · إجابة مدمجة",
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
  const [aboutOpen, setAboutOpen] = useState(false);
  const [researchQuery, setResearchQuery] = useState("");
  const [searchSources, setSearchSources] = useState<SearchSource[]>(["consensus", "semantic_scholar", "openalex"]);
  const [searchStatuses, setSearchStatuses] = useState<SearchStatus[]>([]);
  // Keep each research state declaration on its own source line for valid TSX parsing.
  const [papers, setPapers] = useState<Paper[]>([]);
  const [researchAnalysis, setResearchAnalysis] = useState("");
  const [researchAnalysisError, setResearchAnalysisError] = useState("");
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyNotice, setHistoryNotice] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ilyes-b-ai-chat-v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setMessages(parsed.filter((item: any) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").slice(-80));
      }
    } catch {
      setHistoryNotice(lang === "ar" ? "تعذر استعادة المحادثة المحفوظة على هذا الجهاز." : "Could not restore the chat saved on this device.");
    } finally {
      setHistoryReady(true);
    }
    fetch("/api/status").then(r => r.json()).then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    if (!historyReady) return;
    try {
      localStorage.setItem("ilyes-b-ai-chat-v1", JSON.stringify(messages.slice(-50).map(message => ({ ...message, images: undefined }))));
    } catch {
      setHistoryNotice(lang === "ar" ? "مساحة التخزين المحلية ممتلئة؛ نزّل نسخة من المحادثة قبل المتابعة." : "Local storage is full; export this conversation before continuing.");
    }
  }, [messages, historyReady, lang]);

  function exportConversation() {
    if (!messages.length) return;
    const transcript = messages.map(message => {
      const speaker = message.role === "user" ? (lang === "ar" ? "أنت" : "You") : "ILYES.B AI";
      return speaker + "\\n" + message.content + (message.collaboration?.contributors?.length ? "\\n" + (lang === "ar" ? "المحركات المساهمة: " : "Contributors: ") + message.collaboration.contributors.join(", ") : "");
    }).join("\\n\\n------------------------------\\n\\n");
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ilyes-b-ai-conversation-" + new Date().toISOString().slice(0, 10) + ".txt";
    link.click();
    URL.revokeObjectURL(url);
  }

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
      setMessages([...next, { role: "assistant", content: data.reply, engine: data.engine || "auto", consensusUsed: Boolean(data.consensusUsed), consensusPapers: Array.isArray(data.consensusPapers) ? data.consensusPapers : [], collaboration: data.collaboration }]);
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

  function exportAnswerPdf(content: string) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError(lang === "ar" ? "اسمح بفتح النوافذ المنبثقة لتصدير PDF." : "Allow pop-ups to export PDF.");
      return;
    }
    const clean = content.replace(/\\*\\*/g, "").replace(/__/g, "").replace(/(^|\\s)_(?=\\S)|(?<=\\S)_(?=\\s|$)/g, "");
    const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const body = clean.split(/\\r?\\n/).map(line => {
      const heading = /^\\s{0,3}#{1,6}\\s+(.+)$/.exec(line);
      return heading ? `<h2>${esc(heading[1])}</h2>` : line ? `<p>${esc(line)}</p>` : "<p>&nbsp;</p>";
    }).join("");
    printWindow.document.write(`<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>ILYES.B AI</title><style>@page{size:A4;margin:20mm}body{font-family:"Simplified Arabic Fixed","Simplified Arabic",serif;margin:0;color:#172033;line-height:1.9;font-size:14pt}h1,h2{font-family:"Simplified Arabic Fixed","Simplified Arabic",serif;font-size:16pt;font-weight:700;margin:1em 0 .45em}h1{margin-top:0}main{overflow-wrap:anywhere}p{font-size:14pt;font-weight:400;margin:0 0 .55em;white-space:pre-wrap}</style></head><body><main>${body}</main><script>window.onload=()=>{window.print()}</script></body></html>`);
    printWindow.document.close();
  }

  function exportAnswerWord(content: string) {
    const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const clean = content.replace(/\\*\\*/g, "").replace(/__/g, "").replace(/(^|\\s)_(?=\\S)|(?<=\\S)_(?=\\s|$)/g, "");
    const paragraphs = clean.split(/\\r?\\n/).map(line => {
      const heading = /^\\s{0,3}#{1,6}\\s+(.+)$/.exec(line);
      const text = heading ? heading[1] : line;
      if (!text) return "<w:p/>";
      const size = heading ? 32 : 28;
      const bold = heading ? "<w:b/><w:bCs/>" : "";
      return `<w:p><w:pPr><w:bidi/><w:jc w:val="start"/><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Simplified Arabic Fixed" w:hAnsi="Simplified Arabic Fixed" w:eastAsia="Simplified Arabic Fixed" w:cs="Simplified Arabic Fixed"/><w:rtl/>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
    }).join("");
    const files: [string, string][] = [
      ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
      ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
      ["word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ["word/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Simplified Arabic Fixed" w:hAnsi="Simplified Arabic Fixed" w:eastAsia="Simplified Arabic Fixed" w:cs="Simplified Arabic Fixed"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>'],
      ["word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`]
    ];
    const encoder = new TextEncoder();
    const crc32 = (bytes: Uint8Array) => {
      let crc = -1;
      for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
      return (crc ^ -1) >>> 0;
    };
    const chunks: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    const u16 = (v: number) => [v & 255, (v >>> 8) & 255];
    const u32 = (v: number) => [...u16(v & 65535), ...u16(v >>> 16)];
    for (const [name, value] of files) {
      const n = encoder.encode(name), data = encoder.encode(value), crc = crc32(data);
      const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0), ...n, ...data]);
      chunks.push(local);
      const dir = new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...n]);
      central.push(dir); offset += local.length;
    }
    const directory = central.reduce((all, part) => { const merged = new Uint8Array(all.length + part.length); merged.set(all); merged.set(part, all.length); return merged; }, new Uint8Array());
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(directory.length), ...u32(offset), ...u16(0)]);
    const blob = new Blob([...chunks, directory, end] as BlobPart[], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "ilyes-b-ai-answer.docx"; link.click();
    URL.revokeObjectURL(url);
  }

  async function searchPapers(e: FormEvent) {
    e.preventDefault();
    const query = researchQuery.trim();
    if (query.length < 3 || researchBusy) return;
    if (searchSources.length === 0) {
      setResearchError(lang === "ar" ? "اختر محرك بحث واحداً على الأقل قبل بدء البحث." : "Select at least one search engine before starting.");
      return;
    }
    setResearchBusy(true);
    setSearchStatuses([]);
    setResearchError("");
    setResearchAnalysis("");
    setResearchAnalysisError("");
    setPapers([]);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, sources: searchSources })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تنفيذ البحث الأكاديمي");
      setPapers(data.papers || []);
      setSearchStatuses(data.sources || []);
      setResearchAnalysis(data.analysis || "");
      setResearchAnalysisError(data.analysisError || "");
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

  const providerReady = (name: "openai" | "claude" | "gemini" | "groq") => status?.providers?.[name] ?? false;
  const readyCount = status ? Object.values(status.providers).filter(Boolean).length : 0;

  return (
    <main className="app-shell" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar glass">
        <div className="left-tools">
          <button className="tool-button language-toggle" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label={lang === "ar" ? "Switch language to English" : "تغيير اللغة إلى العربية"}>{lang === "ar" ? "EN" : "عربي"}</button>
          <button className="tool-button about-toggle" onClick={() => setAboutOpen(true)}>{lang === "ar" ? "ⓘ نبذة" : "ⓘ About"}</button>
        </div>
        <div className="brand">
          <div className="brand-mark"><span>IB</span><i>✦</i></div>
          <div><strong>ILYES.B <em>AI</em></strong><small>{lang === "ar" ? "معرفة. بحث. إبداع." : "Knowledge. Research. Creativity."}</small></div>
        </div>
        <div className="toolbar">
          <label className="engine-picker">
            <span>✧</span>
            <select aria-label="AI engine" value={provider} onChange={e => setProvider(e.target.value as Engine)}>
              <option value="auto">{lang === "ar" ? "تلقائي · سريع" : "Auto · Fast"}</option>
              <option value="hybrid" disabled={!providerReady("openai")}>{lang === "ar" ? "تعاون المحركات بقيادة GPT" : "GPT-led engine collaboration"}{providerReady("openai") ? " ✓" : " · يتطلب OpenAI"}</option>
              <option value="openai" disabled={!providerReady("openai")}>OpenAI{providerReady("openai") ? " ✓" : " · غير مهيأ"}</option>
              <option value="claude" disabled={!providerReady("claude")}>Claude{providerReady("claude") ? " ✓" : " · غير مهيأ"}</option>
              <option value="gemini" disabled={!providerReady("gemini")}>Gemini{providerReady("gemini") ? " ✓" : " · غير مهيأ"}</option>
              <option value="groq" disabled={!providerReady("groq")}>Groq{providerReady("groq") ? " ✓" : " · غير مهيأ"}</option>
            </select>
          </label>
          <button className={"tool-button research-toggle " + (researchOpen ? "active" : "")} onClick={() => setResearchOpen(v => !v)}>⌕ <span>{lang === "ar" ? "بحث أكاديمي" : "Research"}</span></button>
          <a className="tool-button join-link" href="/join">✦ <span>{lang === "ar" ? "انضم" : "Join"}</span></a>
          <a className="tool-button admin-link" href="/admin">⌘ <span>{lang === "ar" ? "الإدارة" : "Admin"}</span></a>
          {messages.length > 0 && <button className="tool-button" onClick={exportConversation}>⇩ <span>{lang === "ar" ? "تصدير المحادثة" : "Export chat"}</span></button>}
          {messages.length > 0 && <button className="tool-button new-chat" onClick={() => { setMessages([]); setError(""); setHistoryNotice(""); }}>＋ <span>{lang === "ar" ? "محادثة جديدة" : "New chat"}</span></button>}
        </div>
      </header>


      {aboutOpen && <div className="about-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setAboutOpen(false); }}>
        <section className="about-modal glass" role="dialog" aria-modal="true" aria-labelledby="about-title">
          <div className="about-modal-header">
            <div><span className="eyebrow">ILYES.B AI · PLATFORM GUIDE</span><h2 id="about-title">{lang === "ar" ? "نبذة عن المنصة" : "About the platform"}</h2></div>
            <button className="close-button" onClick={() => setAboutOpen(false)} aria-label={lang === "ar" ? "إغلاق" : "Close"}>×</button>
          </div>
          {lang === "ar" ? <>
            <p className="about-intro">مرحباً بك في ILYES.B AI. هذه المنصة مساحة موحدة تساعدك على السؤال والكتابة والتعلّم والبحث الأكاديمي. يمكنك استخدامها مباشرة دون خبرة تقنية؛ اختر الطريقة المناسبة من الدليل التالي.</p>
            <div className="about-section"><h3>كيف تبدأ؟</h3><ol><li><b>للمحادثة:</b> اكتب سؤالك في مربع الكتابة أسفل الصفحة، ثم اضغط زر الإرسال. اختر محركاً أو اترك الاختيار على «تلقائي».</li><li><b>للصور:</b> اضغط رمز الصورة وأرفق صورة واضحة، ثم اكتب ما تريد فهمه أو استخراجه منها.</li><li><b>للصوت:</b> اضغط رمز الميكروفون واسمح للمتصفح باستخدامه، ثم تحدث بوضوح.</li><li><b>للبحث العلمي:</b> افتح «بحث أكاديمي»، واكتب سؤالاً بحثياً محدداً، ثم اضغط «ابحث عن دراسات».</li></ol></div>
            <div className="about-section">
              <h3>أولاً: محركات الذكاء الاصطناعي</h3>
              <p>هذه المحركات تتولى فهم رسالتك وتوليد الإجابات وصياغة النصوص وشرح الموضوعات. المحركات التي قد تظهر في قائمة الاختيار هي:</p>
              <ul>
                <li><b>OpenAI:</b> محرك للمحادثة والتحليل وصياغة الإجابات، ويُستخدم أيضاً لتحليل الدراسات التي يعثر عليها البحث الأكاديمي.</li>
                <li><b>Gemini:</b> محرك للمحادثة، وتُوجَّه إليه مهام فهم الصور في المنصة.</li>
                <li><b>Groq:</b> يتيح تشغيل نماذج لغوية للاستجابة للمحادثات.</li>
                <li><b>Claude:</b> قد يظهر كخيار إضافي عند إعداد مفتاحه؛ ويمكن أن يشارك OpenAI في إعداد إجابة مدمجة عندما يكون المحركان مهيأين.</li>
              </ul>
              <p><b>وضع «تلقائي»:</b> يختار الخدمة المتاحة وفق إعدادات الخادم. وعند تهيئة OpenAI وClaude معاً يمكن دمج مخرجاتهما في إجابة واحدة. ظهور المحرك في القائمة أو علامة الجاهزية يعني أن مفتاحه موجود في إعدادات الخادم، وليس ضماناً دائماً لعدم حدوث عطل لدى مزوّد الخدمة.</p>
            </div>
            <div className="about-section">
              <h3>ثانياً: البحث الأكاديمي ودمج المحركات</h3>
              <p>تتيح المنصة ثلاثة مصادر للبحث العلمي: <b>Consensus</b> للعثور على الدراسات والأدلة، و<b>Semantic Scholar</b> للبحث في الأوراق والمؤلفين والاستشهادات، و<b>OpenAlex</b> لفهرسة المنشورات والباحثين والمجلات. هذه خدمات بحث مستقلة وليست محركات محادثة.</p><p><b>كيف تستخدمها؟</b> افتح «بحث أكاديمي»، وحدد محركاً واحداً أو أكثر من مربعات الاختيار، أو اضغط «تحديد الكل» لدمج المحركات الثلاثة. اكتب سؤالاً محدداً ثم اضغط زر «دمج المحركات والبحث». تعمل المصادر المختارة بالتوازي، وتجمع المنصة النتائج وتحاول إزالة الدراسات المكررة، وتعرض شارة تبين مصدر كل دراسة وحالة كل محرك.</p>
              <div className="about-flow"><span>1 · تكتب سؤالاً وتحدد المحركات</span><i>←</i><span>2 · بحث متزامن</span><i>←</i><span>3 · دمج وإزالة التكرار</span><i>←</i><span>4 · تحليل OpenAI</span></div>
              <p>بعد جمع النتائج، ترسل المنصة البيانات والملخصات المتاحة إلى OpenAI لتحليلها ومقارنة أوجه الاتفاق والاختلاف وحدود الأدلة. لا يعني ذلك قراءة النص الكامل لكل ورقة. افتح الدراسة الأصلية وتحقق من بياناتها ومنهجيتها قبل الاستشهاد بها. قد يتعذر أحد المصادر بينما تنجح المصادر الأخرى؛ وستظهر حالة كل محرك بصورة مستقلة.</p><p><b>تنبيه علمي:</b> التحليل يعتمد على البيانات والملخصات التي أعادها البحث، ولا يعني بالضرورة قراءة النص الكامل لكل ورقة. افتح الدراسة الأصلية وتحقق من مؤلفيها وسنة نشرها ومنهجيتها ونتائجها قبل الاستشهاد بها. Consensus أداة للعثور على الأبحاث، وليس ضماناً لصحة كل نتيجة أو إجماعاً علمياً.</p>
            </div>
            <div className="about-section">
              <h3>ثالثاً: أين تظهر نتائج البحث المدمج؟</h3>
              <ol>
                <li>اضغط «بحث أكاديمي» في الشريط العلوي أو زر «بحث» بجوار مساحة الكتابة.</li>
                <li>اكتب سؤالاً بحثياً واضحاً، ثم اضغط «ابحث عن دراسات».</li>
                <li>يظهر «تحليل OpenAI للدراسات» في أعلى النتائج إذا نجح التحليل.</li>
                <li>تظهر أسفل التحليل بطاقات الدراسات التي جمعتها محركات البحث المختارة، مع بيان مصدر كل دراسة ورابط فتحها عند توفره.</li>
              </ol>
              <p>إذا تعذر تحليل OpenAI، فقد تظل الدراسات ظاهرة مع رسالة توضّح تعذر التحليل. وإذا لم تظهر دراسات، جرّب كلمات مفتاحية أكثر تحديداً. تحقق دائماً من بيانات الدراسة ونصها الكامل قبل الاستشهاد بها في بحث جامعي.</p>
            </div>
            <div className="about-note"><b>الخلاصة:</b> للمحادثة اكتب سؤالك في مربع الكتابة. وللعثور على مصادر علمية اختر Consensus وSemantic Scholar وOpenAlex منفردة أو مجتمعة؛ تجمع المنصة نتائجها وتحاول إزالة المكرر، ثم يحلل OpenAI المعلومات المتاحة، وتبقى مراجعة المصادر الأصلية مسؤولية الباحث.</div>
            <div className="about-section"><h3>الملكية الفكرية والعلامات التجارية</h3><p>اسم ILYES.B AI وشعارها وتصميم واجهتها والبرمجيات والمحتوى الأصلي الذي أُنشئ خصيصاً لها عناصر مخصصة للمنصة، وتُحفظ الحقوق المتعلقة بها لصاحب المنصة وفق التشريعات المعمول بها. لا يجوز نسخها أو إعادة نشرها أو استغلالها تجارياً دون إذن مسبق، إلا في الحدود التي يسمح بها القانون.</p><p>أسماء OpenAI وClaude وGemini وGroq وConsensus وشعاراتها وعلاماتها التجارية تعود إلى أصحابها، ويقتصر ذكرها هنا على التعريف بالخدمات المستخدمة، ولا يعني ذلك وجود شراكة أو اعتماد رسمي ما لم يُعلن خلاف ذلك. وتخضع الخدمات الخارجية لشروطها وسياساتها الخاصة.</p><p>يحتفظ المستخدم بحقوقه في المحتوى الذي يقدمه، ويظل مسؤولاً عن امتلاكه حق استخدامه وعن احترام حقوق المؤلف والخصوصية عند رفع النصوص أو الصور أو الوثائق. وينبغي مراجعة شروط مزودي الخدمات بشأن مخرجات الذكاء الاصطناعي قبل استخدامها أو نشرها.</p><p><b>© 2026 ILYES.B AI — جميع الحقوق محفوظة.</b></p></div>
          </> : <>
            <p className="about-intro">Welcome to ILYES.B AI. Use this workspace to ask questions, write, learn and discover academic research. No technical experience is required.</p><div className="about-section"><h3>How to get started</h3><ol><li><b>Chat:</b> Type your question in the box at the bottom and send it. Choose an engine or leave Auto selected.</li><li><b>Images:</b> Use the image icon to attach a clear picture and describe what you want to understand.</li><li><b>Voice:</b> Tap the microphone and allow browser access.</li><li><b>Academic research:</b> Open Academic Search, enter a focused research question and submit it.</li></ol></div>
            <div className="about-section"><h3>1. AI engines</h3><p>These engines understand prompts and generate answers. Available choices may include OpenAI, Gemini and Groq. Claude may also appear when configured. Auto mode selects an available provider; when both OpenAI and Claude are configured, their outputs can be combined. A readiness indicator confirms that a key is configured, not that the provider is always operational.</p></div>
            <div className="about-section"><h3>2. Academic search and engine merging</h3><p>The platform searches three academic sources: <b>Consensus</b> for research discovery and evidence, <b>Semantic Scholar</b> for papers, authors and citations, and <b>OpenAlex</b> for scholarly works and researchers. Select one source or several, or use Select all to search all three in parallel. The platform combines results, attempts to remove duplicates and labels each paper with its source. OpenAI then analyzes the available metadata and abstracts. A provider may fail while the others still return results. This does not mean every full paper was read; verify original sources before citing them.</p></div>
            <div className="about-section"><h3>3. Where results appear</h3><ol><li>Open Academic Search from the top bar or the Search button beside the composer.</li><li>Enter a focused research question and submit it.</li><li>OpenAI's analysis appears above the results when available.</li><li>Consensus papers appear as cards below, with a link to each paper when available.</li></ol><p>If OpenAI analysis fails, paper results may still appear with an explanatory message. Always verify the paper and its full text before citing it.</p></div>
            <div className="about-note"><b>In short:</b> Use the chat box for questions. In Academic Search, select Consensus, Semantic Scholar and OpenAlex individually or together. Their results are merged and deduplicated where possible, then OpenAI analyzes the available information. Always verify original sources.</div><div className="about-section"><h3>Intellectual property and trademarks</h3><p>The ILYES.B AI name, logo, interface design, original software and platform-created content are dedicated platform elements. Rights in these materials are reserved to the platform owner under applicable law. Copying, republishing or commercial exploitation requires prior permission, except where permitted by law.</p><p>OpenAI, Claude, Gemini, Groq and Consensus names and marks belong to their respective owners. Their mention identifies third-party services and does not imply partnership or endorsement unless expressly stated. Third-party services remain subject to their own terms and policies.</p><p>Users retain rights in content they submit and are responsible for having permission to use it and for respecting copyright and privacy when uploading materials. Check provider terms before using or publishing AI-generated output.</p><p><b>© 2026 ILYES.B AI — All rights reserved.</b></p></div>
          </>}
        </section>
      </div>}

      <section className="status-row" aria-live="polite">
        <span className="status-label"><i className={status ? "status-dot online" : "status-dot"} />{status ? (lang === "ar" ? readyCount + "/4 جاهزة" : readyCount + " of 4 engines configured") : (lang === "ar" ? "جارٍ الفحص…" : "Checking services…")}</span>
        <span className="status-note">{status ? (status.consensus ? (lang === "ar" ? "البحث جاهز" : "Academic search configured") : (lang === "ar" ? "البحث غير مهيأ" : "Academic search not configured")) : (lang === "ar" ? "جارٍ التحقق" : "This may take a moment")}</span>
      </section>

      {researchOpen && <section className="research-panel glass">
        <div className="panel-heading"><div><span className="eyebrow">ACADEMIC DISCOVERY</span><h2>{lang === "ar" ? "البحث الأكاديمي متعدد المحركات" : "Multi-engine academic search"}</h2></div><button className="close-button" onClick={() => setResearchOpen(false)} aria-label="Close">×</button></div>
        <p>{lang === "ar" ? "اختر محركاً واحداً أو ادمج المحركات الثلاثة في بحث متزامن. تُجمع النتائج وتُزال المكررات، ثم يحلل OpenAI الدراسات المتاحة." : "Choose one engine or combine all three in a parallel search. Results are merged and deduplicated, then OpenAI analyzes the available papers."}</p>
        <div className="research-engine-select">
          <div className="research-engine-heading">
            <b>{lang === "ar" ? "محركات البحث الأكاديمي" : "Academic search engines"}</b>
            <button type="button" onClick={() => setSearchSources(searchSources.length === 3 ? [] : ["consensus", "semantic_scholar", "openalex"])}>{searchSources.length === 3 ? (lang === "ar" ? "إلغاء تحديد الكل" : "Clear all") : (lang === "ar" ? "تحديد الكل" : "Select all")}</button>
          </div>
          <div className="research-engine-options">
            {([
              ["consensus", "Consensus", lang === "ar" ? "بحث دلالي عن الدراسات والأدلة العلمية" : "Semantic discovery of research and evidence"],
              ["semantic_scholar", "Semantic Scholar", lang === "ar" ? "أوراق علمية ومؤلفون واستشهادات" : "Papers, authors and citations"],
              ["openalex", "OpenAlex", lang === "ar" ? "فهرس واسع للمنشورات والباحثين" : "Broad index of works and researchers"]
            ] as [SearchSource, string, string][]).map(([id, name, description]) => <button type="button" role="checkbox" aria-checked={searchSources.includes(id)} className={"research-engine-option " + (searchSources.includes(id) ? "selected" : "")} key={id} onClick={() => setSearchSources(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])}>
              <span className="research-engine-check" aria-hidden="true">{searchSources.includes(id) ? "✓" : ""}</span>
              <span className="research-engine-copy"><b>{name}</b><small>{description}</small></span>
            </button>)}
          </div>
          <div className="research-merge-note">{lang === "ar" ? `تم اختيار ${searchSources.length} من 3 محركات` : `${searchSources.length} of 3 engines selected`}</div>
          {searchStatuses.length > 0 && <div className="research-source-status">{searchStatuses.map(source => <span className={"source-status " + source.status} key={source.id}><i />{source.name}: {source.status === "success" ? (lang === "ar" ? ` ${source.count} نتيجة` : ` ${source.count} results`) : source.status === "empty" ? (lang === "ar" ? " لا توجد نتائج" : " no results") : (lang === "ar" ? " تعذر الاتصال" : " unavailable")}</span>)}</div>}
        </div>
        <form onSubmit={searchPapers} className="research-form">
          <input value={researchQuery} onChange={e => setResearchQuery(e.target.value)} placeholder={lang === "ar" ? "مثال: أثر الذكاء الاصطناعي على المسؤولية المدنية" : "e.g. AI and civil liability"} />
          <button className="primary-button research-merge-button" disabled={researchBusy || researchQuery.trim().length < 3 || searchSources.length === 0}>{researchBusy ? (lang === "ar" ? "جارٍ البحث في المحركات…" : "Searching engines…") : (lang === "ar" ? (searchSources.length > 1 ? "⟷ دمج المحركات والبحث" : "ابحث بهذا المحرك") : (searchSources.length > 1 ? "⟷ Merge engines & search" : "Search this engine"))}</button>
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
          <small>{p.citations !== null ? (lang === "ar" ? "الاستشهادات: " : "Citations: ") + p.citations : ""}{p.doi ? " · DOI: " + p.doi : ""}</small><div className="paper-sources">{(p.sources || []).map(source => <span key={source}>{source === "semantic_scholar" ? "Semantic Scholar" : source === "openalex" ? "OpenAlex" : "Consensus"}</span>)}</div>
          {p.url && <a href={p.url} target="_blank" rel="noreferrer">{lang === "ar" ? "فتح الدراسة ↗" : "Open paper ↗"}</a>}
        </article>)}</div>}
        <small className="research-footnote">{lang === "ar" ? "تحقّق من بيانات الدراسة والنص الكامل قبل الاستشهاد بها. استخدام البحث يخضع لحصة حساب Consensus." : "Verify paper details and full text before citing. Searches count toward your Consensus allowance."}</small>
      </section>}

      <section className={"conversation-area " + (messages.length ? "has-messages" : "")}>
        {messages.length === 0 ? <div className="welcome">
          <span className="eyebrow">{lang === "ar" ? "ذكاء متعدد المحركات" : "MULTI-ENGINE INTELLIGENCE"}</span>
          <h1>{lang === "ar" ? <>أهلاً بك في <span>ILYES.B AI</span></> : <>Welcome to <span>ILYES.B AI</span></>}</h1>
          <p className="welcome-copy">{lang === "ar" ? "اسأل واكتب وابحث، في مساحة واحدة." : "Ask, write and research in one place."}</p>

</div> : <div className="messages-list">{messages.map((m, i) => <article key={i} className={"message-card " + m.role}>
          <div className="message-heading"><div className="message-avatar">{m.role === "user" ? "أ" : "✦"}</div><div><b>{m.role === "user" ? (lang === "ar" ? "أنت" : "You") : "ILYES.B AI"}</b>{m.role === "assistant" && m.engine && <small>{ENGINE_LABELS[m.engine] || m.engine}</small>}{m.role === "assistant" && m.collaboration?.used && <small>{lang === "ar" ? "ساهمت في الإجابة: " : "Contributed: "}{m.collaboration.contributors.join(" + ")}</small>}</div></div>
          {m.images?.map((src, imageIndex) => <img key={imageIndex} className="message-image" src={src} alt={lang === "ar" ? "الصورة المرفقة" : "Attached image"} />)}
          {m.content && <div className="message-content">{renderMessageContent(m.content)}</div>}
          {m.role === "assistant" && m.consensusUsed && <section className="chat-sources" aria-label={lang === "ar" ? "مصادر Consensus" : "Consensus sources"}>
            <div className="chat-sources-heading"><span className="chat-sources-icon">⌕</span><div><b>{lang === "ar" ? "مصادر البحث من Consensus" : "Consensus research sources"}</b><small>{lang === "ar" ? "تم استدعاء Consensus لهذه الإجابة" : "Consensus was queried for this answer"}</small></div><span className="chat-source-count">{m.consensusPapers?.length || 0}</span></div>
            {m.consensusPapers?.length ? <div className="chat-source-list">{m.consensusPapers.map((paper, paperIndex) => {
              const href = paper.url || (paper.doi ? (paper.doi.startsWith("http") ? paper.doi : "https://doi.org/" + paper.doi) : "");
              return <article className="chat-source-card" key={paperIndex}>
                <span className="chat-source-number">{paperIndex + 1}</span>
                <div className="chat-source-details"><b>{paper.title}</b>
                  <small>{[paper.authors, paper.year].filter(Boolean).join(" · ")}</small>
                  {paper.abstract && <p>{paper.abstract}</p>}
                  {href ? <a href={href} target="_blank" rel="noreferrer">{lang === "ar" ? "فتح الدراسة الأصلية ↗" : "Open original study ↗"}</a> : paper.doi && <small>DOI: {paper.doi}</small>}
                </div>
              </article>;
            })}</div> : <p className="chat-sources-empty">{lang === "ar" ? "تم الاتصال بـ Consensus، لكن لم تُرجع الخدمة دراسات قابلة للعرض لهذا السؤال." : "Consensus was queried but returned no displayable papers for this question."}</p>}
            <small className="chat-sources-note">{lang === "ar" ? "هذه مراجع بحثية مسترجعة آلياً؛ تحقّق من بيانات الدراسة ونصها الأصلي قبل الاستشهاد بها." : "Automatically retrieved research references. Verify each paper and its original text before citing."}</small>
          </section>}
          {m.role === "assistant" && <div className="answer-export"><span className="answer-export-label">{lang === "ar" ? "تصدير الإجابة:" : "Export answer:"}</span><button type="button" className="copy-button" onClick={() => copyAnswer(m.content, i)}>{copiedIndex === i ? "✓ " + (lang === "ar" ? "تم النسخ" : "Copied") : "▢ " + (lang === "ar" ? "نسخ" : "Copy")}</button><button type="button" className="copy-button" onClick={() => exportAnswerPdf(m.content)}>PDF</button><button type="button" className="copy-button" onClick={() => exportAnswerWord(m.content)}>Word</button></div>}
        </article>)}{busy && <div className="thinking"><span /><span /><span />{lang === "ar" ? "جارٍ إعداد الإجابة…" : "Preparing your answer…"}</div>}</div>}
      </section>

      {historyNotice && <div className="history-notice" role="status">{historyNotice}</div>}
      {error && <div className="error-banner"><span>!</span>{error}<button onClick={() => setError("")}>×</button></div>}
      <div className="composer-wrap">
        <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
          <input id="image-upload" className="hidden-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { selectImage(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          <div className="composer-tools">
            <button type="button" className="search-side-button" onClick={() => setResearchOpen(v => !v)} title={lang === "ar" ? "البحث الأكاديمي" : "Academic search"} aria-label="Academic search">⌕ <span>{lang === "ar" ? "بحث" : "Search"}</span></button>
            <button type="button" className="image-button" onClick={() => document.getElementById("image-upload")?.click()} title={lang === "ar" ? "إرفاق صورة" : "Attach image"} aria-label="Attach image">▧</button>
            <button type="button" className="voice-button" onClick={dictate} title={lang === "ar" ? "إملاء صوتي" : "Voice input"} aria-label="Voice input">♩</button>
          </div>
          <div className="composer-field"><label htmlFor="message-input">{lang === "ar" ? "رسالتك" : "Your message"}</label><textarea id="message-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={lang === "ar" ? "اكتب سؤالك أو الصق النص هنا…" : "Ask anything or paste your text…"} rows={2} /></div>
          <button className="send-button" disabled={busy || (!input.trim() && !attachedImage)} aria-label="Send">{busy ? "…" : "↑"}</button>
        </form>
        {attachedImage && <div className="attachment-preview"><img src={attachedImage} alt={lang === "ar" ? "معاينة الصورة" : "Image preview"} /><span>{lang === "ar" ? "صورة جاهزة للإرسال" : "Image ready to send"}</span><button type="button" onClick={() => setAttachedImage(null)} aria-label="Remove image">×</button></div>}
        {imageError && <div className="inline-error">{imageError}</div>}
        <div className="composer-hint"><span>{lang === "ar" ? "Enter للإرسال · Shift + Enter لسطر جديد" : "Enter to send · Shift + Enter for a new line"}</span><span>{lang === "ar" ? "تحقّق من المعلومات المهمة." : "Verify important information."}</span></div>
      </div>
      <footer className="site-footer"><span>© 2026 ILYES.B AI</span><i>•</i>{lang === "ar" ? "جميع الحقوق محفوظة." : "All rights reserved."}</footer>
    </main>
  );
}