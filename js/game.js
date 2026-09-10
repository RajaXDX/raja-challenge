/* ============================= GAME STATE ============================= */

// الثوابت
// ملاحظة: هذا الرمز يعمل فقط في التشغيل المحلي بدون سحابة، حيث لا يؤثر التعديل
// على أحد. مع وجود Supabase يكون الدخول ببريد وكلمة مرور عبر Supabase Auth،
// والصلاحية مفروضة في قاعدة البيانات (راجع supabase-admin-security.sql).
const ADMIN_PIN = '2014';
const LIFELINES = [
  {
    key: 'fakh', name: 'الفخ', ic: '🪤',
    desc: 'إذا أجاب الفريق الآخر إجابة صحيحة، تذهب النقاط لكم بدلاً منه.'
  },
  {
    key: 'istareeh', name: 'استريح', ic: '✋',
    desc: 'تتخطّون السؤال بلا نقاط لأحد، ويبقى الدور معكم.'
  },
  {
    key: 'hofra', name: 'الحفرة', ic: '🕳️',
    desc: 'يُمنع الفريق الآخر من أخذ نقاط هذا السؤال.'
  },
  {
    key: 'sadeeq', name: 'اتصال بصديق', ic: '📞',
    desc: 'لديكم 30 ثانية للاتصال بصديق يساعدكم في الإجابة.'
  },
  {
    key: 'jawabain', name: 'جاوب جوابين', ic: '✌️',
    desc: 'يحقّ لكم تقديم إجابتين، وتُحتسب لكم إن صحّت إحداهما.'
  },
];

/*
  الفئات الأصلية المعتمدة (2026-08-04).

  ⚠️ هذه ليست قائمة تاريخية بل **القائمة الحيّة**: نُسخت حرفياً من صفّ
  `categories` في `game_settings` بعد أن استقرّ المستخدم عليها، فصار الجهاز
  الجديد يبدأ بها بلا انتظار السحابة، ولا يرى فئة مسحوبة ولو لحظة واحدة.

  كانت من قبل 35 فئة من زمن البداية، وسبعَ عشرةَ منها مسحوبة فعلياً — فأي
  جهاز جديد كان يعرضها ثم تختفي عند أول مزامنة. مصدر الحقيقة الآن واحد.

  📌 **عند حذف فئة**: أسقِطها من هنا **وأضِف اسمها إلى
  `data/retired-categories.json`** — الحذف من هنا وحده لا يكفي، لأن
  `syncCategoriesWithBank` تُعيدها من أسئلة الملفات.
  📌 **عند إضافة فئة**: أضِفها هنا بنفس الاسم حرفاً بحرف — الاسم مفتاح
  البنك، وأي فرق (مسافة أو تشكيل) يُنتج فئة ثانية فارغة.
*/
const DEFAULT_CATEGORIES = [
  { name: 'الشمال', ic: '🧭' }, { name: 'الوسطى', ic: '🏙️' }, { name: 'الجنوب', ic: '⛰️' },
  { name: 'الغربية', ic: '🏘️' }, { name: 'الشرقية', ic: '🛢️' }, { name: 'السعودية', ic: '🇸🇦' },
  { name: 'لهجات سعودية', ic: '🗣️' }, { name: 'مطاعم السعودية', ic: '🍽️' },
  { name: 'شعارات سعودية', ic: '🏷️' }, { name: 'عالم الحيوان', ic: '🐘' },
  { name: 'معلومات عامة', ic: '❓' }, { name: 'تاريخ', ic: '🏛️' },
  { name: 'عالم الشعر', ic: '✍️' }, { name: 'لغة وأدب', ic: '📖' },
  { name: 'طب عام', ic: '🩺' }, { name: 'شعارات عالمية', ic: '🌐' },
  { name: 'منو المشهور', ic: '🎩' },
  // فئات أضافها المستخدم بنفسه — الاسم يحمل رمزه، والأيقونة تُركت ✨ كما في السحابة
  { name: '😀 خمن بالإيموجي', ic: '✨' }, { name: 'جغرافيا 🌎', ic: '✨' },
  { name: 'الالغاز 🧩', ic: '✨' }, { name: 'الحساب 🧮', ic: '✨' },
  { name: 'الانبياء 🌙', ic: '✨' }, { name: 'ولا كلمة 🤫', ic: '✨' },
  // فئتا الأعلام — صور بحتة، أسئلتها في data/questions-part16.json
  { name: 'أعلام عربية', ic: '🏳️' }, { name: 'أعلام العالم', ic: '🌍' },
  { name: 'أعلام قديمة', ic: '📜' },
  // خرائط الدول — صور بحتة، أسئلتها في data/questions-part18.json
  { name: 'خرائط الدول', ic: '🗺️' },
  // صور قديمة — صور بحتة، أسئلتها في data/questions-part19.json
  { name: 'صور قديمة', ic: '📷' },
  /*
    أُضيفت 2026-09-10 بطلب المستخدم **بلا أسئلة بعد**: الأسماء تُحجَز أولاً
    لتظهر الفئة على كل جهاز، والبنك يُملأ بعدها. حتى ذلك الحين فتح أي خلية
    فيها يعرض نموذج «إضافة سؤال سريع» (`showQuickAddForm`) لا خطأ — فهي
    قابلة للاختيار لكنها غير جاهزة للعب.
  */
  { name: 'حروف مبعثرة', ic: '🔤' }, { name: 'صحح الخطأ', ic: '✏️' },
  { name: 'القرآن الكريم', ic: '📗' }, { name: 'شعارات دول', ic: '🛡️' },
  { name: 'نشيد وطني', ic: '🎼' }, { name: 'معالم السعودية', ic: '🕌' },
  { name: 'اسم اللاعب الأول', ic: '🪪' }, { name: 'تسريحة لاعب', ic: '💇' },
  { name: 'كرة قدم', ic: '⚽' }, { name: 'الكرة السعودية', ic: '🏆' },
  { name: 'شعارات أندية ومنتخبات', ic: '🏟️' },
  { name: 'ألعاب إلكترونية', ic: '🎮' },
];

// متغيرات الحالة
let CATEGORIES = loadJSON('mr_categories', DEFAULT_CATEGORIES.slice());
let POINTS = loadJSON('mr_points', [100, 250, 400]);
let QBANK = loadJSON('mr_bank', {});

// يعالج حالات محفوظة سابقاً بمتصفحات تأثرت بباق مزامنة قديم كتب مصفوفات/كائنات فارغة فوق البيانات الافتراضية
if (!Array.isArray(CATEGORIES) || CATEGORIES.length === 0) {
  CATEGORIES = DEFAULT_CATEGORIES.slice();
  saveJSON('mr_categories', CATEGORIES);
}
if (!Array.isArray(POINTS) || POINTS.length === 0) {
  POINTS = [100, 250, 400];
  saveJSON('mr_points', POINTS);
}

let teamSetup = {
  A: { name: 'الفريق الأول', lifelines: [] },
  B: { name: 'الفريق الثاني', lifelines: [] }
};

// سقف فئات الجولة. كان الاختيار مفتوحاً وتُقسَّم كل 6 فئات جولةً مستقلة،
// فتطول الجلسة بلا نهاية واضحة. لوحة واحدة من 6 فئات = 18 سؤالاً = جلسة
// لها بداية ونهاية، ويُتوَّج آخرها بسؤال المراهنة.
const MAX_CATS = 6;

let selectedCats = [];
let rounds = [];
/*
  ثلاث خلايا لكل فئة: سؤال واحد لكل مستوى — 100 و250 و400، مرّة واحدة لكل
  منها. (جُرّبت ست خلايا — سؤالان لكل مستوى — مع تصميم «3a» ثم رجعنا عنها
  بطلب المستخدم: ضاعفت طول الجولة.)

  📌 تجريد «slot» باقٍ عمداً رغم أنه صار مطابقاً للمستوى: مفتاح مخزون
  الأسئلة وحالة السؤال المبثوثة في الأونلاين كلها مبنية عليه، وحذفه تفكيك
  بلا مقابل. وإن رجعنا لأكثر من سؤال في المستوى يكفي تغيير هذين السطرين.
*/
const CELLS_PER_CAT = 3;
const levelOfSlot = slot => slot;

let stateUsed = {};
/*
  خلايا انتهى وقتها بلا إجابة. **ليست** مستهلَكة: تبقى مفتوحة على اللوحة
  ويُعاد فتحها بنفس السؤال (`questionCache` مفهرَس بالخلية فلا يتغيّر السؤال).
  نحفظها لنميّزها بصرياً فقط — كي يعرف اللاعبون أنها مُحاولة سابقة لا خلية بكر.
*/
let stateExpired = {};
let questionCache = {};
let scores = { A: 0, B: 0 };
let lifelineUsed = { A: [], B: [] };
let activeRound = 0;
let current = null;
let activeTeam = null;      // الفريق صاحب الدور الحالي ('A' أو 'B')
let turnOrder = [];         // ترتيب اللاعبين في الأونلاين: [{player_id, name, team}]
let turnIndex = 0;          // موضع الدور الحالي داخل turnOrder

const DIFF = ['سهل', 'متوسط', 'صعب'];
const DIFFKEY = ['easy', 'medium', 'hard'];

/* ============================= TEAM SETUP ============================= */

function renderTeamSetup() {
  const container = document.getElementById('teamsSetupContainer');
  if (!container) return;

  container.innerHTML = '';

  ['A', 'B'].forEach(team => {
    const teamDiv = createElement('div', { class: `team-setup ${team}` }, `
      <label>${team === 'A' ? '🟢' : '🟡'} اسم الفريق ${team === 'A' ? 'الأول' : 'الثاني'}</label>
      <input type="text" id="setupName${team}" placeholder="الفريق ${team === 'A' ? 'الأول' : 'الثاني'}" value="${escapeHtml(teamSetup[team].name)}">
      <div class="lifelines-label">وسائل المساعدة (اختر 3)</div>
      <div class="lifelines" id="lifelines${team}"></div>
      <div class="lifeline-count" id="count${team}">0 / 3</div>
    `);

    container.appendChild(teamDiv);

    renderLifelineChips(team);
  });

  updateTeamSetupStatus();
}

function renderLifelineChips(team) {
  const wrap = document.getElementById(`lifelines${team}`);
  if (!wrap) return;

  wrap.innerHTML = '';
  LIFELINES.forEach(l => {
    const chip = createElement('div', { class: 'lifeline-chip' }, `
      <span class="ic">${l.ic}</span>${l.name}
    `);
    chip.onclick = () => toggleLifeline(team, l.key, chip);
    wrap.appendChild(chip);
  });

  updateLifelineDisplay(team);
}

function toggleLifeline(team, key, chipEl) {
  Sound.select();
  const arr = teamSetup[team].lifelines;
  const idx = arr.indexOf(key);

  if (idx > -1) {
    arr.splice(idx, 1);
    chipEl.classList.remove('sel');
  } else {
    if (arr.length >= 3) return;
    arr.push(key);
    chipEl.classList.add('sel');
  }

  updateLifelineDisplay(team);
  updateTeamSetupStatus();
}

function updateLifelineDisplay(team) {
  const count = teamSetup[team].lifelines.length;
  const countEl = document.getElementById(`count${team}`);
  if (countEl) {
    countEl.textContent = `${count} / 3`;
  }
}

function updateTeamSetupStatus() {
  const nextBtn = document.getElementById('nextSetupBtn');
  const validA = teamSetup.A.lifelines.length === 3;
  const validB = teamSetup.B.lifelines.length === 3;
  if (nextBtn) {
    nextBtn.disabled = !validA || !validB;
  }
}

function goToCategories() {
  Sound.click();
  teamSetup.A.name = document.getElementById('setupNameA')?.value?.trim() || 'الفريق الأول';
  teamSetup.B.name = document.getElementById('setupNameB')?.value?.trim() || 'الفريق الثاني';

  if (teamSetup.A.lifelines.length < 3 || teamSetup.B.lifelines.length < 3) {
    uiAlert('لازم كل فريق يختار 3 وسائل مساعدة بالضبط');
    return;
  }

  showScreen('screen-categories');
  renderCatGrid();
}

/* ============================= CATEGORY SELECTION ============================= */

function renderCatGrid() {
  // المؤقّت ومفتاح المراهنة يُرسمان هنا لا في `goToCategories`: للأخيرة
  // مدخلان (محلي وأونلاين) وكلاهما يمرّ بهذه الدالة، فلا يُنسى أحدهما
  renderTimerPicker();
  renderBetToggle();

  const grid = document.getElementById('catGrid');
  if (!grid) return;

  grid.innerHTML = '';
  CATEGORIES.forEach(c => {
    grid.appendChild(makeCatCard(c));
  });
  updateSelStatus();
}

function makeCatCard(c) {
  const sel = selectedCats.some(s => s.name === c.name);
  const card = createElement('div', {
    class: `cat-pick${sel ? ' sel' : ''}`
  }, `
    <div class="check">✓</div>
    <span class="ic">${c.ic}</span>
    <div class="nm">${escapeHtml(c.name)}</div>
  `);
  card.onclick = () => toggleCategory(c, card);
  return card;
}

function toggleCategory(c, card) {
  const idx = selectedCats.findIndex(s => s.name === c.name);
  if (idx > -1) {
    Sound.select();
    selectedCats.splice(idx, 1);
    card.classList.remove('sel');
  } else {
    if (selectedCats.length >= MAX_CATS) {
      Sound.skip?.();
      uiAlert(`الجولة ${MAX_CATS} فئات فقط — شِل وحدة قبل ما تضيف غيرها`);
      return;
    }
    Sound.select();
    selectedCats.push(c);
    card.classList.add('sel');
  }
  updateSelStatus();
}

async function addCustomCategory() {
  // ⚠️ للإدمن فقط — نفس تحقق لوحة الإدارة
  if (!(await authenticateAdmin())) return;

  const input = document.getElementById('customCatName');
  const name = trimArabic(input.value);
  if (!name) return;

  if (CATEGORIES.some(c => c.name === name) || selectedCats.some(c => c.name === name)) {
    input.value = '';
    uiAlert('هذه الفئة موجودة بالفعل');
    return;
  }

  const c = { name, ic: '✨' };
  CATEGORIES.push(c);
  selectedCats.push(c);
  document.getElementById('catGrid').appendChild(makeCatCard(c));
  document.getElementById('catGrid').lastChild.classList.add('sel');
  input.value = '';
  updateSelStatus();
  saveJSON('mr_categories', CATEGORIES);
}

function updateSelStatus() {
  const n = selectedCats.length;
  const status = document.getElementById('selStatus');
  if (status) {
    status.innerHTML = n >= MAX_CATS
      ? `اخترت <b>${n} / ${MAX_CATS}</b> — اللوحة كاملة ✅`
      : `اخترت <b>${n} / ${MAX_CATS}</b> فئة`;
  }

  // بعد أن صار السقف 6 لم تعد اللوحة تُقسَّم لجولات، فتبويب الجولة الواحدة زينة
  const grid = document.getElementById('catGrid');
  if (grid) grid.classList.toggle('at-max', n >= MAX_CATS);

  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.disabled = n < 1;
  }
}

/* ============================= START GAME ============================= */

function startGame() {
  Sound.start();

  questionCache = {};
  rounds = [];
  resetBetState();
  resetRoundLog();

  for (let i = 0; i < selectedCats.length; i += MAX_CATS) {
    rounds.push(selectedCats.slice(i, i + MAX_CATS));
  }

  stateUsed = {};
  stateExpired = {};
  rounds.forEach((r, ri) => {
    stateUsed[ri] = r.map(() => Array(CELLS_PER_CAT).fill(false));
    stateExpired[ri] = r.map(() => Array(CELLS_PER_CAT).fill(false));
  });

  scores = { A: 0, B: 0 };
  lifelineUsed = { A: [], B: [] };
  activeRound = 0;

  // اختيار عشوائي لمن يبدأ اللعب
  activeTeam = Math.random() < 0.5 ? 'A' : 'B';

  // في الأونلاين نبني ترتيب اللاعبين بالتناوب ابتداءً من الفريق المختار
  turnOrder = isOnlineGame() ? buildTurnOrder(activeTeam) : [];
  turnIndex = 0;
  if (turnOrder.length) activeTeam = currentTurnPlayer().team;

  // إذا لم تكن في مود أونلاين، استخدم teamSetup. إذا كان في أونلاين، استخدم roomPlayers
  if (currentRoom) {
    // مود أونلاين - استخدم أسماء الفريق من Supabase
    const teamA = roomPlayers.filter(p => p.team === 'A');
    const teamB = roomPlayers.filter(p => p.team === 'B');
    if (teamA.length === 0 || teamB.length === 0) {
      uiAlert('❌ لم يتم توزيع اللاعبين بشكل صحيح');
      return;
    }
  }

  updateGameUI();
  showScreen('screen-game');
  renderTabs();
  renderBoard();
  trackEvent(isOnlineGame() ? 'game_started' : 'game_started_local');

  // في الأونلاين: صاحب الروم يبثّ بداية اللعبة فتظهر اللوحة على كل الأجهزة
  if (isOnlineHost()) {
    supa?.from('game_rooms').update({ status: 'active' }).eq('id', currentRoom.id);
    publishGameState();
  }
  applyViewerRestrictions();
  announceStartingTeam();
}

/* ============================= TURN HANDLING ============================= */

// يبني ترتيب الأدوار بتناوب الفريقين: أ1 ← ب1 ← أ2 ← ب2 …
// لو كان أحد الفريقين أكثر عدداً، يُكمل الباقون بالتتابع في نهاية الدورة.
function buildTurnOrder(startingTeam) {
  const pick = t => roomPlayers
    .filter(p => p.team === t)
    .map(p => ({ player_id: p.player_id, name: p.player_name, team: t }));

  const first = pick(startingTeam);
  const second = pick(startingTeam === 'A' ? 'B' : 'A');

  const order = [];
  const max = Math.max(first.length, second.length);
  for (let i = 0; i < max; i++) {
    if (first[i]) order.push(first[i]);
    if (second[i]) order.push(second[i]);
  }
  return order;
}

// اللاعب صاحب الدور الحالي (أونلاين فقط)
function currentTurnPlayer() {
  if (!turnOrder.length) return null;
  return turnOrder[turnIndex % turnOrder.length] || null;
}

// هل الدور على هذا الجهاز؟
function isMyTurn() {
  if (!isOnlineGame()) return true;
  const p = currentTurnPlayer();
  return !!p && p.player_id === currentPlayer?.player_id;
}

// إعلان الفريق الذي يبدأ اللعب في أول الجولة
function announceStartingTeam() {
  if (!activeTeam) return;

  const turn = currentTurnPlayer();
  const name = turn ? turn.name : getTeamName(activeTeam);
  const icon = activeTeam === 'A' ? '🟢' : '🟡';

  const box = createElement('div', { class: 'start-toast' }, `
    <div class="start-toast-label">🎲 البداية مع</div>
    <div class="start-toast-team">${icon} ${escapeHtml(name)}</div>
  `);

  document.body.appendChild(box);
  Sound.start?.();

  setTimeout(() => box.classList.add('fade-out'), 2200);
  setTimeout(() => box.remove(), 2800);
}

// تبديل الدور: في الأونلاين للاعب التالي في الترتيب، وفي المحلي للفريق الآخر
function switchTurn() {
  if (isOnlineGame() && turnOrder.length) {
    turnIndex = (turnIndex + 1) % turnOrder.length;
    activeTeam = currentTurnPlayer()?.team || activeTeam;
  } else if (activeTeam) {
    activeTeam = activeTeam === 'A' ? 'B' : 'A';
  }
  renderTurnIndicator();
}

