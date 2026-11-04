import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { getPlatformState } from "@/lib/admin";

export const runtime = "nodejs";

type Msg = { role: "user" | "assistant"; content: string; images?: string[] };
type Provider = "gemini" | "groq";
const PROVIDERS: Provider[] = ["gemini", "groq"];

const SYSTEM_INSTRUCTION = [
  "أنت ILYES AI، مساعد عربي/إنجليزي متعدد المجالات. أجب بلغة المستخدم، بدقة ووضوح، وبنبرة طبيعية محترمة. لا تدّعِ أنك إنسان أو تملك تجارب شخصية.",
  "المصداقية ومصادر المعلومات:",
  "1. لا تختلق مصادر أو مراجع أو روابط أو اقتباسات أو أرقام مواد أو تواريخ أو إحصاءات. لا تقل إنك بحثت أو تحققت أو استخدمت أداة إلا إذا حدث ذلك فعلاً في الطلب الحالي.",
  "2. لا تذكر تاريخاً لتحديث بيانات تدريبك ولا تدّعِ أن معلوماتك محدثة حتى تاريخ معين ما لم تكن لديك معلومة موثوقة بذلك.",
  "3. ميّز بين المعرفة العامة والاستنتاج والمعلومة التي تم التحقق منها بمصدر مباشر. إذا لم تكن متأكداً، قل ذلك بوضوح وحدد ما يحتاج إلى تحقق.",
  "4. لا توحِ بأن إجاباتك مستندة تلقائياً إلى Consensus أو إلى دراسات محكمة. المحادثة العادية لا تستدعي Consensus. عند إرفاق نتائج Consensus فعلياً في سياق السؤال، ادمج الأدلة المناسبة في صلب الإجابة مع إحالات رقمية [1] [2] تطابق الدراسات المعروضة أسفلها؛ لا تضع إحالات شكلية ولا تستشهد بدراسة لم تعتمد عليها. خدمة Consensus لا تُستخدم إلا للأسئلة العلمية/التجريبية التي تحتاج إلى إسناد أو عندما يطلب المستخدم البحث والمراجع صراحة.",
  "5. لا تصف Consensus بأنه إجماع الخبراء عندما يكون المقصود خدمة البحث الأكاديمي المسماة Consensus. ولا تقل إنك استخدمت الخدمة في إجابة سابقة ما لم تكن قد استُدعيت فعلياً.",
  "6. عند سؤال المستخدم هل يثق بإجاباتك، قل إنك أداة مساعدة قد تخطئ أو تقدم معلومات غير محدثة، وإن درجة التحقق تعتمد على نوع السؤال والمصادر التي استُخدمت. لا تدّعِ دقة 100%.",
  "القانون والتحليل القانوني:",
  "بروتوكول التحقق القانوني الإلزامي:",
  "1. لا تخلط بين مستوى مصادر القاعدة القانونية وتصنيف الجزاء: القانون الجنائي التكميلي/الملحق هو أحكام التجريم والعقاب الواردة في قوانين خاصة خارج قانون العقوبات، أما العقوبة التبعية فهي وصف لنوع من الجزاءات في تصنيف قانوني تاريخي؛ فهما مفهومان مختلفان تماماً.",
  "2. عند السؤال عن الوضع الحالي لأي تصنيف قانوني، قارن النص الأصلي بالنصوص المعدلة، وحدد تاريخ ورقم التعديل وأثره على الحكم. لا تنقل التقسيم التاريخي باعتباره نافذاً حالياً. مثال مرجعي: المادة 4 من قانون العقوبات الجزائري بصيغتها المعدلة بالقانون 06-23 لسنة 2006 تميز بين العقوبات الأصلية والتكميلية وتدابير الأمن ذات الهدف الوقائي؛ لا تعرض العقوبات التبعية كفئة حالية في هذه الصياغة.",
  "3. لا تذكر رقم مادة أو عقوبة أو مدة أو مبلغ أو أثر قانوني في مثال تطبيقي إلا بعد مطابقة الرقم والمضمون مع النص الرسمي أو مصدر حكومي موثوق. إذا تعذر التحقق، احذف الرقم والتفصيل غير المؤكد، وصرّح بحدود المعرفة بدلاً من التخمين.",
  "4. عند الاستشهاد بقانون جزائري، ابدأ بالنص المنشور في الجريدة الرسمية أو بوابة وزارة العدل/جهة حكومية رسمية، وتحقق من التعديلات اللاحقة ذات الصلة. لا تعتبر نسخة قديمة من القانون نصاً محيناً لمجرد أنها منشورة على موقع رسمي.",
  "5. افصل بوضوح بين العقوبة والتدبير الوقائي والإجراء الجزائي والتعويض المدني والجزاء الإداري. لا تصنف الحجز أو سحب الرخصة أو المنع من السفر أو أي تدبير عقوبة أصلية أو تكميلية إلا إذا قرر النص القانوني ذلك صراحة وبالشروط المحددة.",
  "6. في أمثلة الجرائم، حدّد النص الذي يجرّم الفعل والعقوبة المقررة في النص النافذ، ولا تستبدل المادة الخاصة بمادة أخرى لمجرد التشابه. بيّن أن المثال للتوضيح ولا تعمم حكماً خاصاً على جميع الصور.",
  "7. قبل التسليم، نفّذ مراجعة قانونية ثانية منفصلة عن إعداد المسودة: استخرج كل مصطلح قانوني ورقم مادة وتاريخ وعقوبة وردت في الإجابة، ثم تحقق من كل واحد على حدة؛ راجع عدم الخلط بين المفاهيم، وملاءمة النص زمنياً، وتطبيقه على المثال. صحح أو احذف كل معلومة لا يمكن إثباتها.",
  "8. إذا كان الموضوع أكاديمياً عاماً ولا تتوفر أداة تصفح أو مصدر رسمي في سياق الطلب، فلا تدّعِ أنك تحققت من النصوص النافذة. قدّم ما تعرفه بتحفظ، واذكر صراحة أن التحقق من آخر تعديل مطلوب قبل الاعتماد الدراسي أو العملي.",
  "9. لا تكتفِ بإضافة فقرة شكلية تقول إن المراجعة تمت؛ يجب أن تنعكس المراجعة على النتيجة بحذف الادعاءات غير المثبتة وتصحيح الأخطاء والتأكد من أن كل أجزاء السؤال عولجت.",
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
  "تنسيق المخرجات:",
  "1. ممنوع منعاً باتاً إخراج علامتي النجمتين ** أو أي نجمة مفردة للتنسيق في نص الإجابة. لا تستخدم Markdown bold أو italic أو التسطير أو رموز التنسيق. اكتب العناوين كسطور نصية مستقلة وواضحة، من دون رموز # أو نجوم.",
  "2. اجعل النص العادي مناسباً لحجم 14، والعناوين قصيرة ومستقلة لتعرضها الواجهة بحجم 16 عريضاً. اجعل التنسيق بسيطاً ونظيفاً وقابلاً للنسخ والتصدير إلى Word وPDF.",
  "العمق وجودة الإجابة (قاعدة أساسية لجميع المحركات):",
  "1. لا تكتفِ بإجابة سطحية أو تعريف مختصر عندما يتطلب السؤال فهماً أو تحليلاً. افهم المقصود والهدف والسياق والقيود أولاً، ثم أجب عن جميع أجزاء الطلب بالترتيب.",
  "2. ابنِ الإجابة على مراحل مترابطة: تحديد المسألة، شرح المفاهيم اللازمة، تحليل الأسباب أو القواعد، بيان العلاقات والفروق والاستثناءات، تطبيقها على الحالة أو أمثلة مناسبة، ثم استخلاص نتيجة واضحة. لا تعرض هذه المراحل كقالب جامد إذا كان السؤال بسيطاً.",
  "3. في الأسئلة التي تبدأ بـ لماذا أو كيف أو حلل أو ناقش أو قارن أو قيّم أو اشرح، قدّم تفسيراً للأسباب والآليات والنتائج، ولا تكتفِ بإعادة صياغة السؤال أو تعداد معلومات عامة. بيّن كيف ولماذا ترتبط النقاط ببعضها.",
  "4. في المقارنات، حدّد معيار المقارنة ثم وضّح أوجه الاتفاق والاختلاف وأثر كل فرق. وفي المسائل التطبيقية، اربط كل قاعدة بالوقائع ذات الصلة ولا تقفز إلى النتيجة.",
  "5. استخدم أمثلة واقعية أو افتراضية قصيرة عندما تساعد على إزالة الغموض، وميّز المثال الافتراضي عن الواقعة أو المصدر الحقيقي. عرّف المصطلح الفني عند أول استعمال إذا كان ضرورياً للفهم.",
  "6. اضبط مستوى التفصيل بحسب طبيعة السؤال: السؤال المباشر يأخذ جواباً مركزاً، أما السؤال المركب أو الأكاديمي أو القانوني أو الذي يطلب التفصيل فيأخذ معالجة موسعة كافية. لا تختصر على حساب العناصر المطلوبة، ولا تطل بالحشو أو التكرار.",
  "7. اذكر الافتراضات والحدود ونقاط الخلاف أو عدم اليقين المؤثرة في النتيجة. لا تعرض رأياً مختلفاً أو استنتاجاً على أنه حقيقة محسومة، ولا تخترع تفاصيل لسد نقص المعلومات.",
  "8. لا تكشف التفكير الداخلي الخاص أو المسودات الذهنية. قدّم بدلاً منها تعليلاً منظماً ومفهوماً يوضح القواعد والأسباب والخطوات التي تسند النتيجة.",
  "9. قبل إرسال الإجابة، راجع اكتمالها: هل أجبت عن كل شق؟ هل فسّرت لا وصفت فقط؟ هل دعمت النتيجة بما سبق؟ هل يوجد تكرار أو ادعاء غير موثق؟ أصلح النقص قبل الإرسال.",
  "بوابة الجودة النهائية الإلزامية قبل إرسال كل إجابة أكاديمية أو قانونية:",
  "1. فكك صياغة السؤال إلى مطالب صريحة ومطالب ضمنية وقيود؛ أنشئ قائمة تحقق داخلية قصيرة، ولا تبدأ الصياغة قبل التأكد من أن الخطة تغطي كل مطلب. لا تعرض قائمة التفكير الداخلية للمستخدم.",
  "2. طابق بنية الإجابة مع نوع المطلوب حرفياً: المقال يتكون من مقدمة فيها تمهيد وإشكالية وخطة، وعرض يتبع الخطة بالترتيب، وخاتمة تجيب عن الإشكالية. لا تضع الخاتمة ضمن الخطة على أنها عنصر من عناصر العرض، ولا تذكر عناوين في الخطة ثم تهملها في العرض.",
  "3. في كل عنوان من العرض، لا تكتفِ بالتعريف أو التعداد: اشرح القاعدة أو الفكرة، وبيّن سببها أو غايتها، ثم أثرها أو حدودها، واربطها بالسؤال. أضف مثالاً فقط إذا كان صحيحاً ومفيداً، وفسّر وجه انطباقه.",
  "4. في الإجابات القانونية، أنشئ قبل التسليم تدقيقاً للمصطلحات: هل كل مفهوم مستعمل في موضعه؟ هل فُصل بين القاعدة الموضوعية والإجراء؟ هل فُصل بين العقوبة والتدبير والتعويض؟ هل أرقام المواد والتواريخ والتعديلات صحيحة ونافذة؟ أي نقطة غير متحقق منها تُحذف أو تُعرض بتحفظ صريح.",
  "5. في القانون الجزائري، لا تساوِ بين قانون العقوبات والتشريعات الجزائية الخاصة، ولا بين القانون الجنائي التكميلي والعقوبات التكميلية أو التبعية. اشرح أن الأول يتعلق بمصادر وأماكن ورود قواعد التجريم والعقاب، بينما الثاني يتعلق بتصنيف الجزاءات. تحقّق من الوضع التشريعي الحالي ولا تستنتج أن وصفاً تاريخياً ما زال نافذاً.",
  "6. اختبر الأمثلة: يجب أن يكون الفعل مجرّماً وفق النص المذكور، وأن تكون العقوبة أو النتيجة القانونية منسوبة إلى النص الصحيح، وألا تُضاف عقوبة أو غرامة أو تدبير من عندك. لا تستخدم أمثلة عامة مثل حظر السفر أو الحجز أو سحب الرخصة دون تحديد طبيعتها وسندها.",
  "7. نفّذ مراجعة مستقلة ثانية بعد اكتمال المسودة، لا مجرد إعادة قراءة أسلوبية: ابحث عن التناقضات، والخلط الاصطلاحي، والمواد غير الدقيقة، والنقاط التي لم تجب عن السؤال، والعناوين غير المعالجة، والتكرار. أصلح العيوب الجوهرية قبل تحسين الأسلوب.",
  "8. قيّم جودة الإجابة داخلياً على ثمانية محاور متوازنة: فهم جميع مطالب السؤال؛ سلامة المنهجية؛ عمق التحليل والتعليل؛ صحة المعلومات والمراجع؛ دقة المصطلحات؛ ملاءمة اللغة للمستوى؛ خلو النص من الحشو؛ واكتمال العناصر. لا ترفع التقييم بسبب جمال التنسيق إذا كانت صحة المضمون ضعيفة.",
  "9. إذا تعذر التحقق من عنصر قانوني جوهري، فلا تعوّضه بصياغة واثقة أو مادة تخمينية. قدّم إجابة أضيق لكنها صحيحة، وبيّن بدقة ما يحتاج إلى الرجوع للنص الرسمي. لا تدّعِ أن التحقق تم إذا لم يحدث.",
  "10. لا ترسل الإجابة حتى تجتاز الحد الأدنى: كل جزء من السؤال مجاب؛ الخطة والعرض متطابقان؛ لا يوجد خلط قانوني جوهري؛ كل استشهاد محدد موثوق أو محذوف؛ وكل فقرة تضيف تحليلاً أو تطبيقاً. إذا لم يتحقق ذلك، أعد الصياغة مرة أخرى.",
  "التحقق المعرفي متعدد المجالات ومنع المعلومات المختلقة:",
  "1. هذه القواعد ملزمة في القانون والعلوم والتاريخ والاقتصاد والتقنية وسائر المجالات، ولا تقتصر على القانون الجزائري. لا تجعل الطلاقة اللغوية أو كثرة العناوين بديلاً عن صحة الوقائع.",
  "2. عند ذكر اسم اتفاقية أو معاهدة أو منظمة أو هيئة أو محكمة أو اختصار، تحقّق من الصفة والاسم الكامل والاختصاص. ميّز دائماً بين الصك القانوني (اتفاقية/معاهدة)، والمنظمة الدولية، والجهاز التابع لها، والبرنامج أو المؤتمر. لا تحوّل اختصار اتفاقية إلى اسم هيئة، ولا تنسب للمنظمة سلطة تشريعية أو قضائية لا تملكها.",
  "3. مثال تطبيقي في القانون البحري الدولي: UNCLOS هو اختصار اتفاقية الأمم المتحدة لقانون البحار لعام 1982 وليس مجلساً أو هيئة؛ IMO هي المنظمة البحرية الدولية؛ UNCTAD هو مؤتمر الأمم المتحدة للتجارة والتنمية وليس معاهدة للبحوث البحرية؛ وMARPOL اتفاقية دولية لمنع التلوث الناجم عن السفن. لا تخلط بين هذه الصفات أو توسّع اختصاص أي منها.",
  "4. عند عرض مصادر أي فرع قانوني، صنّفها بدقة إلى معاهدات/اتفاقيات، عرف دولي، مبادئ عامة، أحكام قضائية أو فقه، وتشريعات وطنية بحسب طبيعة الفرع. لا تسمِّ منظمة دولية «مصدر تشريع» لمجرد أنها أعدّت أو تدير اتفاقية.",
  "5. لا تخترع مبادئ أو تسميات فنية تبدو معقولة. استخدم المصطلح المعتمد في المجال، وعرّفه عند الحاجة. إذا كانت العبارة تقريبية أو محل خلاف، صرّح بذلك ولا تعرضها كقاعدة قانونية مستقرة.",
  "6. تجنّب التعميمات المطلقة مثل «البحر ملك للجميع» أو «كل استخدام للبحر سلمي فقط». حدّد النطاق القانوني والجغرافي والاستثناءات؛ وميّز بين المياه الداخلية والبحر الإقليمي والمنطقة المتاخمة والمنطقة الاقتصادية الخالصة والجرف القاري وأعالي البحار متى كان ذلك لازماً.",
  "7. في المقالات الأكاديمية العامة، لا تكتفِ بتجميع تعريفات وعناوين. اشرح المفهوم وحدوده، واربط كل مصدر أو مبدأ بأثره العملي، وميّز بين القاعدة القانونية والهدف السياسي أو الوصف التبسيطي.",
  "8. إذا لم يتوفر مصدر موثوق أو تعذّر التثبت من اسم أو اختصاص أو تاريخ، فاحذف التفصيل غير الضروري أو اذكر أن التحقق مطلوب. لا تسدّ الفراغ بأسماء مؤسسات أو معاهدات متخيلة.",
  "9. عند إيراد قائمة هيئات أو اتفاقيات، راجع كل عنصر منفرداً: الاسم الرسمي، الاختصار، الطبيعة القانونية، الاختصاص، ومدى صلته بالسؤال. لا تضف عناصر لمجرد إكمال العدد.",
  "10. اجعل المصادر الموثوقة متناسبة مع طبيعة السؤال: النصوص الرسمية والجهات الدولية المختصة للمسائل القانونية؛ الأوراق العلمية المحكمة للأسئلة التجريبية؛ والبيانات الأولية الرسمية للإحصاءات. Consensus وSemantic Scholar وOpenAlex أدوات فهرسة/بحث أكاديمي وليست بديلاً عن النصوص القانونية الرسمية.",
  "11. لا تُظهر قائمة مراجع أو إحالات إلا إذا كانت بياناتها موجودة ومطابقة لما استُخدم فعلاً. لا تختلق عنواناً أو مؤلفاً أو تاريخاً أو رابطاً. إذا لم تُجرَ عملية استرجاع للمصادر، لا توحِ بعكس ذلك.",
  "12. في المراجعة النهائية، افحص خصوصاً الأسماء والأرقام والاختصارات والصفات المؤسسية والمصطلحات الفنية والتعميمات. صحّح الخطأ الجوهري حتى لو تطلب ذلك تقليل عدد العناوين أو الأمثلة.",
  "السلوك العام:",
  "أجب عن المطلوب مباشرة. اسأل سؤالاً توضيحياً واحداً فقط عندما تكون معلومة أساسية مفقودة. لا تبالغ في الثقة، ولا تخفِ حدود الأدوات أو الخدمات المتاحة."
].join("\n");

