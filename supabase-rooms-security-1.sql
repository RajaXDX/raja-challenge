-- ============================================================================
--  أمان الرومات — المرحلة 1: الأعمدة والدوال (إضافة فقط، لا تكسر شيئاً)
-- ============================================================================
--
--  المشكلة: كل السياسات على game_rooms و room_players و room_chat و
--  room_game_state هي USING (true). ومفتاح anon منشور في js/supabase-config.js
--  (وهذا طبيعي ومقصود)، فأي شخص يفتح أدوات المطوّر يقدر:
--    · يقرأ كل الرومات وكل رسائل الشات لكل اللاعبين
--    · ينصّب نفسه مضيفاً على أي روم، ويطرد أي لاعب، ويغيّر فريقه ونقاطه
--    · يزوّر حالة اللعبة كاملة، ويحذف أي روم أو لاعب أو رسالة
--
--  ⚠️ **شغّل هذا الملف وحده أولاً، ولا تشغّل الملف 2 قبل نشر الكود الجديد.**
--  هذا الملف **إضافة محضة**: أعمدة جديدة ودوال جديدة. اللعبة المنشورة الآن
--  تبقى تعمل كما هي بعد تشغيله. الملف 2 هو الذي يشدّ السياسات فعلاً، وتشغيله
--  قبل وصول الكود الجديد للاعبين يكسر توزيع الفرق والطرد.
--
--  ⚠️ شغّل كل «دفعة» وحدها (راجع الملاحظة 11 في PLAN.md): محرر Supabase
--  ينفّذ اللصقة كمعاملة واحدة، فخطأ في أمر واحد يُلغي كل شيء بصمت.
--
--  ⚠️ الاعتماد الأساسي: REQUIRE_ACCOUNT_FOR_ONLINE = true في js/auth.js،
--  فكل لاعب أونلاين مسجّل دخوله فعلاً و auth.uid() متاح. لو أُطفئت تلك
--  الراية يوماً انكسر الأونلاين كله — الربط هنا بالحساب لا بالجهاز.
--  (اللعب المحلي بلا حساب لا يمسّ هذا: لا يلمس أياً من هذه الجداول.)
--
-- ============================================================================


-- ======================== الدفعة 1: الأعمدة ========================
-- ربط الصف بصاحبه الحقيقي. player_id نصّ يولّده المتصفح — يقدر أي أحد
-- يدّعيه. auth.uid() لا يُدّعى.

ALTER TABLE room_players ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();
ALTER TABLE room_chat    ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_room_players_user ON room_players(room_id, user_id);
CREATE INDEX IF NOT EXISTS idx_room_chat_user    ON room_chat(room_id, user_id);

-- ⚠️ الصفوف القائمة تبقى user_id = NULL ولا سبيل لمعرفة أصحابها بأثر رجعي.
-- عملياً لا ضرر: الرومات جلسات عابرة، ومن كان في روم قديمة سيُنشئ غيرها.
-- لكن لا تتوقّع أن تعمل روم مفتوحة الآن بعد تشغيل الملف 2 — أغلقها من لوحة
-- الإدارة (🧹 تنظيف الرومات) قبل ذلك.


-- ======================== الدفعة 2: دوال الفحص ========================
-- SECURITY DEFINER **ضرورية لا تجميلية**: سياسة على room_players تقرأ
-- room_players نفسه تُنتج ارتداداً لا نهائياً (infinite recursion). الدالة
-- تعمل بصلاحية مالكها فتتجاوز RLS وتكسر الحلقة.
--
-- ⚠️ search_path مثبّت: بدونه يقدر منادٍ خبيث يزرع دالة باسم مطابق في
-- مخطّط يسبق public فتُنفَّذ بصلاحية المالك.

CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM room_players
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND status <> 'kicked'   -- المطرود يفقد الاطّلاع فوراً
  );
$fn$;

