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

const DEFAULT_CATEGORIES = [
  { name: 'الشمال', ic: '🧭' }, { name: 'الحرمين', ic: '🕋' }, { name: 'الوسطى', ic: '🏙️' },
  { name: 'الجنوب', ic: '⛰️' }, { name: 'الغربية', ic: '🏘️' }, { name: 'الشرقية', ic: '🛢️' },
  { name: 'السعودية', ic: '🇸🇦' }, { name: 'أغاني وطنية', ic: '🎤' }, { name: 'حلا وقهوة', ic: '☕' },
  { name: 'موسم الرياض', ic: '🎡' }, { name: 'لهجات سعودية', ic: '🗣️' }, { name: 'سوبرماركت', ic: '🛒' },
  { name: 'مطاعم السعودية', ic: '🍽️' }, { name: 'شعارات سعودية', ic: '🏷️' }, { name: 'عالم الحيوان', ic: '🐘' },
  { name: 'تكنولوجيا', ic: '💻' }, { name: 'معلومات عامة', ic: '❓' }, { name: 'سيرة ذاتية', ic: '👤' },
  { name: 'تاريخ', ic: '🏛️' }, { name: 'عالم الشعر', ic: '✍️' }, { name: 'لغة وأدب', ic: '📖' },
  { name: 'طب عام', ic: '🩺' }, { name: 'عطور عربية', ic: '🪔' }, { name: 'عطور عالمية', ic: '🧴' },
  { name: 'أكل وبراد', ic: '🧺' }, { name: 'منتجات', ic: '🛍️' }, { name: 'شعارات عالمية', ic: '🌐' },
  { name: 'شعارات', ic: '🎯' }, { name: 'ميمز', ic: '😂' }, { name: 'الذكاء الاصطناعي', ic: '🤖' },
  { name: 'سيارات', ic: '🚗' }, { name: 'منو المشهور', ic: '🎩' }, { name: 'مين المؤثر', ic: '🕵️' },
  { name: 'صوت المشهور', ic: '🎙️' }, { name: 'طب الأسنان', ic: '🦷' },
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

let selectedCats = [];
let rounds = [];
let stateUsed = {};
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
  Sound.select();
  const idx = selectedCats.findIndex(s => s.name === c.name);
  if (idx > -1) {
    selectedCats.splice(idx, 1);
    card.classList.remove('sel');
  } else {
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
  const roundsCount = Math.ceil(n / 6) || 0;
  const status = document.getElementById('selStatus');
  if (status) {
    status.innerHTML = `اخترت <b>${n}</b> فئة — راح تتكوّن <b>${roundsCount}</b> جولة${n % 6 !== 0 && n > 0 ? ` (آخر جولة فيها ${n % 6} فئات)` : ''}`;
  }

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

  for (let i = 0; i < selectedCats.length; i += 6) {
    rounds.push(selectedCats.slice(i, i + 6));
  }

  stateUsed = {};
  rounds.forEach((r, ri) => {
    stateUsed[ri] = r.map(() => [false, false, false]);
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
    // `mr_set_status` ترفض من ليس مضيفاً — الفحص في القاعدة لا هنا
    RoomNet.setStatus('active');
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

// هل استُهلكت كل الخلايا في كل الجولات؟
function isGameFinished() {
  if (!rounds.length) return false;

  return rounds.every((cats, ri) => {
    const roundState = stateUsed[ri];
    if (!roundState) return false;
    return cats.every((_, ci) => (roundState[ci] || []).every(Boolean));
  });
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
        <div class="end-team-score">${a}</div>
      </div>
      <div class="end-score-card B ${b >= a ? 'lead' : ''}">
        <div class="end-team-name">🟡 ${escapeHtml(nameB)}</div>
        <div class="end-team-score">${b}</div>
      </div>
    `;
  }

  showScreen('screen-end');
  Sound.award?.();
  trackEvent('game_finished');

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
  if (scoreA) scoreA.textContent = scores.A;
  if (scoreB) scoreB.textContent = scores.B;

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
    goToSetup();
  }
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

  board.style.gridTemplateColumns = `repeat(${cats.length}, 1fr)`;
  board.innerHTML = '';

  // رؤوس الفئات
  cats.forEach(c => {
    const h = createElement('div', {
      class: 'cat-header'
    }, `<span class="ic">${escapeHtml(c.ic)}</span><span>${escapeHtml(c.name)}</span>`);
    board.appendChild(h);
  });

  // الخلايا
  for (let row = 0; row < 3; row++) {
    cats.forEach((c, ci) => {
      const used = stateUsed[activeRound][ci][row];
      const cell = createElement('div', {
        class: `cell${used ? ' used' : ''}`
      }, used ? '✓' : POINTS[row]);

      if (!used) {
        cell.onclick = () => openQuestion(ci, row);
      }

      board.appendChild(cell);
    });
  }
}

/* ============================= MULTIPLE CHOICE ============================= */
/*
  بنك الأسئلة يحوي الإجابة الصحيحة فقط — لا خيارات خاطئة في أي من الأسئلة.
  لذلك نولّد المشتّتات من إجابات أسئلة أخرى في نفس الفئة ونفس المستوى، وهي
  الأقرب شكلاً وطولاً للإجابة الصحيحة فتكون منافسة معقولة. وإن لم تكفِ،
  نوسّع للمستويات الأخرى في الفئة نفسها ثم لبقية الفئات.
*/

function collectAnswerPool(categoryName, diffKey, exclude) {
  const seen = new Set([normalizeAnswer(exclude)]);
  const pool = [];

  const take = (list) => {
    (list || []).forEach(q => {
      const a = String(q?.answer || '').trim();
      const key = normalizeAnswer(a);
      if (!a || seen.has(key)) return;
      seen.add(key);
      pool.push(a);
    });
  };

  // 1) نفس الفئة ونفس المستوى — الأقرب سياقاً
  take(QBANK[categoryName]?.[diffKey]);

  // 2) نفس الفئة، مستويات أخرى
  if (pool.length < 12) {
    DIFFKEY.filter(k => k !== diffKey).forEach(k => take(QBANK[categoryName]?.[k]));
  }

  // 3) فئات أخرى — ملاذ أخير
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

// اختيار مشتّتات مقاربة في الطول للإجابة الصحيحة — الخيار القصير جداً وسط
// خيارات طويلة يكشف نفسه
function buildChoices(item, categoryName, diffKey, seed) {
  const correct = String(item?.answer || '').trim();
  if (!correct) return null;

  const pool = collectAnswerPool(categoryName, diffKey, correct);
  if (pool.length < 3) return null;

  const rand = makeSeededRandom(seed);

  // نرتّب حسب قرب الطول ثم نأخذ عشوائياً من الأقرب نصفهم
  const byCloseness = pool
    .map(a => ({ a, d: Math.abs(a.length - correct.length) }))
    .sort((x, y) => x.d - y.d);

  const candidates = byCloseness.slice(0, Math.max(3, Math.min(20, byCloseness.length)));
  const picked = [];
  while (picked.length < 3 && candidates.length) {
    const i = Math.floor(rand() * candidates.length);
    picked.push(candidates.splice(i, 1)[0].a);
  }
  if (picked.length < 3) return null;

  const choices = [correct, ...picked];

  // خلط ثابت بنفس البذرة حتى يرى كل اللاعبين نفس الترتيب
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

function openQuestion(ci, row) {
  // في الأونلاين صاحب الدور هو من يفتح السؤال ويجيب عليه
  if (isOnlineGame() && !isMyTurn()) {
    const t = currentTurnPlayer();
    uiAlert(`⏳ الدور الآن على ${t ? t.name : 'لاعب آخر'}`);
    return;
  }

  Sound.open();
  const cat = rounds[activeRound][ci];
  current = { ci, row, cat };

  const qcat = document.getElementById('qcat');
  const qpoints = document.getElementById('qpoints');
  if (qcat) qcat.innerHTML = `${escapeHtml(cat.ic)} ${escapeHtml(cat.name)}`;
  if (qpoints) qpoints.textContent = `${POINTS[row]} نقطة`;

  document.getElementById('cornersBar').style.display = 'none';
  document.getElementById('qbody').innerHTML = '<div class="loadbox">⏳ جاري إحضار السؤال...</div>';
  document.getElementById('overlay').classList.add('show');

  const cacheKey = `${activeRound}-${ci}-${row}`;
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
      showQuickAddForm(cat, row, ci);
      return;
    }
  }

  renderQuestionBody(item);
  if (canControlGame() && isOnlineGame()) publishGameState();
  if (isOnlineHost()) publishGameState();
}

function showQuickAddForm(cat, row, ci) {
  document.getElementById('qbody').innerHTML = `
    <div class="loadbox">ما فيه سؤال محفوظ لهذه الفئة بعد 🙂</div>
    <div class="admin-row" style="flex-direction:column; align-items:stretch; margin-top:10px;">
      <input type="text" id="quickQText" placeholder="نص السؤال">
      <input type="text" id="quickQAnswer" placeholder="الإجابة الصحيحة">
      <input type="text" id="quickQEmoji" placeholder="إيموجي (اختياري)">
      <button class="btn btn-answer" style="margin-top:6px;" onclick="quickAddAndShow(${ci},${row})">حفظ وعرض السؤال</button>
    </div>
  `;
  document.getElementById('cornersBar').style.display = 'flex';
  document.getElementById('answerCorner').style.visibility = 'hidden';
}

async function quickAddAndShow(ci, row) {
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

  const cacheKey = `${activeRound}-${ci}-${row}`;
  questionCache[cacheKey] = newItem;

  log('سؤال جديد تمت إضافته من قبل الإدمن', 'success');
  Sound.award();
  renderQuestionBody(newItem);
}

function pickFromBank(categoryName, row) {
  const diffKey = DIFFKEY[row];
  const list = QBANK[categoryName] && QBANK[categoryName][diffKey];

  if (!list || !list.length) return null;

  const idx = Math.floor(Math.random() * list.length);
  return { ...list[idx] };
}

function renderQuestionBody(item) {
  const body = document.getElementById('qbody');
  if (!body) return;

  // أونلاين: أربعة خيارات واحتساب تلقائي بدل حكم المضيف
  if (isOnlineGame() && Array.isArray(item.choices)) {
    renderChoices(item);
    return;
  }

  body.innerHTML = `
    <div class="qimg" id="qimg">${item.emoji || '❓'}</div>
    <div class="qtext" id="qtext">${item.question}</div>
    <div class="atext" id="atext">${item.answer}</div>
  `;

  document.getElementById('toggleAnswerBtn').textContent = 'عرض الإجابة';
  document.getElementById('answerCorner').style.visibility = 'visible';
  document.getElementById('cornersBar').style.display = 'flex';
  Sound.reveal();

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
    const scoreEl = document.getElementById(`score${team}`);
    if (scoreEl) scoreEl.textContent = scores[team];
    Sound.award();
  } else {
    Sound.skip();
  }

  stateUsed[activeRound][current.ci][current.row] = true;
  closeQuestion();
  renderBoard();

  // الدور ينتقل للفريق الآخر، إلا مع «استريح» فيبقى مع نفس الفريق
  if (!opts.keepTurn) switchTurn();

  // انتهت كل الخلايا؟ نعرض شاشة الفوز
  if (isGameFinished()) {
    if (isOnlineHost()) publishGameState({ phase: 'ended' });
    showEndScreen();
    return;
  }

  if (isOnlineHost()) publishGameState();
}

function closeQuestion() {
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('cornersBar').style.display = '';
  current = null;
  lastAnswer = null;
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

// من يحقّ له تحديث حالة اللعبة: المضيف أو صاحب الدور (لأنه هو من يجيب)
function canControlGame() {
  return isOnlineHost() || isMyTurn();
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
    activeRound,
    activeTeam,
    turnOrder,
    turnIndex,
    scores,
    lifelines: { setup: { A: teamSetup.A.lifelines, B: teamSetup.B.lifelines },
                 used: lifelineUsed, active: activeLifeline },
    openQuestion: current
      ? { ci: current.ci, row: current.row, round: activeRound, item: questionCache[`${activeRound}-${current.ci}-${current.row}`] }
      : null,
    lastAnswer,
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

  if (state.phase !== 'playing' && state.phase !== 'ended') return;

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
  if (state.used) stateUsed = state.used;
  if (state.scores) scores = state.scores;
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
      current = { ci: q.ci, row: q.row, cat };
      questionCache[`${q.round}-${q.ci}-${q.row}`] = q.item;
      document.getElementById('qcat').innerHTML = `${escapeHtml(cat.ic)} ${escapeHtml(cat.name)}`;
      document.getElementById('qpoints').textContent = `${POINTS[q.row]} نقطة`;
      renderQuestionBody(q.item);
      overlay.classList.add('show');
    }
  } else if (!isOnlineHost()) {
    overlay.classList.remove('show');
    current = null;
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
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'overlay') closeQuestion();
  });

  updateTotalStats();
  syncBundledQuestionBank();
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
  'data/questions-part10.json'
];

// نجلب الملفات مرة واحدة فقط لكل تحميل صفحة ونعيد استخدام النتيجة،
// لأن الدالة تُستدعى مرتين (عند التحميل وبعد سحب السحابة) وكان ذلك يضاعف الطلبات
let bundledQuestionFilesPromise = null;

// يقرأ كل ملفات الأسئلة المرفقة مع المشروع (يتجاوز أي ملف ناقص بدل ما يفشل كلياً)
function fetchBundledQuestionFiles() {
  if (bundledQuestionFilesPromise) return bundledQuestionFilesPromise;

  bundledQuestionFilesPromise = Promise.all(QBANK_FILES.map(async (path) => {
    try {
      const res = await fetch(path);
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

// يدمج أسئلة جديدة داخل البنك بدون حذف أي سؤال مضاف يدوياً،
// ويتجاهل السؤال إذا كان نصه موجوداً مسبقاً في نفس الفئة والمستوى
function mergeIntoQuestionBank(bank, incoming) {
  let added = 0;

  Object.keys(incoming).forEach(cat => {
    const src = incoming[cat];
    if (!src || typeof src !== 'object') return;

    if (!bank[cat] || typeof bank[cat] !== 'object') {
      bank[cat] = { easy: [], medium: [], hard: [] };
    }

    ['easy', 'medium', 'hard'].forEach(diff => {
      if (!Array.isArray(bank[cat][diff])) bank[cat][diff] = [];
      const incomingList = Array.isArray(src[diff]) ? src[diff] : [];

      const seen = new Set(bank[cat][diff].map(q => String(q?.question || '').trim()));
      incomingList.forEach(q => {
        const text = String(q?.question || '').trim();
        if (!text || seen.has(text)) return;
        bank[cat][diff].push(q);
        seen.add(text);
        added++;
      });
    });
  });

  return added;
}

// يضمن أن كل فئة موجودة في البنك تظهر أيضاً في قائمة الفئات
function syncCategoriesWithBank() {
  let added = 0;
  Object.keys(QBANK).forEach(name => {
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
    let added = 0;
    files.forEach(data => { added += mergeIntoQuestionBank(QBANK, data); });

    const newCats = syncCategoriesWithBank();

    if (added > 0 || newCats > 0) {
      saveJSON('mr_bank', QBANK);
      saveJSON('mr_categories', CATEGORIES);
    }

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

// دالة للمزامنة السحابية
async function pushToCloud() {
  if (!supa) return;
  // سيتم تنفيذها في sync.js
}

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

  body.innerHTML = `
    <div class="qimg">${item.emoji || '❓'}</div>
    <div class="qtext">${escapeHtml(item.question)}</div>
    <div class="choice-hint">${
      done ? '' : (mine ? '👈 اختر إجابتك' : `⏳ ${escapeHtml(turn?.name || 'لاعب آخر')} يجيب الآن`)
    }</div>
    <div class="choices" id="choicesWrap">
      ${item.choices.map((c, i) => {
        let cls = 'choice';
        if (done) {
          if (i === item.correctIndex) cls += ' correct';
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
          : `❌ إجابة خاطئة من ${escapeHtml(lastAnswer.byName)} — الصحيحة: ${escapeHtml(item.choices[item.correctIndex])}`}
      </div>` : ''}
  `;

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

  const key = `${activeRound}-${current.ci}-${current.row}`;
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

  stateUsed[activeRound][current.ci][current.row] = true;
  lastAnswer = null;
  closeQuestion();
  renderBoard();
  switchTurn();

  if (isGameFinished()) {
    if (canControlGame()) publishGameState({ phase: 'ended' });
    showEndScreen();
    return;
  }

  if (canControlGame()) publishGameState();
}
