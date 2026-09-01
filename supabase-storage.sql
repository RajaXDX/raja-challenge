-- ============================================================================
-- مخزن وسائط الأسئلة (الفيديو) — يُشغَّل مرة واحدة في Supabase → SQL Editor
-- ============================================================================
--
-- المشكلة التي يعالجها هذا الملف:
-- كان الفيديو يُخزَّن داخل بنك الأسئلة نفسه كـ data URL. والبنك كله يُحفظ في
-- localStorage (سقف المتصفح ~5MB) ويُدفع كاملاً إلى game_settings عند كل
-- تعديل. وbase64 يضخّم الملف ~33%. فكان الحدّ 1MB للمقطع الواحد (~15 ثانية)،
-- ومقطع أو مقطعان يملآن البنك كله.
--
-- الحل: الفيديو يُرفع إلى Storage، والسؤال يحفظ **رابطه فقط**. المقطع حتى
-- 50MB، والعدد غير محدود، والبنك يبقى نصّاً خفيفاً كما كان.
--
-- ============================================================================
-- الخطوة 1: الدلو
-- ============================================================================
-- public = true: اللاعبون يشاهدون الفيديو بدون تسجيل دخول، تماماً كبقية اللعبة.
-- file_size_limit يُفرض هنا في الخادم — الحدّ في المتصفح تجميل ورسالة أوضح فقط.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-media',
  'question-media',
  true,
  52428800,  -- 50 ميجابايت
  array['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================================
-- الخطوة 2: الصلاحيات
-- ============================================================================
-- نفس منطق supabase-admin-security.sql: القراءة للجميع، والكتابة للإدمن
-- المسجَّل فقط. بدون هذا يقدر أي زائر يملأ المخزن بما شاء.

drop policy if exists "question_media_read_public"     on storage.objects;
drop policy if exists "question_media_insert_admin"    on storage.objects;
drop policy if exists "question_media_update_admin"    on storage.objects;
drop policy if exists "question_media_delete_admin"    on storage.objects;

create policy "question_media_read_public" on storage.objects
  for select
  using (bucket_id = 'question-media');

create policy "question_media_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'question-media');

create policy "question_media_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'question-media')
  with check (bucket_id = 'question-media');

create policy "question_media_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'question-media');

-- ============================================================================
-- للتحقق بعد التشغيل
-- ============================================================================
-- select id, public, file_size_limit from storage.buckets where id = 'question-media';
-- select policyname, cmd, roles from pg_policies
--   where tablename = 'objects' and policyname like 'question_media%';
--
-- المتوقع: دلو عام بسقف 52428800، وأربع سياسات — قراءة للجميع وثلاث للـ authenticated.
