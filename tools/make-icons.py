# -*- coding: utf-8 -*-
"""
يولّد كل أيقونات التطبيق وشاشات البداية من مصدر واحد.

لماذا سكربت لا ملفات مرسومة يدوياً:
  الأيقونة مطلوبة بعشرة مقاسات لأربع منصات. تعديل اللون أو الشكل يدوياً
  يعني إعادة رسم عشرة ملفات وضمان تطابقها. هنا يُعدَّل ثابت واحد ويُعاد
  التشغيل.

المصدر: مربّع مقصوص من `assets/share.png` حول الشعار.

⚠️ **لماذا `share.png` لا `logo.png`؟** الشعار في `logo.png` مقاسه 238×244
  بكسل، وآبل تطلب أيقونة 1024×1024. التكبير أربعة أضعاف من 238 يعطي حوافّ
  ضبابية تُرى بالعين في صفحة المتجر. ونفس الشعار موجود في `share.png` بمقاس
  ~340×360 — أي بدقّة أعلى ~50٪. والأهم أن المقصوص يحمل **خلفية الصورة
  نفسها**، فلا حاجة لتركيب خلفية تحتها ولا خطر ظهور خطّ وصل بين الاثنتين.

⚠️ هذا أفضل ما يمكن من الأصول الموجودة، وليس مثالياً: 460 بكسل تُكبَّر إلى
  1024 تبقى دون الحدّة الكاملة. **لو توفّر الشعار متجهياً (SVG أو AI) أو
  بمقاس 1024، ضعه في `assets/logo-1024.png` وسيستعمله السكربت تلقائياً.**

تشغيل:  python tools/make-icons.py
"""

import math
import pathlib
import sys
from PIL import Image

# ⚠️ كونسول ويندوز الافتراضي cp1252 ولا يطبع العربية — والسكربت كان يفشل
# في **آخر سطر** بعد أن يكتب كل الأيقونات بنجاح، فيبدو كأنه لم يعمل.
# صاحب المشروع على ويندوز، فهذا ليس احتمالاً نظرياً.
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)

# نُفضّل شعاراً عالي الدقّة إن وُجد، وإلا قصصنا من `share.png`.
LOGO_HIRES = ROOT / 'assets' / 'logo-1024.png'
SHARE_SRC = ROOT / 'assets' / 'share.png'

# مربّع حول الشعار داخل `share.png` (1200×630). حُسبت حدوده باكتشاف
# البكسلات الذهبية: x 449‑772، y 110‑471. وُسّع لمربّع 460 بهامش متساوٍ
# حتى لا يلامس الشعارُ الحافّةَ — آبل تقصّ زوايا الأيقونة بنفسها.
SHARE_CROP = (380, 60, 840, 520)

# ألوان الهوية — من :root في css/style.css
NIGHT = (10, 26, 20)      # --night
PANEL = (18, 56, 42)      # --panel
GOLD = (212, 175, 55)     # --gold

# نسبة الشعار من ضلع الأيقونة. أقلّ من الملء الكامل عمداً: آبل تقصّ
# الزوايا بنفسها، والمحتوى الملاصق للحافّة يُقصّ معها.
#
# ⚠️ **بلا حلقة مرسومة.** جُرّبت حلقة ذهبية حول الشعار فتضاعفت مع الإطار
# الذهبي الموجود **داخل** الشعار نفسه — حلقتان متحدتا المركز تبدوان خطأ
# طباعياً لا تصميماً. الشعار يحمل حدّه معه، فلا نضيف له حدّاً ثانياً.
LOGO_RATIO = 1.0


def radial_bg(size):
    """خلفية متدرجة قطرياً: أفتح في الوسط وأغمق عند الحواف."""
    img = Image.new('RGB', (size, size), NIGHT)
    px = img.load()
    cx = cy = size / 2
    maxd = math.hypot(cx, cy)
    for y in range(size):
        for x in range(size):
            t = min(1.0, math.hypot(x - cx, y - cy) / maxd)
            t = t ** 0.85
            px[x, y] = tuple(int(PANEL[i] + (NIGHT[i] - PANEL[i]) * t) for i in range(3))
    return img


