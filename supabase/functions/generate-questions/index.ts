// مولّد الأسئلة بالذكاء الاصطناعي — Supabase Edge Function
//
// لماذا دالة على السيرفر بدل نداء Claude من المتصفح مباشرة:
// اللعبة منشورة على GitHub Pages، وأي مفتاح يوضع في ملفات JS يقدر أي زائر
// يقرأه ويصرف من رصيدك. المفتاح هنا سرّ في Supabase (ANTHROPIC_API_KEY)
// لا يخرج من السيرفر، والدالة لا تعمل إلا لحساب إدارة (is_admin()).
//
// النشر:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy generate-questions

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5-5";
const DIFF_AR: Record<string, string> = { easy: "سهلة", medium: "متوسطة", hard: "صعبة" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          emoji: { type: "string" },
        },
        required: ["question", "answer", "emoji"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

const SYSTEM = `أنت كاتب أسئلة للعبة «تحدي رجا» — لعبة أسئلة جماعية سعودية تُلعب بين فريقين.
اكتب أسئلة بالعربية الفصحى المبسّطة، دقيقة ومتأكد من صحتها 100%.
- الإجابة قصيرة جداً (كلمة إلى ثلاث كلمات)، واضحة، ولا تحتمل أكثر من جواب صحيح.
- لا تكتب الإجابة داخل نص السؤال ولا تلمّح لها بشكل مكشوف.
- السهل: يعرفه أغلب الناس. المتوسط: يحتاج ثقافة. الصعب: لأهل الاختصاص والمهتمين.
- نوّع زوايا الأسئلة ولا تكرر فكرة سؤال.
- emoji: إيموجي واحد يناسب السؤال.
- إن كانت معلومة غير مؤكدة أو مختلف عليها، لا تضعها.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST فقط" }, 405);

  // ---- التحقق من أن المرسل إدمن ----
  const auth = req.headers.get("Authorization") ?? "";
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: isAdmin, error: adminErr } = await supa.rpc("is_admin");
  if (adminErr || isAdmin !== true) return json({ error: "هذي الخدمة للإدارة فقط" }, 403);

  // ---- المدخلات ----
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "طلب غير صالح" }, 400); }

  const category = String(body.category ?? "").trim().slice(0, 100);
  const topic = String(body.topic ?? "").trim().slice(0, 500);
  const difficulty = String(body.difficulty ?? "medium");
  const count = Math.min(Math.max(Number(body.count) || 10, 1), 30);
  const existing = Array.isArray(body.existing)
    ? body.existing.map((s) => String(s).slice(0, 300)).slice(0, 400)
    : [];

  if (!category) return json({ error: "اختر الفئة" }, 400);
  if (!DIFF_AR[difficulty]) return json({ error: "مستوى صعوبة غير معروف" }, 400);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY غير مضبوط في أسرار Supabase" }, 500);

  const prompt = [
    `اكتب ${count} أسئلة ${DIFF_AR[difficulty]} لفئة «${category}».`,
    topic ? `تفاصيل الموضوع المطلوب: ${topic}` : "",
    existing.length
      ? `هذي أسئلة موجودة مسبقاً في نفس الفئة — لا تكررها ولا تكتب نفس فكرتها:\n- ${existing.join("\n- ")}`
      : "",
  ].filter(Boolean).join("\n\n");

  // ---- نداء Claude ----
  const client = new Anthropic({ apiKey });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // إن رفض النموذج الطلب بالخطأ، يكمل نموذج بديل بدل ما يفشل الطلب
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    } as any);

    if (response.stop_reason === "refusal") {
      return json({ error: "النموذج رفض هالموضوع، جرّب صياغة ثانية" }, 422);
    }
    if (response.stop_reason === "max_tokens") {
      return json({ error: "الرد طويل وانقطع، قلّل عدد الأسئلة" }, 422);
    }

    const text = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    const parsed = JSON.parse(text);
    const questions = (parsed.questions ?? [])
      .filter((q: any) => q?.question?.trim() && q?.answer?.trim())
      .map((q: any) => ({
        question: q.question.trim(),
        answer: q.answer.trim(),
        emoji: (q.emoji || "❓").trim(),
      }));

    return json({ questions });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return json({ error: "مفتاح Claude غير صحيح" }, 500);
    }
    if (e instanceof Anthropic.RateLimitError) {
      return json({ error: "ضغط على الخدمة، جرّب بعد شوي" }, 429);
    }
    if (e instanceof Anthropic.APIError) {
      return json({ error: `خطأ من Claude: ${e.message}` }, 502);
    }
    if (e instanceof SyntaxError) {
      return json({ error: "الرد ما جا بالشكل المطلوب، جرّب مرة ثانية" }, 502);
    }
    console.error(e);
    return json({ error: "خطأ غير متوقع" }, 500);
  }
});
