/* ============================= ADMIN PANEL ============================= */

let adminReturnScreen = 'screen-home';

// متغير عام للتحقق من أن الإدمن مسجل دخول
let isAdminLoggedIn = false;

/* ============================= ADMIN AUTHENTICATION ============================= */

// التحقق من هوية الإدمن.
//
// لماذا لم نعد نعتمد على رمز داخل الكود:
// أي رمز مكتوب في ملفات JS يقدر أي زائر يقرأه من مصدر الصفحة، وبما أن لوحة
// الإدارة تكتب في السحابة (game_settings) فإن ذلك يعني أن أي شخص يقدر يغيّر
// بيانات كل اللاعبين. لذلك صار التحقق عبر Supabase Auth، والصلاحية تُفرض
// في قاعدة البيانات نفسها عبر RLS لا في المتصفح.
//
// بدون اتصال بالسحابة (تشغيل محلي) نسمح بالرمز، لأن التعديل حينها لا يخرج
// من الجهاز ولا يؤثر على أحد.
async function authenticateAdmin() {
  // وضع محلي بحت: لا سحابة = لا ضرر على الآخرين
  if (!supa) {
    const entered = await uiPrompt('وضع محلي (بدون سحابة).\nأدخل رمز لوحة الإدارة:');
    if (entered === null) return false;
    if (trimArabic(entered) !== ADMIN_PIN) {
      uiAlert('❌ رمز غير صحيح');
      return false;
    }
    return true;
  }

  // ⚠️ لا يكفي أن يكون مسجّل دخول — كل اللاعبين صاروا مسجّلين بعد إضافة
  // الحسابات. الإدمن = عضوية في جدول admins، والتحقق يتم في قاعدة البيانات.
  try {
    const { data: { session } } = await supa.auth.getSession();
    if (session) {
      if (await checkIsAdmin()) return true;
      uiAlert('❌ هذا الحساب ليس حساب إدارة');
      return false;
    }
  } catch (e) {
    console.warn('تعذّر قراءة الجلسة:', e);
  }

  const identifier = await uiPrompt('اسم المستخدم أو بريد الإدارة:');
  if (identifier === null) return false;

  const password = await uiPrompt('كلمة المرور:');
  if (password === null) return false;

  try {
    // نقبل الاثنين: البريد لحساب الإدارة الأصلي، واسم المستخدم لحسابات
    // اللاعبين التي مُنحت صلاحية الإدارة — بريدها مشتقّ من بصمة الاسم.
    const raw = identifier.trim();
    const email = raw.includes('@') ? raw : await usernameToEmail(raw);

    const { error } = await supa.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      uiAlert('❌ بيانات الدخول غير صحيحة');
      log(`فشل دخول الإدارة: ${error.message}`, 'error');
      return false;
    }

    await loadProfile();
    if (!(await checkIsAdmin())) {
      uiAlert('❌ هذا الحساب ليس حساب إدارة');
      await supa.auth.signOut();
      return false;
    }

    return true;
  } catch (e) {
    uiAlert('❌ تعذّر الاتصال بخدمة الدخول');
    console.error(e);
    return false;
  }
}

async function adminSignOut() {
  if (supa) {
    try { await supa.auth.signOut(); } catch (e) { console.warn(e); }
  }
  isAdminLoggedIn = false;
}

async function openAdmin() {
  Sound.select();

  const ok = await authenticateAdmin();
  if (!ok) return;

  isAdminLoggedIn = true;
  log('✅ الإدمن دخل بنجاح', 'success');

  const active = document.querySelector('.screen.active');
  adminReturnScreen = active ? active.id : 'screen-home';

  showScreen('screen-admin');
  initializeAdminPanel();
}

function closeAdmin() {
  Sound.click();
  adminSignOut(); // إنهاء جلسة الإدارة في السحابة أيضاً
  showScreen(adminReturnScreen);
  if (adminReturnScreen === 'screen-categories') {
    renderCatGrid();
  } else if (adminReturnScreen === 'screen-game') {
    renderBoard();
  }
  log('✅ إغلاق لوحة الإدارة', 'info');
}

function initializeAdminPanel() {
  document.getElementById('ptEasy').value = POINTS[0];
  document.getElementById('ptMed').value = POINTS[1];
  document.getElementById('ptHard').value = POINTS[2];
  renderAdminCategories();
  populateBankCatSelect();
  renderBankList();
  renderImageLibrary();
  updateSyncInfo();
}

/* ============================= ADMIN TABS ============================= */

function switchAdminTab(tabName) {
  // إخفاء جميع التبويبات
  document.querySelectorAll('.admin-section').forEach(section => {
    section.classList.remove('active');
  });

  // إزالة الحالة النشطة من جميع الأزرار
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.classList.remove('active');
  });

  // إظهار التبويب المطلوب
  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) {
    targetTab.classList.add('active');
  }

  // تنشيط الزر المناسب
  event.target.classList.add('active');

  // تحديث المحتوى
  if (tabName === 'sync') {
    updateSyncInfo();
  } else if (tabName === 'users') {
    // الحظر يُدار من هنا، فقائمة المحظورين تُحمَّل مع التبويب لا بضغطة إضافية
    loadUsers();
    loadBans();
  }
}

