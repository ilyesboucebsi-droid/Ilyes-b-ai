"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import "./admin.css";

type State = { paused: boolean; maintenance: boolean; joinEnabled: boolean; updatedAt: string | null };
type JoinRequest = { id: string; name: string; email: string; message: string; createdAt: string };
type Audit = { action: string; at: string };
type Analytics = { views7: number; views30: number; unique30: number; pages: { name: string; count: number }[]; referrers: { name: string; count: number }[]; devices: { name: string; count: number }[]; daily: { day: string; views: number }[]; sampleSize: number; updatedAt: string };

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [action, setAction] = useState("");
  const [actionPassword, setActionPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAnalytics = useCallback(async () => {
    setAnalyticsBusy(true); setAnalyticsError("");
    try {
      const response = await fetch("/api/admin/analytics", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الإحصائيات.");
      setAnalytics(data);
    } catch (e) { setAnalyticsError(e instanceof Error ? e.message : "تعذر تحميل الإحصائيات."); }
    finally { setAnalyticsBusy(false); }
  }, []);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/state", { cache: "no-store" });
    if (response.status === 401) { setLoggedIn(false); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "تعذر تحميل لوحة الإدارة.");
    setState(data.state); setRequests(data.requests || []); setAudit(data.audit || []); setLoggedIn(true);
    await loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);

  async function login(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تسجيل الدخول.");
      setPassword(""); await load(); setNotice("تم تسجيل الدخول إلى لوحة الإدارة.");
    } catch (e) { setError(e instanceof Error ? e.message : "حدث خطأ."); }
    finally { setBusy(false); }
  }

  async function executeAction(e: FormEvent) {
    e.preventDefault(); if (!action) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, password: actionPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "لم ينفذ الإجراء.");
      setState(data.state); setAction(""); setActionPassword(""); await load(); setNotice("تم تنفيذ التغيير وتسجيله.");
    } catch (e) { setError(e instanceof Error ? e.message : "حدث خطأ."); }
    finally { setBusy(false); }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setLoggedIn(false); setState(null); setNotice("تم تسجيل الخروج.");
  }

  const actionLabel: Record<string, string> = {
    pause: "إيقاف المنصة مؤقتاً", resume: "إعادة تشغيل المنصة",
    maintenance_on: "تفعيل وضع الصيانة", maintenance_off: "إنهاء وضع الصيانة",
    join_on: "تفعيل استقبال طلبات الانضمام", join_off: "تعطيل استقبال طلبات الانضمام"
  };

  return <main className="admin-shell" dir="rtl">
    <header className="admin-top"><a href="/" className="admin-brand"><span>IB</span><b>ILYES.B <i>AI</i></b></a><span className="admin-tag">OWNER CONTROL CENTER</span></header>
    {!loggedIn ? <section className="admin-login">
      <div className="admin-symbol">⌘</div><span className="admin-kicker">PRIVATE ACCESS</span><h1>لوحة التحكم والإدارة</h1>
      <p>هذه المساحة مخصصة لمالك المنصة. يلزم تسجيل الدخول قبل عرض إعدادات التشغيل.</p>
      <form onSubmit={login}><label htmlFor="admin-password">كلمة مرور الإدارة</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /><button disabled={busy || !password}>{busy ? "جارٍ التحقق…" : "دخول آمن"}</button></form>
      {error && <div className="admin-error">{error}</div>}
      <small>لا تشارك كلمة المرور أو تضعها في ملفات المشروع.</small>
    </section> : <>
      <section className="admin-heading"><div><span className="admin-kicker">PLATFORM OVERVIEW</span><h1>مركز إدارة المنصة</h1><p>تحكم في حالة التشغيل وبوابة الانضمام، واطّلع على أداء المنصة.</p></div><div className="admin-heading-actions"><a className="admin-insights-button" href="#platform-analytics" onClick={(event) => { event.preventDefault(); document.getElementById("platform-analytics")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><span>▤</span><b>رؤى المنصة</b></a><button className="admin-logout" onClick={logout}>تسجيل الخروج</button></div></section>
      <section className="admin-section analytics-panel" id="platform-analytics">
        <div className="admin-section-title"><div><span className="admin-kicker">VISITOR INSIGHTS</span><h2>إحصائيات ورؤى الزوار</h2><p className="admin-description">ملخص مباشر لزيارات المنصة خلال آخر 7 و30 يوماً.</p></div><button className="analytics-refresh" onClick={loadAnalytics} disabled={analyticsBusy}>{analyticsBusy ? "جارٍ التحديث…" : "↻ تحديث الإحصائيات"}</button></div>
        {analyticsError && <p className="analytics-error">{analyticsError}</p>}
        <div className="analytics-cards">
          <article><span>الزيارات · 7 أيام</span><b>{analytics ? analytics.views7.toLocaleString("ar-DZ") : "—"}</b></article>
          <article><span>الزيارات · 30 يوماً</span><b>{analytics ? analytics.views30.toLocaleString("ar-DZ") : "—"}</b></article>
          <article><span>زوار مميزون · 30 يوماً</span><b>{analytics ? analytics.unique30.toLocaleString("ar-DZ") : "—"}</b></article>
        </div>
        {analytics && <>
          <div className="analytics-columns">
            <div className="analytics-list"><h3>الصفحات الأكثر زيارة</h3>{analytics.pages.length ? analytics.pages.map(x=><div key={x.name}><span dir="ltr">{x.name}</span><b>{x.count.toLocaleString("ar-DZ")}</b></div>) : <p className="empty-state">لا توجد زيارات مسجلة بعد.</p>}</div>
            <div className="analytics-list"><h3>مصادر الوصول</h3>{analytics.referrers.length ? analytics.referrers.map(x=><div key={x.name}><span dir="ltr">{x.name}</span><b>{x.count.toLocaleString("ar-DZ")}</b></div>) : <p className="empty-state">ستظهر المصادر بعد تسجيل الزيارات.</p>}</div>
            <div className="analytics-list"><h3>الأجهزة المستخدمة</h3>{analytics.devices.length ? analytics.devices.map(x=><div key={x.name}><span>{x.name}</span><b>{x.count.toLocaleString("ar-DZ")}</b></div>) : <p className="empty-state">لا توجد بيانات بعد.</p>}</div>
          </div>
          <div className="analytics-daily"><h3>الزيارات اليومية · آخر 7 أيام</h3><div>{analytics.daily.map(x=><div key={x.day}><span>{new Date(x.day+"T00:00:00Z").toLocaleDateString("ar-DZ",{day:"numeric",month:"numeric",timeZone:"UTC"})}</span><b>{x.views.toLocaleString("ar-DZ")}</b></div>)}</div></div>
          <p className="analytics-footnote">آخر تحديث: {new Date(analytics.updatedAt).toLocaleString("ar-DZ")} · عينة تفاصيل الصفحات والمصادر: {analytics.sampleSize.toLocaleString("ar-DZ")} زيارة كحد أقصى من آخر 5000 حدث محفوظ.</p>
        </>}
        <p className="analytics-privacy">القياس لا يسجل أسماء الزوار أو عناوين IP؛ يُستخدم معرّف عشوائي يُحوّل إلى بصمة مشفّرة لحساب الزوار المميزين. لا تُسجل صفحات الإدارة.</p>
      </section>
      {state && <div className="admin-status-grid">
        <article><span>حالة المنصة</span><b className={state.paused ? "bad" : "good"}>{state.paused ? "متوقفة مؤقتاً" : "تعمل"}</b></article>
        <article><span>وضع الصيانة</span><b className={state.maintenance ? "warn" : "good"}>{state.maintenance ? "مفعّل" : "غير مفعّل"}</b></article>
        <article><span>بوابة الانضمام</span><b className={state.joinEnabled ? "good" : "bad"}>{state.joinEnabled ? "مفتوحة" : "مغلقة"}</b></article>
        <article><span>طلبات الانضمام</span><b>{requests.length}</b></article>
      </div>}
      <section className="admin-section"><div className="admin-section-title"><div><span className="admin-kicker">OPERATIONS</span><h2>التحكم بالتشغيل</h2></div><span className="secure-chip">● محمي بكلمة المرور</span></div>
        <div className="admin-actions">
          <button className="action-card danger" onClick={() => setAction("pause")} disabled={state?.paused}><span>Ⅱ</span><b>إيقاف مؤقت</b><small>تعطيل المحادثة والبحث الأكاديمي للزوار.</small></button>
          <button className="action-card" onClick={() => setAction("resume")} disabled={!state?.paused}><span>▶</span><b>إعادة التشغيل</b><small>إعادة إتاحة خدمات المنصة.</small></button>
          <button className="action-card warning" onClick={() => setAction("maintenance_on")} disabled={state?.maintenance}><span>⚙</span><b>تفعيل الصيانة</b><small>إغلاق الخدمات العامة أثناء أعمال الصيانة.</small></button>
          <button className="action-card" onClick={() => setAction("maintenance_off")} disabled={!state?.maintenance}><span>✓</span><b>إنهاء الصيانة</b><small>إعادة فتح الخدمات بعد اكتمال الصيانة.</small></button>
        </div>
      </section>
      <section className="admin-section"><div className="admin-section-title"><div><span className="admin-kicker">COMMUNITY ACCESS</span><h2>بوابة انضمام الزوار والمستخدمين</h2></div><span className={state?.joinEnabled ? "state-chip on" : "state-chip off"}>{state?.joinEnabled ? "مفعّلة" : "معطّلة"}</span></div>
        <p className="admin-description">عند التفعيل يستطيع الزائر إرسال طلب انضمام باسمه وبريده الإلكتروني. تُحفظ الطلبات هنا لمراجعتها. هذا نموذج تسجيل اهتمام، وليس حساب دخول فعلياً.</p>
        <div className="join-control"><div><b>{state?.joinEnabled ? "استقبال طلبات الانضمام مفتوح" : "استقبال طلبات الانضمام متوقف"}</b><small>يمكنك تفعيل البوابة أو تعطيلها مؤقتاً دون حذف الطلبات السابقة.</small></div><button className={state?.joinEnabled ? "switch-button off" : "switch-button on"} onClick={() => setAction(state?.joinEnabled ? "join_off" : "join_on")}>{state?.joinEnabled ? "تعطيل مؤقت" : "تفعيل الانضمام"}</button></div>
        <div className="request-list"><h3>طلبات الانضمام الأخيرة</h3>{requests.length === 0 ? <p className="empty-state">لا توجد طلبات مسجلة حتى الآن.</p> : requests.map(item => <article key={item.id}><div><b>{item.name}</b><a href={"mailto:" + item.email}>{item.email}</a>{item.message && <p>{item.message}</p>}</div><time>{new Date(item.createdAt).toLocaleString("ar-DZ")}</time></article>)}</div>
      </section>
      <section className="admin-section"><div className="admin-section-title"><div><span className="admin-kicker">AUDIT LOG</span><h2>سجل العمليات</h2></div></div>{audit.length ? <div className="audit-list">{audit.map((item,i)=><div key={i}><b>{actionLabel[item.action] || item.action}</b><time>{new Date(item.at).toLocaleString("ar-DZ")}</time></div>)}</div> : <p className="empty-state">لا توجد عمليات مسجلة.</p>}</section>
      {action && <div className="admin-modal-backdrop"><form className="admin-confirm" onSubmit={executeAction}><button type="button" className="modal-x" onClick={() => {setAction("");setActionPassword("");}}>×</button><span className="admin-kicker">CONFIRM ACTION</span><h2>{actionLabel[action]}</h2><p>لأسباب أمنية، أدخل كلمة مرور الإدارة لتأكيد هذا التغيير. لن يُنفذ الإجراء قبل التحقق منها.</p><label htmlFor="confirm-password">كلمة المرور</label><input id="confirm-password" type="password" autoFocus autoComplete="current-password" value={actionPassword} onChange={e => setActionPassword(e.target.value)} required /><div><button type="button" className="cancel-action" onClick={() => setAction("")}>إلغاء</button><button className="confirm-action" disabled={busy || !actionPassword}>{busy ? "جارٍ التنفيذ…" : "تأكيد التغيير"}</button></div></form></div>}
      {error && <div className="admin-error">{error}</div>}
      {notice && <div className="admin-notice">{notice}</div>}
    </>}
    <footer>ILYES AI · لوحة المالك الخاصة</footer>
  </main>;
}
