-- ============================================================================
--  تحدي رجا — تأمين الرومات على نموذج «صراع الحروف»
-- ============================================================================
--
--  ما كان قبل هذا الملف
--  --------------------
--  جداول الرومات الأربعة كانت سياساتها كلها `USING (true)`، والمفتاح العام
--  منشور في `js/supabase-config.js` كما يجب أن يكون. النتيجة العملية:
--
--    • أي شخص يستعلم `game_rooms` فيحصل على **كل أكواد الرومات**. وقفل عرض
--      القائمة في الواجهة (إصلاح 2026-07-27) لا يمنع الاستعلام المباشر —
--      الواجهة ليست حاجزاً.
--    • ومنها يقرأ **كل رسائل الشات في كل الرومات**، ماضياً وحاضراً.
--    • و`room_players` يكشف `device_id` لكل لاعب.
--    • ويكتب في أي روم: يغيّر النقاط، يوزّع الفرق، يطرد اللاعبين.
--
--  الحلّ: نفس نموذج `supabase-huroof.sql` حرفياً —
--  **RLS مفعّلة بصفر سياسات**، والصلاحية منزوعة عن `anon` و`authenticated`،
--  وكل شيء يمرّ بدوال `SECURITY DEFINER` تفحص توكن العضوية. التوكنات
--  تُنزع من كل ردّ، فلا يخرج توكن إلا لصاحبه في ردّ الإنشاء/الدخول.
--
--  ⚠️ شغّل كل دفعة وحدها في محرر SQL. المحرر ينفّذ اللصقة **كمعاملة واحدة**،
--     فخطأ في أمر واحد يُلغي كل شيء بصمت ولا تعرف أين وقع.
--
--  ⚠️ **الرومات المفتوحة الآن ستُغلق** (الدفعة 2). صفوف اللاعبين الحالية بلا
--     توكن، فلا سبيل لإثبات عضويتها في النموذج الجديد. شغّل الملف وقت لا
--     أحد يلعب. الرومات مؤقتة أصلاً ولا يضيع بإغلاقها شيء دائم.
--
--  ↩️ للتراجع: آخر الملف دفعة تعيد السياسات المفتوحة كما كانت.
--
--  ============================================================================
--  لماذا لم يعد `postgres_changes` يعمل — وماذا حلّ محلّه
--  ------------------------------------------------------
--  Realtime يطبّق RLS على `postgres_changes` بهوية المشترك. وبعد أن صارت
--  الجداول بصفر سياسات، لن يصل المشترك **أي** صف. هذا متوقّع ومقصود.
--
--  البديل هو ما تفعله «صراع الحروف»: **بثّ للسرعة، واستطلاع للحقيقة**.
--  البثّ على قناة `mr-<code>` يصل فوراً فتتحرّك الشاشة بلا انتظار، ثم
--  `mr_snapshot` تؤكّد من الجدول. البثّ لا يُؤتمن على الحقائق — من يبثّ
--  قد يكذب — لكنه لم يعد يستطيع أن يكذب طويلاً.
-- ============================================================================


-- ======================== الدفعة 1: الأعمدة الجديدة ========================

-- توكن العضوية. سرّ يبقى على جهاز اللاعب ولا يُعاد لأحد غيره.
-- (بديل `device_id` الذي كان يُرسل للجميع — وهو بحد ذاته تسريب.)
ALTER TABLE room_players ADD COLUMN IF NOT EXISTS token TEXT;

CREATE INDEX IF NOT EXISTS idx_room_players_token ON room_players (room_id, token);

-- عدّاد النسخة: الحارس ضد الكتابة فوق نسخة أحدث. بلا هذا يكفي ردّ متأخر من
-- جهاز بطيء ليمحو جولة كاملة عند الجميع.
ALTER TABLE room_game_state ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;

-- لتنظيف الرومات المهجورة
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();


-- ======================== الدفعة 2: إغلاق ما هو مفتوح ========================
-- صفوف اللاعبين الحالية بلا توكن. لا سبيل لإثبات عضويتها، فنُغلق رومها
-- بدل أن نتركها معلّقة لا تُقرأ ولا تُكتب.

UPDATE room_players SET status = 'left', left_at = now()
WHERE status = 'active' AND token IS NULL;

UPDATE game_rooms SET status = 'completed', updated_at = now()
WHERE status <> 'completed';