function renderTurnIndicator() {
  const banner = document.getElementById('turnBanner');
  const cardA = document.getElementById('teamCardA');
  const cardB = document.getElementById('teamCardB');

  if (cardA) cardA.classList.toggle('active-turn', activeTeam === 'A');
  if (cardB) cardB.classList.toggle('active-turn', activeTeam === 'B');

  if (!banner) return;
  if (!activeTeam) { banner.textContent = ''; return; }

  const icon = activeTeam === 'A' ? '🟢' : '🟡';
  const turn = currentTurnPlayer();

  if (turn) {
    const mine = turn.player_id === currentPlayer?.player_id;
    banner.innerHTML = `<span class="turn-label">الدور الآن:</span> ${icon} <b>${escapeHtml(turn.name)}</b>` +
      `<span class="turn-team">${escapeHtml(teamSetup[turn.team]?.name || '')}</span>` +
      (mine ? '<span class="turn-you">دورك أنت</span>' : '');
    banner.classList.toggle('my-turn', mine);
  } else {
    banner.innerHTML = `<span class="turn-label">الدور الآن:</span> ${icon} <b>${escapeHtml(getTeamName(activeTeam))}</b>`;
    banner.classList.remove('my-turn');
  }
}

/* ============================= END OF GAME ============================= */

function normalizeUsedState(used) {
  const out = {};
  Object.keys(used || {}).forEach(ri => {
    out[ri] = (used[ri] || []).map(cells => {
      const arr = Array.isArray(cells) ? cells.slice(0, CELLS_PER_CAT) : [];
      while (arr.length < CELLS_PER_CAT) arr.push(false);
      return arr.map(Boolean);
    });
  });
  return out;
}

// هل استُهلكت كل الخلايا في كل الجولات؟
function isGameFinished() {
  if (!rounds.length) return false;

  return rounds.every((cats, ri) => {
    const roundState = stateUsed[ri];
    if (!roundState) return false;
    return cats.every((_, ci) => (roundState[ci] || []).every(Boolean));
  });
}

/*
  بطاقة «آخر لعبة» في الرئيسية (النموذج 3a). لم يكن للّعبة سجلّ نتائج أصلاً،
  فنحفظ سطراً واحداً محلياً — لا يُدفع للسحابة ولا يخصّ حساباً، فهو ذاكرة
  الجهاز لا اللاعب.
*/
function saveLastGame(a, b, nameA, nameB) {
  const tie = a === b;
  saveJSON('mr_last_game', {
    tie,
    winner: tie ? '' : (a > b ? nameA : nameB),
    high: Math.max(a, b),
    low: Math.min(a, b),
    at: Date.now()
  });
}

function renderLastGame() {
  const box = document.getElementById('homeLastGame');
  if (!box) return;

  const last = loadJSON('mr_last_game', null);
  if (!last || typeof last.high !== 'number') {
    box.style.display = 'none';
    return;
  }

  const w = document.getElementById('homeLastWinner');
  const sc = document.getElementById('homeLastScore');
  if (w) w.textContent = last.tie ? 'تعادل' : `${last.winner} فاز`;
  if (sc) sc.textContent = `${last.high} – ${last.low}`;
  box.style.display = '';
}

function showEndScreen() {
  const a = scores.A;
  const b = scores.B;
  const nameA = getTeamName('A');
  const nameB = getTeamName('B');

  const trophy = document.getElementById('endTrophy');
  const title = document.getElementById('endTitle');
  const winner = document.getElementById('endWinner');
  const scoresEl = document.getElementById('endScores');

  if (a === b) {
    if (trophy) trophy.textContent = '🤝';
    if (title) title.textContent = 'تعادل!';
    if (winner) winner.innerHTML = `<span class="tie-text">الفريقان تعادلا بـ ${a} نقطة</span>`;
  } else {
    const winTeam = a > b ? 'A' : 'B';
    const winName = a > b ? nameA : nameB;
    const diff = Math.abs(a - b);
    if (trophy) trophy.textContent = '🏆';
    if (title) title.textContent = 'الفائز';
    if (winner) {
      winner.innerHTML = `
        <div class="winner-name ${winTeam}">${winTeam === 'A' ? '🟢' : '🟡'} ${escapeHtml(winName)}</div>
        <div class="winner-margin">بفارق ${diff} نقطة</div>
      `;
    }
  }

  if (scoresEl) {
    scoresEl.innerHTML = `
      <div class="end-score-card A ${a >= b ? 'lead' : ''}">
        <div class="end-team-name">🟢 ${escapeHtml(nameA)}</div>
        <div class="end-team-score" data-score="${a}">${a}</div>
      </div>
      <div class="end-score-card B ${b >= a ? 'lead' : ''}">
        <div class="end-team-name">🟡 ${escapeHtml(nameB)}</div>
        <div class="end-team-score" data-score="${b}">${b}</div>
      </div>
    `;
  }

  renderEndSummary();
  saveLastGame(a, b, nameA, nameB);

  // التقييم يُبنى قبل عرض الشاشة فلا يقفز أمام اللاعب بعد ظهورها
  renderEndRating?.();

  showScreen('screen-end');
  Sound.award?.();
  trackEvent('game_finished');

  // النتيجتان تزحفان من الصفر، والكونفيتي يتأخّر قليلاً ليقع مع اكتمالهما
  document.querySelectorAll('#endScores .end-team-score').forEach(el => {
    const target = Number(el.dataset.score) || 0;
    el.textContent = '0';
    animateNumber(el, target, 900);
  });
  setTimeout(() => burstConfetti(document.querySelector('#screen-end .end-wrap')), 450);

  // إحصاءات الحساب: نحسب فوز اللاعب حسب فريقه في الأونلاين،
  // وفي المحلي نسجّل الجولة بأعلى نتيجة دون نسبة فوز لأحد بعينه
  if (isSignedIn()) {
    const myTeam = currentRoom && currentPlayer
      ? roomPlayers.find(p => p.player_id === currentPlayer.player_id)?.team
      : null;
    const myScore = myTeam ? scores[myTeam] : Math.max(scores.A, scores.B);
    const won = myTeam ? (scores[myTeam] > scores[myTeam === 'A' ? 'B' : 'A']) : (a !== b);
    recordGameResult({ won, score: myScore });
  }
}

// مشاركة نتيجة اللعبة — لحظة الفوز هي أقوى لحظة يميل فيها اللاعبون للمشاركة
function buildResultText() {
  const a = scores.A, b = scores.B;
  const nameA = getTeamName('A'), nameB = getTeamName('B');
  const url = location.origin + location.pathname;

  const header = a === b
    ? `🤝 تعادل في «تحدي رجا»!`
    : `🏆 فاز ${a > b ? nameA : nameB} في «تحدي رجا»!`;

  return `${header}\n\n🟢 ${nameA}: ${a}\n🟡 ${nameB}: ${b}\n\nجرّبوها: ${url}`;
}

async function shareResult() {
  Sound.click();
  const text = buildResultText();

  // مشاركة النظام الأصلية (تفتح واتساب وغيره) حيث تتوفر
  if (navigator.share) {
    try {
      await navigator.share({ title: 'تحدي رجا', text });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return; // المستخدم ألغى
    }
  }

  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}

// زر "لعبة جديدة" من شاشة النهاية
function playAgain() {
  Sound.click();
  resetBetState();
  resetRoundLog();
  if (isOnlineGame()) {
    // نرجع لإعدادات الروم حتى يعيد المضيف اختيار الفئات
    if (isOnlineHost()) {
      publishGameState({ phase: 'lobby' });
    }
    goToRoomSetup();
  } else {
    goToSetup();
  }
}

// اسم الفريق المعروض: في الأونلاين أسماء اللاعبين، وفي المحلي اسم الفريق
function getTeamName(team) {
  if (currentRoom && roomPlayers?.length) {
    const members = roomPlayers.filter(p => p.team === team).map(p => p.player_name);
    if (members.length) return members.join(' + ');
  }
  return teamSetup[team]?.name || (team === 'A' ? 'الفريق الأول' : 'الفريق الثاني');
}

function updateGameUI() {
  const nameA = document.getElementById('gameNameA');
  const nameB = document.getElementById('gameNameB');
  const scoreA = document.getElementById('scoreA');
  const scoreB = document.getElementById('scoreB');

  if (nameA) nameA.textContent = `🟢 ${getTeamName('A')}`;
  if (nameB) nameB.textContent = `🟡 ${getTeamName('B')}`;
  animateNumber(scoreA, scores.A);
  animateNumber(scoreB, scores.B);

  renderTurnIndicator();
  renderLifelineDisplay();
}

function renderLifelineDisplay() {
  ['A', 'B'].forEach(team => {
    const wrap = document.getElementById(`lifeDisplay${team}`);
    if (!wrap) return;

    wrap.innerHTML = '';
    teamSetup[team].lifelines.forEach(key => {
      const l = LIFELINES.find(x => x.key === key);
      const used = lifelineUsed[team].includes(key);
      const el = createElement('div', {
        class: `ic${used ? ' used' : ''}`,
        title: l.name
      }, l.ic);

      if (!used) {
        el.onclick = () => useLifeline(team, key);
      }

      wrap.appendChild(el);
    });
  });
}

/* ============================= تعديل النقاط يدوياً ============================= */
/*
  حَكَم بشري فوق حساب اللعبة: إجابة تستحق نصف نقاط، مخالفة تستحق خصماً، أو
  احتساب خاطئ يُصحَّح في ثانية بدل أن تُعاد اللعبة كلّها.

  ⚠️ **المضيف وحده في الأونلاين.** تعديلٌ من جهاز لاعب لن تقبله السحابة أصلاً
  (`canControlGame` تكذّبه ما لم يكن دوره)، فيرى رقماً يرجع بعد لحظة — لذلك
  نخفي الزرّ عنه بدل أن نتركه يضغط بلا أثر.

  ⚠️ **لا نزول تحت الصفر**: كما في المراهنة (`applyBetOutcome`)، لا رصيد سالب
  في هذه اللعبة — الخصم يقف عند الصفر.
*/
const ADJUST_STEPS = [50, 100, 250, 400];
let adjustStep = 100;

function canAdjustScores() {
  return !isOnlineGame() || isOnlineHost();
}

function openScoreAdjust() {
  if (!canAdjustScores()) { uiAlert('المضيف وحده يقدر يعدّل النقاط'); return; }

  const overlay = createElement('div', { class: 'ui-modal-overlay' });
  const box = createElement('div', { class: 'ui-modal adjust-modal' }, `
    <div class="ui-modal-msg">⚖️ تعديل نقاط الفريقين</div>
    <div class="adjust-steps" id="adjustSteps"></div>
    <div class="adjust-rows" id="adjustRows"></div>
    <div class="ui-modal-actions">
      <button class="btn-main btn-primary" data-act="ok">تم</button>
    </div>
  `);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 180);
  };
  box.querySelector('[data-act="ok"]').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };

  renderScoreAdjust(box);
}

function renderScoreAdjust(box) {
  const steps = box.querySelector('#adjustSteps');
  if (steps) {
    steps.innerHTML = '';
    ADJUST_STEPS.forEach(v => {
      const b = createElement('button', {
        type: 'button',
        class: `timer-opt${v === adjustStep ? ' active' : ''}`
      }, String(v));
      b.onclick = () => { adjustStep = v; Sound.click(); renderScoreAdjust(box); };
      steps.appendChild(b);
    });
  }

  const rows = box.querySelector('#adjustRows');
  if (!rows) return;
  rows.innerHTML = '';

  ['A', 'B'].forEach(team => {
    const row = createElement('div', { class: `adjust-row ${team}` }, `
      <button type="button" class="adjust-btn plus">+</button>
      <div class="adjust-team">
        <div class="adjust-name">${escapeHtml(getTeamName(team))}</div>
        <div class="adjust-score" data-score="${team}">${Number(scores[team]) || 0}</div>
      </div>
      <button type="button" class="adjust-btn minus">−</button>
    `);
    row.querySelector('.minus').onclick = () => adjustScore(team, -adjustStep, box);
    row.querySelector('.plus').onclick  = () => adjustScore(team,  adjustStep, box);
    rows.appendChild(row);
  });
}

function adjustScore(team, delta, box) {
  if (!canAdjustScores() || !delta) return;

  const before = Number(scores[team]) || 0;
  const after = Math.max(0, before + delta);
  if (after === before) { Sound.skip(); return; }   // عند الصفر لا خصم

  scores[team] = after;
  Sound.click();
  animateNumber(document.getElementById(`score${team}`), after);

  const el = box?.querySelector(`[data-score="${team}"]`);
  if (el) el.textContent = after;

  // كل ضغطة تُبثّ فوراً: الرقم على أجهزة اللاعبين يجب ألّا يتأخّر عن الحَكَم
  if (isOnlineGame()) publishGameState();
}

/* ============================= LIFELINES ============================= */

// وسيلة المساعدة المفعّلة على السؤال المفتوح حالياً: { team, key }
let activeLifeline = null;
let friendCallTimer = null;

async function useLifeline(team, key) {
  // في الأونلاين المضيف وحده يفعّلها (هو من يدير اللعب)
  if (isOnlineGame() && !currentPlayer?.is_host) {
    log('صاحب الروم هو من يفعّل وسائل المساعدة', 'info');
    return;
  }

  if (lifelineUsed[team].includes(key)) return;

  const l = LIFELINES.find(x => x.key === key);
  if (!l) return;

  // كلها تُستعمل أثناء سؤال مفتوح ما عدا لا شيء — نطلب فتح سؤال أولاً
  if (!current) {
    uiAlert(`${l.ic} ${l.name}\n\n${l.desc}\n\nافتح السؤال أولاً ثم فعّلها.`);
    return;
  }

  if (activeLifeline) {
    uiAlert('⚠️ فيه وسيلة مساعدة مفعّلة على هذا السؤال بالفعل');
    return;
  }

  if (!await uiConfirm(`${l.ic} تفعيل «${l.name}» لفريق ${getTeamName(team)}؟\n\n${l.desc}\n\nتُستخدم مرة واحدة فقط طوال اللعبة.`)) {
    return;
  }

  Sound.select();
  lifelineUsed[team].push(key);
  activeLifeline = { team, key };

  renderLifelineDisplay();
  renderLifelineBanner();
  renderAwardButtons();   // الحفرة تعطّل أزرار الفريق الآخر

  if (key === 'sadeeq') startFriendCall();
  if (key === 'istareeh') {
    // تخطٍّ فوري بلا نقاط مع بقاء الدور مع نفس الفريق
    award(null, { keepTurn: true });
    return;
  }

  if (isOnlineHost()) publishGameState();
}

function renderLifelineBanner() {
  const banner = document.getElementById('lifelineBanner');
  if (!banner) return;

  if (!activeLifeline) {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }

  const l = LIFELINES.find(x => x.key === activeLifeline.key);
  banner.style.display = 'block';
  banner.innerHTML = `
    <span class="ll-ic">${l.ic}</span>
    <b>${l.name}</b> — ${escapeHtml(getTeamName(activeLifeline.team))}
    <div class="ll-desc">${l.desc}</div>
    <div class="ll-timer" id="lifelineTimer"></div>
  `;
}

// مؤقّت 30 ثانية لاتصال بصديق
function startFriendCall() {
  clearInterval(friendCallTimer);
  let left = 30;

  const tick = () => {
    const el = document.getElementById('lifelineTimer');
    if (!el) return;
    el.textContent = `⏱️ ${left} ثانية`;
    if (left <= 0) {
      clearInterval(friendCallTimer);
      el.textContent = '⏰ انتهى الوقت';
      Sound.skip();
    }
    left--;
  };

  setTimeout(tick, 0);
  friendCallTimer = setInterval(tick, 1000);
}

/* ============================= QUESTION TIMER ============================= */

/*
  مؤقّت السؤال. كان الوحيد في اللعبة هو مؤقّت «اتصال بصديق»، والسؤال العادي
  يبقى مفتوحاً بلا حدّ — فريق يفكّر خمس دقائق والبقية ينتظرون.

  ⚠️ نبثّ **لحظة الانتهاء** (طابع زمني) لا الثواني المتبقية: لو بثثنا عدّاداً
  لاختلف بين الأجهزة بمقدار تأخّر الشبكة، ولرأى كل لاعب رقماً مختلفاً.
  الطابع الزمني يجعل الجميع يحسبون من نقطة واحدة.
*/
const TIMER_CHOICES = [0, 20, 30, 45];   // 0 = مطفأ

/*
  ⚠️ **فئات التمثيل بلا مؤقّت مهما كان الإعداد** (`isActingCategory`):
  في «ولا كلمة» يقرأ لاعبٌ الكلمة ويمثّلها بلا كلام وفريقه يخمّن. العدّاد
  هنا لا يقطع الإجابة بل التمثيل نفسه — والفئة كلها تصير غير قابلة للّعب.
  نفس القائمة التي تُعفيها من بناء الخيارات (`NO_CHOICE_CATEGORIES`)،
  فلا تتفرّق القائمتان مع أي فئة تمثيل تُضاف لاحقاً.
*/
let questionSeconds = loadJSON('mr_qtimer', 0);
let questionDeadline = 0;
let questionTimerId = null;

function setQuestionSeconds(sec) {
  questionSeconds = Number(sec) || 0;
  saveJSON('mr_qtimer', questionSeconds);
  Sound.click();
  renderTimerPicker();
}

function renderTimerPicker() {
  const wrap = document.getElementById('timerPicker');
  if (!wrap) return;

  wrap.innerHTML = '';
  TIMER_CHOICES.forEach(sec => {
    const b = createElement('button', {
      class: `timer-opt${sec === questionSeconds ? ' active' : ''}`
    }, sec === 0 ? 'بدون مؤقّت' : `${sec} ثانية`);
    b.onclick = () => setQuestionSeconds(sec);
    wrap.appendChild(b);
  });
}

function startQuestionTimer() {
  stopQuestionTimer();

  const box = document.getElementById('qtimer');
  if (box) { box.textContent = ''; box.classList.remove('urgent'); }

  // بلا مهلة: نترك الخانة فارغة — وإلا بقي عدّاد السؤال السابق معروضاً
  if (!questionDeadline) return;

  /*
    سؤال مقفول خلف مقطعه: لا عدّاد قبل أن يظهر السؤال. المهلة تصل من السحابة
    مبثوثة (لحظة انتهاء مطلقة) فتُخزَّن عندنا بلا عرض، ثم يُستدعى هذا التوقيت
    ثانيةً عند الظهور فيلتقطها — فيبقى الجميع على نفس اللحظة بلا عدّ مبكّر.
  */
  if (isQuestionGated(questionCache[currentQuestionKey()])) return;

  const tick = () => {
    const el = document.getElementById('qtimer');
    if (!el) return;

    const left = Math.max(0, Math.ceil((questionDeadline - Date.now()) / 1000));
    el.textContent = `⏱️ ${left}`;
    el.classList.toggle('urgent', left <= 5 && left > 0);

    if (left > 0) return;

    stopQuestionTimer();
    el.textContent = '⏰ انتهى الوقت';

    // من يحسم انتهاء الوقت: صاحب الدور أو المضيف. الاستدعاء المزدوج غير ضارّ
    // لأن الدوال أدناه تخرج فوراً إذا أُغلق السؤال أو سُجّلت إجابة.
    if (isOnlineGame() && !canControlGame()) return;
    Sound.skip();
    onQuestionTimeout();
  };

  tick();
  questionTimerId = setInterval(tick, 250);   // ربع ثانية: العدّ لا يتلعثم
}

function stopQuestionTimer() {
  if (questionTimerId) { clearInterval(questionTimerId); questionTimerId = null; }
}

function onQuestionTimeout() {
  if (!current) return;

  // بالـ slot لا بالـ row: المخزون مفهرَس بالخلية (0–5) لا بالمستوى (0–2)،
  // وإلا أعادت الخلية الثانية في المستوى سؤال الخلية الأولى.
  const key = `${activeRound}-${current.ci}-${current.slot}`;
  const item = questionCache[key];

  // أونلاين بخيارات: تُحتسب إجابة خاطئة بلا نقاط، ويُعرض الصحيح ثم ينتقل الدور
  if (isOnlineGame() && Array.isArray(item?.choices)) {
    if (lastAnswer) return;
    const turn = currentTurnPlayer();
    lastAnswer = {
      pickedIndex: -1,
      correctIndex: item.correctIndex,
      byName: turn?.name || getTeamName(activeTeam),
      team: turn?.team || activeTeam,
      correct: false,
      timedOut: true
    };
    // لا نكشف الإجابة: السؤال راجع للوحة، وكشفه الآن يُفرغ إعادة فتحه
    if (isMyTurn()) recordCategoryResult(current.cat?.name, false);
    logRound({ team: lastAnswer.team, playerId: turn?.player_id || 'local',
               name: lastAnswer.byName, correct: false, timedOut: true });
    renderChoices(item);
    publishGameState();
    setTimeout(() => finishAnsweredQuestion(), 2600);
    return;
  }

  // محلي: بلا نقاط والدور ينتقل — لكن الخلية تبقى مفتوحة بنفس السؤال
  award(null, { timedOut: true });
}

