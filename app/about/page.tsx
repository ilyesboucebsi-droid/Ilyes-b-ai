import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "عن المنصة",
  description: "تعرّف على ILYES AI، منصة مفتوحة تجمع أدوات الذكاء الاصطناعي والمحادثة والبحث الأكاديمي لمساعدة الطلاب والباحثين."
};

const features = [
  { title: "محادثة ذكية", description: "واجهة للمحادثة بالعربية والإنجليزية تساعد على شرح الأفكار وتنظيمها وصياغة الإجابات." },
  { title: "بحث أكاديمي", description: "إمكانية البحث عن الأدبيات والدراسات العلمية والاستفادة من بيانات المصادر المتاحة داخل المنصة." },
  { title: "مصادر متعددة", description: "الاستفادة من خدمات بحث أكاديمي مثل Semantic Scholar وOpenAlex وConsensus بحسب توافرها." },
  { title: "وصول مفتوح", description: "يمكن للزائر استخدام الخدمات العامة دون إنشاء حساب مسبق، ما لم تتطلب ميزة معينة خلاف ذلك." }
];

export default function AboutPage() {
  return (
    <main className="about-page" dir="rtl">
      <style>{`
        .about-page{min-height:100vh;padding:28px 20px 50px;color:#eaf3ff;background:radial-gradient(ellipse at 15% 0%,#143d59 0,transparent 35%),radial-gradient(ellipse at 90% 15%,#1c2853 0,transparent 32%),#07111f;font-family:Arial,"Noto Sans Arabic",system-ui,sans-serif}
        .about-wrap{width:min(1050px,100%);margin:auto}.about-nav{display:flex;justify-content:space-between;align-items:center;padding:8px 0 22px;border-bottom:1px solid #1b3550}
        .about-brand{color:#f2f7ff;text-decoration:none;font-weight:900}.about-brand span{color:#57d7ef}.about-back{color:#a9c1d8;text-decoration:none;font-size:13px}
        .about-hero{padding:76px 0 48px;max-width:790px}.about-kicker{color:#57d7ef;font-size:11px;font-weight:800;letter-spacing:1.5px}
        .about-hero h1{font-size:clamp(34px,6vw,58px);line-height:1.25;margin:16px 0}.about-hero p{max-width:700px;color:#a9bed2;font-size:17px;line-height:2}
        .about-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}.about-primary,.about-secondary{display:inline-flex;padding:13px 20px;border-radius:12px;text-decoration:none;font-weight:800;font-size:14px}
        .about-primary{background:linear-gradient(100deg,#36c6e8,#668cff);color:#061321}.about-secondary{border:1px solid #294660;color:#d6e8f7}
        .about-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:20px}.about-card{padding:24px;border:1px solid #1b3550;border-radius:18px;background:linear-gradient(145deg,#10243a,#0a1727)}
        .about-card h2{font-size:18px;margin:0 0 10px}.about-card p{color:#9bb2c9;line-height:1.9;font-size:14px;margin:0}
        .about-note{margin-top:28px;padding:18px 20px;border-right:3px solid #57d7ef;background:#0c1c2d;color:#9fb6cc;line-height:1.9;font-size:13px}
        .about-footer{text-align:center;margin-top:48px;color:#66819b;font-size:12px}
        @media(max-width:650px){.about-page{padding:18px 15px 35px}.about-hero{padding:55px 0 30px}.about-hero p{font-size:15px}.about-grid{grid-template-columns:1fr}.about-card{padding:20px}}
      `}</style>
      <div className="about-wrap">
        <header className="about-nav">
          <Link href="/" className="about-brand">ILYES.B <span>AI</span></Link>
          <Link href="/" className="about-back">العودة إلى المنصة ←</Link>
        </header>
        <section className="about-hero">
          <span className="about-kicker">KNOWLEDGE · RESEARCH · AI</span>
          <h1>ذكاء اصطناعي يساعدك على التفكير والبحث.</h1>
          <p>ILYES AI منصة مفتوحة تجمع أدوات المحادثة الذكية والبحث الأكاديمي في واجهة واحدة، لمساعدة الطلاب والباحثين والمهتمين بالمعرفة على استكشاف الأفكار والوصول إلى الدراسات وتنظيم المعلومات.</p>
          <div className="about-actions">
            <Link href="/" className="about-primary">ابدأ استخدام المنصة</Link>
            <Link href="/join" className="about-secondary">طلب الانضمام ومتابعة التحديثات</Link>
          </div>
        </section>
        <section aria-label="مميزات المنصة" className="about-grid">
          {features.map(feature => <article className="about-card" key={feature.title}><h2>{feature.title}</h2><p>{feature.description}</p></article>)}
        </section>
        <p className="about-note">تنبيه: إجابات الذكاء الاصطناعي ونتائج البحث أدوات مساعدة، وقد تتضمن أخطاء أو معلومات غير مكتملة. يُرجى التحقق من النصوص القانونية والبيانات العلمية بالرجوع إلى مصادرها الأصلية.</p>
        <footer className="about-footer">ILYES AI · منصة مفتوحة للمعرفة والبحث</footer>
      </div>
    </main>
  );
}
