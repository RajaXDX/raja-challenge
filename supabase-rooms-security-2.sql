-- ============================================================================
--  أمان الرومات — المرحلة 2: السياسات (هذه هي التي تُغلق الثغرة)
-- ============================================================================
--
--  ⛔ **لا تشغّل هذا الملف إلا بعد**:
--     1. تشغيل supabase-rooms-security-1.sql بالكامل ونجاح استعلام تحققه
--     2. نشر الكود الجديد فعلاً على GitHub Pages ووصوله للاعبين
--     3. إغلاق الرومات المفتوحة من لوحة الإدارة (🧹 تنظيف الرومات)
--
--  السبب: صفوف الرومات القديمة user_id = NULL فلن يعرفها أصحابها بعد الآن،
--  والكود القديم يوزّع الفرق بتحديث مباشر سيُرفض بعد هذا الملف.
--
--  ⚠️ شغّل كل دفعة وحدها (الملاحظة 11 في PLAN.md).
--
--  ↩️ **للتراجع**: في آخر الملف دفعة «العودة» تُرجع الحال كما كان.
--
-- ============================================================================


-- ======================== الدفعة 1: إسقاط المفتوح ========================

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


-- ======================== الدفعة 2: منع غير المسجّل ========================
-- كل لاعب أونلاين مسجّل دخوله (REQUIRE_ACCOUNT_FOR_ONLINE)، فلا حاجة لـ anon
-- إطلاقاً. واللاعب المحلي لا يصل هذه الجداول أصلاً.
-- ⚠️ هذا وحده يُسقط أخطر ما في الثغرة: من يقرأ المفتاح المنشور من المصدر
-- ولا يملك حساباً لم يعد يرى شيئاً.

REVOKE ALL ON game_rooms      FROM anon;
REVOKE ALL ON room_players    FROM anon;
REVOKE ALL ON room_chat       FROM anon;
REVOKE ALL ON room_game_state FROM anon;


-- ======================== الدفعة 3: الرومات ========================

-- القراءة للأعضاء وحدهم. والدخول بالكود يمرّ بـ find_room_by_code()
-- فلا يحتاج قراءة مباشرة — ولا يستطيع أحد تعداد الرومات.
CREATE POLICY "rooms_read_members" ON game_rooms
  FOR SELECT TO authenticated
  USING (public.is_room_member(id));

CREATE POLICY "rooms_insert_authed" ON game_rooms
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- التعديل للمضيف وحده (بدء الجولة يضبط status = 'active')
CREATE POLICY "rooms_update_host" ON game_rooms
  FOR UPDATE TO authenticated
  USING (public.is_room_host(id))
  WITH CHECK (public.is_room_host(id));

-- الحذف للإدارة وحدها. كان مفتوحاً للجميع.
CREATE POLICY "rooms_delete_admin" ON game_rooms
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- لوحة الإدارة تُغلق الرومات القديمة، وهي ليست مضيفاً لها
CREATE POLICY "rooms_admin_all" ON game_rooms
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ======================== الدفعة 4: اللاعبون ========================

CREATE POLICY "players_read_members" ON room_players
  FOR SELECT TO authenticated
  USING (public.is_room_member(room_id) OR public.is_admin());

-- تُدخل نفسك فقط: user_id لا يُدّعى.
--
-- ⚠️ **والشرط الثاني ليس زينة**: صلاحيات الأعمدة في الدفعة 5 تحرس UPDATE
-- وحده، فبدون هذا الشرط يدخل أي أحد روماً بكودها وهو يكتب `is_host = true`
-- في صفّه من أول لحظة فيصير مضيفاً عليها. الصفة مسموحة عند الإدخال فقط
-- لمن كان **هو نفسه** المضيف المعلن في `game_rooms.host_player_id` — أي
-- منشئ الروم، لأن صفّ الروم يُكتب قبل صفّ اللاعب.
CREATE POLICY "players_insert_self" ON room_players
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      is_host = false
      OR EXISTS (
        SELECT 1 FROM game_rooms r
        WHERE r.id = room_id AND r.host_player_id = player_id
      )
    )
  );

-- تعدّل صفّك وحدك. وأفعال المضيف (الفريق، الطرد، النقاط، نقل الاستضافة)
-- تمرّ بالدوال في الملف 1 — لأنها تمسّ صفوف الآخرين.
CREATE POLICY "players_update_self" ON room_players
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- لا حذف إطلاقاً — الخروج status = 'left' لا حذف صفّ


-- ======================== الدفعة 5: قصر الأعمدة ========================
-- ⚠️ **هذه أهم دفعة في الملف.** بدونها تبقى «عدّل صفّك» ثغرة كاملة: أي
-- عضو يكتب is_host = true في صفّه فيصير مضيفاً، أو score = 9999 لنفسه.
-- RLS تحرس **الصفوف** لا الأعمدة، وحراسة الأعمدة تكون بصلاحيات الأعمدة.
--
-- الدوال SECURITY DEFINER تعمل بصلاحية مالكها فلا يقيّدها هذا.

REVOKE UPDATE ON room_players FROM authenticated;
GRANT  UPDATE (player_name, status, left_at, last_seen_at)
       ON room_players TO authenticated;

