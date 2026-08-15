-- ============================================================================
--  الحظر (Ban) — منع لاعب وجهازه من العودة للعبة أو إنشاء حساب جديد
-- ============================================================================
--
--  ⚠️ شغّل كل «دفعة» وحدها (الملاحظة 11 في PLAN.md): محرر Supabase ينفّذ
--  اللصقة كمعاملة واحدة، فخطأ في أمر واحد يُلغي كل شيء بصمت.
--
--  ♻️ **إعادة التشغيل آمنة**: كل أمر هنا إمّا IF NOT EXISTS أو
--  CREATE OR REPLACE أو DROP ثم CREATE. لا يضيع شيء ولا يُرفع حظر قائم.
--  (شغّلته قبل التصحيح؟ أعد الدفعات **2 و3 و5** — أُضيف عمود covers_devices
--   الذي يجعل خيار «احظر أجهزته» صادقاً، وقبله كان الجهاز يُحجب دائماً.)
--
-- ----------------------------------------------------------------------------
--  ما الذي يُحظر فعلاً — اقرأ هذا قبل أن تعتمد على الميزة
-- ----------------------------------------------------------------------------
--  الحظر ثلاث طبقات، وقوّتها ليست واحدة:
--
--  1) **الحساب** (user_id) — لا يُنتحل. مفروض في قاعدة البيانات نفسها عبر
--     السياسات أسفل هذا الملف: المحظور لا ينشئ روماً ولا يدخل واحدة مهما
--     عبث بالمتصفح، لأن auth.uid() يأتي من الجلسة الموقّعة لا من كوده.
--
--  2) **معرّف الجهاز** (mr_device_id في localStorage) — يمنع «إنشاء حساب
--     جديد من نفس الجهاز». يكسره من يمسح بيانات الموقع أو يفتح نافذة خاصة.
--
--  3) **بصمة الجهاز** (نوع الجهاز + الشاشة + المتصفح + المنطقة الزمنية +
--     رسم canvas) — تبقى بعد مسح التخزين وفي النافذة الخاصة، وهي التي تجعل
--     الحظر «حقيقياً» عملياً أمام لاعب عادي.
--
--     ⚠️ **وهي الوحيدة التي قد تُخطئ**: جهازان متطابقان تماماً (نفس موديل
--     الجوال ونفس النظام ونفس المتصفح ونفس المنطقة) قد يعطيان البصمة نفسها،
--     فيُحظر بريء. لذلك حظر البصمة **اختياري** في اللوحة، ورفعه بضغطة.
--
--  الخلاصة الصادقة: هذا يوقف الشخص المزعج العادي تماماً. ولا يوجد — بلا
--  خادم خاص وتحقّق بالهوية — ما يوقف مبرمجاً مصمّماً على العودة.
-- ============================================================================


-- ======================== الدفعة 1: ربط الأجهزة بالحسابات ========================
-- بدون هذا الجدول يكون الحظر بلا ذاكرة: تحظر الحساب فيعود صاحبه بحساب جديد
-- من نفس الجهاز، أو تحظر الجهاز فيعود بحسابه القديم من جهاز آخر. هنا نسجّل
-- «من لعب من أين» فيمتدّ الحظر على السلسلة كلها.

