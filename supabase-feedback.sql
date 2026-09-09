-- ============================================================================
-- ملاحظات اللاعبين — بلاغات الأسئلة وتقييم الجولة
-- يُشغَّل مرة واحدة في Supabase → SQL Editor
-- ============================================================================
--
-- الغرض:
--   1) `question_reports` — بنك الأسئلة تجاوز 1,600 سؤال، وكثير منها كُتب
--      بسرعة. اللاعب الذي يكتشف إجابة خاطئة لم يكن عنده أي طريقة ليخبرك،
--      فيبقى الخطأ يتكرّر على كل من يلعب بعده إلى الأبد.
--   2) `game_ratings` — تقييم بعد كل جولة، ليُعرف هل الجلسة كانت ممتعة
--      فعلاً، لا أن يُستنتج ذلك من عدد الزيارات.
--
-- ⚠️ **شغّله على دفعتين** كما تنصّ الملاحظة 11 في PLAN.md: محرر Supabase
--    ينفّذ اللصقة كمعاملة واحدة، وخطأ في أمر واحد يُلغي كل شيء بصمت.
--    الدفعة الأولى تنتهي عند السطر الفاصل، والثانية بعده.
--
-- ⚠️ **الإدراج مفتوح للجميع** — نفس مقايضة `app_events`: اللاعب في الوضع
--    المحلي غير مسجَّل أصلاً، ولو اشترطنا تسجيلاً لما وصلنا بلاغ واحد.
--    والحماية من العبث في القيود لا في الصلاحية: طول محدود للنصوص، ونجوم
--    بين 1 و5، فأسوأ ما يفعله عابث هو صفوف يُحذفها زرّ في لوحة الإدارة.
--
-- ⚠️ **لا يُخزَّن ما يدلّ على هوية** — لا اسم لاعب ولا معرّف جهاز، تماشياً
--    مع سياسة `app_events`. البلاغ يحمل السؤال لا صاحبه.
-- ============================================================================


-- ============================ الدفعة الأولى ============================
-- بلاغات الأسئلة

CREATE TABLE IF NOT EXISTS question_reports (
  id          BIGSERIAL PRIMARY KEY,
  category    TEXT NOT NULL CHECK (char_length(category) <= 120),
  difficulty  TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question    TEXT NOT NULL CHECK (char_length(question) <= 600),
  answer      TEXT CHECK (char_length(answer) <= 600),
  reason      TEXT NOT NULL CHECK (char_length(reason) <= 60),
  note        TEXT CHECK (char_length(note) <= 400),
  resolved    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- الفرز في اللوحة بالأحدث أولاً، وغير المعالَج قبل المعالَج
CREATE INDEX IF NOT EXISTS idx_reports_open ON question_reports (resolved, created_at DESC);

ALTER TABLE question_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_insert_public"     ON question_reports;
DROP POLICY IF EXISTS "reports_read_admin"        ON question_reports;
DROP POLICY IF EXISTS "reports_update_admin"      ON question_reports;
DROP POLICY IF EXISTS "reports_delete_admin"      ON question_reports;

CREATE POLICY "reports_insert_public" ON question_reports
  FOR INSERT WITH CHECK (true);

CREATE POLICY "reports_read_admin" ON question_reports
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "reports_update_admin" ON question_reports
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "reports_delete_admin" ON question_reports
  FOR DELETE TO authenticated USING (true);


-- ======================= توقّف هنا وشغّل الدفعة الأولى =======================


-- ============================ الدفعة الثانية ============================
-- تقييم الجولة

CREATE TABLE IF NOT EXISTS game_ratings (
  id          BIGSERIAL PRIMARY KEY,
  stars       SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  note        TEXT CHECK (char_length(note) <= 400),
  mode        TEXT CHECK (mode IN ('local', 'online')),
  questions   SMALLINT,          -- كم سؤالاً لُعب فعلاً — تقييم جولة ناقصة يُقرأ غير تقييم جولة كاملة
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ratings_day ON game_ratings (created_at DESC);

ALTER TABLE game_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ratings_insert_public" ON game_ratings;
DROP POLICY IF EXISTS "ratings_read_admin"    ON game_ratings;
DROP POLICY IF EXISTS "ratings_delete_admin"  ON game_ratings;

CREATE POLICY "ratings_insert_public" ON game_ratings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "ratings_read_admin" ON game_ratings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ratings_delete_admin" ON game_ratings
  FOR DELETE TO authenticated USING (true);


-- ============================================================================
-- للتحقق بعد التشغيل
-- ============================================================================
-- SELECT tablename FROM pg_tables
--   WHERE tablename IN ('question_reports', 'game_ratings');
--
-- SELECT tablename, policyname, cmd, roles FROM pg_policies
--   WHERE tablename IN ('question_reports', 'game_ratings') ORDER BY tablename, cmd;
--
-- المتوقع: جدولان، وسبع سياسات — إدراجان {public} وخمس للـ {authenticated}.
--
-- متوسط التقييم آخر 30 يوماً:
-- SELECT round(avg(stars), 2) AS المتوسط, count(*) AS العدد
--   FROM game_ratings WHERE created_at > now() - interval '30 days';
--
-- أكثر الأسئلة بلاغاً:
-- SELECT question, category, count(*) AS البلاغات
--   FROM question_reports WHERE NOT resolved
--   GROUP BY question, category ORDER BY البلاغات DESC LIMIT 20;
