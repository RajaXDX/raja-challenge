/* ============================= الحظر (BAN) ============================= */
/*
  منع لاعب — وجهازه — من العودة للعبة أو إنشاء حساب جديد.

  يعتمد على supabase-bans.sql. الطبقات ثلاث وقوّتها ليست واحدة:

    1) الحساب       — مفروض في قاعدة البيانات، لا يُنتحل ولا يُلتَفّ عليه.
    2) معرّف الجهاز — mr_device_id في localStorage. يكسره مسح بيانات الموقع.
    3) بصمة الجهاز  — نوع الجهاز والشاشة والمتصفح والمنطقة الزمنية ورسم
                      canvas. تبقى بعد مسح التخزين وفي النافذة الخاصة.

  ⚠️ **نفشل مفتوحين لا مغلقين**: أي تعذّر في الفحص (شبكة، أو أن السكربت
  لم يُشغَّل في Supabase بعد) يعني «غير محظور». العكس — أن يمنع عطلُ شبكةٍ
  عابرٌ كلَّ اللاعبين من اللعب — أسوأ بكثير من مرور محظور جولةً واحدة،
  خصوصاً أن قاعدة البيانات نفسها ترفضه عند أول فعل حقيقي على أي حال.
*/

// نتيجة آخر فحص، حتى لا نكرّر النداء في نفس تحميل الصفحة
let banStatusCache = null;

/* ---- بصمة الجهاز ---- */

async function sha256Hex(text, length = 32) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

// رسم نصّ في canvas وقراءة ناتجه: نفس الرسم يعطي بايتات مختلفة قليلاً
// باختلاف بطاقة الرسم والخطوط ونظام التشغيل، فيضيف تمييزاً لا تعطيه
// خصائص navigator وحدها. بعض المتصفحات تعشوِش الناتج حمايةً للخصوصية —
// عندها تتغيّر البصمة كل مرة فلا تُمسك، ولا تُخطئ في حقّ أحد.
function canvasSignature() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';

    ctx.textBaseline = 'top';
    ctx.font = '16px "Cairo", Arial';
    ctx.fillStyle = '#3FA796';
    ctx.fillRect(2, 2, 120, 24);
    ctx.fillStyle = '#D4AF37';
    ctx.fillText('تحدي رجا 🎮 raja', 4, 6);
    ctx.strokeStyle = 'rgba(212,175,55,.6)';
    ctx.arc(60, 30, 14, 0, Math.PI * 1.7);
    ctx.stroke();

    return canvas.toDataURL().slice(-96);
  } catch (e) {
    return 'canvas-error';
  }
}

// ⚠️ لا تُخزَّن في localStorage عمداً: فائدتها كلها أنها تبقى **بعد** مسحه.
let deviceFingerprintPromise = null;

function getDeviceFingerprint() {
  if (deviceFingerprintPromise) return deviceFingerprintPromise;

  deviceFingerprintPromise = (async () => {
    try {
      const nav = navigator;
      const parts = [
        nav.userAgent,
        nav.platform || '',
        (nav.languages || [nav.language || '']).join(','),
        `${screen.width}x${screen.height}x${screen.colorDepth}`,
        String(window.devicePixelRatio || 1),
        Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        String(new Date().getTimezoneOffset()),
        String(nav.hardwareConcurrency || 0),
        String(nav.deviceMemory || 0),
        String(nav.maxTouchPoints || 0),
        canvasSignature()
      ];
      return await sha256Hex(parts.join('|'));
    } catch (e) {
      console.warn('تعذّر حساب بصمة الجهاز:', e);
      return null;
    }
  })();

  return deviceFingerprintPromise;
}

/* ---- الفحص ---- */

// يُرجع { banned, reason }. لا يرمي أبداً.
async function checkBanStatus({ force = false } = {}) {
  if (!supa) return { banned: false };
  if (banStatusCache && !force) return banStatusCache;

  try {
    const [device, fingerprint] = await Promise.all([
      Promise.resolve(getDeviceId()),
      getDeviceFingerprint()
    ]);

    const { data, error } = await supa.rpc('check_ban', {
      p_device: device || null,
      p_fingerprint: fingerprint || null
    });

    if (error) {
      // غالباً: supabase-bans.sql لم يُشغَّل بعد
      console.warn('تعذّر فحص الحظر:', error.message);
      return { banned: false };
    }

    banStatusCache = {
      banned: data?.banned === true,
      reason: data?.reason || ''
    };
    return banStatusCache;
  } catch (e) {
    console.warn('تعذّر فحص الحظر:', e);
    return { banned: false };
  }
}