function clearActiveLifeline() {
  clearInterval(friendCallTimer);
  friendCallTimer = null;
  activeLifeline = null;
  renderLifelineBanner();
}

async function backToSetupConfirm() {
  if (await uiConfirm('بدء لعبة جديدة؟ بيروح كل التقدم الحالي')) {
    selectedCats = [];
    questionCache = {};
    resetBetState();
    resetRoundLog();
    goToSetup();
  }
}

// الخروج من الجولة إلى الشاشة الرئيسية — غير «لعبة جديدة» التي تعيدك
// لاختيار الفئات وأنت ما زلت داخل الروم.
async function exitToHomeConfirm() {
  const online = isOnlineGame();
  const warning = online
    ? 'الرجوع للقائمة الرئيسية؟ بتخرج من الروم وبيروح كل التقدم الحالي'
    : 'الرجوع للقائمة الرئيسية؟ بيروح كل التقدم الحالي';

  if (!await uiConfirm(warning)) return;

  // نغلق نافذة السؤال أولاً وإلا بقيت معلّقة فوق الشاشة الرئيسية
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.classList.remove('show');
  current = null;
  lastAnswer = null;
  clearActiveLifeline();

  // الخروج الحقيقي من الروم: يُلغي الاشتراكات ويخفي الشات ويمسح جلسة
  // العودة التلقائية — بدونه يبقى اللاعب مشتركاً وشاشة الشات ظاهرة
  if (online && typeof leaveRoom === 'function') {
    try { await leaveRoom(); } catch (e) { console.warn('تعذّر الخروج من الروم:', e); }
  }

  selectedCats = [];
  questionCache = {};
  rounds = [];
  stateUsed = {};
  stateExpired = {};
  scores = { A: 0, B: 0 };
  lifelineUsed = { A: [], B: [] };
  turnOrder = [];
  turnIndex = 0;
  activeTeam = null;
  activeRound = 0;
  resetBetState();
  resetRoundLog();

  goToHome();
}

/* ============================= BOARD RENDERING ============================= */

function renderTabs() {
  const tabs = document.getElementById('roundTabs');
  if (!tabs) return;

  tabs.innerHTML = '';
  if (rounds.length <= 1) return;

  rounds.forEach((r, i) => {
    const b = createElement('button', {
      class: `round-tab${i === activeRound ? ' active' : ''}`
    }, `الجولة ${i + 1}`);

    b.onclick = () => {
      if (isOnlineGame() && !currentPlayer?.is_host) return;
      activeRound = i;
      renderTabs();
      renderBoard();
      if (isOnlineHost()) publishGameState();
    };

    tabs.appendChild(b);
  });
}

function renderBoard() {
  const cats = rounds[activeRound];
  // قد تُستدعى قبل أن تصل بيانات الجولات (مثلاً عند لاعب في روم لم تبدأ لعبته بعد)
  if (!Array.isArray(cats) || cats.length === 0) return;
  const board = document.getElementById('board');
  if (!board) return;

  // اللوحة صارت كروتاً لا شبكة أعمدة، فالتنسيق كله في CSS ولا حاجة
  // لـ gridTemplateColumns المحسوب هنا كما كان
  board.style.gridTemplateColumns = '';
  board.innerHTML = '';

  cats.forEach((c, ci) => {
    const card = createElement('div', { class: 'cat-card' }, `
      <div class="cat-card-head">
        <span class="cat-name">${escapeHtml(c.name)}</span>
        <span class="cat-ic">${escapeHtml(c.ic)}</span>
      </div>
    `);

    const cells = createElement('div', { class: 'cat-cells' });

    for (let slot = 0; slot < CELLS_PER_CAT; slot++) {
      const used = stateUsed[activeRound]?.[ci]?.[slot];
      // انتهى وقتها ولم تُحسم: تبقى مفتوحة، وتُعلَّم كي يُعرف أنها ستعيد نفس السؤال
      const expired = !used && stateExpired[activeRound]?.[ci]?.[slot];
      const cell = createElement('div', {
        class: `cell${used ? ' used' : ''}${expired ? ' expired' : ''}`,
        title: expired ? 'انتهى وقتها — تفتح بنفس السؤال' : ''
      }, used ? '·' : POINTS[levelOfSlot(slot)]);

      if (!used) {
        cell.onclick = () => openQuestion(ci, slot);
      }

      cells.appendChild(cell);
    }

    card.appendChild(cells);
    board.appendChild(card);
  });
}

/* ============================= MULTIPLE CHOICE ============================= */
/*
  بنك الأسئلة يحوي الإجابة الصحيحة فقط — لا خيارات خاطئة في أي من الأسئلة.
  لذلك نولّد المشتّتات من إجابات أسئلة أخرى في نفس الفئة ونفس المستوى، وهي
  الأقرب شكلاً وطولاً للإجابة الصحيحة فتكون منافسة معقولة. وإن لم تكفِ،
  نوسّع للمستويات الأخرى في الفئة نفسها ثم لبقية الفئات.
*/

// مجموعات من نفس النوع. لو كانت الإجابة الصحيحة من إحداها، نسحب المشتّتات
// منها فتكون منطقية: «آسيا» تنافسها قارات لا «كنتاكي» و«تمر».
const ANSWER_POOLS = [
  ['آسيا','أفريقيا','أوروبا','أمريكا الشمالية','أمريكا الجنوبية','أستراليا','أنتاركتيكا'],

  ['الرياض','مكة المكرمة','المدينة المنورة','القصيم','الشرقية','عسير','تبوك',
   'حائل','الحدود الشمالية','جازان','نجران','الباحة','الجوف'],

  ['الرياض','جدة','الدمام','الخبر','الطائف','أبها','بريدة','خميس مشيط',
   'الجبيل','ينبع','الأحساء','عرعر','سكاكا','القطيف'],

  // ⚠️ كل الدول العربية لا المشهورة منها فقط: «فلسطين» كانت خارج المجموعة
  // فسؤال علمها في «أعلام عربية» يسقط للملاذ الأخير، ومستواه فيه ثلاث
  // إجابات فقط — أي أقل من ثلاثة مشتّتات — فكان **يُعرض بلا خيارات أصلاً**
  // في الأونلاين. ومثله أعلام الصومال وجزر القمر وجيبوتي وموريتانيا.
  ['السعودية','مصر','الإمارات','الكويت','قطر','البحرين','عُمان','سلطنة عُمان',
   'الأردن','لبنان','سوريا','العراق','اليمن','المغرب','الجزائر','تونس','ليبيا',
   'السودان','فلسطين','الصومال','جيبوتي','موريتانيا','جزر القمر'],

  ['أمريكا','بريطانيا','فرنسا','ألمانيا','إيطاليا','إسبانيا','اليابان','الصين',
   'الهند','البرازيل','روسيا','تركيا','كندا','إيران','باكستان','إندونيسيا'],

  ['عطارد','الزهرة','الأرض','المريخ','المشتري','زحل','أورانوس','نبتون'],

  ['الأحمر','الأزرق','الأخضر','الأصفر','الأسود','الأبيض','البرتقالي',
   'البنفسجي','الرمادي','البني','الوردي'],

  ['الأسد','النمر','الفيل','الزرافة','الجمل','الحصان','الذئب','الدب','الغزال',
   'النسر','الصقر','الحوت','الدلفين','القرش','التمساح','الفهد','وحيد القرن'],

  ['القلب','الكبد','الرئة','الكلى','المعدة','الدماغ','الجلد','العين','الأذن',
   'الطحال','البنكرياس','الأمعاء'],

  ['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب',
   'شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'],

  ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر',
   'أكتوبر','نوفمبر','ديسمبر'],

  ['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'],

  ['الشمال','الجنوب','الشرق','الغرب','الشمال الشرقي','الشمال الغربي'],

  ['المحيط الهادئ','المحيط الأطلسي','المحيط الهندي','المحيط المتجمد الشمالي',
   'المحيط الجنوبي','البحر الأحمر','البحر المتوسط','الخليج العربي','بحر العرب'],

  ['الذهب','الفضة','الحديد','النحاس','الألومنيوم','الرصاص','الزنك','البلاتين','التيتانيوم'],

  ['الأكسجين','الهيدروجين','النيتروجين','ثاني أكسيد الكربون','الهيليوم','الكربون'],

  ['أبو بكر الصديق','عمر بن الخطاب','عثمان بن عفان','علي بن أبي طالب'],

  ['كرة القدم','كرة السلة','كرة الطائرة','التنس','السباحة','الجري','الملاكمة','الفروسية'],

  ['الهلال','النصر','الاتحاد','الأهلي','الشباب','الاتفاق','التعاون','الفتح','الرائد'],

  // ⚠️ أضِف كل صيغة إملائية شائعة: `findAnswerPool` تطابق **بداية** الإجابة،
  // فـ«داوود عليه السلام» لا تطابق «داود» فتسقط لمشتّتات الفئة نفسها.
  ['نوح','إبراهيم','ابراهيم','موسى','عيسى','يوسف','يونس','سليمان','داود','داوود',
   'أيوب','زكريا','هود','صالح','آدم','ادم','شعيب','لوط','إدريس','ادريس',
   'إسماعيل','اسماعيل','إسحاق','اسحاق','يعقوب','هارون','إلياس','اليسع','ذو الكفل'],

  // ⚠️ مدن لا عواصم فقط: «دبي» هنا من البداية، و«أبوظبي» أُضيفت لأن سؤال
  // «ما عاصمة الإمارات؟» كان يسقط للملاذ الأخير فتنافسه إجابات فئته.
  ['القاهرة','الرياض','دبي','أبوظبي','الدوحة','الكويت','المنامة','مسقط','عمّان',
   'بيروت','دمشق','بغداد','صنعاء','الرباط','الجزائر','تونس','طرابلس','الخرطوم'],

  // ⚠️ «هيروشيما» ليست عاصمة، ووجودها مقصود من الطرفين: تأخذ مشتّتاتها من
  // هنا بدل أن تسقط للملاذ الأخير، وتصلح مشتّتاً لسؤال «ما عاصمة اليابان؟».
  ['باريس','لندن','برلين','روما','مدريد','طوكيو','بكين','نيودلهي','موسكو',
   'واشنطن','أنقرة','أوتاوا','برازيليا','جاكرتا','هيروشيما'],

  ['آبل','جوجل','مايكروسوفت','أمازون','ميتا','سامسونج','إنتل','إنفيديا','تسلا','سوني'],

  ['واتساب','إنستغرام','سناب شات','تيك توك','يوتيوب','تويتر','تيليجرام','فيسبوك'],

  ['القهوة','الشاي','الحليب','العصير','الماء','اللبن','الكركديه','النعناع'],

  ['الكبسة','المندي','المظبي','الجريش','المرقوق','الهريس','السليق','المطازيز','العريكة'],

  ['التمر','الرمان','العنب','التين','الموز','التفاح','البرتقال','المانجو','الفراولة','البطيخ'],

  ['الهيل','الزعفران','القرفة','الكمون','الكزبرة','الفلفل الأسود','الزنجبيل','القرنفل'],

  ['العود','المسك','العنبر','الورد','الياسمين','الصندل','الزعفران','البخور'],

  ['الأنف','الفم','اليد','القدم','الرأس','الظهر','الرقبة','الكتف','الركبة','المرفق'],

  ['البصر','السمع','الشم','الذوق','اللمس'],

  ['الطويل','الكامل','الوافر','البسيط','الرجز','الرمل','المتقارب','الخفيف','السريع'],

  ['المتنبي','أبو تمام','البحتري','أحمد شوقي','حافظ إبراهيم','امرؤ القيس',
   'زهير بن أبي سلمى','الخنساء','أبو نواس','المعرّي','نزار قباني','محمود درويش'],

  ['الأموية','العباسية','العثمانية','الفاطمية','الأيوبية','المملوكية','الأندلسية','السلجوقية'],

  // كيانات تاريخية زائلة — لفئة «أعلام قديمة». مجموعة الدول الحالية لا تصلح
  // لها: «الاتحاد السوفيتي» بين السعودية وإيطاليا يُعرف بأنه الوحيد الزائل.
  // ⚠️ بصيغة «الدولة الأموية» كاملةً لا «الأموية» وحدها: المطابقة تُسقط «ال»
  // من أول الإجابة فقط، فـ«الدولة الأموية» لا تبدأ بـ«الأموية» ولا تطابقها.
  ['الاتحاد السوفيتي','الدولة العثمانية','الدولة الأموية','الدولة العباسية',
   'إمارة بني خالد','يوغوسلافيا','تشيكوسلوفاكيا','بلاد فارس','الدولة الفاطمية'],

  ['تويوتا','نيسان','هوندا','فورد','شيفروليه','مرسيدس','بي إم دبليو','أودي',
   'لكزس','هيونداي','كيا','بورشه','فيراري','لامبورغيني'],

  ['الماس','الياقوت','الزمرد','اللؤلؤ','الفيروز','العقيق','الزبرجد'],

  ['النخيل','الزيتون','القمح','الأرز','الذرة','الشعير','القطن','البن'],

  ['الأسبرين','البنسلين','الإنسولين','الباراسيتامول','المضاد الحيوي','اللقاح'],

  ['فيتامين أ','فيتامين ب','فيتامين ج','فيتامين د','فيتامين هـ','فيتامين ك'],

  ['المينا','العاج','اللب','الملاط','اللثة','الجذر','التاج'],

  ['القواطع','الأنياب','الضواحك','الأضراس','ضرس العقل'],
];

/*
  اللواحق الوحيدة التي تُقبل بعد اسم عنصر المجموعة.

  ⚠️ قبول **أي** كلمة بعد الاسم كان يخلط اسماً باسم آخر يبدأ بمثله:
  «الاتحاد السوفيتي» طابق نادي «الاتحاد» فصارت خياراته «الشباب السوفيتي»
  و«الأهلي السوفيتي» و«الرائد السوفيتي» — واللاحقة تُلحق بالجميع فتخرج
  أسماء لا وجود لها. ومثلها «الهلال الخصيب» و«الشباب الفلسطيني».
  الكلمة التالية تصف الاسم نفسه (لقب أو شرح) أو تجعله اسماً آخر بالكامل،
  ولا ثالث — فنقبل اللقب والشرح بين قوسين فقط.
*/
const NAME_HONORIFICS = [
  'عليه السلام', 'عليها السلام', 'عليهما السلام', 'عليهم السلام',
  'صلى الله عليه وسلم',
  'رضي الله عنه', 'رضي الله عنها', 'رضي الله عنهم', 'رضي الله عنهما',
  'رحمه الله', 'رحمها الله',
].map(normalizeAnswer);

// نبحث عن مجموعة تنتمي إليها الإجابة. المطابقة على النص المطبَّع، ونقبل
// الاحتواء لأن الإجابة قد تكون «قارة آسيا» أو «آسيا (أكبر القارات)».
function findAnswerPool(correct) {
  const c = normalizeAnswer(correct);
  if (!c) return null;

  for (const pool of ANSWER_POOLS) {
    // نأخذ أطول عنصر مطابق: «ذو الكفل» تسبق «ذو» لو وُجدت
    let best = null;
    pool.forEach(item => {
      const n = normalizeAnswer(item);
      if (!n) return;
      // مطابقة تامة، أو الاسم متبوعاً بلقب («يونس عليه السلام») أو بشرح
      // بين قوسين («آسيا (أكبر القارات)») — لا بأي كلمة أخرى.
      // ⚠️ ولا نقبل الاحتواء في أي موضع: «الحوت الأزرق» كان يطابق مجموعة
      // الألوان بسبب «الأزرق»، فتصير خياراته ألواناً.
      let hit = n === c || c.startsWith(n + '(');
      if (!hit && c.startsWith(n + ' ')) {
        const tail = c.slice(n.length + 1);
        hit = tail.startsWith('(') || tail.startsWith('（')
              || NAME_HONORIFICS.includes(tail);
      }
      if (hit && (!best || n.length > best.length)) best = n;
    });
    if (best) return { pool, matchedLength: best.length };
  }
  return null;
}

/*
  اللاحقة التي تتبع الاسم في الإجابة: «يونس **عليه السلام**».

  ⚠️ بدونها ينكشف الجواب فوراً: المشتّتات تأتي من المجموعة أسماءً مجرّدة،
  فيبقى الخيار الصحيح وحده يحمل اللاحقة. ولا يكفي حذف الأسماء من المجموعة —
  جرّبناه فصار أسوأ: كلها تسقط لمشتّتات الفئة فتستوي مرة وتفضح مرة.
*/
function answerSuffix(correct, matchedLength) {
  const c = normalizeAnswer(correct);
  if (!matchedLength || matchedLength >= c.length) return '';

  // نقتطع من النص الأصلي بمحاذاة ما طابقناه في النص المطبَّع. الطولان
  // متساويان لأن التطبيع يستبدل حرفاً بحرف ولا يحذف — عدا «ال» في البداية.
  const lead = /^ال/.test(String(correct).trim()) ? 2 : 0;
  const tail = String(correct).trim().slice(lead + matchedLength);
  return /^[\s(]/.test(tail) ? tail : '';
}

/*
  الشرح الملحق بالإجابة بين قوسين.

  ⚠️ في الأسئلة الحسابية تحمل الإجابة حلّها معها:
  «36 تفاحة (12x3 =36 )» و«العدد هو 3 (لأن 3 × 3 = 9، ثم 9 + 5 = 14)».
  المشتّتات الرقمية تبدّل الرقم الأول فقط، فيبقى الشرح **نفسه حرفياً في
  الخيارات الأربعة وهو يذكر الرقم الصحيح** — يقرأه اللاعب فيعرف الجواب بلا
  تفكير. نُسقط الشرح من نصّ الخيارات وحدها؛ الإجابة المحفوظة تبقى كاملة
  فيظهر الشرح في الوضع المحلي عند كشف الإجابة.
*/
function stripTrailingNote(text) {
  const t = String(text || '').trim();
  const m = t.match(/^(.*?)\s*[(（][^)）]*[)）]\s*[.。]?$/);
  if (!m) return t;
  const head = m[1].trim();
  return head ? head : t;   // إجابة كلّها بين قوسين: نتركها كما هي
}

// إجابة رقمية → مشتّتات رقمية قريبة، مع الحفاظ على وحدة القياس.
// «206 عظمة» تنافسها «198 عظمة» لا «الرياض».
function numericDistractors(correct, rand) {
  const text = String(correct);

  // ⚠️ النِّسَب والمجالات لا تُبدَّل بتغيير رقم واحد: «من 1:15 إلى 1:18»
  // كان يصير «من 3:15 إلى 1:18» — تركيب لا معنى له، والجزء الثابت يبقى
  // شاهداً على الصحيح. ندعها لمشتّتات الفئة.
  if (/\d\s*[:：/–—-]\s*\d/.test(text)) return null;

  const m = text.match(/(\d[\d,]*)/);
  if (!m) return null;

  const raw = m[1].replace(/,/g, '');
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n === 0) return null;

  const isYear = n >= 1000 && n <= 2100;
  const out = new Set();
  let guard = 0;

  while (out.size < 3 && guard++ < 40) {
    let v;
    if (isYear) {
      v = n + Math.floor(rand() * 21) - 10;
    } else if (n <= 12) {
      v = n + Math.floor(rand() * 7) - 3;
    } else {
      const spread = Math.max(2, Math.round(n * 0.35));
      v = n + Math.floor(rand() * spread * 2) - spread;
    }
    if (v > 0 && v !== n) out.add(v);
  }

  if (out.size < 3) return null;
  return [...out].map(v => correct.replace(m[1], String(v)));
}