function updateSyncInfo() {
  const info = document.getElementById('syncInfo');
  if (!info) return;

  if (!supa) {
    info.innerHTML = `
      <p>⚠️ Supabase غير متصل</p>
      <p>حالياً يتم استخدام التخزين المحلي فقط</p>
    `;
    return;
  }

  let total = 0;
  Object.values(QBANK).forEach(c => {
    ['easy', 'medium', 'hard'].forEach(k => {
      total += (c[k] || []).length;
    });
  });

  info.innerHTML = `
    <div style="display: grid; gap: 12px;">
      <div style="padding: 12px; background: rgba(63, 167, 150, 0.1); border-radius: 8px;">
        <strong>📊 إحصائيات البنك:</strong>
        <p>إجمالي الأسئلة: <strong>${total}</strong></p>
        <p>الفئات: <strong>${Object.keys(QBANK).length}</strong></p>
      </div>
      <div style="padding: 12px; background: rgba(212, 175, 55, 0.1); border-radius: 8px;">
        <strong>☁️ حالة المزامنة:</strong>
        <p id="syncStatus">جاري الفحص...</p>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-answer" onclick="syncNow()">🔄 مزامنة الآن</button>
        <button class="btn btn-ghost" onclick="exportBankJSON()">📥 تصدير البيانات</button>
        <button class="btn btn-ghost" onclick="importBankJSON()">📤 استيراد البيانات</button>
      </div>
    </div>
  `;
}

/* ============================= POINTS MANAGEMENT ============================= */

function savePoints() {
  const e = parseInt(document.getElementById('ptEasy').value) || 100;
  const m = parseInt(document.getElementById('ptMed').value) || 250;
  const h = parseInt(document.getElementById('ptHard').value) || 400;

  POINTS = [e, m, h];
  saveJSON('mr_points', POINTS);
  pushToCloud();
  Sound.award();
  uiAlert('✅ تم حفظ النقاط بنجاح');

  if (document.querySelector('#screen-game.active')) {
    renderBoard();
  }
}

/* ============================= CATEGORIES MANAGEMENT ============================= */

function renderAdminCategories() {
  const label = document.getElementById('catCountLabel');
  if (label) label.textContent = CATEGORIES.length;

  const wrap = document.getElementById('catAdminList');
  if (!wrap) return;

  wrap.innerHTML = '';
  CATEGORIES.forEach(c => {
    const chip = createElement('div', { class: 'cat-admin-chip' }, `
      <span>${escapeHtml(c.ic)} ${escapeHtml(c.name)}</span>
      <span class="del" title="حذف">✕</span>
    `);
    chip.querySelector('.del').onclick = () => deleteCategory(c.name);
    wrap.appendChild(chip);
  });
}

async function adminAddCategory() {
  // ✅ حماية أمنية: التحقق من أن الإدمن مسجل دخول
  if (!isAdminLoggedIn) {
    uiAlert('❌ يجب تسجيل الدخول كإدمن أولاً');
    return;
  }

  const input = document.getElementById('adminNewCatName');
  const name = trimArabic(input.value);
  if (!name) return;

  if (CATEGORIES.some(c => c.name === name)) {
    uiAlert('❌ هذه الفئة موجودة بالفعل');
    input.value = '';
    return;
  }

  // ⚠️ اسم سبق حذفه يبقى في قائمة السحب، فلو أُضيف بلا رفع السحب
  // لاختفى فوراً عند أول دمج — وبدا كأن الإضافة لم تنجح
  await unretireCategory(name);

  CATEGORIES.push({ name, ic: '✨' });
  saveJSON('mr_categories', CATEGORIES);
  await pushToCloud();
  input.value = '';
  renderAdminCategories();
  populateBankCatSelect();
  log(`✅ تمت إضافة فئة جديدة: ${name}`, 'success');
  uiAlert('✅ تمت إضافة الفئة بنجاح');
}

async function deleteCategory(name) {
  if (!await uiConfirm(`هل تريد حذف الفئة "${name}"؟`)) return;

  CATEGORIES = CATEGORIES.filter(c => c.name !== name);
  selectedCats = selectedCats.filter(c => c.name !== name);
  delete QBANK[name];

  saveJSON('mr_categories', CATEGORIES);
  saveJSON('mr_bank', QBANK);

  // ⚠️ تسجيل الحذف في السحابة **قبل** الدفع، وهو جوهر المسألة:
  // بدونه لا يعرف أي جهاز آخر أن الفئة حُذفت، فيُعيدها دمجه عند أول تحميل
  // — وترجع إليك أنت أيضاً عند تحديث الصفحة.
  const published = await publishRetiredCategory(name);
  await pushToCloud();

  renderAdminCategories();
  populateBankCatSelect();
  updateTotalStats?.();

  uiAlert(published
    ? '✅ تم حذف الفئة من كل الأجهزة'
    : '⚠️ حُذفت من هذا الجهاز، لكن تعذّر تسجيل الحذف في السحابة — قد تعود');
}

/* ============================= QUESTION BANK MANAGEMENT ============================= */