CREATE TABLE IF NOT EXISTS device_accounts (
  device_id   TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint TEXT,
  first_seen  TIMESTAMPTZ DEFAULT now(),
  last_seen   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (device_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_device_accounts_user ON device_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_device_accounts_fp   ON device_accounts (fingerprint);

ALTER TABLE device_accounts ENABLE ROW LEVEL SECURITY;

-- لا سياسة كتابة إطلاقاً: التسجيل يمرّ بدالة register_device() وحدها.
-- ولا سياسة قراءة لغير الإدارة: من لعب من أي جهاز ليس شأن بقية اللاعبين.
DROP POLICY IF EXISTS "device_accounts_read_admin" ON device_accounts;
CREATE POLICY "device_accounts_read_admin" ON device_accounts
  FOR SELECT TO authenticated USING (public.is_admin());


-- ======================== الدفعة 2: جدول الحظر ========================
--
-- ⚠️ **بلا مفتاح أجنبي على user_id عمداً**: لو ربطناه بـ auth.users مع
-- ON DELETE CASCADE لاختفى سجلّ الحظر لحظة حذف الحساب — أي أن حذف الحساب
-- يرفع الحظر عنه، وهو عكس المقصود تماماً. الحظر يجب أن يبقى بعد الحذف.
-- ولهذا أيضاً نحفظ الاسم وقت الحظر: بعد حذف الحساب لا يبقى ما يُعرَف به.

CREATE TABLE IF NOT EXISTS bans (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID,
  device_id     TEXT,
  fingerprint   TEXT,
  username      TEXT,              -- الاسم وقت الحظر (لقراءة اللوحة فقط)
  reason        TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  created_by    UUID,
  lifted_at     TIMESTAMPTZ,
  CONSTRAINT bans_needs_target CHECK (
    user_id IS NOT NULL OR device_id IS NOT NULL OR fingerprint IS NOT NULL
  )
);

-- ⚠️ **العمود الذي يجعل خيار «احظر أجهزته» صادقاً.** بدونه كان حظر الحساب
-- يحجب جهازه دائماً بقاعدة السلسلة في check_ban، سواء أطفأت الخيار أم لا —
-- أي أن من أراد حظر شخص بعينه دون أن يمسّ الجهاز الذي يشاركه إخوته، لم يكن
-- يجد سبيلاً لذلك. (تُضاف بـ ALTER لأن الجدول قد يكون أُنشئ قبل هذا التصحيح.)
ALTER TABLE bans ADD COLUMN IF NOT EXISTS covers_devices BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_bans_user   ON bans (user_id)     WHERE active;
CREATE INDEX IF NOT EXISTS idx_bans_device ON bans (device_id)   WHERE active;
CREATE INDEX IF NOT EXISTS idx_bans_fp     ON bans (fingerprint) WHERE active;

ALTER TABLE bans ENABLE ROW LEVEL SECURITY;

-- القراءة للإدارة وحدها، والكتابة عبر الدوال فقط.
-- ⚠️ لو فتحنا القراءة للاعبين لصار كل واحد يعرف بصمات أجهزة الآخرين.
DROP POLICY IF EXISTS "bans_read_admin" ON bans;
CREATE POLICY "bans_read_admin" ON bans
  FOR SELECT TO authenticated USING (public.is_admin());


-- ======================== الدفعة 3: دوال الفحص ========================

-- هل صاحب الجلسة الحالية محظور؟ تُستعمل داخل السياسات، فلا تأخذ أي شيء من
-- المتصفح: لا معرّف جهاز ولا بصمة — auth.uid() فقط، وهو ما لا يُنتحل.
CREATE OR REPLACE FUNCTION public.is_banned_now()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT EXISTS (
    -- حظر مباشر على الحساب
    SELECT 1 FROM bans WHERE active AND user_id = auth.uid()
  ) OR EXISTS (
    -- أو حظر على جهاز/بصمة سبق أن دخل منه هذا الحساب
    SELECT 1
      FROM device_accounts da
      JOIN bans b ON b.active AND (
             b.device_id = da.device_id
          OR (b.fingerprint IS NOT NULL AND b.fingerprint = da.fingerprint)
      )
     WHERE da.user_id = auth.uid()
  );
$fn$;

-- الفحص الكامل الذي يناديه المتصفح عند فتح اللعبة: يشمل الجهاز والبصمة
-- قبل تسجيل الدخول أصلاً، فالمحظور يُوقَف عند الباب لا بعد الدخول.
-- تُرجع السبب أيضاً حتى يعرف الشخص لماذا — لا شاشة صمت.
CREATE OR REPLACE FUNCTION public.check_ban(
  p_device TEXT DEFAULT NULL,
  p_fingerprint TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
DECLARE
  v_reason TEXT;
BEGIN
  -- 1) حظر مباشر: الحساب أو الجهاز أو البصمة
  SELECT reason INTO v_reason
    FROM bans
   WHERE active AND (
         (user_id IS NOT NULL AND user_id = auth.uid())
      OR (device_id IS NOT NULL AND p_device IS NOT NULL AND device_id = p_device)
      OR (fingerprint IS NOT NULL AND p_fingerprint IS NOT NULL AND fingerprint = p_fingerprint)
   )
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('banned', true, 'reason', COALESCE(v_reason, ''));
  END IF;

  -- 2) حساب محظور سبق أن لعب من هذا الجهاز → الجهاز محجوب بالتبعية.
  --    هذا ما يمنع «حساب جديد من نفس الجهاز».
  --    ⚠️ covers_devices شرط لا زينة: من حُظر حسابه وحده (بلا أجهزته) لا
  --    يجوز أن يُحجب الجهاز الذي يشاركه غيره في البيت.
  IF p_device IS NOT NULL OR p_fingerprint IS NOT NULL THEN
    SELECT b.reason INTO v_reason
      FROM device_accounts da
      JOIN bans b ON b.active AND b.user_id = da.user_id AND b.covers_devices
     WHERE (p_device IS NOT NULL AND da.device_id = p_device)
        OR (p_fingerprint IS NOT NULL AND da.fingerprint = p_fingerprint)
     LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('banned', true, 'reason', COALESCE(v_reason, ''));
    END IF;
  END IF;

  -- 3) الحساب الحالي سبق أن دخل من جهاز محظور
  IF auth.uid() IS NOT NULL AND public.is_banned_now() THEN
    SELECT b.reason INTO v_reason
      FROM device_accounts da
      JOIN bans b ON b.active AND (
             b.device_id = da.device_id
          OR (b.fingerprint IS NOT NULL AND b.fingerprint = da.fingerprint)
      )
     WHERE da.user_id = auth.uid()
     LIMIT 1;

    RETURN jsonb_build_object('banned', true, 'reason', COALESCE(v_reason, ''));
  END IF;

  RETURN jsonb_build_object('banned', false);