/*
  ⚠️ **الإجابات تدخل المجموعة مقطوعة الشرح.**
  «جبل السودة (3133 متر)» مشتّتاً وسط ثلاثة بلا أقواس يفضح نفسه بالشكل وحده،
  والقطع يستوي به الأربعة. والتفريد يقع على النص المقطوع أيضاً، وإلا دخل
  «جبل السودة» و«جبل السودة (3133 متر)» خيارين لشيء واحد.
*/
function collectAnswerPool(categoryName, diffKey, exclude) {
  const seen = new Set([normalizeAnswer(stripTrailingNote(exclude))]);
  const pool = [];

  // نحتفظ بنص السؤال مع الإجابة: التشابه بين السؤالين أدلّ على تقارب
  // نوع الإجابة من تشابه طول النص
  const take = (list) => {
    (list || []).forEach(q => {
      const a = stripTrailingNote(String(q?.answer || '').trim());
      const key = normalizeAnswer(a);
      if (!a || seen.has(key)) return;
      seen.add(key);
      pool.push({ answer: a, question: String(q?.question || '') });
    });
  };

  /*
    ⚠️ **مستويات الفئة الثلاثة تُجمع دائماً، لا عند نقص العدد فقط.**
    كان الجمع مشروطاً بـ«أقل من 12»، فمستوىً واحد مليء بإجابات رقمية يكفي
    العدد ولا يكفي **الشكل**: «أرامكو السعودية» كانت تنافسها «حوالي 50%»
    و«بئر الدمام رقم 7». اختلاف الشكل يفضح الإجابة، واختلاف المستوى لا
    يراه اللاعب أصلاً — فالمجموعة الأوسع أولى، ومرشّحات الشكل بعدها هي
    التي تختار.
  */
  take(QBANK[categoryName]?.[diffKey]);   // نفس المستوى أولاً فيتقدّم عند التعادل
  DIFFKEY.filter(k => k !== diffKey).forEach(k => take(QBANK[categoryName]?.[k]));

  // فئات أخرى — ملاذ أخير
  if (pool.length < 3) {
    Object.keys(QBANK).forEach(cat => {
      if (cat === categoryName) return;
      DIFFKEY.forEach(k => take(QBANK[cat]?.[k]));
    });
  }

  return pool;
}