-- ======================== الدفعة 3: إغلاق الجداول ========================

-- كل السياسات المفتوحة القديمة تُحذف. الأسماء من `supabase-setup.sql`.
DROP POLICY IF EXISTS "allow_public_read_rooms"    ON game_rooms;
DROP POLICY IF EXISTS "allow_public_insert_rooms"  ON game_rooms;
DROP POLICY IF EXISTS "allow_public_update_rooms"  ON game_rooms;
DROP POLICY IF EXISTS "allow_public_delete_rooms"  ON game_rooms;

DROP POLICY IF EXISTS "allow_public_read_players"   ON room_players;
DROP POLICY IF EXISTS "allow_public_insert_players" ON room_players;
DROP POLICY IF EXISTS "allow_public_update_players" ON room_players;
DROP POLICY IF EXISTS "allow_public_delete_players" ON room_players;

DROP POLICY IF EXISTS "allow_public_read_chat"   ON room_chat;
DROP POLICY IF EXISTS "allow_public_insert_chat" ON room_chat;
DROP POLICY IF EXISTS "allow_public_update_chat" ON room_chat;
DROP POLICY IF EXISTS "allow_public_delete_chat" ON room_chat;

DROP POLICY IF EXISTS "allow_public_read_state"   ON room_game_state;
DROP POLICY IF EXISTS "allow_public_insert_state" ON room_game_state;
DROP POLICY IF EXISTS "allow_public_update_state" ON room_game_state;
DROP POLICY IF EXISTS "allow_public_delete_state" ON room_game_state;

-- RLS مفعّلة بلا أي سياسة = لا أحد يصل للجداول مباشرة.
ALTER TABLE game_rooms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players    ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_chat       ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_game_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON game_rooms      FROM anon, authenticated;
REVOKE ALL ON room_players    FROM anon, authenticated;
REVOKE ALL ON room_chat       FROM anon, authenticated;
REVOKE ALL ON room_game_state FROM anon, authenticated;

-- ولا داعي لبقائها في النشر اللحظي: لن تصل مشتركاً بعد اليوم، ووجودها
-- هناك يوهم أن `postgres_changes` ما زال خياراً.
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE game_rooms;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE room_players;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE room_chat;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE room_game_state;
EXCEPTION WHEN OTHERS THEN NULL; END $$;


-- ======================== الدفعة 4: أدوات داخلية ========================

-- كود من 6 خانات بلا حروف تلتبس بالنطق أو بالشكل (0/O و1/I محذوفة عمداً —
-- الكود يُقال بالصوت، وحرف ملتبس يعني محاولة دخول فاشلة).
-- ⚠️ الكود القديم كان يُولَّد في المتصفح بـ`Math.random` بلا فحص تصادم،
--    فتصادمُه يظهر للمستخدم خطأ قاعدة بيانات خاماً. هنا يُعاد التوليد.
CREATE OR REPLACE FUNCTION mr_new_code() RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM game_rooms WHERE code = candidate);
  END LOOP;
  RETURN candidate;
END;
$fn$;

-- من صاحب هذا التوكن في هذه الروم؟ يُعيد `player_id` أو NULL.
-- المطرود والخارج ليسا عضوين.
CREATE OR REPLACE FUNCTION mr_seat_of(p_room_id text, p_token text) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT player_id FROM room_players
  WHERE room_id = p_room_id AND token = p_token AND status = 'active'
  LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION mr_is_host(p_room_id text, p_token text) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE((
    SELECT is_host FROM room_players
    WHERE room_id = p_room_id AND token = p_token AND status = 'active'
    LIMIT 1
  ), false);
$fn$;

-- الصورة التي تُعاد للمتصفح.
-- ⚠️ **`token` و`device_id` يُنزعان هنا.** لو سُرِّب توكن لاعب لأمكن اللعب
-- بدلاً عنه وطردُ الآخرين إن كان مضيفاً. المكان الوحيد الذي يخرج منه توكن
-- هو ردّ الإنشاء/الدخول لصاحبه وحده — ونحن لا نُعيده أصلاً، بل يولّده
-- المتصفح ويحتفظ به.
CREATE OR REPLACE FUNCTION mr_public_room(r game_rooms) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object(
    'id',      r.id,
    'code',    r.code,
    'name',    r.name,
    'mode',    r.mode,
    'status',  r.status,
    'categories_selected', r.categories_selected,
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'player_id',   p.player_id,
               'player_name', p.player_name,
               'team',        p.team,
               'score',       p.score,
               'is_host',     p.is_host,
               'status',      p.status
             ) ORDER BY p.joined_at)
      FROM room_players p
      WHERE p.room_id = r.id AND p.status = 'active'
    ), '[]'::jsonb),
    'state', (
      SELECT jsonb_build_object(
               'state_data',    s.state_data,
               'scores',        s.scores,
               'current_round', s.current_round,
               'version',       s.version)
      FROM room_game_state s WHERE s.room_id = r.id
    )
  );
