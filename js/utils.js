/* ============================= UTILITY FUNCTIONS ============================= */

/* ---- SOUND EFFECTS ---- */
const Sound = (function () {
  let ctx = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type, gainVal) {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime + start);
      gain.gain.setValueAtTime(0, c.currentTime + start);
      gain.gain.linearRampToValueAtTime(gainVal || 0.15, c.currentTime + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(c.currentTime + start);
      osc.stop(c.currentTime + start + dur + 0.02);
    } catch (e) {
      // Audio context not available
    }
  }

  return {
    click() { tone(520, 0, 0.08, 'triangle', 0.12); },
    open() { tone(420, 0, 0.09, 'sine', 0.1); tone(620, 0.07, 0.12, 'sine', 0.1); },
    reveal() { tone(740, 0, 0.1, 'sine', 0.12); tone(990, 0.08, 0.16, 'sine', 0.12); },
    award() { tone(523, 0, 0.12, 'triangle', 0.14); tone(659, 0.1, 0.12, 'triangle', 0.14); tone(784, 0.2, 0.22, 'triangle', 0.16); },
    skip() { tone(300, 0, 0.12, 'sine', 0.1); tone(220, 0.1, 0.18, 'sine', 0.1); },
    start() { tone(392, 0, 0.1, 'triangle', 0.12); tone(494, 0.1, 0.1, 'triangle', 0.12); tone(587, 0.2, 0.1, 'triangle', 0.12); tone(784, 0.3, 0.25, 'triangle', 0.16); },
    select() { tone(440, 0, 0.06, 'square', 0.06); },
  };
})();

/* ---- LOCAL STORAGE ---- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (e) {
    console.error('Save failed:', e);
    return false;
  }
}

/* ---- IMAGES ---- */

/*
  الصور تُخزَّن داخل بنك الأسئلة نفسه كـ data URL، ويُدفع البنك كاملاً إلى
  Supabase وإلى localStorage. لذلك حجم الصورة ليس تفصيلاً:
    • localStorage لا يتجاوز ~5MB لكل نطاق، والبنك النصّي وحده يقارب 1.5MB
    • البنك يُدفع للسحابة عند كل تعديل
  فنصغّر كل صورة قبل تخزينها: 640px بعد أطول ضلع بجودة 0.7 ≈ 30–60KB،
  وهو أكثر من كافٍ لمربّع الصورة داخل نافذة السؤال.

  الحل الأصح مستقبلاً: Supabase Storage ورابط بدل data URL.
*/
const IMAGE_MAX_DIM = 640;
const IMAGE_QUALITY = 0.7;