function populateBankCatSelect() {
  const sel = document.getElementById('bankCatSelect');
  if (!sel) return;

  const current = sel.value;
  sel.innerHTML = '';

  CATEGORIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${c.ic} ${c.name}`;
    sel.appendChild(opt);
  });

  if (current && CATEGORIES.some(c => c.name === current)) {
    sel.value = current;
  }

  sel.onchange = renderBankList;
  document.getElementById('bankDiffSelect').onchange = renderBankList;

  renderBankList();
}

/* ---- صور الأسئلة ---- */

// الصورة المختارة لسؤال جديد لم يُضف بعد
let pendingQuestionImage = null;

// المقطع الصوتي المختار لسؤال جديد لم يُضف بعد
let pendingQuestionAudio = null;

// مقطع الفيديو المختار لسؤال جديد لم يُضف بعد
let pendingQuestionVideo = null;

/*
  ⚠️ قراءة الملف غير متزامنة، و«+ إضافة سؤال» متزامن.
  فبين اختيار الملف وانتهاء قراءته تبقى pendingQuestion* فارغة — ومن يضغط
  «إضافة» في تلك اللحظة يُضاف سؤاله **بلا وسائط وبلا أي رسالة خطأ**.
  والفيديو أبطأ ما يُقرأ، فهو أول من يقع في هذه الفجوة.
  العلاج ثلاثي: نُبقي وعد القراءة هنا ليُنتظر، ونعطّل الزر أثناءها، ونُظهر
  «جاري القراءة» حتى لا تبدو الخانة فارغة بلا سبب.
*/
const inflightMedia = { image: null, audio: null, video: null };

function setAddQuestionBusy() {
  const btn = document.getElementById('addQuestionBtn');
  if (!btn) return;
  const busy = !!(inflightMedia.image || inflightMedia.audio || inflightMedia.video);
  btn.disabled = busy;
  btn.textContent = busy ? '⏳ جاري قراءة الملف…' : '+ إضافة سؤال';
}

// ينتظر أي قراءة لم تنتهِ. allSettled: الملف المرفوض أبلغ عن نفسه أصلاً
// ولا يجوز أن يمنع إضافة السؤال ببقية وسائطه.
function awaitPendingMedia() {
  return Promise.allSettled([inflightMedia.image, inflightMedia.audio, inflightMedia.video]);
}

// حدّ آمن دون سقف localStorage (~5MB): نرفض قبل الامتلاء لا بعده.
// الامتلاء بلا حارس يعني فشل الحفظ صامتاً وضياع البنك كلّه.
const BANK_SIZE_LIMIT = 4 * 1024 * 1024;

function bankSizeBytes() {
  try { return new Blob([JSON.stringify(QBANK)]).size; } catch (e) { return 0; }
}

// نحفظ ونتحقق: لو تجاوزنا الحدّ نُبلغ بوضوح بدل أن يفشل الحفظ بصمت
function saveBankWithImages() {
  const size = bankSizeBytes();
  if (size > BANK_SIZE_LIMIT) {
    uiAlert(`❌ حجم البنك ${formatBytes(size)} — تجاوز الحدّ الآمن.\n` +
            `احذف بعض الصور أو استخدم صوراً أصغر.`);
    return false;
  }
  if (!saveJSON('mr_bank', QBANK)) {
    uiAlert('❌ تعذّر الحفظ — تخزين المتصفح ممتلئ. احذف بعض الصور.');
    return false;
  }
  return true;
}

async function previewNewQuestionImage() {
  const input = document.getElementById('newQImage');
  const box = document.getElementById('newQImagePreview');
  const file = input?.files?.[0];
  if (!file) { clearNewQuestionImage(); return; }

  if (box) box.innerHTML = '<span>⏳ جاري قراءة الصورة…</span>';
  const job = downscaleImageFile(file);
  inflightMedia.image = job;
  setAddQuestionBusy();

  try {
    pendingQuestionImage = await job;
    if (box) {
      box.innerHTML =
        `<img src="${pendingQuestionImage}" alt="معاينة">
         <span>${formatBytes(dataUrlBytes(pendingQuestionImage))}</span>
         <button type="button" class="del-q" onclick="clearNewQuestionImage()">✕</button>`;
    }
  } catch (e) {
    uiAlert(`❌ ${e.message}`);
    clearNewQuestionImage();
  } finally {
    if (inflightMedia.image === job) inflightMedia.image = null;
    setAddQuestionBusy();
  }
}

function clearNewQuestionImage() {
  pendingQuestionImage = null;
  const input = document.getElementById('newQImage');
  const box = document.getElementById('newQImagePreview');
  if (input) input.value = '';
  if (box) box.innerHTML = '';
}

/* ---- أصوات الأسئلة ---- */

async function previewNewQuestionAudio() {
  const input = document.getElementById('newQAudio');
  const box = document.getElementById('newQAudioPreview');
  const file = input?.files?.[0];
  if (!file) { clearNewQuestionAudio(); return; }

  if (box) box.innerHTML = '<span>⏳ جاري قراءة الصوت…</span>';
  const job = readAudioFile(file);
  inflightMedia.audio = job;
  setAddQuestionBusy();

  try {
    pendingQuestionAudio = await job;
    if (box) {
      box.innerHTML =
        `<audio controls src="${pendingQuestionAudio}"></audio>
         <span>${formatBytes(dataUrlBytes(pendingQuestionAudio))}</span>
         <button type="button" class="del-q" onclick="clearNewQuestionAudio()">✕</button>`;
    }
  } catch (e) {
    uiAlert(`❌ ${e.message}`);
    clearNewQuestionAudio();
  } finally {
    if (inflightMedia.audio === job) inflightMedia.audio = null;
    setAddQuestionBusy();
  }
}

function clearNewQuestionAudio() {
  pendingQuestionAudio = null;
  const input = document.getElementById('newQAudio');
  const box = document.getElementById('newQAudioPreview');
  if (input) input.value = '';
  if (box) box.innerHTML = '';
}

// إلصاق صوت بسؤال موجود — يخدم فئات مثل «صوت المشهور» و«أغاني وطنية»
async function attachAudioToQuestion(cat, diffKey, idx) {
  if (!isAdminLoggedIn) { uiAlert('❌ يجب تسجيل الدخول كإدمن أولاً'); return; }
  const item = QBANK[cat]?.[diffKey]?.[idx];
  if (!item) return;

  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'audio/*';
  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      const previous = item.audio;
      item.audio = await readAudioFile(file);
      if (!saveBankWithImages()) {
        if (previous) item.audio = previous; else delete item.audio;
        return;
      }
      pushToCloud();
      renderBankList();
      log(`🔊 أُلصق صوت بسؤال في ${cat}`, 'success');
      uiAlert('✅ تم إلصاق الصوت بالسؤال');
    } catch (e) {
      uiAlert(`❌ ${e.message}`);
    }
  };
  picker.click();
}

async function removeQuestionAudio(cat, diffKey, idx) {
  const item = QBANK[cat]?.[diffKey]?.[idx];
  if (!item?.audio) return;
  if (!await uiConfirm('حذف صوت هذا السؤال؟')) return;
  delete item.audio;
  saveBankWithImages();
  pushToCloud();
  renderBankList();
}

// إلصاق صورة بسؤال موجود — هذا ما يجعل فئات الشعارات والمشاهير قابلة للعب
async function attachImageToQuestion(cat, diffKey, idx) {
  if (!isAdminLoggedIn) { uiAlert('❌ يجب تسجيل الدخول كإدمن أولاً'); return; }
  const item = QBANK[cat]?.[diffKey]?.[idx];
  if (!item) return;

  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      const previous = item.image;
      item.image = await downscaleImageFile(file);
      if (!saveBankWithImages()) {
        if (previous) item.image = previous; else delete item.image;
        return;
      }
      pushToCloud();
      renderBankList();
      log(`🖼️ أُلصقت صورة بسؤال في ${cat}`, 'success');
      uiAlert('✅ تم إلصاق الصورة بالسؤال');
    } catch (e) {
      uiAlert(`❌ ${e.message}`);
    }
  };
  picker.click();
}

async function removeQuestionImage(cat, diffKey, idx) {
  const item = QBANK[cat]?.[diffKey]?.[idx];
  if (!item?.image) return;
  if (!await uiConfirm('حذف صورة هذا السؤال؟')) return;
  delete item.image;
  saveBankWithImages();
  pushToCloud();
  renderBankList();
}

/* ---- فيديو الأسئلة ---- */

async function previewNewQuestionVideo() {
  const input = document.getElementById('newQVideo');
  const box = document.getElementById('newQVideoPreview');
  const file = input?.files?.[0];
  if (!file) { discardNewQuestionVideo(); return; }

  // الرفع للسحابة قد يأخذ وقتاً محسوساً مع مقطع بعشرات الميجات — نقول ذلك
  if (box) box.innerHTML = '<span>⏳ جاري رفع الفيديو…</span>';
  const job = storeVideoFile(file);
  inflightMedia.video = job;
  setAddQuestionBusy();

  try {
    pendingQuestionVideo = await job;
    if (box) {
      // الحجم من الملف نفسه لا من الحقل: الحقل صار رابطاً لا data URL
      box.innerHTML =
        `<video controls preload="metadata" src="${escapeHtml(pendingQuestionVideo)}"></video>
         <span>${formatBytes(file.size)}</span>
         <button type="button" class="del-q" onclick="discardNewQuestionVideo()">✕</button>`;
    }
  } catch (e) {
    uiAlert(`❌ ${e.message}`);
    clearNewQuestionVideo();
  } finally {
    if (inflightMedia.video === job) inflightMedia.video = null;
    setAddQuestionBusy();
  }
}

// إلغاء صريح من المستخدم: المقطع رُفع للمخزن ولن يُربط بأي سؤال، فنحذفه.
// منفصلة عن clearNewQuestionVideo لأن تلك تُستدعى أيضاً **بعد** حفظ السؤال —
// وهناك الرابط صار ملك السؤال، وحذفه يكسره.
function discardNewQuestionVideo() {
  const dropped = pendingQuestionVideo;
  clearNewQuestionVideo();
  deleteStoredVideo(dropped);
}

function clearNewQuestionVideo() {
  pendingQuestionVideo = null;
  const input = document.getElementById('newQVideo');
  const box = document.getElementById('newQVideoPreview');
  if (input) input.value = '';
  if (box) box.innerHTML = '';
}

// إلصاق فيديو بسؤال موجود — يخدم فئات مثل «ميمز» و«صوت المشهور» بمقطع مرئي
async function attachVideoToQuestion(cat, diffKey, idx) {
  if (!isAdminLoggedIn) { uiAlert('❌ يجب تسجيل الدخول كإدمن أولاً'); return; }
  const item = QBANK[cat]?.[diffKey]?.[idx];
  if (!item) return;

  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'video/*';
  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      const previous = item.video;
      item.video = await storeVideoFile(file);
      if (!saveBankWithImages()) {
        // فشل الحفظ ⇒ الرفع صار بلا صاحب: نُرجع القديم وننظّف الجديد
        const orphan = item.video;
        if (previous) item.video = previous; else delete item.video;
        deleteStoredVideo(orphan);
        return;
      }
      deleteStoredVideo(previous);   // المقطع المستبدَل لم يعد يشير إليه شيء
      pushToCloud();
      renderBankList();
      log(`🎬 أُلصق فيديو بسؤال في ${cat}`, 'success');
      uiAlert('✅ تم إلصاق الفيديو بالسؤال');
    } catch (e) {
      uiAlert(`❌ ${e.message}`);
    }
  };
  picker.click();
}

async function removeQuestionVideo(cat, diffKey, idx) {
  const item = QBANK[cat]?.[diffKey]?.[idx];
  if (!item?.video) return;
  if (!await uiConfirm('حذف فيديو هذا السؤال؟')) return;
  const removed = item.video;
  delete item.video;
  saveBankWithImages();
  deleteStoredVideo(removed);
  pushToCloud();
  renderBankList();
}

async function addBankQuestion() {
  // ✅ حماية أمنية: فقط الإدمن يمكنه إضافة أسئلة
  if (!isAdminLoggedIn) {
    uiAlert('❌ يجب تسجيل الدخول كإدمن أولاً');
    return;
  }

  // الزر معطَّل أثناء القراءة، لكن الانتظار هنا هو الضمان الحقيقي:
  // نقرة مبكرة أو استدعاء من مكان آخر لا يجوز أن يبتلع الوسائط بصمت.
  await awaitPendingMedia();

  const cat = document.getElementById('bankCatSelect').value;
  const diffKey = document.getElementById('bankDiffSelect').value;
  const q = trimArabic(document.getElementById('newQText').value);
  const a = trimArabic(document.getElementById('newQAnswer').value);
  const emoji = document.getElementById('newQEmoji').value.trim() || '❓';

  if (!cat || !q || !a) {
    uiAlert('❌ لازم تكتب نص السؤال والإجابة على الأقل');
    return;
  }

  if (!QBANK[cat]) {
    QBANK[cat] = { easy: [], medium: [], hard: [] };
  }

  const entry = {
    question: q,
    answer: a,
    emoji: emoji,
    needsImage: false,
    imageQuery: ''
  };
  if (pendingQuestionImage) entry.image = pendingQuestionImage;
  if (pendingQuestionAudio) entry.audio = pendingQuestionAudio;
  if (pendingQuestionVideo) entry.video = pendingQuestionVideo;

  QBANK[cat][diffKey].push(entry);

  if (!saveBankWithImages()) {
    QBANK[cat][diffKey].pop();
    return;
  }
  pushToCloud();

  document.getElementById('newQText').value = '';
  document.getElementById('newQAnswer').value = '';
  document.getElementById('newQEmoji').value = '';
  clearNewQuestionImage();
  clearNewQuestionAudio();
  clearNewQuestionVideo();

  log(`✅ تمت إضافة سؤال جديد في فئة ${cat}`, 'success');
  Sound.award();
  renderBankList();
  uiAlert('✅ تم إضافة السؤال بنجاح');
  updateTotalStats();
}

async function deleteBankQuestion(cat, diffKey, idx) {
  if (!QBANK[cat] || !QBANK[cat][diffKey]) return;

  if (!await uiConfirm('هل تريد حذف هذا السؤال؟')) return;

  QBANK[cat][diffKey].splice(idx, 1);
  saveJSON('mr_bank', QBANK);
  pushToCloud();
  renderBankList();
  updateTotalStats();
}

function renderBankList() {
  const cat = document.getElementById('bankCatSelect').value;
  const diffKey = document.getElementById('bankDiffSelect').value;
  const list = (QBANK[cat] && QBANK[cat][diffKey]) || [];
  const wrap = document.getElementById('bankList');

  if (!wrap) return;

  wrap.innerHTML = '';
  list.forEach((item, idx) => {
    const thumb = item.image
      ? `<img class="bank-thumb" src="${escapeHtml(item.image)}" alt="">`
      : `<span class="bank-emoji">${escapeHtml(item.emoji || '❓')}</span>`;

    const row = createElement('div', { class: 'bank-item' }, `
      <div class="bank-main">
        ${thumb}
        <div>
          <div class="bq">${escapeHtml(item.question)}</div>
          <div class="ba">الإجابة: ${escapeHtml(item.answer)}</div>
        </div>
      </div>
    `);

    const imgBtn = createElement('button', {
      class: 'img-q',
      title: item.image ? 'استبدال الصورة' : 'إلصاق صورة'
    }, '🖼️');
    imgBtn.onclick = () => attachImageToQuestion(cat, diffKey, idx);
    row.appendChild(imgBtn);

    if (item.image) {
      const rmImg = createElement('button', { class: 'img-q', title: 'حذف الصورة' }, '🚫');
      rmImg.onclick = () => removeQuestionImage(cat, diffKey, idx);
      row.appendChild(rmImg);
    }

    const audBtn = createElement('button', {
      class: 'img-q',
      title: item.audio ? 'استبدال الصوت' : 'إلصاق صوت'
    }, '🔊');
    audBtn.onclick = () => attachAudioToQuestion(cat, diffKey, idx);
    row.appendChild(audBtn);

    if (item.audio) {
      const rmAud = createElement('button', { class: 'img-q', title: 'حذف الصوت' }, '🔇');
      rmAud.onclick = () => removeQuestionAudio(cat, diffKey, idx);
      row.appendChild(rmAud);
    }

    const vidBtn = createElement('button', {
      class: 'img-q',
      title: item.video ? 'استبدال الفيديو' : 'إلصاق فيديو'
    }, '🎬');
    vidBtn.onclick = () => attachVideoToQuestion(cat, diffKey, idx);
    row.appendChild(vidBtn);

    if (item.video) {
      const rmVid = createElement('button', { class: 'img-q', title: 'حذف الفيديو' }, '⛔');
      rmVid.onclick = () => removeQuestionVideo(cat, diffKey, idx);
      row.appendChild(rmVid);
    }

    const delBtn = createElement('button', { class: 'del-q', title: 'حذف' }, '✕');
    delBtn.onclick = () => deleteBankQuestion(cat, diffKey, idx);
    row.appendChild(delBtn);

    wrap.appendChild(row);
  });

  // الإحصائيات
  let total = 0;
  Object.values(QBANK).forEach(c => {
    ['easy', 'medium', 'hard'].forEach(k => {
      total += (c[k] || []).length;
    });
  });

  const countEl = document.getElementById('bankCount');
  if (countEl) {
    countEl.textContent = `أسئلة هذه الفئة/المستوى: ${list.length} — إجمالي البنك: ${total} سؤال`;
  }
}

/* ============================= EXPORT / IMPORT ============================= */

function exportBankJSON() {
  const data = {
    version: '2.0',
    exportDate: new Date().toISOString(),
    categories: CATEGORIES,
    points: POINTS,
    questions: QBANK
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mokhamakh-raj-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  uiAlert('✅ تم تصدير البيانات بنجاح');
}

function importBankJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);

        if (!data.questions) {
          uiAlert('❌ صيغة الملف غير صحيحة');
          return;
        }

        // دمج البيانات
        Object.keys(data.questions).forEach(cat => {
          if (!QBANK[cat]) {
            QBANK[cat] = { easy: [], medium: [], hard: [] };
          }

          ['easy', 'medium', 'hard'].forEach(k => {
            if (Array.isArray(data.questions[cat][k])) {
              QBANK[cat][k] = QBANK[cat][k].concat(data.questions[cat][k]);
            }
          });

          if (!CATEGORIES.some(c => c.name === cat)) {
            CATEGORIES.push({ name: cat, ic: '✨' });
          }
        });

        saveJSON('mr_bank', QBANK);
        saveJSON('mr_categories', CATEGORIES);
        pushToCloud();

        renderAdminCategories();
        populateBankCatSelect();
        updateTotalStats();

        uiAlert('✅ تم استيراد البيانات بنجاح');
      } catch (error) {
        console.error(error);
        uiAlert('❌ خطأ في قراءة الملف');
      }
    };
    reader.readAsText(file);
  };

  input.click();
}

function syncNow() {
  setSyncStatus('syncing');
  pushToCloud().then(() => {
    updateSyncInfo();
  });
}

/* ============================= IMAGE IMPORT ============================= */

/*
  ⚠️ كانت هذه الدالة تحفظ الصور بحجمها الأصلي في `mr_images` **ولا شيء
  يقرأها إطلاقاً** — لا الأسئلة ولا العرض. فالمستخدم يستورد صوره ثم لا
  يجدها في أي سؤال. الآن: تُصغَّر، وتُعرض في شبكة، ومنها تُلصق بالأسئلة.
*/
async function importImages() {
  if (!isAdminLoggedIn) {
    uiAlert('❌ يجب تسجيل الدخول كإدمن أولاً');
    return;
  }

  const fileInput = document.getElementById('imageImportInput');
  const files = Array.from(fileInput.files || []).filter(f => f.type.startsWith('image/'));

  if (!files.length) {
    uiAlert('❌ اختر صوراً من الجهاز أولاً');
    return;
  }

  const statusDiv = document.getElementById('imageImportStatus');
  const images = loadJSON('mr_images', {});
  let processed = 0;
  let failed = 0;

  for (const file of files) {
    statusDiv.textContent = `⏳ جاري معالجة ${processed + failed + 1}/${files.length}...`;
    try {
      const data = await downscaleImageFile(file);
      images[`img_${Date.now()}_${processed}`] = {
        name: file.name,
        data,
        size: dataUrlBytes(data),
        originalSize: file.size,
        type: 'image/jpeg',
        uploadDate: new Date().toISOString()
      };
      processed++;
    } catch (e) {
      console.warn('تعذّرت معالجة صورة:', file.name, e);
      failed++;
    }
  }

  if (!saveJSON('mr_images', images)) {
    statusDiv.textContent = '';
    uiAlert('❌ تخزين المتصفح ممتلئ — احذف بعض الصور قبل الاستيراد');
    return;
  }

  statusDiv.textContent = `✅ استُوردت ${processed} صورة` + (failed ? ` (تعذّرت ${failed})` : '');
  fileInput.value = '';
  Sound.award();
  log(`✅ استُوردت ${processed} صورة`, 'success');

  renderImageLibrary();
  setTimeout(() => { statusDiv.textContent = ''; }, 2500);
}

// شبكة الصور: كل صورة تُلصق بالسؤال المحدَّد في القائمة أو تُحذف
function renderImageLibrary() {
  const grid = document.getElementById('imageLibraryGrid');
  if (!grid) return;

  const images = loadJSON('mr_images', {});
  const keys = Object.keys(images);

  if (!keys.length) { grid.innerHTML = ''; return; }

  const total = keys.reduce((s, k) => s + (images[k].size || 0), 0);

  grid.innerHTML =
    `<div class="admin-hint">${keys.length} صورة — ${formatBytes(total)}</div>` +
    keys.map(k => `
      <div class="img-cell">
        <img src="${escapeHtml(images[k].data)}" alt="${escapeHtml(images[k].name || '')}">
        <button class="del-q" title="حذف من المكتبة" onclick="deleteLibraryImage('${k}')">✕</button>
      </div>
    `).join('');
}

async function deleteLibraryImage(key) {
  const images = loadJSON('mr_images', {});
  if (!images[key]) return;
  if (!await uiConfirm('حذف هذه الصورة من المكتبة؟')) return;
  delete images[key];
  saveJSON('mr_images', images);
  renderImageLibrary();
}

// حُذفت showImageLibrary: كانت تعرض أسماء الصور وتَعِد بأنه «يمكنك الآن
// استخدام أسماء الصور في الأسئلة» — وهو وعد لم يكن له أي كود يحقّقه.
// بديلها renderImageLibrary أعلاه، والإلصاق الفعلي في attachImageToQuestion.

// formatBytes مشتركة الآن في js/utils.js (بوحدات عربية)

/* ============================= RELOAD QUESTION BANK ============================= */

async function reloadQuestionBank() {
  const before = countBankQuestions();
  const added = await syncBundledQuestionBank();
  const after = countBankQuestions();

  populateBankCatSelect();
  renderBankList();
  renderAdminCategories();
  updateSyncInfo();

  if (added > 0) {
    uiAlert(`✅ تم تحميل ${added} سؤال جديد\n\nالمجموع الآن: ${after} سؤال (كان ${before})`);
  } else {
    uiAlert(`ℹ️ بنك الأسئلة محدّث بالفعل — ${after} سؤال`);
  }
}

function countBankQuestions() {
  let total = 0;
  Object.values(QBANK).forEach(c => {
    ['easy', 'medium', 'hard'].forEach(k => {
      total += (c[k] || []).length;
    });
  });
  return total;
}

/* ============================= CLEANUP ROOMS ============================= */

// ملاحظة: سياسات RLS في Supabase تسمح بالقراءة والإضافة والتعديل فقط — لا يوجد DELETE،
// لذلك كان الحذف يفشل بصمت (بدون خطأ وبدون أن يُحذف شيء).
// الحل هنا: نُغلق الرومات القديمة (status = completed) فتختفي من أي قائمة رومات نشطة.
async function cleanupOldRooms() {
  if (!supa) {
    uiAlert('❌ Supabase غير متصل');
    return;
  }

  try {
    const { data: openRooms, error: readError } = await supa
      .from('game_rooms')
      .select('id, code, name, status')
      .neq('status', 'completed');

    if (readError) throw readError;

    if (!openRooms || openRooms.length === 0) {
      uiAlert('ℹ️ لا توجد رومات مفتوحة — كل شيء نظيف');
      return;
    }

    if (!await uiConfirm(`إغلاق ${openRooms.length} روم مفتوحة؟\nاللاعبون فيها سيحتاجون إنشاء روم جديدة.`)) {
      return;
    }

    const ids = openRooms.map(r => r.id);

    const { error: roomsError } = await supa
      .from('game_rooms')
      .update({ status: 'completed' })
      .in('id', ids);
    if (roomsError) throw roomsError;

    // إخراج اللاعبين من تلك الرومات
    await supa
      .from('room_players')
      .update({ status: 'left', left_at: new Date().toISOString() })
      .in('room_id', ids);

    // تحقق فعلي أن الإغلاق تم
    const { data: stillOpen } = await supa
      .from('game_rooms')
      .select('id')
      .neq('status', 'completed');

    const remaining = stillOpen?.length ?? 0;
    if (remaining > 0) {
      uiAlert(`⚠️ أُغلقت ${openRooms.length - remaining} روم، وبقيت ${remaining} لم تُغلق (تحقّق من صلاحيات Supabase)`);
    } else {
      uiAlert(`✅ تم إغلاق ${openRooms.length} روم`);
    }

    log(`🧹 تم إغلاق ${openRooms.length - remaining} روم`, 'success');
  } catch (error) {
    console.error('Cleanup error:', error);
    uiAlert(`❌ خطأ: ${error.message}`);
  }
}

/* ============================= ANALYTICS VIEW ============================= */

async function loadAnalytics() {
  const box = document.getElementById('analyticsBox');
  if (!box) return;

  if (!supa) {
    box.innerHTML = '<p style="color:#999">⚠️ غير متاح بدون اتصال بالسحابة</p>';
    return;
  }

  box.innerHTML = '<p style="color:#999">جاري التحميل...</p>';

  try {
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supa
      .from('app_events')
      .select('event, source, device, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) throw error;

    const rows = data || [];
    if (!rows.length) {
      box.innerHTML = `
        <p style="color:#999">لا توجد بيانات بعد.</p>
        <p style="font-size:12px;color:#999">
          إن لم تكن شغّلت <code>supabase-analytics.sql</code> فشغّله أولاً،
          ثم انتظر أول زيارة.
        </p>`;
      return;
    }

    const count = e => rows.filter(r => r.event === e).length;
    const bySource = {};
    rows.filter(r => r.event === 'visit').forEach(r => {
      const s = r.source || 'unknown';
      bySource[s] = (bySource[s] || 0) + 1;
    });
    const mobile = rows.filter(r => r.device === 'mobile').length;

    const top = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 6);

    box.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:14px">
        ${[['👀 زيارات', count('visit')],
           ['🚪 رومات', count('room_created')],
           ['🎮 جولات', count('game_started') + count('game_started_local')],
           ['🏆 اكتملت', count('game_finished')]]
          .map(([l, v]) => `
            <div style="padding:12px;background:rgba(212,175,55,.1);border-radius:8px;text-align:center">
              <div style="font-size:12px;color:var(--muted)">${l}</div>
              <div style="font-size:22px;font-weight:900;color:var(--gold)">${v}</div>
            </div>`).join('')}
      </div>

      <div style="padding:12px;background:rgba(0,0,0,.2);border-radius:8px;margin-bottom:10px">
        <strong>من أين جاؤوا:</strong>
        ${top.map(([s, n]) => `<div style="display:flex;justify-content:space-between;margin-top:6px">
            <span>${escapeHtml(s)}</span><b style="color:var(--gold)">${n}</b></div>`).join('') || '<p>—</p>'}
      </div>

      <p style="font-size:12px;color:var(--muted)">
        📱 ${Math.round(mobile / rows.length * 100)}% من الجوال ·
        آخر 14 يوماً · ${rows.length} حدث
      </p>`;
  } catch (e) {
    box.innerHTML = `<p style="color:#E74C3C">تعذّر التحميل: ${escapeHtml(e.message || '')}</p>
      <p style="font-size:12px;color:#999">غالباً لم يُشغَّل <code>supabase-analytics.sql</code> بعد.</p>`;
  }
}