def load_logo():
    """مصدر الأيقونة مربّعاً وبأعلى دقّة متاحة."""
    if LOGO_HIRES.exists():
        print(f'المصدر: {LOGO_HIRES.name}')
        return Image.open(LOGO_HIRES).convert('RGB')
    if not SHARE_SRC.exists():
        raise SystemExit(f'المصدر مفقود: {SHARE_SRC}')
    img = Image.open(SHARE_SRC).convert('RGB').crop(SHARE_CROP)
    print(f'المصدر: {SHARE_SRC.name} مقصوصاً {img.size[0]}×{img.size[1]}')
    return img


LOGO = load_logo()


def build(size, logo_ratio=LOGO_RATIO):
    """أيقونة مربّعة بالمقاس المطلوب.

    المصدر مربّع أصلاً ويحمل خلفيته معه، فالتحجيم المباشر يكفي ولا نركّب
    شيئاً تحته. عند `logo_ratio < 1` نضع المصدر داخل خلفية متدرّجة —
    تلزم للأيقونة القابلة للقصّ وحدها."""
    if logo_ratio >= 0.999:
        return LOGO.resize((size, size), Image.LANCZOS)

    img = radial_bg(size)
    side = max(1, int(size * logo_ratio))
    img.paste(LOGO.resize((side, side), Image.LANCZOS),
              ((size - side) // 2, (size - side) // 2))
    return img


def splash(w, h):
    """شاشة بداية: الشعار في الوسط على خلفية سادة تملأ أي مقاس شاشة."""
    img = Image.new('RGB', (w, h), NIGHT)
    side = int(min(w, h) * 0.28)
    logo = build(side).convert('RGB')
    img.paste(logo, ((w - side) // 2, (h - side) // 2))
    return img


made = []

# ---- الأيقونة الرئيسية وكل مقاسات الويب و iOS ----
for n in (1024, 512, 192, 180, 152, 120, 76, 32, 16):
    p = OUT / f'icon-{n}.png'
    build(n).convert('RGB').save(p, optimize=True)
    made.append(p)

# ---- أيقونة أندرويد القابلة للقص: المحتوى داخل 80% حتى لا يُقصّ ----
p = OUT / 'icon-maskable-512.png'
build(512, logo_ratio=0.66).convert('RGB').save(p, optimize=True)
made.append(p)

# ---- شاشة البداية: مربعة 2732 تغطي كل أجهزة آبل بعد الاقتصاص ----
p = OUT / 'splash-2732.png'
splash(2732, 2732).save(p, optimize=True)
made.append(p)

# ---- أصول iOS ----
# نولّدها هنا لا في أداة منفصلة: الأيقونة والشعار مصدر واحد، وأي تغيّر في
# الهوية يجب أن يصل الويب والتطبيق معاً وإلا اختلف شكلهما بلا أن ينتبه أحد.
IOS = ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets'
if IOS.is_dir():
    # أيقونة التطبيق: آبل تطلب 1024×1024 مصمتة بلا شفافية ولا زوايا مدوّرة
    # (النظام يقصّها بنفسه). حفظها RGB يضمن غياب قناة ألفا — ووجودها سبب
    # رفض شائع يظهر متأخراً، عند رفع الحزمة لا عند بنائها.
    p = IOS / 'AppIcon.appiconset' / 'AppIcon-512@2x.png'
    build(1024).convert('RGB').save(p, optimize=True)
    made.append(p)

    # شاشة البداية: مربّعة 2732 تُقصّ لأي مقاس شاشة. الملفات الثلاثة
    # المطلوبة في الكتالوج متطابقة عمداً — الفرق بينها في سلّم العرض فقط.
    splash_img = splash(2732, 2732)
    for name in ('splash-2732x2732.png',
                 'splash-2732x2732-1.png',
                 'splash-2732x2732-2.png'):
        p = IOS / 'Splash.imageset' / name
        splash_img.convert('RGB').save(p, optimize=True)
        made.append(p)
else:
    print('ℹ️  مجلد ios/ غير موجود — تخطّينا أصول التطبيق. شغّل `npx cap add ios` أولاً.')

total = sum(f.stat().st_size for f in made)
for f in made:
    print(f'  {f.name:<26} {f.stat().st_size/1024:8.1f} KB')
print(f'\n{len(made)} files, {total/1024:.0f} KB total')