END;
$fn$;

-- anon أيضاً: الفحص يجري قبل تسجيل الدخول، وإلا مرّ المحظور من شاشة الدخول
GRANT EXECUTE ON FUNCTION public.check_ban(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_banned_now()       TO anon, authenticated;


-- ======================== الدفعة 4: تسجيل الجهاز ========================
-- تُنادى بعد كل دخول ناجح. تربط الجهاز بالحساب (لذاكرة الحظر) وتُرجع نتيجة
-- الفحص في النداء نفسه — نداء واحد لا اثنان.

CREATE OR REPLACE FUNCTION public.register_device(
  p_device TEXT,
  p_fingerprint TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR p_device IS NULL OR p_device = '' THEN
    RETURN public.check_ban(p_device, p_fingerprint);
  END IF;

  INSERT INTO device_accounts (device_id, user_id, fingerprint)
  VALUES (p_device, auth.uid(), p_fingerprint)
  ON CONFLICT (device_id, user_id) DO UPDATE
    SET last_seen   = now(),
        fingerprint = COALESCE(EXCLUDED.fingerprint, device_accounts.fingerprint);

  RETURN public.check_ban(p_device, p_fingerprint);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.register_device(TEXT, TEXT) TO authenticated;


-- ======================== الدفعة 5: الحظر من اللوحة ========================
-- الحظر يشمل — باختيار الإدمن — كل جهاز وبصمة سبق أن دخل منها هذا الحساب،
-- ويُخرجه فوراً من أي روم هو فيها الآن بدل انتظاره حتى يُحدّث الصفحة.

CREATE OR REPLACE FUNCTION public.admin_ban_player(
  target_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_ban_devices BOOLEAN DEFAULT true,
  p_ban_fingerprint BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name    TEXT;
  v_devices INT := 0;
  v_fps     INT := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرّح: هذه العملية للإدمن فقط';
  END IF;

  -- حاجزان يمنعان قفل اللوحة على الجميع
  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'لا يمكنك حظر نفسك';
  END IF;
  IF EXISTS (SELECT 1 FROM admins WHERE user_id = target_id) THEN
    RAISE EXCEPTION 'لا يمكن حظر حساب إدمن — أزل صلاحيته أولاً';
  END IF;

  SELECT username INTO v_name FROM profiles WHERE id = target_id;

  -- الحساب نفسه (لا نكرّر حظراً قائماً)
  IF NOT EXISTS (SELECT 1 FROM bans WHERE active AND user_id = target_id) THEN
    INSERT INTO bans (user_id, username, reason, created_by, covers_devices)
    VALUES (target_id, v_name, NULLIF(btrim(COALESCE(p_reason, '')), ''),
            auth.uid(), COALESCE(p_ban_devices, true));

  ELSIF COALESCE(p_ban_devices, true) THEN
    -- محظور أصلاً بنطاق أضيق، والإدمن يعيد حظره بنطاق أوسع: نوسّعه فعلاً
    -- بدل أن يُهمل النداء بصمت فيظنّ أن الجهاز حُجب وهو لم يُحجب.
    UPDATE bans SET covers_devices = true
     WHERE active AND user_id = target_id AND NOT covers_devices;
  END IF;

  -- أجهزته
  IF p_ban_devices THEN
    INSERT INTO bans (device_id, username, reason, created_by)
    SELECT DISTINCT da.device_id, v_name,
           NULLIF(btrim(COALESCE(p_reason, '')), ''), auth.uid()
      FROM device_accounts da
     WHERE da.user_id = target_id
       AND NOT EXISTS (
             SELECT 1 FROM bans b
              WHERE b.active AND b.device_id = da.device_id
           );
    GET DIAGNOSTICS v_devices = ROW_COUNT;
  END IF;

  -- بصماته (⚠️ قد تشمل جهازاً آخر مطابقاً تماماً — راجع رأس الملف)
  IF p_ban_fingerprint THEN
    INSERT INTO bans (fingerprint, username, reason, created_by)
    SELECT DISTINCT da.fingerprint, v_name,
           NULLIF(btrim(COALESCE(p_reason, '')), ''), auth.uid()
      FROM device_accounts da
     WHERE da.user_id = target_id
       AND da.fingerprint IS NOT NULL
       AND NOT EXISTS (
             SELECT 1 FROM bans b
              WHERE b.active AND b.fingerprint = da.fingerprint
           );
    GET DIAGNOSTICS v_fps = ROW_COUNT;
  END IF;

  -- إخراجه من الرومات الآن: السياسات تمنع الدخول لاحقاً، لكن من هو داخل
  -- بالفعل يبقى يلعب إلى أن يُحدّث الصفحة لولا هذا.
  UPDATE room_players
     SET status = 'kicked', left_at = now(), is_host = false
   WHERE user_id = target_id AND status <> 'kicked';

  RETURN jsonb_build_object(
    'ok', true,
    'username', COALESCE(v_name, ''),
    'devices', v_devices,
    'fingerprints', v_fps
  );
END;
$fn$;

-- رفع الحظر: عن الحساب وعن كل ما سُجّل معه في نفس العملية
CREATE OR REPLACE FUNCTION public.admin_unban_player(target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count INT := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرّح: هذه العملية للإدمن فقط';
  END IF;

  UPDATE bans
     SET active = false, lifted_at = now()
   WHERE active
     AND (
       user_id = target_id
       OR device_id IN (SELECT device_id FROM device_accounts WHERE user_id = target_id)
       OR fingerprint IN (
            SELECT fingerprint FROM device_accounts
             WHERE user_id = target_id AND fingerprint IS NOT NULL
          )
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'lifted', v_count);
END;
$fn$;

-- رفع سطر حظر واحد بعينه (لجهاز أو بصمة بلا حساب — مثلاً بريء وقع في بصمة)
CREATE OR REPLACE FUNCTION public.admin_unban_row(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرّح: هذه العملية للإدمن فقط';
  END IF;

  UPDATE bans SET active = false, lifted_at = now() WHERE id = p_id AND active;
  RETURN FOUND;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_ban_player(UUID, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_unban_player(UUID)                       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_unban_row(BIGINT)                        FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_ban_player(UUID, TEXT, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_player(UUID)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_row(BIGINT)                        TO authenticated;


-- ======================== الدفعة 6: فرض الحظر في القاعدة ========================
--
-- ⚠️ **هذه الدفعة هي الفرق بين حظر حقيقي وحظر شكلي.** فحص المتصفح وحده
-- يلتفّ عليه أي أحد بأدوات المطوّر. هنا يُرفض المحظور من قاعدة البيانات
-- نفسها: لا ينشئ روماً، ولا يدخل واحدة، ولو زوّر كل ما في متصفحه.

DROP POLICY IF EXISTS "rooms_insert_authed" ON game_rooms;
CREATE POLICY "rooms_insert_authed" ON game_rooms
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND NOT public.is_banned_now());

-- نفس شرط الملف supabase-rooms-security-2.sql مضافاً إليه الحظر
DROP POLICY IF EXISTS "players_insert_self" ON room_players;
CREATE POLICY "players_insert_self" ON room_players
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT public.is_banned_now()
    AND (
      is_host = false
      OR EXISTS (
        SELECT 1 FROM game_rooms r
        WHERE r.id = room_id AND r.host_player_id = player_id
      )
    )
  );

-- والشات كذلك: المحظور الذي بقيت صفحته مفتوحة لا يواصل الكتابة.
--
-- ⚠️ **نفس الاسم القديم عمداً** (chat_insert_self من الملف 2): سياسات
-- الإدخال المتعدّدة تُجمع بـ OR، فلو أضفنا سياسة ثانية باسم جديد لبقيت
-- القديمة تسمح للمحظور — والحظر لا يفعل شيئاً. الاستبدال لا الإضافة.
DROP POLICY IF EXISTS "chat_insert_self" ON room_chat;
CREATE POLICY "chat_insert_self" ON room_chat
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_room_member(room_id)
    AND NOT public.is_banned_now()
  );


-- ============================================================================
--  للتحقق بعد التشغيل
-- ============================================================================
-- SELECT count(*) AS دوال FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname IN
--    ('is_banned_now','check_ban','register_device','admin_ban_player',
--     'admin_unban_player','admin_unban_row');            -- المتوقع: 6
-- SELECT check_ban('اختبار','اختبار');                     -- المتوقع: {"banned": false}
-- SELECT id, username, device_id, fingerprint, active FROM bans ORDER BY id DESC;
--
-- ↩️ للتراجع عن الفرض في الدفعة 6 (يُعيد السياسات كما كانت في الملف 2):
-- DROP POLICY IF EXISTS "rooms_insert_authed" ON game_rooms;
-- CREATE POLICY "rooms_insert_authed" ON game_rooms
--   FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
