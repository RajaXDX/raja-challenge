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

  const password = await uiPromptPassword('كلمة المرور:');
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

function adminAddCategory() {
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

  CATEGORIES.push({ name, ic: '✨' });
  saveJSON('mr_categories', CATEGORIES);
  pushToCloud();
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
  pushToCloud();

  renderAdminCategories();
  populateBankCatSelect();
  uiAlert('✅ تم حذف الفئة بنجاح');
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

function addBankQuestion() {
  // ✅ حماية أمنية: فقط الإدمن يمكنه إضافة أسئلة
  if (!isAdminLoggedIn) {
    uiAlert('❌ يجب تسجيل الدخول كإدمن أولاً');
    return;
  }

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

  QBANK[cat][diffKey].push({
    question: q,
    answer: a,
    emoji: emoji,
    needsImage: false,
    imageQuery: ''
  });

  saveJSON('mr_bank', QBANK);
  pushToCloud();

  document.getElementById('newQText').value = '';
  document.getElementById('newQAnswer').value = '';
  document.getElementById('newQEmoji').value = '';

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
    const row = createElement('div', { class: 'bank-item' }, `
      <div>
        <div class="bq">${item.emoji || '❓'} ${item.question}</div>
        <div class="ba">الإجابة: ${item.answer}</div>
      </div>
    `);

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

function importImages() {
  if (!isAdminLoggedIn) {
    uiAlert('❌ يجب تسجيل الدخول كإدمن أولاً');
    return;
  }

  const fileInput = document.getElementById('imageImportInput');
  const files = fileInput.files;

  if (files.length === 0) {
    uiAlert('❌ اختر صوراً من الجهاز أولاً');
    return;
  }

  const statusDiv = document.getElementById('imageImportStatus');
  statusDiv.textContent = '⏳ جاري معالجة الصور...';

  let processed = 0;
  let images = loadJSON('mr_images', {});

  Array.from(files).forEach((file, idx) => {
    if (!file.type.startsWith('image/')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      const fileName = file.name;
      const timestamp = Date.now();
      const imageKey = `img_${timestamp}_${idx}`;

      images[imageKey] = {
        name: fileName,
        data: base64,
        size: file.size,
        type: file.type,
        uploadDate: new Date().toISOString()
      };

      processed++;
      statusDiv.textContent = `⏳ تم معالجة ${processed}/${files.length} صورة...`;

      if (processed === files.length) {
        saveJSON('mr_images', images);
        pushToCloud();
        statusDiv.textContent = `✅ تم استيراد ${processed} صورة بنجاح!`;
        fileInput.value = '';
        Sound.award();
        log(`✅ تم استيراد ${processed} صورة`, 'success');

        setTimeout(() => {
          statusDiv.textContent = '';
          showImageLibrary(images);
        }, 1500);
      }
    };
    reader.readAsDataURL(file);
  });
}

function showImageLibrary(images) {
  const imageCount = Object.keys(images).length;
  const msg = `
📸 مكتبة الصور
━━━━━━━━━━━━
إجمالي الصور: ${imageCount}

الصور المحفوظة:
${Object.entries(images).slice(-5).map(([key, img]) =>
  `• ${img.name} (${formatBytes(img.size)})`
).join('\n')}

${imageCount > 5 ? `... و ${imageCount - 5} صور أخرى` : ''}

يمكنك الآن استخدام أسماء الصور في الأسئلة!
  `;
  uiAlert(msg);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

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

/* إغلاق الرومات المفتوحة.
   ⚠️ صار عبر `mr_admin_close_rooms` وهي تفحص `is_admin()` في القاعدة.
   قبلها كانت السياسات مفتوحة، أي أن أي زائر — لا الإدمن وحده — يقدر
   يُغلق رومات الناس وهم يلعبون فيها. */
async function cleanupOldRooms() {
  if (!supa) {
    uiAlert('❌ Supabase غير متصل');
    return;
  }

  try {
    const { data: counts, error: countError } = await supa.rpc('mr_admin_room_count');
    if (countError) throw countError;

    const open = counts?.open || 0;
    if (!open) {
      uiAlert('ℹ️ لا توجد رومات مفتوحة — كل شيء نظيف');
      return;
    }

    if (!await uiConfirm(`إغلاق ${open} روم مفتوحة؟
اللاعبون فيها سيحتاجون إنشاء روم جديدة.`)) {
      return;
    }

    const { data, error } = await supa.rpc('mr_admin_close_rooms');
    if (error) throw error;

    uiAlert(`✅ تم إغلاق ${data?.closed ?? open} روم`);
    log(`🧹 تم إغلاق ${data?.closed ?? open} روم`, 'success');
  } catch (error) {
    console.error('Cleanup error:', error);
    uiAlert(`❌ تعذّر الإغلاق: ${error.message || ''}`);
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
              <div style="font-size:12px;color:#9FB8AB">${l}</div>
              <div style="font-size:22px;font-weight:900;color:#D4AF37">${v}</div>
            </div>`).join('')}
      </div>

      <div style="padding:12px;background:rgba(0,0,0,.2);border-radius:8px;margin-bottom:10px">
        <strong>من أين جاؤوا:</strong>
        ${top.map(([s, n]) => `<div style="display:flex;justify-content:space-between;margin-top:6px">
            <span>${escapeHtml(s)}</span><b style="color:#D4AF37">${n}</b></div>`).join('') || '<p>—</p>'}
      </div>

      <p style="font-size:12px;color:#9FB8AB">
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
    const [{ data, error }, { data: adminRows }] = await Promise.all([
      supa.from('profiles')
        .select('id, username, created_at, last_seen_at, games_played, games_won, total_score, rooms_created')
        .order('created_at', { ascending: false })
        .limit(500),
      // admins مقروء للإدمن فقط — نعرف منه من يحمل الصلاحية
      supa.from('admins').select('user_id')
    ]);

    if (error) throw error;

    const adminIds = new Set((adminRows || []).map(a => a.user_id));
    const rows = data || [];
    if (!rows.length) {
      box.innerHTML = '<p style="color:#999">لا توجد حسابات بعد.</p>';
      return;
    }

    const fmtDate = d => d ? new Date(d).toLocaleDateString('ar-SA') : '—';

    box.innerHTML = `
      <p style="font-size:13px;color:#9FB8AB;margin-bottom:10px;">${rows.length} حساب</p>
      <div class="users-list">
        ${rows.map(u => {
          const isAdmin = adminIds.has(u.id);
          // ⚠️ الاسم والمعرّف يمرّان عبر data-* لا داخل onclick — انظر الشرح
          // في friends.js: escapeHtml يحمي HTML، والمتصفح يفكّ ترميزه قبل
          // تسليم محتوى onclick لمحرّك JavaScript، فيعود الاقتباس حقيقياً.
          const safeId = escapeHtml(u.id);
          const safeName = escapeHtml(u.username);
          return `
          <div class="user-row${isAdmin ? ' is-admin' : ''}" data-user="${safeId}">
            <div class="user-main">
              <div class="user-name">
                ${isAdmin ? '<span class="admin-badge">⚙️ إدمن</span> ' : ''}👤 ${escapeHtml(u.username)}
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
                data-user-act="admin" data-id="${safeId}" data-name="${safeName}"
                data-make="${isAdmin ? '0' : '1'}">
                ${isAdmin ? '↩️ إزالة الإدارة' : '⚙️ ترقية لإدمن'}
              </button>
              <button class="btn btn-skip user-del"
                data-user-act="delete" data-id="${safeId}" data-name="${safeName}">🗑️ حذف</button>
            </div>
          </div>`; }).join('')}
      </div>`;
  } catch (e) {
    box.innerHTML = `<p style="color:#E74C3C">تعذّر التحميل: ${escapeHtml(e.message || '')}</p>
      <p style="font-size:12px;color:#999">إن لم تكن شغّلت <code>supabase-accounts.sql</code> فشغّله أولاً.</p>`;
  }
}

/* مستمع مفوَّض على قائمة الحسابات — يقابل data-user-act أعلاه */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-user-act]');
  if (!btn) return;

  if (btn.dataset.userAct === 'admin') {
    setPlayerAdmin(btn.dataset.id, btn.dataset.name || '', btn.dataset.make === '1');
  } else {
    deletePlayerAccount(btn.dataset.id, btn.dataset.name || '');
  }
});

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