REVOKE UPDATE ON room_chat FROM authenticated;
GRANT  UPDATE (reactions) ON room_chat TO authenticated;
-- التفاعلات وحدها: لا يُعدَّل نصّ رسالة أحد


-- ======================== الدفعة 6: الشات ========================

CREATE POLICY "chat_read_members" ON room_chat
  FOR SELECT TO authenticated
  USING (public.is_room_member(room_id));

CREATE POLICY "chat_insert_self" ON room_chat
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_room_member(room_id));

-- التفاعل على رسالة الغير مسموح (وهو الغرض)، والعمود محصور بالدفعة 5
CREATE POLICY "chat_update_members" ON room_chat
  FOR UPDATE TO authenticated
  USING (public.is_room_member(room_id))
  WITH CHECK (public.is_room_member(room_id));

-- لا حذف


-- ======================== الدفعة 7: حالة اللعبة ========================
-- ⚠️ **للأعضاء لا للمضيف وحده — مقصود.** صاحب الدور يبثّ الحالة وقد لا
-- يكون مضيفاً (البند 13)، وقصرها على المضيف يُجمّد الدور عند من لعب.
-- المكسب الحقيقي أن **الغريب** لم يعد يستطيع تزوير حالة روم لا ينتمي إليها.

CREATE POLICY "state_read_members" ON room_game_state
  FOR SELECT TO authenticated
  USING (public.is_room_member(room_id));

CREATE POLICY "state_insert_members" ON room_game_state
  FOR INSERT TO authenticated
  WITH CHECK (public.is_room_member(room_id));

CREATE POLICY "state_update_members" ON room_game_state
  FOR UPDATE TO authenticated
  USING (public.is_room_member(room_id))
  WITH CHECK (public.is_room_member(room_id));

CREATE POLICY "state_delete_admin" ON room_game_state
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- ======================== الدفعة 8: التحقق ========================
-- المتوقّع: لا سياسة باسم allow_public_* على الجداول الأربعة، و**15** سياسة
-- جديدة (5 رومات · 3 لاعبين · 3 شات · 4 حالة)، ولا صلاحية لـ anon.
-- وأعمدة room_players القابلة للتحديث: player_name, status, left_at, last_seen_at

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('game_rooms','room_players','room_chat','room_game_state')
ORDER BY tablename, cmd, policyname;

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('game_rooms','room_players','room_chat','room_game_state')
  AND grantee IN ('anon','authenticated')
ORDER BY grantee, table_name, privilege_type;


-- ============================================================================
-- ↩️ العودة (شغّلها فقط إن انكسر شيء ولم تعرف السبب)
-- ============================================================================
-- DROP POLICY IF EXISTS "rooms_read_members" ON game_rooms;
-- DROP POLICY IF EXISTS "rooms_insert_authed" ON game_rooms;
-- DROP POLICY IF EXISTS "rooms_update_host" ON game_rooms;
-- DROP POLICY IF EXISTS "rooms_delete_admin" ON game_rooms;
-- DROP POLICY IF EXISTS "rooms_admin_all" ON game_rooms;
-- DROP POLICY IF EXISTS "players_read_members" ON room_players;
-- DROP POLICY IF EXISTS "players_insert_self" ON room_players;
-- DROP POLICY IF EXISTS "players_update_self" ON room_players;
-- DROP POLICY IF EXISTS "chat_read_members" ON room_chat;
-- DROP POLICY IF EXISTS "chat_insert_self" ON room_chat;
-- DROP POLICY IF EXISTS "chat_update_members" ON room_chat;
-- DROP POLICY IF EXISTS "state_read_members" ON room_game_state;
-- DROP POLICY IF EXISTS "state_insert_members" ON room_game_state;
-- DROP POLICY IF EXISTS "state_update_members" ON room_game_state;
-- DROP POLICY IF EXISTS "state_delete_admin" ON room_game_state;
-- GRANT UPDATE ON room_players TO authenticated;
-- GRANT UPDATE ON room_chat TO authenticated;
-- GRANT ALL ON game_rooms, room_players, room_chat, room_game_state TO anon;
-- CREATE POLICY "allow_public_read_rooms" ON game_rooms FOR SELECT USING (true);
-- CREATE POLICY "allow_public_insert_rooms" ON game_rooms FOR INSERT WITH CHECK (true);
-- CREATE POLICY "allow_public_update_rooms" ON game_rooms FOR UPDATE USING (true);
-- CREATE POLICY "allow_public_read_players" ON room_players FOR SELECT USING (true);
-- CREATE POLICY "allow_public_insert_players" ON room_players FOR INSERT WITH CHECK (true);
-- CREATE POLICY "allow_public_update_players" ON room_players FOR UPDATE USING (true);
-- CREATE POLICY "allow_public_read_chat" ON room_chat FOR SELECT USING (true);
-- CREATE POLICY "allow_public_insert_chat" ON room_chat FOR INSERT WITH CHECK (true);
-- CREATE POLICY "allow_public_update_chat" ON room_chat FOR UPDATE USING (true);
-- CREATE POLICY "allow_public_read_state" ON room_game_state FOR SELECT USING (true);
-- CREATE POLICY "allow_public_insert_state" ON room_game_state FOR INSERT WITH CHECK (true);
-- CREATE POLICY "allow_public_update_state" ON room_game_state FOR UPDATE USING (true);