// بعد كل دخول ناجح: نربط الجهاز بالحساب (ذاكرة الحظر) ونفحص في نفس النداء
async function registerDeviceAndCheckBan() {
  if (!supa) return { banned: false };

  try {
    const [device, fingerprint] = await Promise.all([
      Promise.resolve(getDeviceId()),
      getDeviceFingerprint()
    ]);

    const { data, error } = await supa.rpc('register_device', {
      p_device: device || null,
      p_fingerprint: fingerprint || null
    });

    if (error) {
      console.warn('تعذّر تسجيل الجهاز:', error.message);
      return { banned: false };
    }

    banStatusCache = {
      banned: data?.banned === true,
      reason: data?.reason || ''
    };
    return banStatusCache;
  } catch (e) {
    console.warn('تعذّر تسجيل الجهاز:', e);
    return { banned: false };
  }
}

/* ---- شاشة المحظور ---- */

async function showBannedScreen(reason) {
  // نُنهي الجلسة: بقاؤها مفتوحة يعني أن أي تبويب آخر يواصل اللعب
  try { stopListeningToCloud?.(); } catch (e) { /* لا يمنع العرض */ }
  try { unsubscribeFromInvites?.(); } catch (e) { /* لا يمنع العرض */ }
  try { await supa?.auth.signOut(); } catch (e) { /* لا يمنع العرض */ }
  currentProfile = null;

  const box = document.getElementById('bannedReason');
  if (box) {
    const text = String(reason || '').trim();
    box.textContent = text || 'لم يُذكر سبب.';
  }

  // لا لوحة إدارة ولا حالة حساب في شاشة الحظر
  const gear = document.getElementById('adminGearBtn');
  if (gear) gear.style.display = 'none';
  const auth = document.getElementById('authState');
  if (auth) auth.style.display = 'none';

  showScreen('screen-banned');

  // الشات مبنيّ في body لا داخل شاشة، فتبديل الشاشة وحده لا يخفيه
  document.getElementById('chatFabWrap')?.remove();
  document.getElementById('chatPanel')?.remove();
}

// بوابة الفتح: تُنادى من js/sync.js قبل بوابة الحساب.
// ترجع true إذا كان محظوراً (أي: توقّف كل شيء بعدها).
async function enforceBanGate() {
  const status = await checkBanStatus();
  if (!status.banned) return false;

  log('⛔ هذا الجهاز/الحساب محظور', 'warning');
  await showBannedScreen(status.reason);
  return true;
}

// فحص قبل الأفعال التي تبني شيئاً في السحابة (إنشاء/دخول روم).
// السياسات في القاعدة ترفض المحظور على أي حال، لكن الرسالة هنا مفهومة،
// وهذا ما يمسك من حُظر **أثناء** جلسته المفتوحة.
async function blockedByBan() {
  const status = await checkBanStatus({ force: true });
  if (!status.banned) return false;
  await showBannedScreen(status.reason);
  return true;
}

/* ============================= لوحة الإدارة ============================= */

/* ---- نافذة الحظر ---- */
// نافذة خاصة لا uiConfirm: نحتاج سبباً مكتوباً (يُعرض للمحظور) وخيارَي
// الجهاز والبصمة معاً — وهذا لا يعبّر عنه سؤال بنعم/لا.
function askBanDetails(username) {
  return new Promise(resolve => {
    const overlay = createElement('div', { class: 'ui-modal-overlay' });

    const box = createElement('div', { class: 'ui-modal ban-modal' }, `
      <div class="ui-modal-msg">
        <strong>⛔ حظر «${escapeHtml(username)}»</strong>
      </div>

      <label class="ban-field">
        <span>السبب (يظهر له عند محاولة الدخول)</span>
        <input type="text" class="ui-modal-input" id="banReasonInput"
               maxlength="120" placeholder="مثال: إساءة في الشات">
      </label>

      <label class="ban-check">
        <input type="checkbox" id="banDevicesChk" checked>
        <span>احظر أجهزته أيضاً — يمنع إنشاء حساب جديد من نفس الجهاز</span>
      </label>

      <label class="ban-check">
        <input type="checkbox" id="banFingerprintChk" checked>
        <span>احظر بصمة جهازه — تبقى بعد مسح بيانات المتصفح وفي النافذة الخاصة</span>
      </label>

      <p class="ban-warn">
        ⚠️ البصمة قد تطابق جهازاً آخر مماثلاً تماماً (نفس الموديل والنظام
        والمتصفح)، فيُحظر شخص بريء. رفع الحظر بضغطة من قائمة المحظورين.
      </p>

      <div class="ui-modal-actions">
        <button class="btn-main btn-ghost" data-act="cancel">إلغاء</button>
        <button class="btn-main btn-primary" data-act="ok">حظر</button>
      </div>
    `);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const close = (value) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 180);
      resolve(value);
    };

    box.querySelector('[data-act="ok"]').onclick = () => close({
      reason: box.querySelector('#banReasonInput').value.trim(),
      banDevices: box.querySelector('#banDevicesChk').checked,
      banFingerprint: box.querySelector('#banFingerprintChk').checked
    });

    box.querySelector('[data-act="cancel"]').onclick = () => close(null);
    overlay.onclick = (e) => { if (e.target === overlay) close(null); };
    box.onkeydown = (e) => { if (e.key === 'Escape') close(null); };

    setTimeout(() => box.querySelector('#banReasonInput')?.focus(), 60);
  });
}

