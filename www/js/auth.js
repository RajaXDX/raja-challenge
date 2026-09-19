/* ============================= PLAYER ACCOUNTS ============================= */
/*
  حسابات اللاعبين عبر Supabase Auth.

  لماذا لا نخزّن كلمة المرور بأنفسنا:
  تخزين كلمات المرور بشكل صحيح صعب وخطير — أي خطأ يكشف حسابات الجميع. لذلك
  نترك الأمر لـ Supabase Auth الذي يحفظها مشفّرة في مخطط auth المحمي. النتيجة
  أن **لا أحد** يستطيع عرض كلمة مرور لاعب — ولا الإدمن ولا نحن — وهذا هو
  السلوك الصحيح لا نقصاً في اللوحة.

  Supabase Auth يطلب بريداً، واللاعب يسجّل باسم مستخدم. لذلك نشتقّ بريداً
  داخلياً ثابتاً من اسم المستخدم، فيبقى الدخول ممكناً بالاسم وحده.
*/

// بوابة الحساب.
//
// مشغّلة: لا لعب بلا حساب. تتطلّب أن يكون الإعداد في Supabase مكتملاً —
//   1) supabase-accounts.sql مُشغَّل
//   2) "Confirm email" معطّل في Authentication → Sign In / Providers → Email
// اجعلها false لو أردت إتاحة اللعب بلا حساب (احتكاك أقل عند النشر).
const REQUIRE_ACCOUNT = true;

const ACCOUNT_EMAIL_DOMAIN = 'raja-players.com';

let currentProfile = null;

/* ---- اسم المستخدم ---- */

