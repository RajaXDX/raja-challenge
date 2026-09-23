# -*- coding: utf-8 -*-
"""
يجمع ملفات اللعبة في مجلد www/ ليحزمها Capacitor داخل التطبيق.

لماذا مجلد منفصل بدل توجيه Capacitor إلى جذر المشروع:
  الجذر يحوي `node_modules` ومجلد `ios` وملفات SQL ومجلدات الصور الخام
  (`AR FLAG` و`MAPS` و`photo` … مئات الميغابايتات). توجيه `webDir` إلى
  الجذر يحشرها كلها داخل التطبيق فينتفخ حجمه بلا فائدة — وقد يشحن
  `Supabase.txt` وفيه المفتاح السرّي. المجلد المنفصل ليس ترتيباً، بل حاجز
  أمان.

هذا ليس أداة بناء للويب: ملفات اللعبة تبقى HTML/CSS/JS خاماً تعمل مباشرة
من الجذر بلا أي تجميع. هذا نسخ فقط، ولا يلزم إلا لبناء تطبيق iOS.

تشغيل:  python tools/build-www.py
"""

import os
import pathlib
import shutil
import stat
import sys
import time

# كونسول ويندوز الافتراضي cp1252 ولا يطبع العربية
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
WWW = ROOT / 'www'

# محاولات حذف الملف المقفل قبل الاستسلام، والمهلة بينها
RETRIES = 5
RETRY_WAIT = 0.4

# ما يُشحن داخل التطبيق. أي إضافة جديدة للعبة يجب أن تُسجَّل هنا،
# وإلا اشتغلت في المتصفح وغابت عن التطبيق — وهو عطل صامت يصعب تفسيره.
FILES = ['index.html', 'manifest.json']
DIRS = ['css', 'js', 'data', 'assets']

# ⚠️ **قائمة منع صريحة.** `assets/` يحوي الشعار والأيقونات (نحتاجها)، لكن
# مجلدات الصور الخام في الجذر لا تُنسخ أصلاً لأنها ليست في `DIRS`.
# وهذه أسماء يجب ألا تصل الحزمة بأي حال:
EXCLUDE_NAMES = {
    'Supabase.txt',      # المفتاح السرّي — لا يُشحن إطلاقاً
    'rr.txt', 'rr.json.txt',
    '.DS_Store', 'Thumbs.db', 'desktop.ini',
}


def remove_file(path):
    """
    يحذف ملفاً ولو كان «للقراءة فقط» أو ممسوكاً لحظةً.

    ⚠️ المشروع يقع داخل OneDrive على جهاز صاحبه، والمزامنة تمسك الملفات
    والمجلدات لثوانٍ فيفشل الحذف بـ WinError 5. المحاولة الواحدة كانت
    توقف البناء كله، فتبقى حزمة التطبيق قديمة بصمت — وهو أسوأ ما في الأمر:
    يُبنى تطبيق iOS من ملفات الأمس ولا شيء يقول ذلك.
    """
    for attempt in range(RETRIES):
        try:
            path.unlink()
            return
        except PermissionError:
            # صفة «للقراءة فقط» تمنع الحذف على ويندوز — نرفعها ونعيد
            try:
                os.chmod(path, stat.S_IWRITE)
            except OSError:
                pass
            if attempt == RETRIES - 1:
                raise
            time.sleep(RETRY_WAIT)
        except FileNotFoundError:
            return


def clear_dir(path):
    """
    يفرّغ المجلد من الملفات ويترك المجلدات قائمة.

    ⚠️ **لا نحذف المجلدات عمداً.** فشل الحذف الذي يعطّل البناء يقع على
    `rmdir` لا على الملفات، والمجلد الفارغ لا يضرّ: النسخ يمرّ عليه بـ
    `dirs_exist_ok` فيملؤه. أما الملف القديم فيجب أن يزول فعلاً، وإلا بقي
    ملف حُذف من المشروع مشحوناً داخل التطبيق.
    """
    if not path.exists():
        return
    for f in sorted(path.rglob('*'), key=lambda p: -len(p.parts)):
        if f.is_file() or f.is_symlink():
            remove_file(f)


def main():
    WWW.mkdir(parents=True, exist_ok=True)
    clear_dir(WWW)

    count = 0
    total = 0

    for name in FILES:
        src = ROOT / name
        if not src.exists():
            raise SystemExit(f'ملف مفقود: {name}')
        shutil.copy2(src, WWW / name)
        count += 1
        total += src.stat().st_size

    for d in DIRS:
        src = ROOT / d
        if not src.is_dir():
            raise SystemExit(f'مجلد مفقود: {d}')
        dst = WWW / d
        shutil.copytree(src, dst, dirs_exist_ok=True)
        for f in dst.rglob('*'):
            if f.is_file():
                if f.name in EXCLUDE_NAMES:
                    remove_file(f)
                    continue
                count += 1
                total += f.stat().st_size

    # ⚠️ فحص أخير لا تجميلي: لو تسرّب المفتاح السرّي إلى الحزمة لشُحن مع
    # التطبيق إلى كل جهاز. نفشل البناء بدل أن نكتشفها بعد النشر.
    leaked = [p for p in WWW.rglob('*') if p.is_file() and p.name in EXCLUDE_NAMES]
    if leaked:
        raise SystemExit('⛔ ملفات ممنوعة وصلت www/: ' + ', '.join(p.name for p in leaked))

    print(f'www/: {count} files, {total/1024:.0f} KB')


if __name__ == '__main__':
    main()