async function banPlayerAccount(userId, username) {
  if (!isAdminLoggedIn) { uiAlert('❌ يجب تسجيل الدخول كإدمن أولاً'); return; }

  const details = await askBanDetails(username);
  if (!details) return;

  try {
    const { data, error } = await supa.rpc('admin_ban_player', {
      target_id: userId,
      p_reason: details.reason || null,
      p_ban_devices: details.banDevices,
      p_ban_fingerprint: details.banFingerprint
    });
    if (error) throw error;

    const devices = Number(data?.devices) || 0;
    const fps = Number(data?.fingerprints) || 0;
    const extra = (devices || fps)
      ? ` (+${devices} جهاز، +${fps} بصمة)`
      : ' — لم يُسجَّل له جهاز بعد، سيُمسك بحسابه';

    log(`⛔ حُظر ${username}${extra}`, 'warning');
    uiAlert(`✅ تم حظر «${username}»${extra}`);

    loadUsers();
    loadBans();
  } catch (e) {
    uiAlert(`❌ ${e.message || 'تعذّر الحظر'}`);
  }
}

async function unbanPlayerAccount(userId, username) {
  if (!await uiConfirm(`رفع الحظر عن «${username}»؟\n\nسيرجع هو وأجهزته للّعب.`)) return;

  try {
    const { error } = await supa.rpc('admin_unban_player', { target_id: userId });
    if (error) throw error;

    uiAlert(`✅ رُفع الحظر عن «${username}»`);
    loadUsers();
    loadBans();
  } catch (e) {
    uiAlert(`❌ ${e.message || 'تعذّر رفع الحظر'}`);
  }
}

// رفع سطر واحد: لجهاز أو بصمة لا حساب لها (البريء الذي وقع في بصمة مطابقة)
async function unbanRow(banId) {
  if (!await uiConfirm('رفع هذا الحظر؟')) return;

  try {
    const { error } = await supa.rpc('admin_unban_row', { p_id: banId });
    if (error) throw error;
    uiAlert('✅ رُفع الحظر');
    loadBans();
  } catch (e) {
    uiAlert(`❌ ${e.message || 'تعذّر رفع الحظر'}`);
  }
}

/* ---- قائمة المحظورين ---- */

async function loadBans() {
  const box = document.getElementById('bansBox');
  if (!box) return;

  if (!supa) {
    box.innerHTML = '<p style="color:#999">⚠️ غير متاح بدون اتصال بالسحابة</p>';
    return;
  }

  box.innerHTML = '<p style="color:#999">جاري التحميل...</p>';

  try {
    const { data, error } = await supa
      .from('bans')
      .select('id, user_id, device_id, fingerprint, username, reason, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) throw error;

    const rows = data || [];

    if (!rows.length) {
      box.innerHTML = '<p style="color:#9FB8AB">لا يوجد محظورون. 👍</p>';
      return;
    }

    const fmtDate = d => d ? new Date(d).toLocaleDateString('ar-SA') : '—';
    const kind = r => r.user_id ? '👤 حساب' : (r.device_id ? '📱 جهاز' : '🔎 بصمة');
    const short = t => t ? escapeHtml(String(t).slice(0, 10)) + '…' : '';

    box.innerHTML = `
      <p style="font-size:13px;color:#9FB8AB;margin-bottom:10px;">${rows.length} حظر نشط</p>
      <div class="users-list">
        ${rows.map(r => `
          <div class="user-row is-banned">
            <div class="user-main">
              <div class="user-name">${kind(r)} ${escapeHtml(r.username || 'بلا اسم')}</div>
              <div class="user-meta">
                ${escapeHtml(r.reason || 'بلا سبب مذكور')} · ${fmtDate(r.created_at)}
                ${r.device_id ? ` · جهاز ${short(r.device_id)}` : ''}
                ${r.fingerprint ? ` · بصمة ${short(r.fingerprint)}` : ''}
              </div>
            </div>
            <div class="user-actions">
              ${r.user_id
                ? `<button class="btn btn-answer"
                     onclick="unbanPlayerAccount('${escapeHtml(r.user_id)}', '${jsStr(r.username || '')}')">
                     ↩️ رفع الحظر عنه وعن أجهزته</button>`
                : `<button class="btn btn-answer" onclick="unbanRow(${Number(r.id)})">
                     ↩️ رفع هذا السطر</button>`}
            </div>
          </div>`).join('')}
      </div>`;
  } catch (e) {
    box.innerHTML = `<p style="color:#E74C3C">تعذّر التحميل: ${escapeHtml(e.message || '')}</p>
      <p style="font-size:12px;color:#999">إن لم تكن شغّلت <code>supabase-bans.sql</code> فشغّله أولاً.</p>`;
  }
}