/* ============================= PLAYER ACCOUNTS VIEW ============================= */

async function loadUsers() {
  const box = document.getElementById('usersBox');
  if (!box) return;

  if (!supa) {
    box.innerHTML = '<p style="color:#999">⚠️ غير متاح بدون اتصال بالسحابة</p>';
    return;
  }

  box.innerHTML = '<p style="color:#999">جاري التحميل...</p>';

  try {
    const [{ data, error }, { data: adminRows }, { data: banRows }] = await Promise.all([
      supa.from('profiles')
        .select('id, username, created_at, last_seen_at, games_played, games_won, total_score, rooms_created')
        .order('created_at', { ascending: false })
        .limit(500),
      // admins مقروء للإدمن فقط — نعرف منه من يحمل الصلاحية
      supa.from('admins').select('user_id'),
      // المحظورون: الصف يتلوّن وزرّه ينقلب لرفع الحظر.
      // ⚠️ لا نُفشل القائمة كلها إن لم يكن supabase-bans.sql مُشغَّلاً بعد
      supa.from('bans').select('user_id').eq('active', true)
        .then(r => r, () => ({ data: [] }))
    ]);

    if (error) throw error;

    const adminIds = new Set((adminRows || []).map(a => a.user_id));
    const bannedIds = new Set((banRows || []).filter(b => b.user_id).map(b => b.user_id));
    const rows = data || [];
    if (!rows.length) {
      box.innerHTML = '<p style="color:#999">لا توجد حسابات بعد.</p>';
      return;
    }

    const fmtDate = d => d ? new Date(d).toLocaleDateString('ar-SA') : '—';

    box.innerHTML = `
      <p style="font-size:13px;color:var(--muted);margin-bottom:10px;">${rows.length} حساب</p>
      <div class="users-list">
        ${rows.map(u => {
          const isAdmin = adminIds.has(u.id);
          const isBanned = bannedIds.has(u.id);
          const safeId = escapeHtml(u.id);
          // jsStr لا escapeHtml: الاسم يدخل سلسلة JS داخل onclick (راجع utils.js)
          const safeName = jsStr(u.username);
          return `
          <div class="user-row${isAdmin ? ' is-admin' : ''}${isBanned ? ' is-banned' : ''}" data-user="${safeId}">
            <div class="user-main">
              <div class="user-name">
                ${isAdmin ? '<span class="admin-badge">⚙️ إدمن</span> ' : ''}
                ${isBanned ? '<span class="ban-badge">⛔ محظور</span> ' : ''}👤 ${escapeHtml(u.username)}
              </div>
              <div class="user-meta">انضم ${fmtDate(u.created_at)} · آخر ظهور ${fmtDate(u.last_seen_at)}</div>
            </div>
            <div class="user-stats">
              <span title="جولات">🎮 ${Number(u.games_played) || 0}</span>
              <span title="فوز">🏆 ${Number(u.games_won) || 0}</span>
              <span title="مجموع النقاط">⭐ ${Number(u.total_score) || 0}</span>
              <span title="رومات أنشأها">🚪 ${Number(u.rooms_created) || 0}</span>
            </div>
            <div class="user-actions">
              <button class="btn ${isAdmin ? 'btn-ghost' : 'btn-answer'}"
                onclick="setPlayerAdmin('${safeId}', '${safeName}', ${!isAdmin})">
                ${isAdmin ? '↩️ إزالة الإدارة' : '⚙️ ترقية لإدمن'}
              </button>
              ${isAdmin ? '' : (isBanned
                ? `<button class="btn btn-answer user-ban"
                     onclick="unbanPlayerAccount('${safeId}', '${safeName}')">↩️ رفع الحظر</button>`
                : `<button class="btn btn-skip user-ban"
                     onclick="banPlayerAccount('${safeId}', '${safeName}')">⛔ حظر</button>`)}
              <button class="btn btn-skip user-del"
                onclick="deletePlayerAccount('${safeId}', '${safeName}')">🗑️ حذف</button>
            </div>
          </div>`; }).join('')}
      </div>`;
  } catch (e) {
    box.innerHTML = `<p style="color:#E74C3C">تعذّر التحميل: ${escapeHtml(e.message || '')}</p>
      <p style="font-size:12px;color:#999">إن لم تكن شغّلت <code>supabase-accounts.sql</code> فشغّله أولاً.</p>`;
  }
}