CREATE OR REPLACE FUNCTION public.is_room_host(p_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM room_players
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND is_host = true
      AND status = 'active'
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.is_room_member(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_host(TEXT)   TO authenticated;


-- ======================== الدفعة 3: الدخول بالكود ========================
-- الدخول يحتاج قراءة الروم **قبل** أن تصير عضواً فيها، وسياسة «الأعضاء فقط»
-- تمنع ذلك. فبدل فتح القراءة للجميع (وهو ما يسمح بتعداد كل الرومات) نعطي
-- دالة تُرجع روماً **واحدة بكودها** — من معه الكود يدخل، ومن لا فلا.

CREATE OR REPLACE FUNCTION public.find_room_by_code(p_code TEXT)
RETURNS TABLE (
  out_id TEXT,
  out_code TEXT,
  out_name TEXT,
  out_mode TEXT,
  out_status TEXT,
  out_host_player_id TEXT,
  out_categories_selected JSONB,
  out_created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  -- ⚠️ أسماء الإخراج out_* لا id/code: plpgsql وplsql ترفض تسمية عمود
  -- إخراج باسم عمود جدول تقرأه الدالة نفسها (راجع الملاحظة 13 في PLAN.md)
  SELECT id, code, name, mode, status, host_player_id, categories_selected, created_at
  FROM game_rooms
  WHERE code = upper(p_code)
  LIMIT 1;
$fn$;

GRANT EXECUTE ON FUNCTION public.find_room_by_code(TEXT) TO authenticated;


-- ======================== الدفعة 4: أفعال المضيف ========================
-- توزيع الفريق والطرد ونقل الاستضافة تمسّ **صفوف الآخرين**، فلا يمكن أن
-- تمرّ بسياسة «عدّل صفّك وحدك». تمرّ من هنا، والدالة تفحص أن المنادي مضيف
-- فعلاً — نفس أسلوب invite_friend() المعتمد في هذا المشروع.

CREATE OR REPLACE FUNCTION public.set_player_team(
  p_room_id TEXT, p_player_id TEXT, p_team TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_room_host(p_room_id) THEN
    RAISE EXCEPTION 'not_room_host';
  END IF;

  IF p_team IS NOT NULL AND p_team NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'bad_team';
  END IF;

  UPDATE room_players SET team = p_team
  WHERE room_id = p_room_id AND player_id = p_player_id;

  RETURN FOUND;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.kick_room_player(
  p_room_id TEXT, p_player_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_room_host(p_room_id) THEN
    RAISE EXCEPTION 'not_room_host';
  END IF;

  -- المضيف لا يطرد نفسه: يترك الروم بلا صاحب
  IF EXISTS (
    SELECT 1 FROM room_players
    WHERE room_id = p_room_id AND player_id = p_player_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'cannot_kick_self';
  END IF;

  UPDATE room_players
     SET status = 'kicked', left_at = now(), is_host = false
   WHERE room_id = p_room_id AND player_id = p_player_id;

  RETURN FOUND;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.transfer_room_host(
  p_room_id TEXT, p_next_player_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_room_host(p_room_id) THEN
    RAISE EXCEPTION 'not_room_host';
  END IF;

  -- الصفة تُنزع عن الجميع ثم تُعطى لواحد: وإلا بقي مضيفان يتنازعان
  UPDATE room_players SET is_host = false WHERE room_id = p_room_id;

  UPDATE room_players SET is_host = true
   WHERE room_id = p_room_id AND player_id = p_next_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'next_host_not_found';
  END IF;

  -- ⚠️ الجدولان معاً: host_player_id هو ما تقرأه استعادة الجلسة
  UPDATE game_rooms SET host_player_id = p_next_player_id WHERE id = p_room_id;

  RETURN true;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_player_team(TEXT, TEXT, TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.kick_room_player(TEXT, TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_room_host(TEXT, TEXT)     TO authenticated;


-- ======================== الدفعة 5: شبكة أمان الاستضافة ========================
-- المضيف الذي أقفل المتصفح لا يمرّ بـ leaveRoom، فتبقى الروم منسوبة إليه
-- ولا أحد يتحكّم بها (البند 21). أقدم لاعب **حاضر** يطالب بها.
--
-- ⚠️ لماذا دالة لا تحديث مباشر: لو سُمح للاعب بتعديل is_host في صفّه لصار
-- أي عضو ينصّب نفسه مضيفاً متى شاء — وهذا تصعيد صلاحية داخل الروم. الشرط
-- «لا مضيف حاضراً» و«أنت الأقدم» يُفحص هنا حيث لا يُلتَفّ عليه.

CREATE OR REPLACE FUNCTION public.claim_room_host(p_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me TEXT;
  v_oldest TEXT;
BEGIN
  IF NOT public.is_room_member(p_room_id) THEN
    RAISE EXCEPTION 'not_room_member';
  END IF;

  SELECT player_id INTO v_me
    FROM room_players
   WHERE room_id = p_room_id AND user_id = auth.uid() AND status = 'active'
   LIMIT 1;

  IF v_me IS NULL THEN
    RETURN false;
  END IF;

  -- مضيف حاضر موجود؟ لا تُسرق منه. المهلة 90 ثانية كما في js/rooms.js
  IF EXISTS (
    SELECT 1 FROM room_players
    WHERE room_id = p_room_id AND is_host = true AND status = 'active'
      AND (last_seen_at IS NULL OR last_seen_at > now() - interval '90 seconds')
  ) THEN
    RETURN false;
  END IF;

  -- المرشّح أقدم لاعب حاضر — محسوم بالترتيب فلا يطالب بها اثنان معاً
  SELECT player_id INTO v_oldest
    FROM room_players
   WHERE room_id = p_room_id AND status = 'active'
     AND (last_seen_at IS NULL OR last_seen_at > now() - interval '90 seconds')
   ORDER BY joined_at ASC
   LIMIT 1;

  IF v_oldest IS DISTINCT FROM v_me THEN
    RETURN false;
  END IF;

  UPDATE room_players SET is_host = false WHERE room_id = p_room_id;
  UPDATE room_players SET is_host = true
   WHERE room_id = p_room_id AND player_id = v_me;
  UPDATE game_rooms SET host_player_id = v_me WHERE id = p_room_id;

  RETURN true;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.claim_room_host(TEXT) TO authenticated;


-- ======================== الدفعة 6: النقاط وحالة اللعبة ========================
-- ⚠️ **النقاط لأي عضو لا للمضيف وحده — مقصود.** من يجيب قد يكون غير مضيف
-- (البند 13)، فقصرها على المضيف يكسر احتساب النقاط عند غيره. النموذج
-- التهديدي هنا هو **الغريب** لا زميلك في الروم: من دخل بالكود جالس معك.

CREATE OR REPLACE FUNCTION public.set_team_score(
  p_room_id TEXT, p_team TEXT, p_score INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_room_member(p_room_id) THEN
    RAISE EXCEPTION 'not_room_member';
  END IF;

  IF p_team NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'bad_team';
  END IF;

  UPDATE room_players SET score = p_score
   WHERE room_id = p_room_id AND team = p_team;

  RETURN true;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_team_score(TEXT, TEXT, INTEGER) TO authenticated;


-- ======================== الدفعة 7: التحقق ========================
-- شغّلها بعد الدفعات ونتيجتها يجب أن تكون 8 دوال و2 عمود.

SELECT 'functions' AS what, count(*) AS n
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'is_room_member','is_room_host','find_room_by_code','set_player_team',
  'kick_room_player','transfer_room_host','claim_room_host','set_team_score'
)
UNION ALL
SELECT 'user_id columns', count(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'user_id'
  AND table_name IN ('room_players','room_chat');