// نطبّع الاسم حتى يكون الدخول متسقاً: حروف صغيرة بلا مسافات طرفية
function normalizeUsername(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// البريد الداخلي مشتقّ من بصمة الاسم — غير مرئي للاعب ولا يُرسل له شيء.
//
// لماذا بصمة لا الاسم نفسه: الأسماء العربية عند ترميزها في بريد تُنتج محارف %
// يرفضها Supabase كبريد غير صالح. البصمة ASCII دائماً، وثابتة لنفس الاسم
// فيبقى الدخول ممكناً باسم المستخدم وحده، ولا تكشف الاسم في جدول Auth.
async function usernameToEmail(name) {
  const clean = normalizeUsername(name);
  const bytes = new TextEncoder().encode('raja:' + clean);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  return `u${hex}@${ACCOUNT_EMAIL_DOMAIN}`;
}

function validateCredentials(username, password) {
  const u = normalizeUsername(username);
  if (u.length < 3) return 'اسم المستخدم لازم 3 أحرف على الأقل';
  if (u.length > 20) return 'اسم المستخدم طويل (20 حرف كحد أقصى)';
  if (!/^[\p{L}\p{N} _-]+$/u.test(u)) return 'اسم المستخدم يقبل حروفاً وأرقاماً ومسافة و _ - فقط';
  if (!password || password.length < 6) return 'كلمة المرور لازم 6 أحرف على الأقل';
  return null;
}

/* ---- التسجيل والدخول ---- */

async function signUpPlayer(username, password, email) {
  if (!supa) return { error: 'قاعدة البيانات غير متصلة' };

  const problem = validateCredentials(username, password);
  if (problem) return { error: problem };

  const mail = String(email || '').trim().toLowerCase();
  if (!mail) return { error: 'البريد الإلكتروني مطلوب' };
  if (!isValidEmail(mail)) return { error: 'صيغة البريد الإلكتروني غير صحيحة' };

  const clean = normalizeUsername(username);

  try {
    // الحسابات الجديدة تُسجَّل ببريد حقيقي — وهو ما يجعل استعادة كلمة
    // المرور ممكنة أصلاً. الحسابات القديمة تبقى على البريد المشتقّ من الاسم.
    const { data, error } = await supa.auth.signUp({
      email: mail,
      password,
      options: { emailRedirectTo: location.origin + location.pathname + '?recover=1' }
    });

    if (error) {
      if (/already registered|already been registered/i.test(error.message)) {
        return { error: 'هذا البريد مسجّل بالفعل — سجّل الدخول أو استعد كلمة المرور' };
      }
      return { error: error.message };
    }

    if (!data.user) return { error: 'تعذّر إنشاء الحساب' };

    // ملف اللاعب المرئي (الاسم والإحصاءات)
    const { error: profileError } = await supa
      .from('profiles')
      .insert({ id: data.user.id, username: clean });

    if (profileError && !/duplicate/i.test(profileError.message)) {
      return { error: 'تعذّر إنشاء الملف الشخصي' };
    }

    await loadProfile();
    trackEvent?.('account_created');
    log(`✅ حساب جديد: ${clean}`, 'success');
    return { ok: true };
  } catch (e) {
    console.error('signUpPlayer', e);
    return { error: 'حدث خطأ غير متوقع' };
  }
}

async function signInPlayer(identifier, password) {
  if (!supa) return { error: 'قاعدة البيانات غير متصلة' };
  if (!identifier || !password) return { error: 'اكتب بياناتك وكلمة المرور' };

  const raw = String(identifier).trim();

  try {
    // بريد صريح → مباشرة. اسم مستخدم → البريد المشتقّ (الحسابات القديمة).
    let { error } = await supa.auth.signInWithPassword({
      email: raw.includes('@') ? raw.toLowerCase() : await usernameToEmail(raw),
      password
    });

    // اسم مستخدم لحساب جديد مسجّل ببريد حقيقي: نجرّب المسار الآخر
    if (error && !raw.includes('@')) {
      const alt = await supa.auth.signInWithPassword({ email: raw.toLowerCase(), password });
      error = alt.error;
    }

    if (error) return { error: 'البيانات غير صحيحة' };

    await loadProfile();
    await supa.from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', currentProfile?.id);

    log(`✅ دخول: ${currentProfile?.username}`, 'success');
    return { ok: true };
  } catch (e) {
    console.error('signInPlayer', e);
    return { error: 'حدث خطأ غير متوقع' };
  }
}

async function signOutPlayer() {
  try { await supa?.auth.signOut(); } catch (e) { console.warn(e); }
  currentProfile = null;
  isAdminLoggedIn = false;
  if (typeof leaveRoom === 'function' && currentRoom) await leaveRoom();
  renderAuthState();
  showScreen('screen-auth');
}

/* ---- الملف الشخصي ---- */

async function loadProfile() {
  if (!supa) return null;

  try {
    const { data: { user } } = await supa.auth.getUser();
    if (!user) { currentProfile = null; return null; }

    const { data, error } = await supa
      .from('profiles').select('*').eq('id', user.id).single();

    if (error) { currentProfile = null; return null; }

    currentProfile = data;
    return data;
  } catch (e) {
    currentProfile = null;
    return null;
  }
}

function isSignedIn() {
  return !!currentProfile;
}

// اسم اللاعب المعتمد في الرومات
function getPlayerDisplayName() {
  return currentProfile?.username || 'لاعب';
}

/* ---- الإحصاءات ---- */

// تُستدعى عند انتهاء الجولة. الزيادة تتم على القيم المقروءة حالاً —
// اللعبة فردية لكل جهاز فلا يوجد تسابق حقيقي على نفس الصف.
async function recordGameResult({ won, score }) {
  if (!supa || !currentProfile) return;

  try {
    const next = {
      games_played: (currentProfile.games_played || 0) + 1,
      games_won: (currentProfile.games_won || 0) + (won ? 1 : 0),
      total_score: (currentProfile.total_score || 0) + (Number(score) || 0),
      last_seen_at: new Date().toISOString()
    };

    const { error } = await supa.from('profiles')
      .update(next).eq('id', currentProfile.id);

    if (!error) Object.assign(currentProfile, next);
  } catch (e) {
    console.warn('تعذّر تسجيل نتيجة الجولة:', e);
  }
}

async function bumpRoomsCreated() {
  if (!supa || !currentProfile) return;
  try {
    const next = { rooms_created: (currentProfile.rooms_created || 0) + 1 };
    await supa.from('profiles').update(next).eq('id', currentProfile.id);
    Object.assign(currentProfile, next);
  } catch (e) { /* لا يعطّل اللعب */ }
}

/* ---- صلاحية الإدمن ---- */

// الإدمن = عضوية في جدول admins، لا مجرد "مسجّل دخول"،
// لأن كل اللاعبين صاروا مسجّلين بعد إضافة الحسابات.
async function checkIsAdmin() {
  if (!supa) return false;
  try {
    // is_admin() تعتمد على auth.uid() من الجلسة نفسها.
    // ⚠️ لا تشترط وجود صف في profiles: حساب الإدارة يُنشأ يدوياً في Supabase
    // ولا ملف لاعب له، وكان اشتراط الملف يرفض دخول الإدمن الحقيقي.
    const { data, error } = await supa.rpc('is_admin');
    if (error) {
      console.warn('is_admin فشلت:', error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.warn('is_admin استثناء:', e);
    return false;
  }
}

/* ---- الواجهة ---- */

function renderAuthState() {
  const box = document.getElementById('authState');
  if (!box) return;

  if (!isSignedIn()) {
    box.innerHTML = '';
    box.style.display = 'none';
    return;
  }

  box.style.display = 'flex';
  box.innerHTML = `
    <span class="auth-user">👤 ${escapeHtml(currentProfile.username)}</span>
    <button class="auth-signout" onclick="signOutPlayer()">خروج</button>
  `;
}

async function handleAuthSubmit(mode) {
  const u = document.getElementById('authUsername')?.value;
  const p = document.getElementById('authPassword')?.value;
  const msg = document.getElementById('authMessage');
  const btns = document.querySelectorAll('#screen-auth .btn-main');

  const setBusy = (busy) => btns.forEach(b => { b.disabled = busy; });
  if (msg) { msg.textContent = ''; msg.className = 'auth-message'; }

  const mail = document.getElementById('authEmail')?.value;

  if (mode === 'reset') { setBusy(false); return submitNewPassword(); }

  setBusy(true);
  let res;
  if (mode === 'signup')      res = await signUpPlayer(u, p, mail);
  else if (mode === 'forgot') res = await requestPasswordReset(mail);
  else                        res = await signInPlayer(u, p);
  setBusy(false);

  if (mode === 'forgot' && res.ok) {
    if (msg) {
      msg.textContent = '📧 لو كان البريد مسجّلاً، وصلك رابط الاستعادة الآن';
      msg.className = 'auth-message';
    }
    return;
  }

  if (res.error) {
    if (msg) { msg.textContent = res.error; msg.className = 'auth-message error'; }
    return;
  }

  document.getElementById('authPassword').value = '';
  renderAuthState();

  refreshFriendBadge?.();

  // أكمل إلى الروم الذي دُعي إليه إن كان جاء من رابط، وإلا للرئيسية
  const resumed = await handleRoomLinkOnLoad();
  if (!resumed) goToModeSelect();
}

/* اللعب بلا حساب — للجلسة الحالية وحدها، لا يُحفظ.
   ⚠️ ليس تسهيلاً بل شرط قبول في App Store (بند 5.1.1(v)): لا يجوز اشتراط
   حساب لميزة لا تحتاجه، واللعب على جهاز واحد لا يحتاجه. */
let guestMode = false;

function continueWithoutAccount() {
  guestMode = true;
  Sound?.click?.();
  renderAuthState();
  showScreen('screen-home');
  log('🎮 وضع اللعب بلا حساب', 'info');
}

function isGuest() { return guestMode && !isSignedIn(); }

// البوابة عند تحميل الصفحة
async function initAuthGate() {
  // لا مكتبة أصلاً → لا سحابة ولا بوابة
  if (!supa) return true;

  // ⚠️ **المكتبة صارت محزومة داخل التطبيق** (بند آبل 2.5.2)، فـ`supa` لم
  // يعد يكون null عند انقطاع الشبكة كما كان أيام الـCDN. لولا هذا الفحص
  // لصار التطبيق بلا إنترنت شاشةَ دخولٍ لا تُتجاوز أبداً — والمراجع في
  // آبل يختبر بلا شبكة. الوصول للخادم هو ما يقرّر، لا وجود المكتبة.
  const reachable = await testSupabaseConnection();
  if (!reachable) {
    log('📴 تعذّر الوصول للخادم — اللعب المحلي متاح', 'info');
    return true;
  }

  // العودة من رابط استعادة كلمة المرور تسبق كل شيء
  await loadProfile();
  if (await handleRecoveryLink()) return false;

  if (!REQUIRE_ACCOUNT) return true;
  renderAuthState();

  if (!isSignedIn()) {
    showScreen('screen-auth');
    return false;
  }

  refreshFriendBadge?.();
  return true;
}

/* ---- تبديل تبويب دخول/تسجيل ---- */

let currentAuthMode = 'login';

function switchAuthTab(mode) {
  currentAuthMode = mode;
  Sound.click();

  const el = id => document.getElementById(id);
  el('authTabLogin')?.classList.toggle('active', mode === 'login');
  el('authTabSignup')?.classList.toggle('active', mode === 'signup');

  const show = (id, on) => { const e = el(id); if (e) e.style.display = on ? '' : 'none'; };

  // أربعة أوضاع: دخول · حساب جديد · نسيت كلمة المرور · تعيين كلمة جديدة
  const conf = {
    login:  { user: true,  email: false, pass: true,  btn: 'دخول',
              note: 'ما عندك حساب؟ اضغط «حساب جديد» فوق', forgot: true,
              userLabel: 'اسم المستخدم أو البريد' },
    signup: { user: true,  email: true,  pass: true,  btn: 'إنشاء الحساب',
              note: 'عندك حساب؟ اضغط «دخول» فوق', forgot: false,
              userLabel: 'اسم المستخدم' },
    forgot: { user: false, email: true,  pass: false, btn: 'أرسل رابط الاستعادة',
              note: 'راح يوصلك رابط على بريدك — افتحه من نفس الجهاز', forgot: false },
    reset:  { user: false, email: false, pass: true,  btn: 'حفظ كلمة المرور الجديدة',
              note: 'اكتب كلمة مرور جديدة لحسابك', forgot: false }
  }[mode] || {};

  show('authUsernameRow', conf.user);
  show('authEmailRow', conf.email);
  show('authPasswordRow', conf.pass);
  show('authForgotBtn', conf.forgot);

  const userLabel = document.querySelector('#authUsernameRow label');
  if (userLabel && conf.userLabel) userLabel.textContent = conf.userLabel;

  const btn = el('authSubmitBtn');
  if (btn) btn.textContent = conf.btn || 'متابعة';

  const note = el('authNote');
  if (note) note.textContent = conf.note || '';

  const pass = el('authPassword');
  if (pass) pass.setAttribute('autocomplete',
    (mode === 'signup' || mode === 'reset') ? 'new-password' : 'current-password');

  const msg = el('authMessage');
  if (msg) { msg.textContent = ''; msg.className = 'auth-message'; }
}

/* ============================= PASSWORD RECOVERY ============================= */

// إرسال رابط استعادة. Supabase يرسله للبريد المسجّل في الحساب — لذلك
// الاستعادة تعمل فقط للحسابات المسجّلة ببريد حقيقي.
async function requestPasswordReset(email) {
  if (!supa) return { error: 'قاعدة البيانات غير متصلة' };

  const mail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(mail)) return { error: 'اكتب بريداً إلكترونياً صحيحاً' };

  try {
    const { error } = await supa.auth.resetPasswordForEmail(mail, {
      redirectTo: location.origin + location.pathname + '?recover=1'
    });
    if (error) return { error: error.message };

    // لا نكشف هل البريد مسجّل أم لا — هذا يمنع استكشاف الحسابات
    return { ok: true };
  } catch (e) {
    return { error: 'تعذّر الإرسال' };
  }
}

// يُستدعى عند العودة من رابط الاستعادة: Supabase يضع جلسة مؤقتة تسمح
// بتغيير كلمة المرور فقط.
async function handleRecoveryLink() {
  const hasFlag = new URLSearchParams(location.search).get('recover');
  const hash = location.hash || '';
  if (!hasFlag && !/type=recovery/.test(hash)) return false;

  history.replaceState(null, '', location.pathname);
  showScreen('screen-auth');
  switchAuthTab('reset');
  return true;
}

async function submitNewPassword() {
  const p1 = document.getElementById('authPassword')?.value || '';
  const msg = document.getElementById('authMessage');

  const show = (text, isError) => {
    if (msg) { msg.textContent = text; msg.className = 'auth-message' + (isError ? ' error' : ''); }
  };

  if (p1.length < 6) return show('كلمة المرور لازم 6 أحرف على الأقل', true);

  try {
    const { error } = await supa.auth.updateUser({ password: p1 });
    if (error) return show(error.message, true);

    show('✅ تم تغيير كلمة المرور — جارٍ الدخول...', false);
    await loadProfile();
    renderAuthState();
    setTimeout(() => goToModeSelect(), 900);
  } catch (e) {
    show('تعذّر تغيير كلمة المرور', true);
  }
}