async function deletePlayerAccount(userId, username) {
  if (!await uiConfirm(`حذف حساب «${username}» نهائياً؟\n\nستُحذف إحصاءاته معه ولا يمكن التراجع.`)) return;

  try {
    // الحذف يتم داخل قاعدة البيانات عبر دالة تتحقّق من صلاحية الإدمن،
    // حتى لا يحتاج المتصفح أي مفتاح صلاحيات عليا
    const { error } = await supa.rpc('admin_delete_player', { target_id: userId });
    if (error) throw error;

    uiAlert(`✅ تم حذف حساب «${username}»`);
    loadUsers();
  } catch (e) {
    uiAlert(`❌ تعذّر الحذف: ${e.message || ''}`);
  }
}

// ترقية لاعب لإدمن أو إزالة صلاحيته.
// القرار يُفرض في قاعدة البيانات: الدالة ترفض إن لم يكن المنادي إدمن،
// وتمنع إزالة آخر إدمن أو إزالة الشخص نفسه — حتى لا تُقفل اللوحة على الجميع.
async function setPlayerAdmin(userId, username, makeAdmin) {
  const question = makeAdmin
    ? `ترقية «${username}» لإدمن؟\n\nسيقدر يعدّل بنك الأسئلة ويحذف الحسابات.`
    : `إزالة صلاحية الإدارة عن «${username}»؟`;

  if (!await uiConfirm(question)) return;

  try {
    const { error } = await supa.rpc('admin_set_admin', {
      target_id: userId,
      make_admin: makeAdmin
    });
    if (error) throw error;

    uiAlert(makeAdmin ? `✅ «${username}» صار إدمن` : `✅ أُزيلت الإدارة عن «${username}»`);
    loadUsers();
  } catch (e) {
    uiAlert(`❌ ${e.message || 'تعذّرت العملية'}`);
  }
}
