#!/bin/sh
# يصدّر الشعار من logo.html إلى PNG عبر كروم بلا واجهة.
# الشعار يحتاج خط Cairo من Google Fonts، فيلزم اتصال بالإنترنت.
set -e
cd "$(dirname "$0")"
ROOT=../..
CH="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
TMP=$(mktemp -d)
shot() { # $1 variant  $2 size  $3 out  $4 extra flags
  "$CH" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=5000 \
    --user-data-dir="$TMP/prof" --window-size="$2" $4 \
    --screenshot="$(cygpath -m "$TMP")/$1.png" "file:///$(cygpath -m "$PWD")/logo.html?v=$1" >/dev/null 2>&1
  cp "$TMP/$1.png" "$3"
}
shot icon  1024,1024 "$ROOT/assets/logo-1024.png"
shot mark  1024,1024 "$TMP/mark-full.png" --default-background-color=00000000
shot share 1200,630  "$ROOT/assets/share.png"
# الشعار داخل اللعبة: يُقصّ على حدوده ويُصغَّر — يُعرض بارتفاع 122px كحدّ أقصى
python - "$TMP/mark-full.png" "$ROOT/assets/logo.png" <<'PY'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
im = im.crop(im.getbbox())
im.save(sys.argv[2].replace('logo.png', 'logo-mark.png'), optimize=True)   # كامل الدقّة لشاشة البداية
h = 360                                   # 3× أكبر ارتفاع عرض
im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
im.save(sys.argv[2], optimize=True)
print('logo.png', im.size)
PY
rm -rf "$TMP"