// نطبّع للمقارنة: نزيل التشكيل والمسافات الزائدة وأل التعريف حتى لا يظهر
// خياران متطابقان فعلياً بصياغتين مختلفتين
function normalizeAnswer(text) {
  return String(text || '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/\s+/g, ' ')
    .replace(/^ال/, '')
    .trim()
    .toLowerCase();
}

// كلمات لا تميّز سؤالاً عن آخر، فاستبعادها يجعل المقارنة ذات معنى
const STOP_WORDS = new Set([
  'ما','ماهو','ماهي','هو','هي','من','في','على','عن','الى','إلى','التي','الذي',
  'كم','اي','أي','هل','متى','اين','أين','كيف','لماذا','اسم','ماذا','هذه','هذا',
  'يوجد','توجد','يعتبر','تعتبر','يسمى','تسمى','بين','مع','او','أو','و',
  'كان','كانت','لها','له','بها','به','التالي','الاتي','عند','بعد','قبل','كل'
]);

function contentWords(text) {
  return normalizeAnswer(text)
    .replace(/[؟?.,،!:؛()«»"']/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// كم كلمة دالة يتشاركها السؤالان؟ «ما أكبر قارة في العالم» و«ما أكبر محيط في
// العالم» يتشاركان «اكبر» و«العالم» → إجابتهما من نوع متقارب
function questionOverlap(wordsA, questionB) {
  if (!wordsA.length) return 0;
  const b = new Set(contentWords(questionB));
  let hits = 0;
  wordsA.forEach(w => { if (b.has(w)) hits++; });
  return hits;
}

// شكل الإجابة — ما يجعل خياراً يكشف نفسه قبل أن يفكّر اللاعب:
// رقم وسط كلمات، أو حروف لاتينية وسط عربي، أو سطر طويل وسط كلمتين.
function answerShape(text) {
  const t = String(text || '');
  const ar = (t.match(/[ء-ي]/g) || []).length;
  const la = (t.match(/[A-Za-z]/g) || []).length;
  return {
    digit: /\d/.test(t),
    latin: la > ar,           // «Camelus dromedarius» لاتيني، «المقدمة (Top notes)» عربي
    len: t.length,
    words: t.split(/\s+/).filter(Boolean).length
  };
}

// أول كلمة دالة في الإجابة. «طريق البخور» و«طريق الحج الشامي» يتشاركان
// «طريق» — أقوى إشارة على أنهما من نوع واحد.
function leadWord(text) {
  return contentWords(text)[0] || '';
}

// مرشّحات متدرّجة: نبدأ بالأصرم، وننزل درجة فقط إذا لم نجد ثلاثة مرشّحين.
// هكذا لا نُرجع null أبداً، ولا نقبل خياراً فاضحاً ما دام هناك أفضل منه.
const SHAPE_FILTERS = [
  (c, k) => c.digit === k.digit && c.latin === k.latin &&
            c.len >= k.len * 0.5 && c.len <= k.len * 2 &&
            Math.abs(c.words - k.words) <= 3,
  (c, k) => c.digit === k.digit && c.latin === k.latin &&
            c.len >= k.len * 0.35 && c.len <= k.len * 3,
  (c, k) => c.digit === k.digit && c.latin === k.latin,
  () => true
];

// اختيار مشتّتات مقاربة في الطول للإجابة الصحيحة — الخيار القصير جداً وسط
// خيارات طويلة يكشف نفسه
/*
  فئات التمثيل: الإجابة **هي المطلوب تمثيله**، فعرضها ضمن أربعة خيارات
  يُلغي اللعبة — الفريق يقرأ الكلمة من الأزرار بدل أن يخمّنها من الحركة.

  ⚠️ هذا لم يكن ظاهراً قبل اليوم بالمصادفة لا بالتصميم: «ولا كلمة» كانت
  سؤالاً واحداً لكل مستوى، و`buildChoices` تحتاج ثلاثة مشتّتات فتفشل وتُعيد
  null — فتُعرض الفئة بلا خيارات. أول ما اكتملت إلى عشرين نجح البناء
  وانكشفت الإجابة. فالاستثناء صريح هنا لا متروك لعدد الأسئلة.
*/
const NO_CHOICE_CATEGORIES = new Set(['ولا كلمة']);

function isActingCategory(name) {
  // الاسم يحمل إيموجي («ولا كلمة 🤫») وقد يتغيّر، فنطابق النصّ لا الحرف
  const clean = String(name || '').replace(/[^؀-ۿ\s]/g, '').replace(/\s+/g, ' ').trim();
  return NO_CHOICE_CATEGORIES.has(clean);
}

function buildChoices(item, categoryName, diffKey, seed) {
  const correct = String(item?.answer || '').trim();
  if (!correct) return null;
  if (isActingCategory(categoryName)) return null;

  const rand = makeSeededRandom(seed);

  // 1) مجموعة من نفس النوع — أفضل جودة
  const typed = findAnswerPool(correct);
  if (typed) {
    const c = normalizeAnswer(correct);
    const suffix = answerSuffix(correct, typed.matchedLength);

    // نستبعد الصيغ الإملائية الأخرى للاسم نفسه («داود» أمام «داوود»)
    const others = typed.pool.filter(x => {
      const n = normalizeAnswer(x);
      return n !== c && !c.includes(n) && !n.includes(c);
    });

    if (others.length >= 3) {
      const picked = [];
      const seen = new Set();
      const avail = others.slice();
      while (picked.length < 3 && avail.length) {
        const one = avail.splice(Math.floor(rand() * avail.length), 1)[0];
        // ⚠️ المجموعة تحوي صيغاً إملائية متعددة للاسم الواحد («آدم» و«ادم»)،
        // فبلا هذا يظهران خيارين منفصلين لنفس الاسم أمام اللاعب
        const key = normalizeAnswer(one);
        if (seen.has(key)) continue;
        seen.add(key);
        picked.push(one);
      }
      // اللاحقة تُلحق بالجميع حتى لا يتميّز الصحيح بها
      if (picked.length === 3) {
        return shuffleChoices(correct, picked.map(p => p + suffix), rand);
      }
    }
  }

  // 2) إجابة رقمية — مشتّتات رقمية.
  // نبني الخيارات على الإجابة **بلا شرحها**: الشرح يتكرّر حرفياً في الأربعة
  // ويذكر الرقم الصحيح، فيفضحه (راجع `stripTrailingNote`).
  const head = stripTrailingNote(correct);
  const nums = numericDistractors(head, rand);
  if (nums) return shuffleChoices(head, nums, rand);

  // 3) الملاذ الأخير: إجابات أخرى من نفس الفئة.
  // الترتيب: تشابه السؤال أولاً ثم قرب الطول — الاعتماد على الطول وحده
  // كان يُنتج خيارات بلا صلة («تمر» أمام سؤال عن قارة).
  //
  // ⚠️ **يُبنى على `head` لا على `correct`**: الشرح بين القوسين لا يحمله إلا
  // الصحيح، فيُعرف بشكله قبل قراءته — «صلم (Salm)» وحده بين ثلاثة عربية،
  // و«نهر النيل (ويُنازعه الأمازون)» وحده الطويل. الإجابة المحفوظة تبقى
  // كاملة فيظهر الشرح عند الكشف في الوضع المحلي.
  const pool = collectAnswerPool(categoryName, diffKey, correct);
  if (pool.length < 3) return null;

  const myWords = contentWords(item?.question || '');
  const myShape = answerShape(head);
  const myLead = leadWord(head);

  const scored = pool.map(c => ({
    answer: c.answer,
    shape: answerShape(c.answer),
    sameLead: !!myLead && leadWord(c.answer) === myLead,
    overlap: questionOverlap(myWords, c.question),
    lenDiff: Math.abs(c.answer.length - head.length)
  }));

  /*
    أول مرشّح يترك ثلاثة على الأقل هو المعتمد.

    ⚠️ **لا تُوسَّع المجموعة إلى فئات أخرى طلباً للشكل.** جُرِّب: إجابة فيها
    حرف لاتيني في فئة عربية («الحمض النووي DNA») لا تجد في فئتها ثلاثة
    تشبهها شكلاً، فجلبها التوسيع من كل الفئات — فصارت خيارات سؤال «هذا شعار
    أي قناة؟» هي: OSN وفصيلة دم ووحدة فلكية واسم علمي لجمل. الشكل استوى
    والمعنى انهار، واللاعب يستبعدها بالسخف بدل أن يستبعدها بالشكل. الفئة
    الواحدة سقفٌ مقصود.
  */
  let kept = [];
  for (const pass of SHAPE_FILTERS) {
    kept = scored.filter(c => pass(c.shape, myShape));
    if (kept.length >= 3) break;
  }
  if (kept.length < 3) kept = scored;

  kept.sort((x, y) =>
    (Number(y.sameLead) - Number(x.sameLead)) ||
    (y.overlap - x.overlap) ||
    (x.lenDiff - y.lenDiff));

  // نأخذ من أفضل المرشّحين فقط، ونعشوِ داخلهم حتى لا تتكرر نفس الخيارات
  const topN = Math.max(3, Math.min(12, kept.length));
  const candidates = kept.slice(0, topN);

  const picked = [];
  while (picked.length < 3 && candidates.length) {
    const i = Math.floor(rand() * candidates.length);
    picked.push(candidates.splice(i, 1)[0].answer);
  }
  if (picked.length < 3) return null;

  return shuffleChoices(head, picked, rand);
}

// خلط ثابت بنفس البذرة حتى يرى كل اللاعبين نفس الترتيب
function shuffleChoices(correct, distractors, rand) {
  const choices = [correct, ...distractors];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { choices, correctIndex: choices.indexOf(correct) };
}

// مولّد عشوائي ببذرة: نفس البذرة تعطي نفس الترتيب على كل الأجهزة
function makeSeededRandom(seed) {
  let h = 2166136261;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function () {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================= QUESTION DIALOG ============================= */

function openQuestion(ci, slot) {
  // في الأونلاين صاحب الدور هو من يفتح السؤال ويجيب عليه
  if (isOnlineGame() && !isMyTurn()) {
    const t = currentTurnPlayer();
    uiAlert(`⏳ الدور الآن على ${t ? t.name : 'لاعب آخر'}`);
    return;
  }

  Sound.open();
  const cat = rounds[activeRound][ci];
  // `row` يبقى المستوى (0–2) فتظل كل حسابات النقاط والصعوبة كما هي،
  // و`slot` هو الخلية (0–5) وبها وحدها تُعلَّم اللوحة ويُفهرَس المخزون.
  const row = levelOfSlot(slot);
  current = { ci, row, slot, cat };

  const qcat = document.getElementById('qcat');
  const qpoints = document.getElementById('qpoints');
  if (qcat) qcat.innerHTML = `${escapeHtml(cat.ic)} ${escapeHtml(cat.name)}`;
  if (qpoints) qpoints.textContent = `${POINTS[row]} نقطة`;

  document.getElementById('cornersBar').style.display = 'none';
  document.getElementById('qbody').innerHTML = '<div class="loadbox">⏳ جاري إحضار السؤال...</div>';
  document.getElementById('overlay').classList.add('show');

  const cacheKey = `${activeRound}-${ci}-${slot}`;
  let item = questionCache[cacheKey];

  if (!item) {
    item = pickFromBank(cat.name, row);
    if (item) {
      // في الأونلاين نولّد الخيارات ببذرة ثابتة حتى يراها كل اللاعبين بنفس الترتيب
      if (isOnlineGame()) {
        const mc = buildChoices(item, cat.name, DIFFKEY[row], `${currentRoom.id}-${cacheKey}`);
        if (mc) { item = { ...item, choices: mc.choices, correctIndex: mc.correctIndex }; }
      }
      questionCache[cacheKey] = item;
    } else {
      showQuickAddForm(cat, row, ci, slot);
      return;
    }
  }

  // المهلة تُحسب مرة عند الفتح ثم تُبثّ، فيعدّ الجميع من نفس النقطة.
  // إلا سؤالاً مقفولاً خلف مقطعه: مهلته تبدأ عند ظهوره لا عند فتحه
  // (`revealWatchedQuestion`)، وإلا التهم المقطعُ وقتَ الإجابة.
  // وإلا فئة تمثيل: لا مؤقّت لها مهما كان الإعداد (راجع `TIMER_CHOICES`).
  questionDeadline = (questionSeconds > 0 && !isQuestionGated(item) && !isActingCategory(cat.name))
    ? Date.now() + questionSeconds * 1000
    : 0;
  questionOpenedAt = Date.now();   // لقياس زمن الإجابة في ملخّص الجولة

  renderQuestionBody(item);
  startQuestionTimer();
  if (canControlGame() && isOnlineGame()) publishGameState();
  if (isOnlineHost()) publishGameState();
}

function showQuickAddForm(cat, row, ci, slot) {
  document.getElementById('qbody').innerHTML = `
    <div class="loadbox">ما فيه سؤال محفوظ لهذه الفئة بعد 🙂</div>
    <div class="admin-row" style="flex-direction:column; align-items:stretch; margin-top:10px;">
      <input type="text" id="quickQText" placeholder="نص السؤال">
      <input type="text" id="quickQAnswer" placeholder="الإجابة الصحيحة">
      <input type="text" id="quickQEmoji" placeholder="إيموجي (اختياري)">
      <button class="btn btn-answer" style="margin-top:6px;" onclick="quickAddAndShow(${ci},${row},${slot})">حفظ وعرض السؤال</button>
    </div>
  `;
  document.getElementById('cornersBar').style.display = 'flex';
  document.getElementById('answerCorner').style.visibility = 'hidden';
}

async function quickAddAndShow(ci, row, slot) {
  // ⚠️ للإدمن فقط — نفس تحقق لوحة الإدارة
  if (!(await authenticateAdmin())) return;

  const cat = rounds[activeRound][ci];
  const q = document.getElementById('quickQText')?.value?.trim();
  const a = document.getElementById('quickQAnswer')?.value?.trim();
  const emoji = document.getElementById('quickQEmoji')?.value?.trim() || '❓';

  if (!q || !a) {
    uiAlert('لازم تكتب السؤال والإجابة');
    return;
  }

  const diffKey = DIFFKEY[row];
  if (!QBANK[cat.name]) {
    QBANK[cat.name] = { easy: [], medium: [], hard: [] };
  }

  const newItem = { question: q, answer: a, emoji, needsImage: false, imageQuery: '' };
  QBANK[cat.name][diffKey].push(newItem);
  saveJSON('mr_bank', QBANK);
  pushToCloud();

  // بالـ slot: المخزون مفهرَس بالخلية لا بالمستوى (راجع openQuestion)
  const cacheKey = `${activeRound}-${ci}-${slot}`;
  questionCache[cacheKey] = newItem;

  log('سؤال جديد تمت إضافته من قبل الإدمن', 'success');
  Sound.award();
  renderQuestionBody(newItem);
}

/*
  ذاكرة الأسئلة المعروضة.

  كان `pickFromBank` اختياراً عشوائياً محضاً بلا ذاكرة، فالسؤال نفسه يعود في
  الجولة التالية. مع 20 سؤالاً لكل خانة و18 خانة في الجولة: الجولة الثانية
  فيها ~1 سؤال مكرّر والخامسة ~3-4. لعائلة تلعب كل ليلة هذا محسوس.

  نحفظ نصوص ما عُرض لكل (فئة/مستوى) ونتجنّبها. وحين تُستهلك الفئة كاملة
  نُصفّرها ونبدأ دورة جديدة — فلا ننفد من الأسئلة أبداً.
*/
/*
  أداء هذا الجهاز حسب الفئة.

  ⚠️ **إحصاءات جهاز لا إحصاءات لاعب**: في الوضع المحلي يتشارك الفريقان جهازاً
  واحداً، فلا سبيل لنسبة الإجابة إلى شخص بعينه. لذلك العنوان في الواجهة
  «أداء هذا الجهاز» لا «أداؤك» — الأمانة أولى من رقم يوحي بما لا يدلّ عليه.
*/
const CAT_STATS_KEY = 'mr_cat_stats';

function recordCategoryResult(categoryName, correct) {
  const name = String(categoryName || '').trim();
  if (!name) return;

  const raw = loadJSON(CAT_STATS_KEY, {});
  const stats = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const cell = stats[name] || { tries: 0, correct: 0 };

  cell.tries += 1;
  if (correct) cell.correct += 1;
  stats[name] = cell;

  saveJSON(CAT_STATS_KEY, stats);
}

// نطلب ثلاث محاولات على الأقل: نسبة مبنية على محاولة واحدة (0% أو 100%)
// تُضلّل أكثر مما تفيد
function getCategoryStats(minTries = 3) {
  const raw = loadJSON(CAT_STATS_KEY, {});
  const stats = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};

  return Object.entries(stats)
    .filter(([, v]) => (v?.tries || 0) >= minTries)
    .map(([name, v]) => ({
      name,
      tries: v.tries,
      correct: v.correct,
      pct: Math.round((v.correct / v.tries) * 100)
    }))
    .sort((a, b) => b.pct - a.pct || b.tries - a.tries);
}

function resetCategoryStats() {
  saveJSON(CAT_STATS_KEY, {});
}

const SEEN_KEY = 'mr_seen_questions';
const SEEN_MAX_CELLS = 400;   // سقف يمنع تضخّم التخزين مع مرور الشهور

function loadSeen() {
  const raw = loadJSON(SEEN_KEY, {});
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
}

function markQuestionSeen(categoryName, diffKey, text) {
  if (!text) return;
  const seen = loadSeen();
  const key = `${categoryName}|${diffKey}`;
  const list = Array.isArray(seen[key]) ? seen[key] : [];

  if (!list.includes(text)) list.push(text);
  seen[key] = list;

  // نُسقط أقدم الخانات إن تجاوزنا السقف — الأحدث أولى بالبقاء
  const keys = Object.keys(seen);
  if (keys.length > SEEN_MAX_CELLS) {
    keys.slice(0, keys.length - SEEN_MAX_CELLS).forEach(k => delete seen[k]);
  }

  saveJSON(SEEN_KEY, seen);
}

function resetSeenQuestions() {
  saveJSON(SEEN_KEY, {});
}

function pickFromBank(categoryName, row) {
  const diffKey = DIFFKEY[row];
  const list = QBANK[categoryName] && QBANK[categoryName][diffKey];

  if (!list || !list.length) return null;

  const seen = loadSeen();
  const key = `${categoryName}|${diffKey}`;
  const already = new Set(Array.isArray(seen[key]) ? seen[key] : []);

  // ما لم يُعرض بعد. إن استُهلكت الفئة كلها بدأنا دورة جديدة نظيفة
  let fresh = list.filter(q => !already.has(String(q?.question || '').trim()));
  if (!fresh.length) {
    delete seen[key];
    saveJSON(SEEN_KEY, seen);
    fresh = list;
  }

  const chosen = fresh[Math.floor(Math.random() * fresh.length)];
  markQuestionSeen(categoryName, diffKey, String(chosen?.question || '').trim());
  return { ...chosen };
}

/*
  سقف التكبير.

  `.qphoto` تعطي كل صورة عرضاً مقصوداً 440px، وهذا صحيح لصورة كبيرة وخاطئ
  لصورة صغيرة: شعار «معادن» 57×35 بكسل كان يُعرض بتكبير **7.7×** فتبدو
  حوافه ضبابية، ونفس الحال لشعار ويندوز 41×38.

  ⚠️ **لا يُعالَج في CSS**: الحدّ يعتمد على الأبعاد الأصلية للصورة،
  و`naturalWidth` لا تُعرف إلا بعد التحميل. لذلك `onload` على كل صورة.

  و⚠️ **`max-width` لا `width`**: العرض المقصود يبقى كما هو، والسقف يقصّه
  عند اللزوم فقط — والصورة الكبيرة لا يمسّها شيء. وعلى الجوال يبقى
  `min(100%, …)` هو الحاكم فلا تفيض الصورة الصغيرة عن الشاشة.
*/
const MAX_PHOTO_UPSCALE = 3;

function capPhotoUpscale(img) {
  if (!img || !img.naturalWidth) return;
  img.style.maxWidth = Math.round(img.naturalWidth * MAX_PHOTO_UPSCALE) + 'px';
}

// صورة السؤال إن وُجدت، وإلا الإيموجي. فئات مثل «شعارات» و«منو المشهور»
// و«ميمز» بلا صورة سؤالها بلا معنى.
function questionVisual(item, id = '') {
  const idAttr = id ? ` id="${id}"` : '';
  if (item?.image) {
    return `<div class="qimg has-photo"${idAttr}>
              <img src="${escapeHtml(item.image)}" alt="صورة السؤال" class="qphoto"
                   onload="capPhotoUpscale(this)">
            </div>`;
  }
  // مع فيديو، المقطع نفسه هو الصورة — مربّع الإيموجي فوقه حشو يزاحمه
  // على ارتفاع الشاشة بلا فائدة. (الصوت يختلف: لا شيء يُرى معه.)
  if (item?.video) return '';

  return `<div class="qimg"${idAttr}>${escapeHtml(item?.emoji || '❓')}</div>`;
}

// مشغّل صوت السؤال — لفئات مثل «صوت المشهور» حيث المقطع هو السؤال نفسه
function questionAudio(item) {
  if (!item?.audio) return '';
  return `<div class="qaudio">
            <audio controls preload="metadata" src="${escapeHtml(item.audio)}"></audio>
          </div>`;
}

/* ============================= شاهد وأجب ============================= */

/*
  فئة «شاهد وأجب»: نصّ السؤال (وخياراته في الأونلاين) لا يظهر إلا بعد أن
  ينتهي المقطع. بدون هذا يقرأ اللاعبون السؤال ويجيبون قبل أن يشاهدوا شيئاً،
  فتفقد الفئة معناها كلّها.

  المطابقة بعد تجريد كل ما ليس حرفاً عربياً: الاسم في السحابة «شاهد وأجب 🎬»
  وقد يُكتب بلا إيموجي أو بمسافات مختلفة — والثلاثة يجب أن تعمل.
*/
const WATCH_FIRST_CATEGORY = 'شاهد وأجب';

function isWatchFirstCategory(name) {
  // نُوحّد الهمزات والتاء المربوطة والألف المقصورة: «شاهد واجب» و«شاهد وأجب»
  // اسم واحد عند اللاعب، واختلاف حرف واحد كان يعطّل القفل كلّه بصمت.
  const strip = t => String(t || '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^؀-ۿ]/g, '');
  return strip(name).includes(strip(WATCH_FIRST_CATEGORY));
}

/*
  مفتاح السؤال الذي انتهى مقطعه. يعيش هنا لا في الـ DOM لأن
  `renderQuestionBody` تُستدعى مع **كل** بثّ حالة في الأونلاين — ولو كانت
  الحالة داخل الصفحة لأُعيد قفل السؤال بعد كل تحديث.
*/
let watchedQuestionKey = null;

function currentQuestionKey() {
  return current ? `${activeRound}-${current.ci}-${current.slot}` : null;
}

// سؤال بلا مقطع في هذه الفئة لا يُقفل — وإلا اختفى نصّه إلى الأبد
function isQuestionGated(item) {
  return !!item?.video
      && isWatchFirstCategory(current?.cat?.name)
      && watchedQuestionKey !== currentQuestionKey();
}

function watchGateBox() {
  return `<div class="qgate">
            <div class="qgate-text">🎬 شاهد المقطع كاملاً — بعده يظهر السؤال</div>
            <button type="button" class="qgate-btn" onclick="revealWatchedQuestion()">أظهر السؤال الآن</button>
          </div>`;
}

// يُستدعى عند انتهاء المقطع، أو يدوياً حين يتعذّر تشغيله (مقطع تالف، شبكة)
function revealWatchedQuestion() {
  const key = currentQuestionKey();
  if (!key || watchedQuestionKey === key) return;
  watchedQuestionKey = key;

  /*
    المؤقّت يبدأ **الآن** لا عند فتح السؤال: مقطع من 30 ثانية كان سيلتهم
    مهلة الإجابة كاملة قبل أن يرى اللاعب السؤال أصلاً.
    في الأونلاين يبثّها صاحب القرار وحده فيعدّ الجميع إلى نفس اللحظة.
  */
  if (questionSeconds > 0 && !questionDeadline && !isActingCategory(current?.cat?.name)) {
    questionDeadline = Date.now() + questionSeconds * 1000;
    if (isOnlineGame() && !canControlGame()) questionDeadline = 0;
  }

  // السؤال طُرح الآن فعلياً — زمن الإجابة يُقاس من هنا لا من فتح المقطع
  questionOpenedAt = Date.now();

  const item = questionCache[key];
  if (item) renderQuestionBody(item);
  startQuestionTimer();
  if (isOnlineGame() && canControlGame()) publishGameState();
}

// نربط الانتهاء بعد كل رندر: الاستبدال يولّد عنصر <video> جديداً في كل مرة
function wireWatchGate(item) {
  if (!isQuestionGated(item)) return;
  const v = document.querySelector('#qbody video');
  if (v) v.addEventListener('ended', revealWatchedQuestion, { once: true });
}

/*
  `#qbody` يُستبدل كاملاً عند كل رندر، والأونلاين يعيد الرندر مع كل بثّ حالة
  — فيولد عنصر وسائط جديداً يبدأ من الصفر. مع «شاهد وأجب» هذا قاتل: المقطع
  لا يصل إلى نهايته أبداً فلا يظهر السؤال. نحفظ موضع التشغيل ونعيده.
  (يفيد الصوت أيضاً بنفس القدر: كان مقطع «صوت المشهور» يعيد نفسه كذلك.)
*/
function snapshotQuestionMedia() {
  const snap = [];
  document.querySelectorAll('#qbody video, #qbody audio').forEach((el, i) => {
    if (el.currentTime > 0) snap[i] = { t: el.currentTime, playing: !el.paused };
  });
  return snap;
}

function restoreQuestionMedia(snap) {
  if (!snap || !snap.length) return;
  document.querySelectorAll('#qbody video, #qbody audio').forEach((el, i) => {
    const s = snap[i];
    if (!s) return;
    const apply = () => {
      try {
        el.currentTime = s.t;
        if (s.playing) el.play().catch(() => {});
      } catch (e) { /* المصدر لم يُحمَّل بعد — لا شيء نستعيده */ }
    };
    // ضبط currentTime قبل معرفة المدّة لا أثر له، فننتظر البيانات الوصفية
    if (el.readyState >= 1) apply();
    else el.addEventListener('loadedmetadata', apply, { once: true });
  });
}

// مشغّل فيديو السؤال — لمقاطع «ميمز» وما شابهها حيث المقطع هو السؤال
function questionVideo(item) {
  if (!item?.video) return '';
  return `<div class="qvideo">
            <video controls preload="metadata" playsinline src="${escapeHtml(item.video)}"></video>
          </div>`;
}

function renderQuestionBody(item) {
  const body = document.getElementById('qbody');
  if (!body) return;

  // أونلاين: أربعة خيارات واحتساب تلقائي بدل حكم المضيف
  if (isOnlineGame() && Array.isArray(item.choices)) {
    renderChoices(item);
    return;
  }

  const gated = isQuestionGated(item);
  const media = snapshotQuestionMedia();

  body.innerHTML = `
    ${questionVisual(item, 'qimg')}
    ${questionAudio(item)}
    ${questionVideo(item)}
    ${gated ? watchGateBox() : `<div class="qtext" id="qtext">${item.question}</div>
    <div class="atext" id="atext">${item.answer}</div>`}
  `;

  restoreQuestionMedia(media);
  wireWatchGate(item);

  document.getElementById('toggleAnswerBtn').textContent = 'عرض الإجابة';
  document.getElementById('answerCorner').style.visibility = 'visible';
  // مقفول: لا «عرض الإجابة» ولا إعطاء نقاط قبل أن يُطرح السؤال أصلاً
  document.getElementById('cornersBar').style.display = gated ? 'none' : 'flex';
  if (!gated) Sound.reveal();

  renderAwardButtons();
}

function renderAwardButtons() {
  const container = document.getElementById('awardButtons');
  if (!container) return;

  container.innerHTML = '';

  // «الحفرة» تمنع الفريق الآخر من أخذ نقاط هذا السؤال
  const blocked = activeLifeline?.key === 'hofra'
    ? (activeLifeline.team === 'A' ? 'B' : 'A')
    : null;

  ['A', 'B'].forEach(team => {
    const isBlocked = blocked === team;
    const btn = createElement('button', {
      class: `btn btn-award ${team}${isBlocked ? ' blocked' : ''}`,
      title: isBlocked ? 'محجوب بـ «الحفرة»' : ''
    }, `${isBlocked ? '🕳️ ' : ''}للـ ${getTeamName(team)}`);

    if (isBlocked) {
      btn.disabled = true;
    } else {
      btn.onclick = () => award(team);
    }

    container.appendChild(btn);
  });
}

function toggleAnswer() {
  Sound.click();
  const q = document.getElementById('qtext');
  const a = document.getElementById('atext');
  const btn = document.getElementById('toggleAnswerBtn');

  if (!q || !a) return;

  const showing = a.classList.contains('show');
  if (showing) {
    a.classList.remove('show');
    q.classList.remove('hide');
    btn.textContent = 'عرض الإجابة';
  } else {
    a.classList.add('show');
    q.classList.add('hide');
    btn.textContent = 'رجوع للسؤال';
  }
}

function award(team, opts = {}) {
  if (!current) return;

  const pts = POINTS[current.row];

  // «الفخ»: إذا أجاب الفريق الآخر صحيحاً، تذهب النقاط لصاحب الفخ
  if (team && activeLifeline?.key === 'fakh' && team !== activeLifeline.team) {
    const trapper = activeLifeline.team;
    uiAlert(`🪤 وقع ${getTeamName(team)} في فخ ${getTeamName(trapper)}!\nالنقاط (${pts}) تذهب لـ ${getTeamName(trapper)}.`);
    team = trapper;
  }

  if (team) {
    scores[team] += pts;
    animateNumber(document.getElementById(`score${team}`), scores[team]);
    Sound.award();
  } else {
    Sound.skip();
  }

  // الأونلاين يسجّل في `submitAnswer` و`onQuestionTimeout` — فلا نُكرّره هنا.
  // و«استريح» تخطٍّ مقصود لا محاولة، فتُوسَم ولا تُحسب في الدقة.
  if (!isOnlineGame()) {
    logRound({ team: team || activeTeam, playerId: null,
               name: team ? getTeamName(team) : null,
               correct: !!team, skipped: !team && !!opts.keepTurn });
  }

  // نفس سبب `answerPublishGrace` في finishAnsweredQuestion: من يعطي النقاط
  // قد يكون صاحب الدور لا المضيف، فيفقد صلاحية البثّ فور انتقال الدور عنه
  const hadControl = canControlGame();
  answerPublishGrace = hadControl;

  try {
    // «استريح» تخطٍّ مقصود لا محاولة، ولا يُحتسب في أداء الفئة.
    // وفي الأونلاين الاحتساب يتم في `submitAnswer` فلا نُكرّره هنا.
    if (!opts.keepTurn && !isOnlineGame()) {
      recordCategoryResult(current.cat?.name, !!team);
    }

    // انتهاء الوقت بلا إجابة لا يستهلك الخلية: تُعلَّم فقط وتُفتح ثانيةً
    // بنفس السؤال. أي حسم آخر (نقاط أو «استريح») يستهلكها كالمعتاد.
    if (opts.timedOut) markSlotExpired();
    else stateUsed[activeRound][current.ci][current.slot] = true;
    closeQuestion();
    renderBoard();

    // الدور ينتقل للفريق الآخر، إلا مع «استريح» فيبقى مع نفس الفريق
    if (!opts.keepTurn) switchTurn();

    // انتهت كل الخلايا؟ سؤال المراهنة أولاً إن كان مفعّلاً، وإلا شاشة الفوز
    if (isGameFinished()) {
      if (startBetRound(hadControl)) return;
      if (hadControl) publishGameState({ phase: 'ended' });
      showEndScreen();
      return;
    }

    if (hadControl) publishGameState();
  } finally {
    answerPublishGrace = false;
  }
}

// تعليم الخلية المفتوحة بأن وقتها انتهى — بلا استهلاكها
function markSlotExpired() {
  if (!current) return;
  const round = stateExpired[activeRound] ||
    (stateExpired[activeRound] = (rounds[activeRound] || []).map(() => Array(CELLS_PER_CAT).fill(false)));
  if (!round[current.ci]) round[current.ci] = Array(CELLS_PER_CAT).fill(false);
  round[current.ci][current.slot] = true;
}

function closeQuestion() {
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('cornersBar').style.display = '';
  current = null;
  lastAnswer = null;
  watchedQuestionKey = null;
  stopQuestionTimer();
  questionDeadline = 0;
  clearActiveLifeline();
  if (canControlGame()) publishGameState();
}

/* ============================= ONLINE GAME STATE SYNC ============================= */

// هل نحن في روم أونلاين؟ وهل نحن صاحب الروم؟
function isOnlineGame() {
  return !!(typeof currentRoom !== 'undefined' && currentRoom);
}

function isOnlineHost() {
  return isOnlineGame() && !!currentPlayer?.is_host;
}

// من أجاب للتوّ يبقى مخوّلاً بالبثّ حتى ينتهي إغلاق سؤاله.
//
// ⚠️ بدون هذا يقف الدور عند من لعب: صاحب الدور يجيب، ثم ينتقل الدور عنه،
// فيفقد الصلاحية قبل أن يبثّ الانتقال نفسه — فتبقى بقية الأجهزة على الدور
// القديم إلى الأبد. (لا تظهر عند المضيف لأنه مخوّل دائماً.)
let answerPublishGrace = false;

// من يحقّ له تحديث حالة اللعبة: المضيف أو صاحب الدور (لأنه هو من يجيب)
//
// ⚠️ `betPublishGrace` تفتحها لأي لاعب أثناء المراهنة: لا دور فيها أصلاً،
// وكل فريق يقفل مراهنته ويجيب من جهازه. سباق البثّ بين الفريقين يعالجه
// `mergeBetState` بالدمج لا بالمنع.
function canControlGame() {
  return isOnlineHost() || isMyTurn() || answerPublishGrace || betPublishGrace;
}

// صاحب الروم يبثّ حالة اللعبة كاملة حتى تظهر نفسها على كل الأجهزة
function publishGameState(extra = {}) {
  // المضيف أو صاحب الدور — لأن صاحب الدور هو من يجيب فيغيّر الحالة
  if (!canControlGame()) return;

  const state = {
    phase: 'playing',
    categories: rounds.map(r => r.map(c => c.name)),
    points: POINTS,
    teamNames: { A: teamSetup.A.name, B: teamSetup.B.name },
    used: stateUsed,
    expired: stateExpired,   // خلايا انتهى وقتها ولم تُحسم — راجع `markSlotExpired`
    activeRound,
    activeTeam,
    turnOrder,
    turnIndex,
    scores,
    lifelines: { setup: { A: teamSetup.A.lifelines, B: teamSetup.B.lifelines },
                 used: lifelineUsed, active: activeLifeline },
    openQuestion: current
      ? { ci: current.ci, row: current.row, slot: current.slot,
          round: activeRound, item: questionCache[`${activeRound}-${current.ci}-${current.slot}`] }
      : null,
    lastAnswer,
    questionDeadline,      // طابع زمني لا عدّاد — راجع `startQuestionTimer`
    // «شاهد وأجب»: هل انتهى المقطع عند صاحب القرار؟ بدونها يبقى بعض اللاعبين
    // على شاشة المقطع بينما المؤقّت المبثوث يعدّ عندهم — راجع `revealWatchedQuestion`
    watchRevealed: current ? watchedQuestionKey === currentQuestionKey() : false,
    bet: betState,
    log: roundLog,         // سجلّ الجولة، ليُبنى الملخّص نفسه على كل الأجهزة
    ...extra
  };

  updateRoomGameState({ state_data: state, scores, current_round: activeRound });
}

// كل الأجهزة (بما فيها صاحب الروم) تطبّق الحالة القادمة من السحابة
function applyRemoteGameState(state) {
  if (!state) return;

  // المضيف رجع للوبي (لعبة جديدة) → نرجع معه
  if (state.phase === 'lobby') {
    if (!isOnlineHost()) goToRoomSetup();
    return;
  }

  if (state.phase !== 'playing' && state.phase !== 'ended' && state.phase !== 'bet') return;

  // نعيد بناء الجولات من أسماء الفئات المُرسلة
  rounds = (state.categories || []).map(names =>
    names.map(n => CATEGORIES.find(c => c.name === n) || { name: n, ic: '✨' })
  );
  if (!rounds.length) return;

  if (Array.isArray(state.points) && state.points.length) POINTS = state.points;
  if (state.teamNames) {
    teamSetup.A.name = state.teamNames.A || teamSetup.A.name;
    teamSetup.B.name = state.teamNames.B || teamSetup.B.name;
  }
  // جهاز على نسخة أقدم يبثّ ٣ خلايا لكل فئة — نمدّها إلى ٦ بدل أن تنكسر
  // اللوحة على من حدّث. الخلايا الزائدة تبدأ غير مستخدَمة.
  if (state.used) stateUsed = normalizeUsedState(state.used);
  if (state.expired) stateExpired = normalizeUsedState(state.expired);
  if (state.scores) scores = state.scores;
  // السجلّ لا ينمو إلا عند من يجيب، فالوارد أحدث دائماً ممّا عند المشاهد
  if (Array.isArray(state.log) && state.log.length >= roundLog.length) roundLog = state.log;
  if (state.activeTeam) activeTeam = state.activeTeam;
  if (Array.isArray(state.turnOrder)) turnOrder = state.turnOrder;
  lastAnswer = state.lastAnswer || null;
  if (typeof state.turnIndex === 'number') turnIndex = state.turnIndex;
  if (state.lifelines) {
    if (state.lifelines.setup) {
      teamSetup.A.lifelines = state.lifelines.setup.A || [];
      teamSetup.B.lifelines = state.lifelines.setup.B || [];
    }
    if (state.lifelines.used) lifelineUsed = state.lifelines.used;
    activeLifeline = state.lifelines.active || null;
  }
  activeRound = state.activeRound || 0;

  // مرحلة المراهنة → شاشة المراهنة على كل الأجهزة
  if (state.phase === 'bet') {
    const mustRepublish = mergeBetState(state.bet);
    updateGameUI();
    if (!document.querySelector('#screen-bet.active')) showScreen('screen-bet');
    renderBet();

    // ما وصلني أنقص ممّا عندي — أعيد بثّ ما أعرفه (راجع `mergeBetState`)
    if (mustRepublish) publishBet();

    // شبكة أمان: لو ضاع بثّ الحسم يتكفّل المضيف به متى اكتملت الإجابتان
    if (isOnlineHost() && betState && !betState.resolved &&
        betState.answers.A && betState.answers.B) {
      resolveBet();
    }
    return;
  }

  // انتهت اللعبة → شاشة الفوز على كل الأجهزة
  if (state.phase === 'ended') {
    updateGameUI();
    if (!document.querySelector('#screen-end.active')) showEndScreen();
    return;
  }

  const alreadyPlaying = document.querySelector('#screen-game.active');
  if (!alreadyPlaying) {
    showScreen('screen-game');
  }

  updateGameUI();
  renderTabs();
  renderBoard();

  // مزامنة نافذة السؤال المفتوح
  const q = state.openQuestion;
  const overlay = document.getElementById('overlay');
  if (q && q.item) {
    const cat = rounds[q.round]?.[q.ci];
    if (cat) {
      const slot = typeof q.slot === 'number' ? q.slot : q.row;
      current = { ci: q.ci, row: q.row, slot, cat };
      questionCache[`${q.round}-${q.ci}-${slot}`] = q.item;
      // قبل الرندر: صاحب القرار أظهر السؤال، فنفتح القفل هنا كي يُبنى الجسد
      // مفتوحاً مباشرة — ويبدأ المؤقّت مع ظهور السؤال لا قبله
      if (state.watchRevealed) watchedQuestionKey = `${activeRound}-${q.ci}-${slot}`;
      document.getElementById('qcat').innerHTML = `${escapeHtml(cat.ic)} ${escapeHtml(cat.name)}`;
      document.getElementById('qpoints').textContent = `${POINTS[q.row]} نقطة`;
      renderQuestionBody(q.item);
      overlay.classList.add('show');
      // نأخذ المهلة كما بُثّت فيعدّ الجميع إلى نفس اللحظة
      questionDeadline = Number(state.questionDeadline) || 0;
      startQuestionTimer();
    }
  } else if (!isOnlineHost()) {
    overlay.classList.remove('show');
    current = null;
    stopQuestionTimer();
    questionDeadline = 0;
  }

  applyViewerRestrictions();
}

// اللاعبون غير المضيف يشاهدون فقط: لا فتح أسئلة ولا إعطاء نقاط
function applyViewerRestrictions() {
  if (!isOnlineGame()) return;
  const viewer = !currentPlayer?.is_host;

  const corners = document.getElementById('cornersBar');
  if (corners) {
    const awardCorner = corners.children[1];
    if (awardCorner) awardCorner.style.display = viewer ? 'none' : '';
  }

  const board = document.getElementById('board');
  if (board) board.classList.toggle('viewer-mode', viewer);

  // تعديل النقاط للمضيف وحده — راجع `canAdjustScores`
  const adjust = document.getElementById('adjustScoresBtn');
  if (adjust) adjust.style.display = viewer ? 'none' : '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'overlay') closeQuestion();
  });

  updateTotalStats();
  renderLastGame();
  // نبدأ قراءة قوائم السحب فوراً حتى تكون جاهزة قبل أول دمج من السحابة
  fetchRetiredQuestions();
  fetchRetiredCategories();
  syncBundledQuestionBank();

  // بلاغات حُفظت أثناء لعب بلا إنترنت — ترتفع الآن بلا أن يشعر أحد
  flushReportQueue?.();
});

/* ============================= QUESTION BANK LOADING ============================= */

const QBANK_FILES = [
  'data/questions.json',
  'data/questions-part2.json',
  'data/questions-part3.json',
  'data/questions-part2-continued.json',
  'data/questions-part4.json',
  'data/questions-part5.json',
  'data/questions-part6.json',
  'data/questions-part7.json',
  'data/questions-part8.json',
  'data/questions-part9.json',
  'data/questions-part10.json',
  'data/questions-part11.json',
  'data/questions-part12.json',
  'data/questions-part13.json',
  'data/questions-part14.json',
  'data/questions-part15.json',
  'data/questions-part16.json',
  'data/questions-part17.json',
  'data/questions-part18.json',
  'data/questions-part19.json',
  'data/questions-part20.json',
  'data/questions-part21.json',
  'data/questions-part22.json'
];

/*
  ⚠️ ملفات البيانات تحتاج نفس مُبطِّل الكاش الذي للـ CSS و JS.

  كانت `data/*.json` تُجلب بلا `?v=` إطلاقاً، فيخدمها المتصفح من الكاش:
  أي تصحيح أو إضافة في بنك الأسئلة **لا يصل للاعب** مهما رفعنا إصدار
  السكربتات. اكتُشف عملياً — تصحيحات مرفوعة كانت تُقرأ من نسخة قديمة.

  نقرأ الإصدار من وسم game.js نفسه، فيبقى المفتاح واحداً: رقم `?v=` في
  index.html يبطّل الكاش للسكربتات والتنسيقات والبيانات معاً.
*/
function assetVersion() {
  const src = document.querySelector('script[src*="game.js"]')?.getAttribute('src') || '';
  const m = src.match(/[?&]v=([^&]+)/);
  return m ? m[1] : '';
}

function versionedUrl(path) {
  const v = assetVersion();
  return v ? `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(v)}` : path;
}

// نجلب الملفات مرة واحدة فقط لكل تحميل صفحة ونعيد استخدام النتيجة،
// لأن الدالة تُستدعى مرتين (عند التحميل وبعد سحب السحابة) وكان ذلك يضاعف الطلبات
let bundledQuestionFilesPromise = null;

// يقرأ كل ملفات الأسئلة المرفقة مع المشروع (يتجاوز أي ملف ناقص بدل ما يفشل كلياً)
function fetchBundledQuestionFiles() {
  if (bundledQuestionFilesPromise) return bundledQuestionFilesPromise;

  bundledQuestionFilesPromise = Promise.all(QBANK_FILES.map(async (path) => {
    try {
      const res = await fetch(versionedUrl(path));
      if (!res.ok) return {};
      const data = await res.json();
      return (data && typeof data === 'object') ? data : {};
    } catch (e) {
      console.warn(`تعذّر قراءة ${path}:`, e);
      return {};
    }
  }));

  return bundledQuestionFilesPromise;
}

// قائمة الأسئلة المسحوبة، تُقرأ مرة واحدة لكل تحميل صفحة.
//
// `retiredTexts` يفحصه الدمج نفسه، فالسؤال المسحوب لا يعود من أي مصدر:
// لا من ملفات المشروع ولا من نسخة Supabase ولا من بثّ لحظي. بدون هذا كانت
// المزامنة اللحظية تعيد زرع ما سحبناه للتوّ.
let retiredQuestionsPromise = null;
let retiredTexts = new Set();

function fetchRetiredQuestions() {
  if (retiredQuestionsPromise) return retiredQuestionsPromise;

  retiredQuestionsPromise = fetch(versionedUrl('data/retired-questions.json'))
    .then(res => (res.ok ? res.json() : null))
    .then(data => (Array.isArray(data?.retire) ? data.retire : []))
    .catch(() => [])    // غياب الملف ليس خطأً
    .then(list => {
      retiredTexts = new Set(list.map(t => String(t).trim()).filter(Boolean));
      return list;
    });

  return retiredQuestionsPromise;
}

/*
  الفئات المسحوبة.

  ⚠️ **حذف فئة من لوحة الإدارة لا يكفي**: `mergeCategories` تدمج ولا تحذف
  (وهذا مقصود — يمنع أي شخص من محو فئات الجميع، راجع الملاحظة 3)، و
  `syncCategoriesWithBank` تعيد أي فئة موجودة في البنك إلى القائمة. فملفات
  المشروع كانت تُرجع كل فئة يحذفها المستخدم عند أول تحميل.

  هذه القائمة تُسقطها من **الاثنين معاً** — قائمة الفئات وبنك الأسئلة —
  على كل جهاز وفي كل تحميل. وأسئلتها تبقى في ملفات `data/` كما هي، فحذف
  الاسم من هنا يُرجع الفئة كاملة بأسئلتها. لا شيء يضيع.
*/
let retiredCategoriesPromise = null;
let retiredCategoryNames = new Set();

function fetchRetiredCategories() {
  if (retiredCategoriesPromise) return retiredCategoriesPromise;

  retiredCategoriesPromise = fetch(versionedUrl('data/retired-categories.json'))
    .then(res => (res.ok ? res.json() : null))
    .then(data => (Array.isArray(data?.retire) ? data.retire : []))
    .catch(() => [])    // غياب الملف ليس خطأً
    .then(list => {
      retiredCategoryNames = new Set(list.map(t => String(t).trim()).filter(Boolean));
      return list;
    });

  return retiredCategoriesPromise;
}

/*
  الحذف يجب أن **ينتشر**، وهذه هي العقدة الأصلية:

  السحابة كانت تخزّن «الموجود» فقط، وكل جهاز يدمج ولا يستبدل — فغياب الفئة
  من السحابة لا يعني «محذوفة» بل «لا معلومة عنها»، فيُعيدها أي جهاز عنده
  نسخة قديمة. الحذف لم يكن له تمثيل في أي مكان.

  الآن للحذف صفّ خاص في `game_settings` اسمه `retired_categories`. الإدارة
  تكتب فيه عند الحذف، وكل جهاز يقرأه عند التحميل فيُسقط ما فيه. وقائمة
  الملف `data/retired-categories.json` تبقى كأرضية ثابتة، والاثنتان تتّحدان.
*/
function applyCloudRetiredCategories(list) {
  (list || []).forEach(n => {
    const name = String(n || '').trim();
    if (name) retiredCategoryNames.add(name);
  });
  return retiredCategoryNames.size;
}

// تُنادى من لوحة الإدارة عند حذف فئة: تُسجّل الحذف في السحابة ليصل الجميع
async function publishRetiredCategory(name) {
  const clean = String(name || '').trim();
  if (!clean || !supa) return false;

  try {
    const { data } = await supa.from('game_settings')
      .select('data').eq('id', 'retired_categories').maybeSingle();

    const list = Array.isArray(data?.data) ? data.data.map(x => String(x).trim()) : [];
    if (!list.includes(clean)) list.push(clean);

    const { error } = await supa.from('game_settings')
      .upsert({ id: 'retired_categories', data: list, updated_at: new Date().toISOString() },
              { onConflict: 'id' });

    if (error) throw error;
    retiredCategoryNames.add(clean);
    return true;
  } catch (e) {
    console.warn('تعذّر نشر حذف الفئة:', e);
    return false;
  }
}

// وعند إعادة إضافة فئة بنفس الاسم: نرفع عنها السحب وإلا اختفت فور إضافتها
async function unretireCategory(name) {
  const clean = String(name || '').trim();
  if (!clean) return false;

  retiredCategoryNames.delete(clean);
  if (!supa) return true;

  try {
    const { data } = await supa.from('game_settings')
      .select('data').eq('id', 'retired_categories').maybeSingle();

    const list = Array.isArray(data?.data) ? data.data.map(x => String(x).trim()) : [];
    if (!list.includes(clean)) return true;

    await supa.from('game_settings')
      .upsert({ id: 'retired_categories', data: list.filter(x => x !== clean),
                updated_at: new Date().toISOString() }, { onConflict: 'id' });
    return true;
  } catch (e) {
    console.warn('تعذّر رفع السحب عن الفئة:', e);
    return false;
  }
}

function retireCategories() {
  if (!retiredCategoryNames.size) return 0;

  let dropped = 0;

  Object.keys(QBANK).forEach(name => {
    if (retiredCategoryNames.has(name.trim())) { delete QBANK[name]; dropped++; }
  });

  const before = CATEGORIES.length;
  CATEGORIES = CATEGORIES.filter(c => !retiredCategoryNames.has(String(c?.name || '').trim()));
  selectedCats = selectedCats.filter(c => !retiredCategoryNames.has(String(c?.name || '').trim()));

  return Math.max(dropped, before - CATEGORIES.length);
}

/*
  يدمج أسئلة الملفات داخل البنك بدون حذف أي سؤال أضافه المستخدم.

  ⚠️ كان الدمج يتجاهل أي سؤال نصّه موجود مسبقاً — أي أنه **لا يستطيع تصحيح
  إجابة خاطئة أبداً**. أي تصحيح في ملفات المشروع كان يموت عند حدود المتصفح:
  النسخة القديمة محفوظة في localStorage وفي Supabase فتبقى هي المعروضة.

  الآن ملفات المشروع مرجعٌ لإجابة السؤال الذي جاء منها: إن اختلفت الإجابة
  حُدِّثت. ما يضيفه المستخدم يدوياً لا تمسّه (لأنه ليس في الملفات أصلاً)،
  والصورة الملصقة محلياً تبقى كما هي.
*/
function mergeIntoQuestionBank(bank, incoming) {
  let added = 0;
  let fixed = 0;

  Object.keys(incoming).forEach(cat => {
    const src = incoming[cat];
    if (!src || typeof src !== 'object') return;

    /*
      ⚠️ الفئة المسحوبة لا تُزرع أصلاً.

      كانت تُدمج كاملة ثم تُحذف بعد سطور في `retireCategories()`، فيُعاد بناء
      **1,020 سؤالاً** من سبع عشرة فئة مسحوبة في كل تحميل صفحة لتُرمى فوراً.
      والأسوأ أن `added` كان يعدّها، فيُطبع في الكونسول «تم تحميل 1020 سؤال
      جديد» في كل مرة — رقم لا يقابله شيء في اللعبة، ويُضلّل أي تشخيص لاحق.

      `retireCategories()` تبقى في محلها: تُنظّف ما جاء من localStorage أو
      من السحابة قبل أن تصل هذه القائمة.
    */
    if (retiredCategoryNames.has(String(cat).trim())) return;

    if (!bank[cat] || typeof bank[cat] !== 'object') {
      bank[cat] = { easy: [], medium: [], hard: [] };
    }

    ['easy', 'medium', 'hard'].forEach(diff => {
      if (!Array.isArray(bank[cat][diff])) bank[cat][diff] = [];
      const incomingList = Array.isArray(src[diff]) ? src[diff] : [];

      const byText = new Map();
      bank[cat][diff].forEach(q => {
        const t = String(q?.question || '').trim();
        if (t && !byText.has(t)) byText.set(t, q);
      });

      incomingList.forEach(q => {
        const text = String(q?.question || '').trim();
        if (!text || retiredTexts.has(text)) return;

        const existing = byText.get(text);
        if (existing) {
          const newAnswer = String(q.answer ?? '').trim();
          if (newAnswer && String(existing.answer ?? '').trim() !== newAnswer) {
            existing.answer = q.answer;
            fixed++;
          }
          // الإيموجي لا يُفرض على سؤال أُلصقت به صورة — الصورة أولى بالعرض
          if (q.emoji && !existing.image && existing.emoji !== q.emoji) {
            existing.emoji = q.emoji;
          }
          return;
        }

        bank[cat][diff].push(q);
        byText.set(text, q);
        added++;
      });
    });
  });

  return { added, fixed };
}

/*
  الأسئلة المسحوبة: إعادة صياغة سؤال في الملفات تُنتج سؤالاً «جديداً» في نظر
  الدمج، فيبقى المعيب جنب المصحَّح. هذه القائمة تُسقط نصوصاً بعينها من بنك
  كل جهاز — وهي الطريقة الوحيدة للتخلّص من سؤال معيب سبق أن انتشر.
  أضف نص السؤال القديم حرفياً عند إعادة صياغة أي سؤال.
*/
function retireQuestions(bank, texts) {
  const drop = new Set((texts || []).map(t => String(t).trim()).filter(Boolean));
  if (!drop.size) return 0;

  let removed = 0;
  Object.keys(bank).forEach(cat => {
    ['easy', 'medium', 'hard'].forEach(diff => {
      if (!Array.isArray(bank[cat]?.[diff])) return;
      const before = bank[cat][diff].length;
      bank[cat][diff] = bank[cat][diff]
        .filter(q => !drop.has(String(q?.question || '').trim()));
      removed += before - bank[cat][diff].length;
    });
  });
  return removed;
}

/*
  يُنزل فئات المشروع الافتراضية إلى قائمة الجهاز.

  ⚠️ `DEFAULT_CATEGORIES` كانت **أرضيةَ أول تشغيل فقط**: بعدها تُقرأ القائمة
  من `mr_categories` في localStorage، فأي فئة تُضاف للمشروع لا تصل لجهازٍ لعب
  مرّة واحدة من قبل. و`syncCategoriesWithBank` لا تُنقذها لأنها تُعيد ما له
  أسئلة في البنك — والفئة الجديدة قد تُحجَز باسمها قبل أن يُكتب لها سؤال.

  الدمج هنا يجعل ملفات المشروع مصدر الإضافة على كل جهاز وفي كل تحميل. والحذف
  يبقى بيد `retiredCategoryNames`: تتخطّاها هذه الدالة، و`retireCategories()`
  تعمل بعدها كطبقة ثانية — فلا تعود فئة مسحوبة من هنا.
*/
function mergeDefaultCategories() {
  let added = 0;
  DEFAULT_CATEGORIES.forEach(def => {
    const name = String(def?.name || '').trim();
    if (!name) return;
    if (retiredCategoryNames.has(name)) return;
    if (CATEGORIES.some(c => String(c?.name || '').trim() === name)) return;
    CATEGORIES.push({ ...def });
    added++;
  });
  return added;
}

// يضمن أن كل فئة موجودة في البنك تظهر أيضاً في قائمة الفئات
function syncCategoriesWithBank() {
  let added = 0;
  Object.keys(QBANK).forEach(name => {
    // ⚠️ لا نُعيد فئة مسحوبة: هذه الدالة كانت أحد طريقَي عودتها
    if (retiredCategoryNames.has(String(name).trim())) return;
    if (CATEGORIES.some(c => c.name === name)) return;
    const known = DEFAULT_CATEGORIES.find(c => c.name === name);
    CATEGORIES.push(known ? { ...known } : { name, ic: '✨' });
    added++;
  });
  return added;
}

// يحمّل ملفات الأسئلة ويدمجها في البنك الحالي.
// يعمل في كل تشغيل (وليس فقط عند بنك فارغ) حتى تصل الأسئلة الجديدة
// للمتصفحات التي عندها نسخة قديمة محفوظة في localStorage أو السحابة.
async function syncBundledQuestionBank() {
  try {
    const files = await fetchBundledQuestionFiles();

    // الإسقاط قبل الدمج: لو أُعيدت صياغة سؤال، نحذف القديم ثم نضيف الجديد
    const removed = retireQuestions(QBANK, await fetchRetiredQuestions());
    await fetchRetiredCategories();

    let added = 0;
    let fixed = 0;
    files.forEach(data => {
      const r = mergeIntoQuestionBank(QBANK, data);
      added += r.added;
      fixed += r.fixed;
    });

    const newDefaults = mergeDefaultCategories();

    // ⚠️ **بعد** الدمج لا قبله: الدمج هو ما يُعيد زرع الفئة المسحوبة من
    // ملفات المشروع، فالإسقاط قبله لا يُجدي
    const droppedCats = retireCategories();

    const newCats = syncCategoriesWithBank() + newDefaults;

    if (added > 0 || fixed > 0 || removed > 0 || newCats > 0 || droppedCats > 0) {
      saveJSON('mr_bank', QBANK);
      saveJSON('mr_categories', CATEGORIES);
    }
    // لا ندفع التصحيح للسحابة: الكتابة في game_settings مقصورة على الإدارة،
    // فمحاولة كل لاعب تفشل بخطأ RLS وتملأ السجل بلا فائدة. لا حاجة إليها
    // أصلاً — كل جهاز يصحّح نفسه من ملفات المشروع عند كل تحميل.

    updateTotalStats();

    if (document.querySelector('#screen-categories.active')) {
      renderCatGrid();
    }
    if (document.querySelector('#screen-admin.active')) {
      populateBankCatSelect?.();
      renderBankList?.();
    }

    if (added > 0) {
      log(`📚 تم تحميل ${added} سؤال جديد من ملفات المشروع`, 'success');
    }
    if (fixed > 0 || removed > 0) {
      log(`🩹 تصحيح البنك: ${fixed} إجابة مُحدَّثة و${removed} سؤال مسحوب`, 'success');
    }

    return added;
  } catch (error) {
    console.warn('تعذّر تحميل بنك الأسئلة:', error);
    return 0;
  }
}

function updateTotalStats() {
  let total = 0;
  Object.values(QBANK).forEach(c => {
    ['easy', 'medium', 'hard'].forEach(k => {
      total += (c[k] || []).length;
    });
  });

  const totalQEl = document.getElementById('totalQuestions');
  if (totalQEl) totalQEl.textContent = total;

  const footerEl = document.getElementById('footerStats');
  if (footerEl) footerEl.textContent = total;

  // عدد الفئات يُحسب من البيانات الفعلية بدل رقم مكتوب يدوياً في HTML
  const catsEl = document.getElementById('totalCategories');
  if (catsEl) {
    const withQuestions = Object.values(QBANK).filter(c =>
      ['easy', 'medium', 'hard'].some(k => (c[k] || []).length > 0)
    ).length;
    catsEl.textContent = withQuestions || CATEGORIES.length;
  }
}

// ⚠️ لا تُعرِّف `pushToCloud` هنا. كان هنا جذمور فارغ يقول «سيتم تنفيذها في
// sync.js»، وهو يعمل فقط لأن `sync.js` يُحمَّل بعد هذا الملف فيَجُبّه. لو
// انعكس ترتيب الوسمين يوماً لصارت كل عمليات الدفع تنجح صامتة بلا أن تحفظ شيئاً.

/* ============================= ONLINE MODE FUNCTIONS ============================= */

function goToModeSelect() {
  Sound.click();
  showScreen('screen-mode-select');
}

// الرجوع من شاشة الفئات: في الأونلاين نعود لإعدادات الروم، وفي المحلي لإعداد الفرق
function backFromCategories() {
  Sound.click();
  if (currentRoom) {
    showScreen('screen-room-setup');
    updateRoomSetupDisplay();
  } else {
    goToSetup();
  }
}

function startLocalMode() {
  Sound.click();
  // وضع محلي = نفس النظام الحالي
  goToSetup();
}

function goToRooms() {
  // الأونلاين يحتاج هويّة: روم ودعوة وأصدقاء وإحصاءات. المحلي لا يمرّ من هنا
  if (!requireAccount('الأونلاين يحتاج حساب — أو العب «محلي» على هذا الجهاز بلا تسجيل')) return;
  Sound.click();
  showScreen('screen-rooms');
  loadAvailableRooms();
}

async function loadAvailableRooms() {
  const roomsList = document.getElementById('roomsList');
  if (!roomsList) return;

  // لا نعرض الرومات المتاحة للحفاظ على الخصوصية
  // بدل ذلك، نطلب من اللاعب إدخال الكود مباشرة
  roomsList.innerHTML = `
    <div style="text-align: center; padding: 20px; color: #999;">
      <p style="margin-bottom: 15px;">🔒 لا توجد رومات عامة</p>
      <p style="font-size: 12px; line-height: 1.6;">
        اطلب من صاحب الروم أن يعطيك الكود<br>
        ثم ادخله في الحقل أعلاه
      </p>
    </div>
  `;
}

function selectRoomToJoin(roomCode) {
  const input = document.getElementById('roomCodeInput');
  if (input) input.value = roomCode;
  document.getElementById('playerNameInput')?.focus();
}

async function showCreateRoomDialog() {
  const roomName = await uiPrompt('اسم الروم:', 'جلسة اللعب');
  if (!roomName) return;

  createRoomAndEnter(roomName);
}

async function createRoomAndEnter(roomName) {
  // الاسم يأتي من الحساب — لا نسأل عنه مرتين
  const playerName = isSignedIn() ? getPlayerDisplayName() : (await uiPrompt('اسمك:', 'اللاعب'))?.trim();
  if (!playerName) return;

  // الاسم يُمرَّر لـ createRoom حتى يُحفظ في السحابة صحيحاً منذ البداية،
  // بدل ضبطه محلياً بعد الإدراج حيث كان اسم الروم قد كُتب مكانه
  const room = await createRoom(roomName, 'online', playerName.trim());
  if (room) goToRoomSetup();
}

async function joinRoomByCode() {
  const roomCode = document.getElementById('roomCodeInput')?.value?.toUpperCase();
  const playerName = isSignedIn()
    ? getPlayerDisplayName()
    : document.getElementById('playerNameInput')?.value;

  if (!roomCode || roomCode.length < 4) {
    uiAlert('❌ أدخل كود الروم');
    return;
  }

  if (!playerName) {
    uiAlert('❌ أدخل اسمك');
    return;
  }

  const success = await joinRoom(roomCode, playerName);
  if (success) {
    goToRoomSetup();
  }
}

function goToRoomSetup() {
  Sound.click();
  showScreen('screen-room-setup');
  updateRoomSetupDisplay();
}

async function updateRoomSetupDisplay() {
  if (!currentRoom) return;

  const codeDisplay = document.getElementById('roomCodeDisplay');
  if (codeDisplay) codeDisplay.textContent = currentRoom.code;

  const modeDisplay = document.getElementById('roomModeDisplay');
  if (modeDisplay) {
    modeDisplay.textContent = currentRoom.mode === 'online' ? '🌐 أونلاين' : '💻 محلي';
  }

  const startBtn = document.getElementById('startGameBtn');
  if (startBtn && currentPlayer?.is_host) {
    startBtn.style.display = 'block';
  }

  await getRoomPlayers();
  updatePlayersList();
  await loadChatMessages();
  createChatPanel();
}

async function startGameOnline() {
  if (!currentPlayer?.is_host) {
    uiAlert('❌ فقط صاحب الروم يمكنه بدء اللعبة');
    return;
  }

  // لا بد من لاعب واحد آخر على الأقل — لا معنى لجولة أونلاين بلاعب واحد
  if (roomPlayers.length < 2) {
    uiAlert('❌ انتظر دخول لاعب آخر على الأقل قبل البدء');
    return;
  }

  // كل اللاعبين لهم فريق
  const playersWithoutTeam = roomPlayers.filter(p => !p.team);
  if (playersWithoutTeam.length > 0) {
    uiAlert(`❌ وزّع كل اللاعبين على الفرق أولاً

بانتظار التوزيع: ${playersWithoutTeam.map(p => p.player_name).join('، ')}`);
    return;
  }

  // والفريقان ليسا فارغين
  const teamA = roomPlayers.filter(p => p.team === 'A');
  const teamB = roomPlayers.filter(p => p.team === 'B');
  if (!teamA.length || !teamB.length) {
    uiAlert('❌ لازم يكون في كل فريق لاعب واحد على الأقل');
    return;
  }

  // الذهاب لشاشة اختيار الفئات بدل الذهاب مباشرة للعبة
  Sound.click();
  selectedCats = []; // مسح الفئات السابقة
  showScreen('screen-categories');
  renderCatGrid();
}

/* ============================= CHOICE UI & AUTO SCORING ============================= */

// نتيجة السؤال الحالي بعد الإجابة: { pickedIndex, correctIndex, byName, team, correct }
let lastAnswer = null;

function renderChoices(item) {
  const body = document.getElementById('qbody');
  if (!body) return;

  const mine = isMyTurn();
  const turn = currentTurnPlayer();
  const done = !!lastAnswer;

  const letters = ['أ', 'ب', 'ج', 'د'];
  const gated = isQuestionGated(item);
  const media = snapshotQuestionMedia();

  // مقفول: الخيارات تُخفى مع النصّ — رؤيتها وحدها تكفي للتخمين بلا مشاهدة
  body.innerHTML = gated ? `
    ${questionVisual(item)}
    ${questionAudio(item)}
    ${questionVideo(item)}
    ${watchGateBox()}
  ` : `
    ${questionVisual(item)}
    ${questionAudio(item)}
    ${questionVideo(item)}
    <div class="qtext">${escapeHtml(item.question)}</div>
    <div class="choice-hint">${
      done ? '' : (mine ? '👈 اختر إجابتك' : `⏳ ${escapeHtml(turn?.name || 'لاعب آخر')} يجيب الآن`)
    }</div>
    <div class="choices" id="choicesWrap">
      ${item.choices.map((c, i) => {
        let cls = 'choice';
        if (done) {
          // انتهى الوقت: لا كشف للصحيحة — السؤال يرجع للوحة بنفسه
          if (lastAnswer.timedOut) cls += ' dim';
          else if (i === item.correctIndex) cls += ' correct';
          else if (i === lastAnswer.pickedIndex) cls += ' wrong';
          else cls += ' dim';
        }
        return `<button class="${cls}" data-i="${i}"${(!mine || done) ? ' disabled' : ''}>
                  <span class="choice-letter">${letters[i]}</span>
                  <span class="choice-text">${escapeHtml(c)}</span>
                </button>`;
      }).join('')}
    </div>
    ${done ? `<div class="answer-result ${lastAnswer.correct ? 'ok' : 'no'}">
        ${lastAnswer.correct
          ? `✅ إجابة صحيحة — ${escapeHtml(lastAnswer.byName)} كسب ${POINTS[current.row]} نقطة`
          : lastAnswer.timedOut
            ? `⏰ انتهى الوقت على ${escapeHtml(lastAnswer.byName)} — السؤال يرجع للوحة`
            : `❌ إجابة خاطئة من ${escapeHtml(lastAnswer.byName)} — الصحيحة: ${escapeHtml(item.choices[item.correctIndex])}`}
      </div>` : ''}
  `;

  restoreQuestionMedia(media);
  wireWatchGate(item);

  if (mine && !done) {
    body.querySelectorAll('.choice').forEach(btn => {
      btn.onclick = () => submitAnswer(Number(btn.dataset.i));
    });
  }

  // الاحتساب تلقائي — نخفي أزرار إعطاء النقاط اليدوية
  const corners = document.getElementById('cornersBar');
  if (corners) corners.style.display = 'none';
}

// صاحب الدور يختار إجابة: التقييم والنقاط يتمّان تلقائياً، فلا مجال للغش
function submitAnswer(index) {
  if (!current || lastAnswer) return;
  if (!isMyTurn()) return;

  // بالـ slot لا بالـ row: المخزون مفهرَس بالخلية (0–5) لا بالمستوى (0–2)،
  // وإلا أعادت الخلية الثانية في المستوى سؤال الخلية الأولى.
  const key = `${activeRound}-${current.ci}-${current.slot}`;
  const item = questionCache[key];
  if (!item || !Array.isArray(item.choices)) return;

  const correct = index === item.correctIndex;
  const turn = currentTurnPlayer();
  const team = turn?.team || activeTeam;
  const pts = POINTS[current.row];

  lastAnswer = {
    pickedIndex: index,
    correctIndex: item.correctIndex,
    byName: turn?.name || getTeamName(team),
    team,
    correct
  };

  // نحتسب أداء الفئة على من أجاب فعلاً — أي على هذا الجهاز
  if (isMyTurn()) recordCategoryResult(current.cat?.name, correct);

  // السجلّ قبل البثّ، وإلا وصل الآخرين ناقصاً هذا السطر
  logRound({ team, playerId: turn?.player_id || 'local', name: turn?.name || getTeamName(team), correct });

  if (correct) {
    scores[team] = (scores[team] || 0) + pts;
    Sound.award();
  } else {
    Sound.skip();
  }

  updateGameUI();
  renderChoices(item);
  publishGameState();

  // مهلة قصيرة ليرى الجميع النتيجة قبل إغلاق السؤال
  setTimeout(() => finishAnsweredQuestion(), 2600);
}

function finishAnsweredQuestion() {
  if (!current) return;

  // نمدّ صلاحية البثّ عبر تبديل الدور، وإلا بقي الدور واقفاً عند من أجاب
  // على كل الأجهزة الأخرى
  const hadControl = canControlGame();
  answerPublishGrace = hadControl;

  try {
    // انتهاء الوقت أونلاين كذلك: الخلية تبقى وتُفتح بنفس السؤال
    if (lastAnswer?.timedOut) markSlotExpired();
    else stateUsed[activeRound][current.ci][current.slot] = true;
    lastAnswer = null;
    closeQuestion();
    renderBoard();
    switchTurn();

    if (isGameFinished()) {
      if (startBetRound(hadControl)) return;
      if (hadControl) publishGameState({ phase: 'ended' });
      showEndScreen();
      return;
    }

    if (hadControl) publishGameState();
  } finally {
    answerPublishGrace = false;
  }
}

/* ============================= سؤال المراهنة الأخير ============================= */
/*
  خاتمة الجولة: بعد آخر خلية، كل فريق يراهن بجزء من نقاطه على سؤال صعب واحد.
  صحّ يربحها، غلط يخسرها.

  ⚠️ **المراهنة سرّية حتى يقفل الفريقان**: الرقم لا يظهر للطرف الآخر قبل ذلك.
  وهذا يلزم حتى في الوضع المحلي — الفريقان على جهاز واحد، فلو بقي رقم الأول
  معروضاً لاختار الثاني رقمه وهو يعرف كم يكفيه بالضبط، وضاع كل التوتّر.

  ⚠️ **السقف الحقيقي هو الأقل من 1000 ومن رصيد الفريق.** الرصيد شرط لا زينة:
  بدونه يراهن فريق بلا نقاط بألف — لا شيء يخسره وكل شيء يكسبه.

  ⚠️ **السؤال يُنتقى مرة واحدة على جهاز واحد ويُبثّ مع الحالة.** لو انتقاه كل
  جهاز عنده لاختلف السؤال بين اللاعبين: `pickFromBank` عشوائية، وذاكرة
  «ما عُرض» محلية لكل جهاز.
*/

const BET_MAX = 1000;
const BET_STEPS = [0, 250, 500, 750, 1000];

let betEnabled = loadJSON('mr_bet', true);
let betState = null;
let betPublishGrace = false;

function setBetEnabled(on) {
  betEnabled = !!on;
  saveJSON('mr_bet', betEnabled);
  Sound.click();
  renderBetToggle();
}

function renderBetToggle() {
  const btn = document.getElementById('betToggle');
  if (!btn) return;
  btn.classList.toggle('on', betEnabled);
  btn.textContent = betEnabled ? 'مفعّل ✓' : 'مطفأ';
  btn.onclick = () => setBetEnabled(!betEnabled);
}

function resetBetState() {
  betState = null;
}

// سقف مراهنة الفريق: لا يتجاوز الألف ولا رصيده
function betCeiling(team) {
  return Math.min(BET_MAX, Math.max(0, Number(scores[team]) || 0));
}

// الفرق التي يملك هذا الجهاز حقّ المراهنة عنها
function myBetTeams() {
  if (!isOnlineGame()) return ['A', 'B'];
  const me = roomPlayers.find(p => p.player_id === currentPlayer?.player_id);
  return me?.team ? [me.team] : [];
}

/*
  سؤال صعب من فئة **خارج فئات الجولة**: خاتمة الجلسة يجب أن تفاجئ الفريقين،
  وفئات اللوحة صاروا عرفوا مزاجها بعد ثمانية عشر سؤالاً.
  📌 فئات اللوحة تبقى احتياطاً أخيراً: لو ما أسعفت أي فئة خارجية (بنك ناقص،
  أو كل الفئات مختارة) لا نُسقط المراهنة أصلاً.
  📌 نتجنّب أسئلة الفيديو والصوت: شاشة المراهنة تعرض النص والصورة فقط،
  فسؤال مقطعُه هو محتواه يصل بلا محتوى.
*/
function pickBetQuestion() {
  const onBoard = rounds[activeRound] || [];
  const boardNames = new Set(
    (rounds || []).flat().map(c => c && c.name).filter(Boolean)
  );
  const outside = (CATEGORIES || []).filter(c => c && c.name && !boardNames.has(c.name));

  for (const pool of [outside, onBoard]) {
    const order = pool.slice().sort(() => Math.random() - 0.5);
    for (const cat of order) {
      const q = pickFromBank(cat.name, 2);   // 2 = صعب
      if (!q || q.video || q.audio) continue;

      let item = q;
      if (isOnlineGame()) {
        const mc = buildChoices(q, cat.name, 'hard', `${currentRoom.id}-bet-${cat.name}`);
        if (mc) item = { ...q, choices: mc.choices, correctIndex: mc.correctIndex };
      }
      return { item, catName: `${cat.ic || ''} ${cat.name}`.trim() };
    }
  }
  return null;
}

// تُنادى مكان شاشة الفوز. ترجع false فتُنهى اللعبة كالمعتاد
function startBetRound(hadControl) {
  if (!betEnabled || betState) return false;

  const picked = pickBetQuestion();
  if (!picked) return false;   // لا سؤال صعب متاح — لا نُعلّق اللعبة

  betState = {
    bets:    { A: 0, B: 0 },
    locked:  { A: false, B: false },
    answers: { A: null, B: null },
    judged:  { A: null, B: null },   // الوضع المحلي: حكم من على الجهاز
    revealed: false,
    resolved: false,
    outcome: null,
    cat: picked.catName,
    item: picked.item
  };

  if (isOnlineGame() && hadControl) publishBet();
  showScreen('screen-bet');
  renderBet();
  Sound.start();
  return true;
}

function publishBet() {
  if (!isOnlineGame()) return;
  betPublishGrace = true;
  try { publishGameState({ phase: 'bet' }); }
  finally { betPublishGrace = false; }
}

/*
  دمج لا استبدال.

  فريقان يقفلان مراهنتيهما في اللحظة نفسها من جهازين: كلٌّ يبثّ حالةً لا تعرف
  قفل الآخر، وآخر بثّ يفوز — فيضيع قفل ويتجمّد الجميع في انتظاره. الدمج يأخذ
  كل قفل وكل إجابة من أي طرف، ومن كان يعرف أكثر ممّا وصله أعاد البثّ فانتشر
  ما عنده. ترجع true إن وجب إعادة البثّ.
*/
function mergeBetState(incoming) {
  if (!incoming) return false;
  if (!betState) { betState = incoming; return false; }

  let iKnowMore = false;

  ['A', 'B'].forEach(t => {
    if (incoming.locked?.[t] && !betState.locked[t]) {
      betState.locked[t] = true;
      betState.bets[t] = Number(incoming.bets?.[t]) || 0;
    } else if (betState.locked[t] && !incoming.locked?.[t]) {
      iKnowMore = true;
    }

    if (incoming.answers?.[t] && !betState.answers[t]) {
      betState.answers[t] = incoming.answers[t];
    } else if (betState.answers[t] && !incoming.answers?.[t]) {
      iKnowMore = true;
    }
  });

  if (incoming.item && !betState.item) betState.item = incoming.item;
  if (incoming.cat && !betState.cat) betState.cat = incoming.cat;

  // الحسم نهائي ولا يُدمج: من حسم أرسل النتيجة كاملة ومعها النقاط
  if (incoming.resolved && !betState.resolved) {
    betState.resolved = true;
    betState.outcome = incoming.outcome || betState.outcome;
    iKnowMore = false;
  }

  return iKnowMore;
}

/* ---------- العرض ---------- */

function renderBet() {
  const wrap = document.getElementById('betBody');
  if (!wrap || !betState) return;

  if (betState.resolved) return renderBetResult(wrap);
  if (betState.locked.A && betState.locked.B) return renderBetQuestion(wrap);
  renderBetWagers(wrap);
}

function renderBetWagers(wrap) {
  const mine = myBetTeams();

  wrap.innerHTML = `
    <div class="bet-head">
      <div class="bet-title">💰 سؤال المراهنة</div>
      <div class="bet-sub">راهن بما تشاء حتى ${BET_MAX} نقطة — صح تكسبها، غلط تخسرها</div>
    </div>
    <div class="bet-cards">${['A', 'B'].map(t => betCardHtml(t, mine.includes(t))).join('')}</div>
    ${isOnlineHost() ? '<button class="btn-main btn-ghost bet-skip" id="betSkipBtn">⏭️ تخطّي المراهنة</button>' : ''}
  `;

  wrap.querySelectorAll('.bet-step').forEach(b => {
    b.onclick = () => setBetAmount(b.dataset.team, Number(b.dataset.amount));
  });
  wrap.querySelectorAll('.bet-lock').forEach(b => {
    b.onclick = () => lockBet(b.dataset.lock);
  });
  const skip = document.getElementById('betSkipBtn');
  if (skip) skip.onclick = () => skipBet();
}

function betCardHtml(team, editable) {
  const icon = team === 'A' ? '🟢' : '🟡';
  const name = escapeHtml(getTeamName(team));
  const score = scores[team] || 0;
  const head = `<div class="bet-team">${icon} ${name}</div>
                <div class="bet-score">${score} نقطة</div>`;

  if (betState.locked[team]) {
    return `<div class="bet-card ${team} locked">${head}<div class="bet-ready">✅ جاهز</div></div>`;
  }
  if (!editable) {
    return `<div class="bet-card ${team} waiting">${head}<div class="bet-wait">⏳ يختار مراهنته...</div></div>`;
  }

  const ceiling = betCeiling(team);
  const val = Number(betState.bets[team]) || 0;
  const steps = BET_STEPS.filter(s => s === 0 || s <= ceiling);

  return `<div class="bet-card ${team} mine">
    ${head}
    <div class="bet-steps">
      ${steps.map(s => `<button class="bet-step${s === val ? ' active' : ''}"
                                data-team="${team}" data-amount="${s}">${s}</button>`).join('')}
    </div>
    ${ceiling < BET_MAX ? `<div class="bet-note">سقفك ${ceiling} — ما تقدر تراهن بأكثر من رصيدك</div>` : ''}
    <button class="btn-main btn-primary bet-lock" data-lock="${team}">تأكيد المراهنة</button>
  </div>`;
}

function setBetAmount(team, amount) {
  if (!betState || betState.locked[team]) return;
  betState.bets[team] = Math.min(Number(amount) || 0, betCeiling(team));
  Sound.select();
  renderBet();   // بلا بثّ: الرقم سرّ حتى القفل
}

function lockBet(team) {
  if (!betState || betState.locked[team]) return;
  betState.bets[team] = Math.min(Number(betState.bets[team]) || 0, betCeiling(team));
  betState.locked[team] = true;
  Sound.click();
  publishBet();
  renderBet();
}

async function skipBet() {
  if (!await uiConfirm('تتخطّى سؤال المراهنة وتروح لشاشة الفوز؟')) return;
  if (betState) { betState.resolved = true; betState.outcome = null; }
  finishBet();
}

function renderBetQuestion(wrap) {
  const item = betState.item || {};
  const mine = myBetTeams();
  const online = isOnlineGame() && Array.isArray(item.choices);
  const letters = ['أ', 'ب', 'ج', 'د'];

  const chips = ['A', 'B'].map(t => {
    const done = !!betState.answers[t];
    return `<div class="bet-chip${done ? ' done' : ''}">${t === 'A' ? '🟢' : '🟡'} ${escapeHtml(getTeamName(t))} — ${done ? '✅ أجاب' : '⏳ ينتظر'}</div>`;
  }).join('');

  if (online) {
    const pending = mine.filter(t => !betState.answers[t]);
    wrap.innerHTML = `
      <div class="bet-qhead">💰 سؤال المراهنة — ${escapeHtml(betState.cat || '')}</div>
      ${questionVisual(item)}
      <div class="qtext">${escapeHtml(item.question || '')}</div>
      <div class="bet-chips">${chips}</div>
      <div class="choice-hint">${pending.length ? '👈 اختر إجابة فريقك' : '⏳ بانتظار الفريق الآخر'}</div>
      <div class="choices">
        ${(item.choices || []).map((c, i) => `
          <button class="choice" data-i="${i}"${pending.length ? '' : ' disabled'}>
            <span class="choice-letter">${letters[i]}</span>
            <span class="choice-text">${escapeHtml(c)}</span>
          </button>`).join('')}
      </div>`;

    if (pending.length) {
      wrap.querySelectorAll('.choice').forEach(b => {
        b.onclick = () => answerBet(pending[0], Number(b.dataset.i));
      });
    }
    return;
  }

  // محلي: يُكشف الجواب ثم يُحكَم على كل فريق
  const judgedBoth = betState.judged.A !== null && betState.judged.B !== null;
  wrap.innerHTML = `
    <div class="bet-qhead">💰 سؤال المراهنة — ${escapeHtml(betState.cat || '')}</div>
    ${questionVisual(item)}
    <div class="qtext">${escapeHtml(item.question || '')}</div>
    ${betState.revealed ? `<div class="bet-answer">${escapeHtml(item.answer || '')}</div>` : ''}
    ${betState.revealed ? `
      <div class="bet-judge">
        ${['A', 'B'].map(t => `
          <div class="bet-judge-row">
            <span class="bet-judge-team">${t === 'A' ? '🟢' : '🟡'} ${escapeHtml(getTeamName(t))}</span>
            <button class="btn-judge ok${betState.judged[t] === true ? ' on' : ''}" data-j="${t}" data-v="1">✓ صح</button>
            <button class="btn-judge no${betState.judged[t] === false ? ' on' : ''}" data-j="${t}" data-v="0">✗ خطأ</button>
          </div>`).join('')}
      </div>
      <button class="btn-main btn-primary" id="betApplyBtn"${judgedBoth ? '' : ' disabled'}>احسب النتيجة</button>
    ` : '<button class="btn-main btn-secondary" id="betRevealBtn">عرض الإجابة</button>'}
  `;

  const reveal = document.getElementById('betRevealBtn');
  if (reveal) reveal.onclick = () => { betState.revealed = true; Sound.reveal(); renderBet(); };

  wrap.querySelectorAll('.btn-judge').forEach(b => {
    b.onclick = () => {
      betState.judged[b.dataset.j] = b.dataset.v === '1';
      Sound.select();
      renderBet();
    };
  });

  const apply = document.getElementById('betApplyBtn');
  if (apply) apply.onclick = () => resolveBet();
}

function answerBet(team, index) {
  if (!betState || betState.answers[team]) return;
  const item = betState.item || {};

  betState.answers[team] = {
    index,
    correct: index === item.correctIndex,
    byName: currentPlayer?.name || getTeamName(team)
  };

  Sound.click();
  publishBet();
  renderBet();

  // من أجاب أخيراً هو من يحسم — فلا ينتظر الجميع بعضهم
  if (betState.answers.A && betState.answers.B) setTimeout(() => resolveBet(), 900);
}

function resolveBet() {
  if (!betState || betState.resolved) return;

  const online = isOnlineGame() && Array.isArray(betState.item?.choices);
  const outcome = {};

  ['A', 'B'].forEach(t => {
    const amount = Math.min(Number(betState.bets[t]) || 0, BET_MAX);
    const correct = online ? !!betState.answers[t]?.correct : betState.judged[t] === true;
    const delta = correct ? amount : -amount;
    outcome[t] = { amount, correct, delta };
    scores[t] = Math.max(0, (Number(scores[t]) || 0) + delta);
  });

  betState.outcome = outcome;
  betState.resolved = true;

  if (outcome.A.correct || outcome.B.correct) Sound.award(); else Sound.skip();
  publishBet();
  renderBet();
}

function renderBetResult(wrap) {
  const o = betState.outcome;

  if (!o) {   // تُخُطّيت المراهنة
    wrap.innerHTML = '<div class="bet-qhead">تُخُطّيت المراهنة</div>' +
      '<button class="btn-main btn-primary" id="betEndBtn">شوف الفائز 🏆</button>';
  } else {
    wrap.innerHTML = `
      <div class="bet-qhead">💰 نتيجة المراهنة</div>
      <div class="bet-answer">الإجابة: ${escapeHtml(betState.item?.answer || '')}</div>
      <div class="bet-cards">
        ${['A', 'B'].map(t => `
          <div class="bet-card ${t} result ${o[t].correct ? 'win' : 'lose'}">
            <div class="bet-team">${t === 'A' ? '🟢' : '🟡'} ${escapeHtml(getTeamName(t))}</div>
            <div class="bet-verdict">${o[t].correct ? '✅ صحيحة' : '❌ خاطئة'}</div>
            <div class="bet-delta">${o[t].delta >= 0 ? '+' : ''}${o[t].delta}</div>
            <div class="bet-total" data-team="${t}">${scores[t]}</div>
          </div>`).join('')}
      </div>
      <button class="btn-main btn-primary" id="betEndBtn">شوف الفائز 🏆</button>`;
  }

  // المجموع يزحف من رصيد ما قبل المراهنة إلى ما بعدها، فيُرى أثر الرهان نفسه
  if (o) {
    wrap.querySelectorAll('.bet-total').forEach(el => {
      const t = el.dataset.team;
      el.textContent = (Number(scores[t]) || 0) - o[t].delta;
      animateNumber(el, scores[t], 800);
    });
    if (o.A.correct || o.B.correct) setTimeout(() => burstConfetti(wrap), 500);
  }

  const end = document.getElementById('betEndBtn');
  if (end) end.onclick = () => finishBet();
}

function finishBet() {
  if (isOnlineGame() && canControlGame()) {
    betPublishGrace = true;
    try { publishGameState({ phase: 'ended' }); }
    finally { betPublishGrace = false; }
  }
  showEndScreen();
}

/* ============================= سجلّ الجولة وملخّصها ============================= */
/*
  شاشة الفوز كانت كأساً واسمين ورقمين — ولا كلمة عمّا جرى في الثمانية عشر
  سؤالاً. تُجمَع الآن سطراً لكل خلية، ويُبنى منها ملخّص.

  ⚠️ **الوضع المحلي لا يعرف اللاعبين ولن يعرفهم.** الفريقان على جهاز واحد،
  و`award(team)` لا تحمل إلا اسم الفريق. فالملخّص هناك **للفرق لا للأفراد**،
  ولا نخترع «أفضل لاعب» من عدم. (نفس مبدأ «أداء هذا الجهاز» في
  `recordCategoryResult`.)

  ⚠️ **الزمن يُقاس على جهاز المجيب وحده.** `questionOpenedAt` تُضبط عند فتح
  السؤال محلياً، والمجيب في الأونلاين هو من فتحه، فالقياس صحيح له. ولا يُقارن
  زمنُ جهازٍ بزمن آخر إلا وكلاهما قاس رحلته من فتحه هو.
*/

let roundLog = [];
let questionOpenedAt = 0;

function resetRoundLog() {
  roundLog = [];
  questionOpenedAt = 0;
}

function logRound(entry) {
  if (!current) return;
  roundLog.push({
    cat: current.cat?.name || '',
    row: current.row,
    points: POINTS[current.row] || 0,
    ms: questionOpenedAt ? Math.max(0, Date.now() - questionOpenedAt) : 0,
    ...entry
  });
}

/* ---- بناء الملخّص ---- */

function buildRoundSummary() {
  const played = roundLog.filter(e => !e.skipped);
  const online = roundLog.some(e => e.playerId);

  const teams = {
    A: { correct: 0, wrong: 0, points: 0, lost: 0 },
    B: { correct: 0, wrong: 0, points: 0, lost: 0 }
  };
  const players = new Map();

  let fastest = null;
  let bestStreak = { team: null, n: 0 };
  let run = { team: null, n: 0 };
  const byCat = new Map();

  played.forEach(e => {
    const t = teams[e.team];
    if (t) {
      if (e.correct) { t.correct++; t.points += e.points; }
      else { t.wrong++; t.lost += e.points; }
    }

    if (e.playerId) {
      if (!players.has(e.playerId)) {
        players.set(e.playerId, { name: e.name, team: e.team, correct: 0, wrong: 0, points: 0, msSum: 0 });
      }
      const p = players.get(e.playerId);
      if (e.correct) { p.correct++; p.points += e.points; }
      else p.wrong++;
      p.msSum += e.ms;
    }

    // ⚠️ نصف ثانية حدّاً أدنى: أقلّ منها ليس سرعة بشر بل نقرة على سؤال
    // كان مفتوحاً من قبل (أو تشغيل آلي) — و«أسرع إجابة: 0.0 ثانية» تُقرأ عطلاً
    if (e.correct && e.ms >= 500 && (!fastest || e.ms < fastest.ms)) fastest = e;

    // أطول سلسلة صحيحة متتالية لفريق واحد
    if (e.correct && e.team === run.team) run.n++;
    else run = { team: e.correct ? e.team : null, n: e.correct ? 1 : 0 };
    if (run.team && run.n > bestStreak.n) bestStreak = { team: run.team, n: run.n };

    if (e.cat) {
      if (!byCat.has(e.cat)) byCat.set(e.cat, { name: e.cat, wrong: 0, total: 0 });
      const c = byCat.get(e.cat);
      c.total++;
      if (!e.correct) c.wrong++;
    }
  });

  // أصعب فئة: الأكثر خطأً، ولا تُعرض إلا إن سقط فيها سؤالان فأكثر
  const hardestCat = [...byCat.values()].sort((x, y) => (y.wrong - x.wrong) || (y.total - x.total))[0];

  // البطل: الأكثر إجابات صحيحة، ويفصل بينهم النقاط ثم أسرع متوسط
  const ranked = [...players.values()].sort((x, y) =>
    (y.correct - x.correct) ||
    (y.points - x.points) ||
    ((x.msSum / Math.max(1, x.correct + x.wrong)) - (y.msSum / Math.max(1, y.correct + y.wrong))));

  const mvp = ranked.length && ranked[0].correct > 0 ? ranked[0] : null;

  return { online, played: played.length, teams, ranked, mvp, fastest, bestStreak, hardestCat };
}

/* ---- العرض ---- */

function renderEndSummary() {
  const box = document.getElementById('endSummary');
  if (!box) return;

  if (!roundLog.length) { box.innerHTML = ''; return; }

  const s = buildRoundSummary();
  const icon = t => (t === 'A' ? '🟢' : '🟡');
  const pct = (c, w) => (c + w ? Math.round((c / (c + w)) * 100) : 0);

  // تمييز العدد بالعربية: «6 سؤالاً» خطأ، و«6 أسئلة» صواب، والمثنّى له صيغته
  const qCount = n => (n === 1 ? 'سؤال واحد' : n === 2 ? 'سؤالين'
                     : n <= 10 ? `${n} أسئلة` : `${n} سؤالاً`);
  const aCount = n => (n === 1 ? 'إجابة صحيحة واحدة' : n === 2 ? 'إجابتين صحيحتين'
                     : n <= 10 ? `${n} إجابات صحيحة` : `${n} إجابة صحيحة`);

  const cards = [];

  if (s.mvp) {
    cards.push(`<div class="sum-card hero">
      <div class="sum-label">⭐ أفضل لاعب</div>
      <div class="sum-value">${icon(s.mvp.team)} ${escapeHtml(s.mvp.name)}</div>
      <div class="sum-note">${aCount(s.mvp.correct)} · ${s.mvp.points} نقطة</div>
    </div>`);
  } else if (!s.online) {
    const lead = s.teams.A.correct >= s.teams.B.correct ? 'A' : 'B';
    cards.push(`<div class="sum-card hero">
      <div class="sum-label">⭐ الأدقّ</div>
      <div class="sum-value">${icon(lead)} ${escapeHtml(getTeamName(lead))}</div>
      <div class="sum-note">${s.teams[lead].correct} من ${s.teams[lead].correct + s.teams[lead].wrong} صحيحة</div>
    </div>`);
  }

  if (s.fastest) {
    cards.push(`<div class="sum-card">
      <div class="sum-label">⚡ أسرع إجابة</div>
      <div class="sum-value sum-ltr">${(s.fastest.ms / 1000).toFixed(1)}<span class="sum-unit">ث</span></div>
      <div class="sum-note">${icon(s.fastest.team)} ${escapeHtml(s.fastest.name || getTeamName(s.fastest.team))} — ${escapeHtml(s.fastest.cat)}</div>
    </div>`);
  }

  /*
    ⚠️ **السلسلة معنىً محلّي.** في الأونلاين الدور يتناوب بين الفريقين حتماً
    (`buildTurnOrder`)، فلا يمكن أن يصيب فريق مرتين متتاليتين — البطاقة كانت
    لا تظهر هناك أبداً. «أصعب فئة» تعمل في الوضعين، وهي أطرف: تكشف الفئة
    التي سقط فيها الجميع.
  */
  if (s.bestStreak.n >= 2) {
    cards.push(`<div class="sum-card">
      <div class="sum-label">🔥 أطول سلسلة</div>
      <div class="sum-value sum-ltr">${s.bestStreak.n}</div>
      <div class="sum-note">${icon(s.bestStreak.team)} ${escapeHtml(getTeamName(s.bestStreak.team))} على التوالي</div>
    </div>`);
  }

  if (s.hardestCat && s.hardestCat.wrong >= 2) {
    cards.push(`<div class="sum-card">
      <div class="sum-label">🎯 أصعب فئة</div>
      <div class="sum-value">${escapeHtml(s.hardestCat.name)}</div>
      <div class="sum-note">${s.hardestCat.wrong} من ${s.hardestCat.total} ضاعت</div>
    </div>`);
  }

  const lostTotal = s.teams.A.lost + s.teams.B.lost;
  if (lostTotal > 0) {
    cards.push(`<div class="sum-card">
      <div class="sum-label">💸 نقاط ضاعت</div>
      <div class="sum-value sum-ltr">${lostTotal}</div>
      <div class="sum-note">على ${qCount(s.teams.A.wrong + s.teams.B.wrong)} بلا إجابة صحيحة</div>
    </div>`);
  }

  // جدول: اللاعبون في الأونلاين، والفريقان في المحلي
  const rows = s.online
    ? s.ranked.map(p => ({ label: `${icon(p.team)} ${p.name}`, c: p.correct, w: p.wrong, pts: p.points }))
    : ['A', 'B'].map(t => ({ label: `${icon(t)} ${getTeamName(t)}`, c: s.teams[t].correct, w: s.teams[t].wrong, pts: s.teams[t].points }));

  // سطر المراهنة — الرهان أبرز لحظة في الجولة فلا يُطوى في المجموع
  let betRow = '';
  if (betState?.outcome) {
    const o = betState.outcome;
    betRow = `<div class="sum-bet">
      💰 المراهنة:
      ${['A', 'B'].map(t => `<span class="sum-bet-one ${o[t].correct ? 'win' : 'lose'}">${icon(t)} ${escapeHtml(getTeamName(t))}
        <b class="sum-ltr">${o[t].delta >= 0 ? '+' : ''}${o[t].delta}</b></span>`).join('')}
    </div>`;
  }

  box.innerHTML = `
    <div class="sum-title">📋 ملخّص الجولة</div>
    <div class="sum-cards">${cards.join('')}</div>
    <div class="sum-table">
      <div class="sum-row head">
        <span class="sum-who">${s.online ? 'اللاعب' : 'الفريق'}</span>
        <span>✅</span><span>❌</span><span>الدقة</span><span>النقاط</span>
      </div>
      ${rows.map(r => `<div class="sum-row">
        <span class="sum-who">${escapeHtml(r.label)}</span>
        <span class="sum-ok">${r.c}</span>
        <span class="sum-no">${r.w}</span>
        <span class="sum-ltr">${pct(r.c, r.w)}%</span>
        <span class="sum-pts">${r.pts}</span>
      </div>`).join('')}
    </div>
    ${betRow}
    ${s.online ? '' : '<div class="sum-foot">الوضع المحلي يعرف الفرق ولا يعرف الأفراد — الجهاز واحد</div>'}
  `;
}