function downscaleImageFile(file, maxDim = IMAGE_MAX_DIM, quality = IMAGE_QUALITY) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('الملف ليس صورة'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّرت قراءة الملف'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('تعذّر فتح الصورة'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        // JPEG لا يدعم الشفافية فتصير المناطق الشفافة سوداء — نضع خلفية بيضاء
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---- AUDIO ---- */

/*
  الصوت يُخزَّن مثل الصورة تماماً: data URL داخل بنك الأسئلة، ويُدفع كاملاً إلى
  localStorage (~5MB) وإلى Supabase. لكن الصوت — بخلاف الصورة — لا يمكن
  «تصغيره» في المتصفح، فالحارس الوحيد هو رفض الملف الكبير قبل قراءته.
  400 كيلوبايت ≈ 50 ثانية بجودة 64kbps، وهي أكثر من كافية لمقطع «صوت المشهور».
*/
const AUDIO_MAX_BYTES = 400 * 1024;

function readAudioFile(file, maxBytes = AUDIO_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('audio/')) {
      reject(new Error('الملف ليس مقطعاً صوتياً'));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error(
        `المقطع كبير (${formatBytes(file.size)}) — الحدّ ${formatBytes(maxBytes)}.
` +
        `اقتصّ المقطع أو استخدم جودة أقل (64kbps تكفي).`
      ));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّرت قراءة الملف'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// حجم نصّ data URL بالبايت تقريباً (base64 يزيد الحجم ~33%)
function dataUrlBytes(dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  if (i < 0) return 0;
  return Math.round((String(dataUrl).length - i - 1) * 0.75);
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} كيلوبايت`;
  return `${(n / (1024 * 1024)).toFixed(2)} ميجابايت`;
}

/* ---- VIDEO ---- */

/*
  الفيديو لم يعد يسكن بنك الأسئلة، بل **Supabase Storage**، ويُحفظ في السؤال
  رابطه فقط.

  السبب: البنك كله يُحفظ في localStorage (~5MB) ويُدفع كاملاً إلى السحابة عند
  كل تعديل، وdata URL يضخّم الملف ~33%. فمقطع واحد كان يلتهم مساحة البنك كله،
  ولذلك كان الحدّ 1MB (~15 ثانية). بالرابط: المقطع حتى 50MB، والعدد غير محدود،
  والبنك يبقى نصّاً خفيفاً كما كان.

  الأسئلة القديمة تحمل data URL في نفس الحقل `video`، و<video src> يقبل الاثنين
  بلا فرق — فلا شيء ينكسر ولا حاجة لترحيل.

  الدلو وسياساته في `supabase-storage.sql` (يُشغَّل مرة واحدة).
*/
const QUESTION_MEDIA_BUCKET = 'question-media';
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;    // نفس سقف الدلو في supabase-storage.sql
const VIDEO_INLINE_MAX_BYTES = 1024 * 1024;  // السقف حين لا سحابة: المقطع يسكن البنك

// لا نثق باسم الملف الأصلي داخل مسار التخزين (مسافات، حروف عربية، ../)
function makeVideoObjectPath(file) {
  const m = /\.([a-zA-Z0-9]{1,5})$/.exec(file.name || '');
  const ext = m ? m[1].toLowerCase() : 'mp4';
  const rand = Math.random().toString(36).slice(2, 10);
  return `videos/${Date.now()}-${rand}.${ext}`;
}

// هل هذا الحقل رابط داخل دلونا؟ (لتمييزه عن data URL القديم عند الحذف)
function isStoredVideoUrl(value) {
  const v = String(value || '');
  return v.startsWith('http') && v.includes(`/${QUESTION_MEDIA_BUCKET}/`);
}

async function uploadVideoFile(file) {
  const path = makeVideoObjectPath(file);

  const { error } = await supa.storage
    .from(QUESTION_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type || 'video/mp4', upsert: false });

  if (error) {
    // رسائل Storage الخام إنجليزية وغامضة — نترجم الحالتين المتوقّعتين فعلاً
    const msg = String(error.message || error);
    if (/bucket/i.test(msg) && /not.?found|exist/i.test(msg)) {
      throw new Error('مخزن الفيديو غير موجود — شغّل `supabase-storage.sql` في Supabase مرة واحدة.');
    }
    if (/policy|unauthorized|403|401|violates|permission/i.test(msg)) {
      throw new Error('الرفع مرفوض — سجّل دخول الإدمن أولاً (المخزن يقبل الرفع من الإدمن فقط).');
    }
    throw new Error('تعذّر رفع الفيديو: ' + msg);
  }

  const { data } = supa.storage.from(QUESTION_MEDIA_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('رُفع الفيديو لكن تعذّر الحصول على رابطه');
  return data.publicUrl;
}

// حذف المقطع من المخزن بعد أن يُنزع من السؤال — وإلا بقي الدلو يمتلئ بمقاطع
// لا يشير إليها شيء. أفضل جهد: فشل الحذف لا يُبطل نزع الفيديو من السؤال.
async function deleteStoredVideo(url) {
  if (!supa || !isStoredVideoUrl(url)) return;
  const i = String(url).indexOf(`/${QUESTION_MEDIA_BUCKET}/`);
  const path = String(url).slice(i + QUESTION_MEDIA_BUCKET.length + 2).split('?')[0];
  if (!path) return;
  try {
    await supa.storage.from(QUESTION_MEDIA_BUCKET).remove([decodeURIComponent(path)]);
  } catch (e) {
    console.warn('تعذّر حذف الفيديو من المخزن:', e);
  }
}

// المدخل الوحيد لإضافة فيديو: يُعيد رابطاً، أو data URL حين لا سحابة
async function storeVideoFile(file) {
  if (!file || !file.type.startsWith('video/')) {
    throw new Error('الملف ليس مقطع فيديو');
  }
  if (file.size > VIDEO_MAX_BYTES) {
    throw new Error(
      `المقطع كبير (${formatBytes(file.size)}) — الحدّ ${formatBytes(VIDEO_MAX_BYTES)}.
` +
      `اقتصّ المقطع أو صغّر دقّته (480p تكفي داخل نافذة السؤال).`
    );
  }

  // بلا شبكة لا يُجدي الرفع؛ نعود للطريقة القديمة بدل أن نمنع العمل أصلاً.
  // (navigator.onLine كاذب أحياناً بالإيجاب، لكنه صادق دائماً بالنفي — وهذا
  //  ما نحتاجه هنا: أي فشل شبكة رغم onLine يبقى خطأً صريحاً لا فشلاً صامتاً.)
  if (supa && navigator.onLine !== false) return uploadVideoFile(file);

  // بلا سحابة يسكن المقطع البنك نفسه، فالحدّ الضيّق القديم يبقى قائماً
  if (file.size > VIDEO_INLINE_MAX_BYTES) {
    throw new Error(
      `لا اتصال بالسحابة، والمقطع (${formatBytes(file.size)}) أكبر من ` +
      `${formatBytes(VIDEO_INLINE_MAX_BYTES)} — وهو حدّ التخزين المحلي.
` +
      `اتصل بالإنترنت وسجّل دخول الإدمن لرفع مقاطع أكبر.`
    );
  }
  return readVideoFile(file, VIDEO_INLINE_MAX_BYTES);
}

function readVideoFile(file, maxBytes = VIDEO_INLINE_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('video/')) {
      reject(new Error('الملف ليس مقطع فيديو'));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error(
        `المقطع كبير (${formatBytes(file.size)}) — الحدّ ${formatBytes(maxBytes)}.
` +
        `اقتصّ المقطع أو صغّر دقّته (480p تكفي داخل نافذة السؤال).`
      ));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّرت قراءة الملف'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

/* ---- SCREEN NAVIGATION ---- */
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
    window.scrollTo(0, 0);
  }
  // اسم الشاشة على <body> ليتمكّن CSS من تغيير الترويسة والتذييل حسبها.
  // البديل `body:has(#screen-home.active)` يسقط على المتصفحات الأقدم بصمت.
  document.body.dataset.screen = screenId;
}

function goToHome() {
  Sound.click();
  showScreen('screen-home');
  // بطاقة «آخر لعبة» تتغيّر بعد كل جولة، فتُقرأ عند كل عودة للرئيسية
  if (typeof renderLastGame === 'function') renderLastGame();
}

function goToSetup() {
  Sound.click();
  showScreen('screen-setup');
  renderTeamSetup();
}

// ⚠️ هذه النسخة **ميتة**: `js/game.js` يعرّف `goToCategories` أيضاً ويُحمَّل
// بعد هذا الملف فيَجُبّها. لا تعدّل هنا ظنّاً أنك تعدّل السلوك — عدّل في
// game.js. (تُركت لأن حذفها يكسر التشغيل لو تغيّر ترتيب الوسوم يوماً.)
function goToCategories() {
  Sound.click();
  showScreen('screen-categories');
}

function showAbout() {
  Sound.click();

  let total = 0;
  Object.values(typeof QBANK !== 'undefined' ? QBANK : {}).forEach(c => {
    ['easy', 'medium', 'hard'].forEach(k => { total += (c[k] || []).length; });
  });
  const cats = Object.keys(typeof QBANK !== 'undefined' ? QBANK : {}).length;

  uiAlert(`تحدي رجا — لعبة أسئلة جماعية
${total.toLocaleString('ar-EG')} سؤال في ${cats} فئة
فريقان، ثلاثة مستويات، ووسائل مساعدة
العبوا من جهاز واحد أو من أجهزتكم بكود روم`);
}

/* ---- HTML ESCAPING ---- */
// تهرّب المحارف الخمسة. النسخة السابقة كانت textContent ثم innerHTML، وهي
// لا تهرّب " ولا ' فتكون غير آمنة داخل الخصائص مثل value="..."
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/*
  نصّ يُوضع داخل سلسلة JavaScript **داخل خاصية HTML** مثل onclick="f('...')".
  المتصفح يفكّ ترميز الخاصية أولاً ثم يفسّرها كـ JS، ولهذا لا تكفي escapeHtml
  هنا: هي تحوّل ' إلى &#39; فيفكّها المتصفح إلى ' فتُغلق السلسلة قبل أوانها.
  الترتيب مقصود: نهرّب لـ JS أولاً (\ و ')، ثم لـ HTML بلا مساس بالمهرّب.
*/
function jsStr(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---- MODAL DIALOGS ---- */
async function showConfirm(message, onConfirm, onCancel) {
  if (await uiConfirm(message)) {
    if (onConfirm) onConfirm();
  } else {
    if (onCancel) onCancel();
  }
}

function showPrompt(message, defaultValue = '') {
  return uiPrompt(message, defaultValue);
}

function showAlert(message, title = 'تنبيه') {
  uiAlert(`${title}\n\n${message}`);
}

/* ---- STRING UTILITIES ---- */
function trimArabic(str) {
  if (!str) return '';
  return str.replace(/^\s+|\s+$/g, '').replace(/‏|‎/g, '');
}

function capitalizeArabic(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function slugify(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/* ---- ARRAY UTILITIES ---- */
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function groupBy(arr, key) {
  return arr.reduce((groups, item) => {
    const group = groups[item[key]] || [];
    group.push(item);
    groups[item[key]] = group;
    return groups;
  }, {});
}

function unique(arr, key) {
  if (!key) return [...new Set(arr)];
  const seen = new Set();
  return arr.filter(item => {
    const k = item[key];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ---- OBJECT UTILITIES ---- */
function mergeObjects(target, source) {
  return { ...target, ...source };
}

function cloneObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ---- DATE & TIME ---- */
function getCurrentDateTime() {
  return new Date().toISOString();
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('ar-SA');
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('ar-SA');
}

function getDaysDifference(date1, date2) {
  const ms = Math.abs(new Date(date1) - new Date(date2));
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/* ---- VALIDATION ---- */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidArabicText(text) {
  return /[؀-ۿ]/.test(text);
}

function isEmpty(value) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function hasProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

/* ---- NUMBER UTILITIES ---- */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/* ---- DOM UTILITIES ---- */
function createElement(tag, attrs = {}, content = '') {
  const el = document.createElement(tag);
  Object.keys(attrs).forEach(key => {
    if (key === 'class') {
      el.className = attrs[key];
    } else if (key === 'style') {
      Object.assign(el.style, attrs[key]);
    } else {
      el.setAttribute(key, attrs[key]);
    }
  });
  if (content !== '' && content !== null && content !== undefined) {
    if (content instanceof Node) {
      el.appendChild(content);
    } else {
      el.innerHTML = content;
    }
  }
  return el;
}

function setInnerText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

function setInnerHTML(element, html) {
  if (element) {
    element.innerHTML = html;
  }
}

function addClass(element, className) {
  if (element) {
    element.classList.add(className);
  }
}

function removeClass(element, className) {
  if (element) {
    element.classList.remove(className);
  }
}

function toggleClass(element, className) {
  if (element) {
    element.classList.toggle(className);
  }
}

function hasClass(element, className) {
  if (!element) return false;
  return element.classList.contains(className);
}

/* ---- ASYNC UTILITIES ---- */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryAsync(fn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await wait(delay);
    }
  }
}

/* ---- LOGGING ---- */
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('ar-SA');
  const prefix = `[${timestamp}]`;

  switch (type) {
    case 'success':
      console.log(`%c${prefix} ✅ ${message}`, 'color: #27AE60; font-weight: bold;');
      break;
    case 'error':
      console.error(`%c${prefix} ❌ ${message}`, 'color: #E74C3C; font-weight: bold;');
      break;
    case 'warning':
      console.warn(`%c${prefix} ⚠️ ${message}`, 'color: #F39C12; font-weight: bold;');
      break;
    default:
      console.log(`%c${prefix} ℹ️ ${message}`, 'color: #3498DB;');
  }
}

/* ============================= UI DIALOGS ============================= */
/* بدائل مصمّمة لـ alert / confirm / prompt.
   السبب: النوافذ الأصلية خارج هوية اللعبة، وبعض المتصفحات — خصوصاً على iOS
   وداخل الإطارات — تحجب prompt() تماماً فيتوقّف إنشاء الروم بلا أي رسالة. */

function closeUiModal(overlay, resolve, value) {
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 180);
  resolve(value);
}

function buildUiModal({ message, kind, defaultValue = '', okText = 'موافق', cancelText = 'إلغاء' }) {
  return new Promise(resolve => {
    const overlay = createElement('div', { class: 'ui-modal-overlay' });

    const box = createElement('div', { class: 'ui-modal' }, `
      <div class="ui-modal-msg">${escapeHtml(String(message)).replace(/\n/g, '<br>')}</div>
      ${kind === 'prompt' ? '<input type="text" class="ui-modal-input" id="uiModalInput">' : ''}
      <div class="ui-modal-actions">
        ${kind !== 'alert' ? `<button class="btn-main btn-ghost" data-act="cancel">${cancelText}</button>` : ''}
        <button class="btn-main btn-primary" data-act="ok">${okText}</button>
      </div>
    `);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const input = box.querySelector('#uiModalInput');
    if (input) {
      input.value = defaultValue;
      setTimeout(() => { input.focus(); input.select(); }, 60);
    }

    const cancelValue = kind === 'confirm' ? false : (kind === 'prompt' ? null : undefined);
    const okValue = () => kind === 'confirm' ? true : (kind === 'prompt' ? input.value : undefined);

    box.querySelector('[data-act="ok"]').onclick = () => closeUiModal(overlay, resolve, okValue());
    const cancelBtn = box.querySelector('[data-act="cancel"]');
    if (cancelBtn) cancelBtn.onclick = () => closeUiModal(overlay, resolve, cancelValue);

    // النقر خارج الصندوق = إلغاء (وفي alert = إغلاق)
    overlay.onclick = (e) => {
      if (e.target === overlay) closeUiModal(overlay, resolve, cancelValue);
    };

    box.onkeydown = (e) => {
      if (e.key === 'Enter' && kind !== 'alert') {
        e.preventDefault();
        closeUiModal(overlay, resolve, okValue());
      } else if (e.key === 'Escape') {
        closeUiModal(overlay, resolve, cancelValue);
      }
    };
  });
}

// إشعار غير حاجب — يظهر ويختفي وحده
function uiAlert(message) {
  const wrap = document.getElementById('uiToasts') ||
    document.body.appendChild(createElement('div', { id: 'uiToasts', class: 'ui-toasts' }));

  const toast = createElement('div', { class: 'ui-toast' },
    escapeHtml(String(message)).replace(/\n/g, '<br>'));

  wrap.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  const remove = () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  };
  toast.onclick = remove;
  setTimeout(remove, 4000);
}

function uiConfirm(message, okText = 'نعم', cancelText = 'إلغاء') {
  return buildUiModal({ message, kind: 'confirm', okText, cancelText });
}

function uiPrompt(message, defaultValue = '') {
  return buildUiModal({ message, kind: 'prompt', defaultValue, okText: 'تم' });
}

/* ============================= إحساس اللعبة ============================= */
/*
  الرقم الذي يقفز لا يُرى، والرقم الذي يزحف يُشاهَد. فرق النقاط هو الحدث
  الوحيد الذي يهمّ اللاعبين، وكان يتبدّل بلا أن ينتبه له أحد.

  ⚠️ **الحركة تُلغى عند `prefers-reduced-motion`** ويُكتب الرقم فوراً — الحركة
  متعة لمن يريدها وإزعاج لمن أطفأها في نظامه.
*/

const _scoreAnims = new WeakMap();

function animateNumber(el, target, ms = 650) {
  if (!el) return;
  target = Number(target) || 0;

  const from = Number(String(el.textContent).replace(/[^\d-]/g, '')) || 0;

  // حركة جارية على نفس العنصر تُلغى، وإلا تصارع الاثنتان على النصّ
  const running = _scoreAnims.get(el);
  if (running) { cancelAnimationFrame(running.raf); clearTimeout(running.guard); }

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduced || from === target) {
    el.textContent = target;
    return;
  }

  el.classList.add('score-bump');
  setTimeout(() => el.classList.remove('score-bump'), 420);

  const finish = () => {
    const s = _scoreAnims.get(el);
    if (s) { cancelAnimationFrame(s.raf); clearTimeout(s.guard); }
    el.textContent = target;
    _scoreAnims.delete(el);
  };

  /*
    ⚠️ **حارس بمؤقّت لا بالرفرفة وحدها.** المتصفح يوقف `requestAnimationFrame`
    في التبويب المخفيّ، فمن نقر «للفريق أ» ثم فتح واتساب يعود ليجد الرقم
    متجمّداً عند قيمة وسط — أو عند الصفر في شاشة الفوز، وهي أسوأ لحظة يقع
    فيها هذا. المؤقّت يفرض القيمة النهائية بعد انقضاء المدة مهما جرى.
  */
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - p, 3);          // تباطؤ في النهاية
    el.textContent = Math.round(from + (target - from) * eased);
    if (p < 1) {
      const s = _scoreAnims.get(el);
      if (s) s.raf = requestAnimationFrame(step);
    } else {
      finish();
    }
  };

  _scoreAnims.set(el, {
    raf: requestAnimationFrame(step),
    guard: setTimeout(finish, ms + 300)
  });
}

/*
  كونفيتي بلا مكتبة ولا canvas: عناصر تسقط بحركة CSS وتُزال بعدها.

  ⚠️ **العدد مقيّد بعرض الشاشة**: 90 قطعة على سطح المكتب تبدو احتفالاً، وعلى
  جوال متوسط تُثقل أول ثانية من أهمّ لحظة في اللعبة.
*/
function burstConfetti(host) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

  const wrap = host || document.body;
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';

  const colors = ['#D4AF37', '#3FA796', '#C9A24B', '#EFE3C6', '#27AE60'];
  const count = window.innerWidth < 600 ? 40 : 80;

  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    bit.className = 'confetti-bit';
    bit.style.left = Math.random() * 100 + '%';
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = (Math.random() * 0.9).toFixed(2) + 's';
    bit.style.animationDuration = (2.4 + Math.random() * 1.6).toFixed(2) + 's';
    bit.style.transform = `rotate(${Math.floor(Math.random() * 360)}deg)`;
    if (i % 3 === 0) bit.style.borderRadius = '50%';
    layer.appendChild(bit);
  }

  wrap.appendChild(layer);
  setTimeout(() => layer.remove(), 5200);
}