$fn$;


-- ======================== الدفعة 5: الإنشاء والدخول ========================

CREATE OR REPLACE FUNCTION mr_create_room(p_room_name text, p_player_name text,
                                          p_token text, p_cats jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r   game_rooms;
  pid text := gen_random_uuid()::text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 12 THEN
    RETURN jsonb_build_object('error', 'bad_token');
  END IF;

  -- تنظيف انتهازي: الرومات المهجورة تُحذف مع كل إنشاء، فلا نحتاج مهمة مجدولة.
  -- الحذف يتتالى على اللاعبين والشات والحالة (ON DELETE CASCADE).
  DELETE FROM game_rooms WHERE created_at < now() - interval '24 hours';

  INSERT INTO game_rooms (code, name, mode, status, host_player_id, categories_selected)
  VALUES (mr_new_code(), COALESCE(NULLIF(btrim(p_room_name), ''), 'روم'),
          'online', 'waiting', pid, COALESCE(p_cats, '[]'::jsonb))
  RETURNING * INTO r;

  INSERT INTO room_players (room_id, player_id, player_name, token, is_host, status)
  VALUES (r.id, pid, left(COALESCE(NULLIF(btrim(p_player_name), ''), 'المضيف'), 20),
          p_token, true, 'active');

  INSERT INTO room_game_state (room_id, current_round, scores, questions_used, state_data)
  VALUES (r.id, 0, '{"A":0,"B":0}'::jsonb, '[]'::jsonb, '{}'::jsonb);

  RETURN mr_public_room(r) || jsonb_build_object('you', pid, 'is_host', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION mr_join_room(p_code text, p_player_name text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r    game_rooms;
  prev room_players;
  pid  text;
  rid  text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 12 THEN
    RETURN jsonb_build_object('error', 'bad_token');
  END IF;

  -- ⚠️ القفل ضروري: لو دخل اثنان في نفس اللحظة لتجاوزا حدّ اللاعبين معاً
  SELECT * INTO r FROM game_rooms WHERE code = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  rid := r.id;
  IF r.status = 'completed' THEN RETURN jsonb_build_object('error', 'ended'); END IF;

  -- مقعد سابق لهذا التوكن؟ (تحديث صفحة أو انقطاع شبكة)
  SELECT * INTO prev FROM room_players
  WHERE room_id = r.id AND token = p_token
  ORDER BY joined_at DESC LIMIT 1;

  IF FOUND THEN
    IF prev.status = 'kicked' THEN RETURN jsonb_build_object('error', 'kicked'); END IF;

    UPDATE room_players SET
      status = 'active',
      left_at = NULL,
      player_name = left(COALESCE(NULLIF(btrim(p_player_name), ''), prev.player_name), 20)
    WHERE id = prev.id;

    -- نعيد قراءة الروم بعد التحديث لتخرج القائمة شاملةً العائد.
    -- ⚠️ نستعمل `rid` لا `r.id`: إسناد `SELECT INTO r` وقراءة `r.id` في
    -- نفس الأمر يعمل، لكنه يقرأ ويكتب المتغيّر ذاته — والوضوح أرخص من
    -- الاعتماد على ترتيب التقييم.
    SELECT * INTO r FROM game_rooms WHERE id = rid;
    RETURN mr_public_room(r) || jsonb_build_object('you', prev.player_id, 'is_host', prev.is_host);
  END IF;

  -- ⚠️ لا يدخل جديد بعد بدء المباراة: اللوحة نصفها ملعوب والأدوار مبنيّة
  IF r.status <> 'waiting' THEN RETURN jsonb_build_object('error', 'started'); END IF;

  IF (SELECT count(*) FROM room_players WHERE room_id = r.id AND status = 'active') >= 12 THEN
    RETURN jsonb_build_object('error', 'full');
  END IF;

  pid := gen_random_uuid()::text;
  INSERT INTO room_players (room_id, player_id, player_name, token, is_host, status)
  VALUES (r.id, pid, left(COALESCE(NULLIF(btrim(p_player_name), ''), 'لاعب'), 20),
          p_token, false, 'active');

  UPDATE game_rooms SET updated_at = now() WHERE id = r.id RETURNING * INTO r;
  RETURN mr_public_room(r) || jsonb_build_object('you', pid, 'is_host', false);
END;
$fn$;


-- ======================== الدفعة 6: القراءة ========================

CREATE OR REPLACE FUNCTION mr_snapshot(p_code text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r   game_rooms;
  pid text;
BEGIN
  SELECT * INTO r FROM game_rooms WHERE code = upper(btrim(p_code));
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  pid := mr_seat_of(r.id, p_token);
  IF pid IS NULL THEN RETURN jsonb_build_object('error', 'not_member'); END IF;

  RETURN mr_public_room(r)
      || jsonb_build_object('you', pid, 'is_host', mr_is_host(r.id, p_token));
END;
$fn$;

-- الشات. `p_after` ختم زمني: نُعيد الجديد فقط بدل الخمسين كلها كل مرة.
CREATE OR REPLACE FUNCTION mr_chat(p_code text, p_token text,
                                   p_after timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r game_rooms;
BEGIN
  SELECT * INTO r FROM game_rooms WHERE code = upper(btrim(p_code));
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF mr_seat_of(r.id, p_token) IS NULL THEN
    RETURN jsonb_build_object('error', 'not_member');
  END IF;

  RETURN jsonb_build_object('messages', COALESCE((
    SELECT jsonb_agg(m ORDER BY m.created_at) FROM (
      SELECT c.id, c.player_id, c.player_name, c.message, c.reactions, c.created_at
      FROM room_chat c
      WHERE c.room_id = r.id
        AND (p_after IS NULL OR c.created_at > p_after)
      ORDER BY c.created_at DESC
      LIMIT 50
    ) m
  ), '[]'::jsonb));
END;
$fn$;


-- ======================== الدفعة 7: الكتابة ========================

-- ⚠️ **الكتابة لأي عضو لا للمضيف وحده — مقصود.** صاحب الدور يجيب فيغيّر
-- الحالة، وهو ليس المضيف غالباً. الحارس الحقيقي هو `p_version`: من يكتب
-- فوق نسخة أحدث يُرفض ويُعاد له الأحدث بدل أن يمحوها.
CREATE OR REPLACE FUNCTION mr_push_state(p_code text, p_token text, p_state jsonb,
                                         p_scores jsonb, p_round int, p_version int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r   game_rooms;
  pid text;
  cur int;
BEGIN
  SELECT * INTO r FROM game_rooms WHERE code = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  pid := mr_seat_of(r.id, p_token);
  IF pid IS NULL THEN RETURN jsonb_build_object('error', 'not_member'); END IF;

  SELECT version INTO cur FROM room_game_state WHERE room_id = r.id;
  IF cur IS NOT NULL AND p_version <= cur THEN
    RETURN mr_public_room(r) || jsonb_build_object('you', pid, 'stale', true,
                                                   'is_host', mr_is_host(r.id, p_token));
  END IF;

  UPDATE room_game_state SET
    state_data    = COALESCE(p_state, state_data),
    scores        = COALESCE(p_scores, scores),
    current_round = COALESCE(p_round, current_round),
    version       = p_version,
    updated_at    = now(),
    updated_by    = pid
  WHERE room_id = r.id;

  UPDATE game_rooms SET updated_at = now() WHERE id = r.id;

  RETURN mr_public_room(r) || jsonb_build_object('you', pid,
                                                 'is_host', mr_is_host(r.id, p_token));
END;
$fn$;

-- بدء المباراة وإنهاؤها — للمضيف وحده
CREATE OR REPLACE FUNCTION mr_set_status(p_code text, p_token text, p_status text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r game_rooms;
BEGIN
  IF p_status NOT IN ('waiting', 'active', 'completed') THEN
    RETURN jsonb_build_object('error', 'bad_status');
  END IF;

  SELECT * INTO r FROM game_rooms WHERE code = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF NOT mr_is_host(r.id, p_token) THEN RETURN jsonb_build_object('error', 'not_host'); END IF;

  UPDATE game_rooms SET status = p_status, updated_at = now()
  WHERE id = r.id RETURNING * INTO r;

  RETURN mr_public_room(r) || jsonb_build_object('you', mr_seat_of(r.id, p_token),
                                                 'is_host', true);
END;
$fn$;

-- توزيع الفرق — للمضيف وحده
CREATE OR REPLACE FUNCTION mr_set_team(p_code text, p_token text,
                                       p_player_id text, p_team text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r game_rooms;
BEGIN
  IF p_team IS NOT NULL AND p_team NOT IN ('A', 'B') THEN
    RETURN jsonb_build_object('error', 'bad_team');
  END IF;

  SELECT * INTO r FROM game_rooms WHERE code = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF NOT mr_is_host(r.id, p_token) THEN RETURN jsonb_build_object('error', 'not_host'); END IF;

  UPDATE room_players SET team = p_team
  WHERE room_id = r.id AND player_id = p_player_id AND status = 'active';

  UPDATE game_rooms SET updated_at = now() WHERE id = r.id RETURNING * INTO r;
  RETURN mr_public_room(r) || jsonb_build_object('you', mr_seat_of(r.id, p_token),
                                                 'is_host', true);
END;
$fn$;

-- نقاط الفريق — لأي عضو (صاحب الدور يجيب فتتغيّر النقاط)
CREATE OR REPLACE FUNCTION mr_set_team_score(p_code text, p_token text,
                                             p_team text, p_score int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r game_rooms;
BEGIN
  IF p_team NOT IN ('A', 'B') THEN RETURN jsonb_build_object('error', 'bad_team'); END IF;

  SELECT * INTO r FROM game_rooms WHERE code = upper(btrim(p_code));
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF mr_seat_of(r.id, p_token) IS NULL THEN
    RETURN jsonb_build_object('error', 'not_member');
  END IF;

  UPDATE room_players SET score = p_score
  WHERE room_id = r.id AND team = p_team AND status = 'active';

  RETURN jsonb_build_object('ok', true);
END;
$fn$;

-- الطرد — للمضيف وحده، ولا يطرد نفسه
CREATE OR REPLACE FUNCTION mr_kick(p_code text, p_token text, p_player_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r game_rooms;
BEGIN
  SELECT * INTO r FROM game_rooms WHERE code = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF NOT mr_is_host(r.id, p_token) THEN RETURN jsonb_build_object('error', 'not_host'); END IF;

  IF p_player_id = mr_seat_of(r.id, p_token) THEN
    RETURN jsonb_build_object('error', 'self');
  END IF;

  UPDATE room_players SET status = 'kicked', left_at = now()
  WHERE room_id = r.id AND player_id = p_player_id;

  UPDATE game_rooms SET updated_at = now() WHERE id = r.id RETURNING * INTO r;
  RETURN mr_public_room(r) || jsonb_build_object('you', mr_seat_of(r.id, p_token),
                                                 'is_host', true);
END;
$fn$;

-- ⚠️ خروج المضيف يُنهي الروم: هو المقدّم والحَكَم، ولا معنى لبقائها بعده.
CREATE OR REPLACE FUNCTION mr_leave(p_code text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r       game_rooms;
  was_host boolean;
BEGIN
  SELECT * INTO r FROM game_rooms WHERE code = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true); END IF;

  was_host := mr_is_host(r.id, p_token);
  IF mr_seat_of(r.id, p_token) IS NULL THEN RETURN jsonb_build_object('ok', true); END IF;

  UPDATE room_players SET status = 'left', left_at = now()
  WHERE room_id = r.id AND token = p_token;

  IF was_host
     OR NOT EXISTS (SELECT 1 FROM room_players
                    WHERE room_id = r.id AND status = 'active') THEN
    UPDATE game_rooms SET status = 'completed', updated_at = now() WHERE id = r.id;
    RETURN jsonb_build_object('ok', true, 'closed', true);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$fn$;


-- ======================== الدفعة 8: الشات ========================

CREATE OR REPLACE FUNCTION mr_send_chat(p_code text, p_token text, p_message text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r   game_rooms;
  pid text;
  nm  text;
  row_out room_chat;
BEGIN
  IF p_message IS NULL OR btrim(p_message) = '' THEN
    RETURN jsonb_build_object('error', 'empty');
  END IF;

  SELECT * INTO r FROM game_rooms WHERE code = upper(btrim(p_code));
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  pid := mr_seat_of(r.id, p_token);
  IF pid IS NULL THEN RETURN jsonb_build_object('error', 'not_member'); END IF;

  -- ⚠️ الاسم يُقرأ من الجدول لا من المتصفح: وإلا انتحل أي عضو اسم غيره
  -- في الشات وهو داخل الروم فعلاً.
  SELECT player_name INTO nm FROM room_players
  WHERE room_id = r.id AND player_id = pid;

  INSERT INTO room_chat (room_id, player_id, player_name, message, reactions)
  VALUES (r.id, pid, nm, left(btrim(p_message), 500), '{}'::jsonb)
  RETURNING * INTO row_out;

  RETURN jsonb_build_object('message', jsonb_build_object(
    'id', row_out.id, 'player_id', row_out.player_id,
    'player_name', row_out.player_name, 'message', row_out.message,
    'reactions', row_out.reactions, 'created_at', row_out.created_at));
END;
$fn$;

-- تفاعل. ⚠️ يضيف/يزيل **معرّف المنادي وحده** — الكود القديم كان يقرأ
-- الرسالة ويعيد كتابة كامل حقل `reactions` من المتصفح، أي أن أي شخص
-- يقدر يزوّر تفاعلات باسم غيره أو يمحو تفاعلات الجميع.
CREATE OR REPLACE FUNCTION mr_react(p_code text, p_token text,
                                    p_message_id text, p_emoji text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r    game_rooms;
  pid  text;
  cur  jsonb;
  lst  jsonb;
BEGIN
  IF p_emoji IS NULL OR length(p_emoji) > 8 THEN
    RETURN jsonb_build_object('error', 'bad_emoji');
  END IF;

  SELECT * INTO r FROM game_rooms WHERE code = upper(btrim(p_code));
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  pid := mr_seat_of(r.id, p_token);
  IF pid IS NULL THEN RETURN jsonb_build_object('error', 'not_member'); END IF;

  -- الرسالة يجب أن تكون في **هذه** الروم
  SELECT reactions INTO cur FROM room_chat
  WHERE id = p_message_id AND room_id = r.id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'no_message'); END IF;

  cur := COALESCE(cur, '{}'::jsonb);
  lst := COALESCE(cur -> p_emoji, '[]'::jsonb);

  IF lst @> to_jsonb(pid) THEN
    lst := COALESCE((SELECT jsonb_agg(v) FROM jsonb_array_elements(lst) v
                     WHERE v <> to_jsonb(pid)), '[]'::jsonb);
  ELSE
    lst := lst || to_jsonb(pid);
  END IF;

  IF jsonb_array_length(lst) = 0 THEN cur := cur - p_emoji;
  ELSE cur := cur || jsonb_build_object(p_emoji, lst);
  END IF;

  UPDATE room_chat SET reactions = cur WHERE id = p_message_id;
  RETURN jsonb_build_object('ok', true, 'reactions', cur);
END;
$fn$;


-- ======================== الدفعة 9: الإدارة ========================

-- إغلاق كل الرومات المفتوحة — للإدمن وحده (`is_admin()` من
-- `supabase-accounts.sql`). الكود القديم كان يفعلها بسياسة مفتوحة، أي أن
-- أي زائر يقدر يُغلق رومات الناس وهم يلعبون.
CREATE OR REPLACE FUNCTION mr_admin_close_rooms()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  n int;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'غير مصرّح: هذه العملية للإدمن فقط';
  END IF;

  SELECT count(*) INTO n FROM game_rooms WHERE status <> 'completed';

  UPDATE room_players SET status = 'left', left_at = now()
  WHERE status = 'active'
    AND room_id IN (SELECT id FROM game_rooms WHERE status <> 'completed');

  UPDATE game_rooms SET status = 'completed', updated_at = now()
  WHERE status <> 'completed';

  RETURN jsonb_build_object('closed', n);
END;
$fn$;

CREATE OR REPLACE FUNCTION mr_admin_room_count()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'غير مصرّح: هذه العملية للإدمن فقط';
  END IF;
  RETURN jsonb_build_object(
    'open',  (SELECT count(*) FROM game_rooms WHERE status <> 'completed'),
    'total', (SELECT count(*) FROM game_rooms));
END;
$fn$;


-- ======================== الدفعة 10: الصلاحيات ========================

REVOKE ALL ON FUNCTION mr_create_room(text, text, text, jsonb)          FROM public;
REVOKE ALL ON FUNCTION mr_join_room(text, text, text)                   FROM public;
REVOKE ALL ON FUNCTION mr_snapshot(text, text)                          FROM public;
REVOKE ALL ON FUNCTION mr_chat(text, text, timestamptz)                 FROM public;
REVOKE ALL ON FUNCTION mr_push_state(text, text, jsonb, jsonb, int, int) FROM public;
REVOKE ALL ON FUNCTION mr_set_status(text, text, text)                  FROM public;
REVOKE ALL ON FUNCTION mr_set_team(text, text, text, text)              FROM public;
REVOKE ALL ON FUNCTION mr_set_team_score(text, text, text, int)         FROM public;
REVOKE ALL ON FUNCTION mr_kick(text, text, text)                        FROM public;
REVOKE ALL ON FUNCTION mr_leave(text, text)                             FROM public;
REVOKE ALL ON FUNCTION mr_send_chat(text, text, text)                   FROM public;
REVOKE ALL ON FUNCTION mr_react(text, text, text, text)                 FROM public;
REVOKE ALL ON FUNCTION mr_admin_close_rooms()                           FROM public;
REVOKE ALL ON FUNCTION mr_admin_room_count()                            FROM public;

GRANT EXECUTE ON FUNCTION mr_create_room(text, text, text, jsonb)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mr_join_room(text, text, text)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mr_snapshot(text, text)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mr_chat(text, text, timestamptz)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mr_push_state(text, text, jsonb, jsonb, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mr_set_status(text, text, text)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mr_set_team(text, text, text, text)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mr_set_team_score(text, text, text, int)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mr_kick(text, text, text)                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mr_leave(text, text)                             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mr_send_chat(text, text, text)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mr_react(text, text, text, text)                 TO anon, authenticated;

-- الإدارة للمسجّلين فقط، والدالة نفسها تفحص `is_admin()` بعدها
GRANT EXECUTE ON FUNCTION mr_admin_close_rooms() TO authenticated;
GRANT EXECUTE ON FUNCTION mr_admin_room_count()  TO authenticated;

-- الدوال الداخلية لا تُنادى من المتصفح
REVOKE ALL ON FUNCTION mr_new_code()                    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION mr_public_room(game_rooms)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION mr_seat_of(text, text)           FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION mr_is_host(text, text)           FROM public, anon, authenticated;


-- ======================== الدفعة 11: التحقق ========================
-- المتوقّع: الجداول الأربعة RLS مفعّلة، **صفر** سياسات، ولا صلاحية جدول
-- لـ anon/authenticated، واثنتا عشرة دالة قابلة للتنفيذ من anon.

SELECT c.relname, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies
FROM pg_class c
WHERE c.relname IN ('game_rooms','room_players','room_chat','room_game_state');

-- المتوقّع: صفر صفوف
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('game_rooms','room_players','room_chat','room_game_state')
  AND grantee IN ('anon', 'authenticated');

SELECT p.proname, r.rolname AS granted_to
FROM pg_proc p
CROSS JOIN LATERAL (VALUES ('anon'), ('authenticated')) AS r(rolname)
WHERE p.proname LIKE 'mr\_%'
  AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
ORDER BY p.proname, r.rolname;


-- ============================================================================
-- ↩️ العودة للسياسات المفتوحة (لا تفعلها إلا لضرورة — تُعيد التسريب كما كان)
-- ============================================================================
-- GRANT ALL ON game_rooms, room_players, room_chat, room_game_state
--   TO anon, authenticated;
-- CREATE POLICY "allow_public_read_rooms"  ON game_rooms      FOR SELECT USING (true);
-- CREATE POLICY "allow_public_read_players" ON room_players   FOR SELECT USING (true);
-- CREATE POLICY "allow_public_read_chat"   ON room_chat       FOR SELECT USING (true);
-- CREATE POLICY "allow_public_read_state"  ON room_game_state FOR SELECT USING (true);
-- …وبقية سياسات INSERT/UPDATE كما في supabase-setup.sql
