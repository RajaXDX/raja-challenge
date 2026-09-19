-- ============================================================================
-- حسابات اللاعبين + صلاحية الإدمن — يُشغَّل مرة واحدة في Supabase → SQL Editor
-- ============================================================================
--
-- ⚠️ مهم عن كلمات المرور:
-- لا نخزّن كلمة المرور في أي جدول من جداولنا إطلاقاً. التسجيل والدخول يتمّان
-- عبر Supabase Auth الذي يحفظ الكلمة مشفّرة (bcrypt) في مخطط auth المحمي.
-- لذلك لوحة الإدارة تعرض اسم المستخدم فقط — كلمة المرور لا يمكن عرضها لأنها
-- ببساطة غير موجودة كنص في أي مكان، ولا حتى نحن نستطيع قراءتها. هذا هو الصحيح.
--
-- ============================================================================
-- خطوة يدوية مطلوبة قبل التشغيل
-- ============================================================================
-- Supabase → Authentication → Sign In / Providers → Email
--   • عطّل "Confirm email"  (اللاعبون يسجّلون باسم مستخدم لا ببريد حقيقي،
--     فلن تصل رسالة تأكيد ولن يستطيعوا الدخول إن بقي مفعّلاً)
-- ============================================================================


-- ============================= 1) جدول الملفات الشخصية =============================
-- بيانات اللاعب المرئية وإحصاءاته. مرتبط بحساب Auth ويُحذف بحذفه.
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  last_seen_at  TIMESTAMPTZ DEFAULT now(),
  games_played  INTEGER DEFAULT 0,
  games_won     INTEGER DEFAULT 0,
  total_score   BIGINT  DEFAULT 0,
  rooms_created INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username);


-- ============================= 2) جدول الإدمن =============================
-- من هو الإدمن؟ عضوية في هذا الجدول — لا يكفي أن يكون "مسجّل دخول"،
-- لأن كل اللاعبين صاروا مسجّلين بعد إضافة الحسابات.
CREATE TABLE IF NOT EXISTS admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now()
);

-- دالة مساعدة تُستخدم في السياسات
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid());
$$;


-- ============================= 3) سياسات الملفات الشخصية =============================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- الأسماء مقروءة للجميع (تظهر في قائمة اللاعبين داخل الروم)
DROP POLICY IF EXISTS "profiles_read_public" ON profiles;
CREATE POLICY "profiles_read_public" ON profiles
  FOR SELECT USING (true);

-- كل لاعب ينشئ ملفه هو فقط
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ويعدّل ملفه هو فقط (أو الإدمن)
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR is_admin())
  WITH CHECK (auth.uid() = id OR is_admin());


-- ============================= 4) سياسات جدول الإدمن =============================
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- الإدمن وحده يرى القائمة. لا سياسة كتابة إطلاقاً:
-- إضافة إدمن جديد تتم من محرر SQL هنا فقط، لا من التطبيق.
DROP POLICY IF EXISTS "admins_read_admin" ON admins;
CREATE POLICY "admins_read_admin" ON admins
  FOR SELECT TO authenticated USING (is_admin());


-- ============================= 5) حذف حساب لاعب =============================
-- حذف مستخدم من auth.users يتطلّب صلاحية عليا لا يجوز أن تصل للمتصفح أبداً.
-- الحل: دالة SECURITY DEFINER تتحقّق أن المنادي إدمن ثم تحذف داخل قاعدة البيانات.
CREATE OR REPLACE FUNCTION admin_delete_player(target_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرّح: هذه العملية للإدمن فقط';
  END IF;

  IF EXISTS (SELECT 1 FROM admins WHERE user_id = target_id) THEN
    RAISE EXCEPTION 'لا يمكن حذف حساب إدمن من التطبيق';
  END IF;

  DELETE FROM auth.users WHERE id = target_id;  -- profiles تُحذف تلقائياً بالـ CASCADE
END;
$$;

REVOKE ALL ON FUNCTION admin_delete_player(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_player(UUID) TO authenticated;


-- ============================= 6) تضييق صلاحية بنك الأسئلة =============================
-- ⚠️ ضروري: السياسات السابقة كانت تمنح الكتابة لأي "authenticated".
-- بعد إضافة حسابات اللاعبين صار كل لاعب authenticated — أي أن أي لاعب
-- كان سيقدر يعدّل بنك الأسئلة والفئات لكل الناس. نقصرها على الإدمن.
DROP POLICY IF EXISTS "insert_settings_authenticated" ON game_settings;
DROP POLICY IF EXISTS "update_settings_authenticated" ON game_settings;
DROP POLICY IF EXISTS "delete_settings_authenticated" ON game_settings;

DROP POLICY IF EXISTS "insert_settings_admin" ON game_settings;
CREATE POLICY "insert_settings_admin" ON game_settings
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "update_settings_admin" ON game_settings;
CREATE POLICY "update_settings_admin" ON game_settings
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "delete_settings_admin" ON game_settings;
CREATE POLICY "delete_settings_admin" ON game_settings
  FOR DELETE TO authenticated USING (is_admin());

-- نفس الشيء لقراءة التحليلات
DROP POLICY IF EXISTS "read_events_authenticated" ON app_events;
DROP POLICY IF EXISTS "read_events_admin" ON app_events;
CREATE POLICY "read_events_admin" ON app_events
  FOR SELECT TO authenticated USING (is_admin());


-- ============================================================================
-- 7) سجّل حساب الإدارة — باسم المستخدم لا بالبريد
-- ============================================================================
-- الصلاحية مربوطة بالعضوية في admins، لا بالبريد. غيّر 'vip' لاسم حسابك.
-- ملاحظة: الحساب لازم يكون مسجّلاً من شاشة اللعبة أولاً حتى يوجد له صف
-- في profiles.
INSERT INTO admins (user_id)
SELECT id FROM profiles WHERE username = 'vip'
ON CONFLICT (user_id) DO NOTHING;