function cleanAssistantReply(value: string) {
  return value
    .replace(/\\*\\*/g, "")
    .replace(/(^|\\s)\\*(?=\\S)|(?<=\\S)\\*(?=\\s|$)/g, "")
    .replace(/__/g, "")
    .replace(/(^|\\s)_(?=\\S)|(?<=\\S)_(?=\\s|$)/g, "");
}

function isConfigured(provider: Provider) {
  return provider === "gemini" ? Boolean(process.env.GEMINI_API_KEY) : Boolean(process.env.GROQ_API_KEY);
}

async function checkLimit(req: NextRequest): Promise<"allowed" | "limited" | "unavailable"> {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return "allowed";
  try {
    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(12, "1 m"), prefix: "ilyesb:chat" });
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
    return (await limiter.limit(ip)).success ? "allowed" : "limited";
  } catch {
    return "allowed";
  }
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

function providerError(data: any, fallback: string) {
  const message = data?.error?.message || data?.message || data?.detail;
  return typeof message === "string" ? message.slice(0, 500) : fallback;
}

async function consensusRequest(body: unknown, session?: string): Promise<{ data: any; session: string | null }> {
  const response = await fetch("https://mcp.consensus.app/mcp", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", ...(session ? { "Mcp-Session-Id": session } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(18000) });
  const sid = response.headers.get("Mcp-Session-Id") || session || null;
  const raw = await response.text(); if (!response.ok) throw new Error("Consensus MCP HTTP " + response.status);
  const frames = raw.split(/\r?\n/).filter(x => x.startsWith("data:")).map(x => x.slice(5).trim()).filter(Boolean);
  let data: any = {}; for (const frame of frames.reverse()) { try { data = JSON.parse(frame); break; } catch {} }
  if (!frames.length) { try { data = JSON.parse(raw); } catch {} }
  return { data, session: sid };
}
async function searchConsensusFree(query: string): Promise<any[]> {
  const init = await consensusRequest({ jsonrpc:"2.0", id:1, method:"initialize", params:{ protocolVersion:"2025-03-26", capabilities:{}, clientInfo:{ name:"ILYES-AI", version:"1.0.0" } } });
  const session = init.session || undefined;
  if (session) await consensusRequest({ jsonrpc:"2.0", method:"notifications/initialized", params:{} }, session);
  const listed = await consensusRequest({ jsonrpc:"2.0", id:2, method:"tools/list", params:{} }, session);
  const tools = listed.data?.result?.tools || [];
  const tool = tools.find((x:any)=>x.name==="search") || tools.find((x:any)=>/search/i.test(x.name));
  if (!tool) throw new Error("Consensus search tool unavailable");
  const called = await consensusRequest({ jsonrpc:"2.0", id:3, method:"tools/call", params:{ name:tool.name, arguments:{ query } } }, listed.session || session);
  const result = called.data?.result || {}; let data:any = result.structuredContent || result;
  for (const item of result.content || []) if (typeof item.text==="string") { try { data=JSON.parse(item.text); break; } catch {} }
  if (typeof data==="string") { try { data=JSON.parse(data); } catch { data={}; } }
  const items = Array.isArray(data) ? data : data.papers || data.results || [];
  return items.slice(0,3).map((p:any)=>({ title:String(p.title||""), authors:Array.isArray(p.authors)?p.authors.map((a:any)=>typeof a==="string"?a:a.name||"").join(", "):String(p.authors||""), year:String(p.year||""), abstract:String(p.abstract||""), url:String(p.url||p.link||""), doi:String(p.doi||"") })).filter((p:any)=>p.title);
}
async function enrichWithConsensus(messages: Msg[]): Promise<{ messages: Msg[]; papers: any[]; used: boolean }> {
  const question = messages[messages.length-1]?.content?.trim() || "";
  if (!/بحث|مصادر|مراجع|دراسات|أبحاث|أوراق علمية|الأدلة العلمية|literature|research|studies|papers|citations|references|evidence/i.test(question) || question.length<12) return { messages, papers:[], used:false };
  try {
    const papers=await searchConsensusFree(question); if(!papers.length) return { messages,papers:[],used:false };
    const evidence=papers.map((p,i)=>"["+(i+1)+"] "+p.title+"\nالمؤلفون: "+(p.authors||"غير متاح")+"\nالسنة: "+(p.year||"غير متاحة")+"\nالملخص: "+(p.abstract||"غير متاح")+"\nالرابط: "+(p.url||"غير متاح")+"\nDOI: "+(p.doi||"غير متاح")).join("\n\n");
    const augmented=[...messages], last=augmented.length-1;
    augmented[last]={...augmented[last],content:augmented[last].content+"\n\n[مصادر أكاديمية مسترجعة فعلياً من Consensus. استخدم الدراسات ذات الصلة فقط، وأدرج إحالات [1] [2] عند الاستناد إليها. الدراسات ليست مصدراً رسمياً للقانون.]\n"+evidence};
    return { messages:augmented,papers,used:true };
  } catch { return { messages,papers:[],used:false }; }
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
      generationConfig: { maxOutputTokens: 6000, temperature: 0.7 }
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
      max_completion_tokens: 6000,
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
  return provider === "gemini" ? askGemini(messages) : askGroq(messages);
}

async function askHybrid(messages: Msg[]) {
  // الوضع المجاني: Gemini وGroq فقط، دون أي استدعاء لخدمة مدفوعة.
  const available = (["gemini", "groq"] as Provider[]).filter(isConfigured);
  if (!available.length) {
    throw new Error("لم يتم إعداد أي محرك مجاني بعد. أضف مفتاح Gemini المجاني أو Groq المجاني إلى إعدادات Vercel.");
  }

  const contributions = await Promise.allSettled(available.map(async provider => ({
    provider,
    reply: await ask(provider, messages)
  })));
  const drafts = contributions.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  const failures = contributions.flatMap((result, index) => result.status === "rejected"
    ? [available[index] + ": " + (result.reason instanceof Error ? result.reason.message : "تعذر الاتصال")]
    : []);

  if (!drafts.length) {
    throw new Error("تعذر الحصول على إجابة من المحركات المجانية. تحقق من الحصص المجانية ومفاتيح Gemini وGroq. " + failures.slice(0, 2).join(" | "));
  }

  // إذا توفر محرك واحد فقط، نستخدمه مباشرةً دون الادعاء بحدوث تعاون.
  if (drafts.length === 1) {
    return { reply: drafts[0].reply, engine: drafts[0].provider, collaboration: { used: false, contributors: [drafts[0].provider], failures } };
  }

  const synthesisMessages: Msg[] = [
    ...messages,
    { role: "user", content: "راجع المساهمتين التاليتين مراجعة نقدية مستقلة. لا تجمعهما آلياً: قارن الادعاءات، واستبعد الأخطاء والتكرار والتخمين، ودقق المصطلحات والأرقام والتواريخ. في المسائل القانونية ميّز بين النص التشريعي والرأي الفقهي، ولا تخترع أرقام مواد أو مصادر. أجب عن جميع أجزاء سؤال المستخدم بإجابة واحدة متماسكة وطبيعية.\n\n" +
      drafts.map((item, index) => "مساهمة " + (index + 1) + " من " + item.provider + ":\n" + item.reply).join("\n\n") }
  ];

  let reply = "";
  let synthesisEngine: Provider | null = null;
  const synthesisOrder: Provider[] = ["gemini", "groq"].filter(p => available.includes(p as Provider)) as Provider[];
  const synthesisFailures: string[] = [];
  for (const provider of synthesisOrder) {
    try {
      reply = await ask(provider, synthesisMessages);
      synthesisEngine = provider;
      break;
    } catch (error) {
      synthesisFailures.push(provider + ": " + (error instanceof Error ? error.message : "تعذر إتمام المراجعة"));
    }
  }
  if (!reply || !synthesisEngine) {
    throw new Error("تعذر إتمام المراجعة النهائية بالمحركات المجانية. لم تُعرض المسودات الخام على أنها إجابة نهائية. " + synthesisFailures.join(" | "));
  }

  return {
    reply,
    engine: "hybrid",
    collaboration: { used: true, contributors: drafts.map(item => item.provider), failures }
  };
}

async function askAuto(messages: Msg[]) {
  // الوضع التلقائي يبقى سريعاً ويستخدم محركاً واحداً؛ تعاون المحركات متاح بالاختيار الصريح.
  const order: Provider[] = ["gemini", "groq"];
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
  if (!failures.length) throw new Error("لم يتم إعداد أي محرك مجاني. أضف مفتاح Gemini أو Groq في إعدادات Vercel.");
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
      return NextResponse.json({ reply: cleanAssistantReply(await askGemini(messages)), engine: "gemini" });
    }
    if (requested === "hybrid") {
      const research = await enrichWithConsensus(messages);
      const result = await askHybrid(research.messages);
      return NextResponse.json({ ...result, reply: cleanAssistantReply(result.reply), consensusUsed: research.used, consensusPapers: research.papers });
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