-- ============================================================================
-- للتحقق بعد التشغيل
-- ============================================================================
-- SELECT count(*) AS عدد_الإدمن FROM admins;              -- المتوقع: 1
-- SELECT is_admin();                                       -- المتوقع: true
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles';


-- ============================================================================
-- 8) ترقية لاعب لإدمن / إزالة الصلاحية — من لوحة الإدارة
-- ============================================================================
-- جدول admins بلا سياسة كتابة عمداً: لو فتحناها لـ authenticated لصار أي لاعب
-- قادراً على ترقية نفسه. الكتابة تمرّ عبر هذه الدالة وحدها، وهي تتحقّق أن
-- المنادي إدمن قبل أي شيء.
CREATE OR REPLACE FUNCTION admin_set_admin(target_id UUID, make_admin BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرّح: هذه العملية للإدمن فقط';
  END IF;

  IF make_admin THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = target_id) THEN
      RAISE EXCEPTION 'الحساب غير موجود';
    END IF;
    INSERT INTO admins (user_id) VALUES (target_id) ON CONFLICT (user_id) DO NOTHING;
  ELSE
    -- حاجزان يمنعان قفل اللوحة على الجميع
    IF target_id = auth.uid() THEN
      RAISE EXCEPTION 'لا يمكنك إزالة صلاحيتك بنفسك';
    END IF;
    IF (SELECT count(*) FROM admins) <= 1 THEN
      RAISE EXCEPTION 'لا يمكن إزالة آخر إدمن';
    END IF;
    DELETE FROM admins WHERE user_id = target_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION admin_set_admin(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_admin(UUID, BOOLEAN) TO authenticated;


-- ============================================================================
-- 9) حذف اللاعب لحسابه بنفسه — أُضيف 2026-09-06
-- ============================================================================
-- ⚠️ **شرط قبول في App Store، لا ميزة اختيارية.** بند 5.1.1(v) يوجب أن
-- يستطيع كل من أنشأ حساباً داخل التطبيق أن يحذفه من داخل التطبيق أيضاً —
-- لا برسالة بريد ولا بنموذج على الويب. وكانت لدينا `admin_delete_player`
-- للإدارة وحدها، فلا سبيل للاعب أن يحذف حسابه إطلاقاً.
--
-- حذف صفّ من auth.users يتطلّب صلاحية عليا لا يجوز أن تصل للمتصفح، فالحذف
-- يتم هنا داخل القاعدة. الدالة لا تأخذ معرّفاً: تحذف `auth.uid()` وحده،
-- فلا يمكن استعمالها لحذف حساب غيرك مهما أُرسل لها.
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  me UUID := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'غير مسجّل دخول';
  END IF;

  -- آخر إدمن لا يحذف نفسه، وإلا بقيت اللوحة بلا صاحب ولا سبيل لاستعادتها
  -- إلا من محرر SQL.
  IF EXISTS (SELECT 1 FROM admins WHERE user_id = me)
     AND (SELECT count(*) FROM admins) <= 1 THEN
    RAISE EXCEPTION 'أنت آخر إدمن — رقِّ غيرك قبل حذف حسابك';
  END IF;

  -- الصداقات ليست عليها CASCADE من profiles، فنحذفها صراحةً وإلا بقيت
  -- صفوف تشير إلى حساب لم يعد موجوداً.
  DELETE FROM friendships WHERE requester_id = me OR addressee_id = me;

  -- profiles تُحذف تلقائياً بالـ CASCADE على auth.users
  DELETE FROM auth.users WHERE id = me;
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;
