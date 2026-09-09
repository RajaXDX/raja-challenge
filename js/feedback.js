/* ============================= ملاحظات اللاعبين ============================= */
/*
  شيئان يجمعهما أنهما رأي اللاعب يصعد إلى السحابة:

  1. **بلاغ عن سؤال** — البنك تجاوز 1,600 سؤال، وكثير منها كُتب بسرعة. من
     يكتشف إجابة خاطئة لم يكن عنده أي طريقة ليخبر صاحب اللعبة، فيبقى الخطأ
     يتكرّر على كل من يلعب بعده. زرّ في نافذة السؤال يُنهي هذا.

  2. **تقييم الجولة** — نجوم بعد شاشة الفوز. عدد الزيارات يقول إن أحدهم فتح
     اللعبة، ولا يقول إن الجلسة كانت ممتعة.

  الجدولان في `supabase-feedback.sql` (يُشغَّل مرة واحدة).

  ⚠️ **لا شيء هنا يُفشل اللعب.** كل نداء سحابي مغلّف: غياب الجدول أو انقطاع
  الشبكة أو رفض RLS كلها تُبتلع، لأن لاعباً يفقد جولته بسبب زرّ بلاغ خسارةٌ
  أكبر بكثير من بلاغ ضائع.

  ⚠️ **البلاغ لا يضيع بلا إنترنت.** أكثر اللعب محلي، والوضع المحلي يعمل بلا
  شبكة أصلاً — فبلاغ يُرسَل مباشرةً أو لا يُرسل أبداً كان سيضيّع أغلب
  البلاغات. تُحفظ في طابور محلي ويُفرَّغ عند أول تحميل تتوفر فيه السحابة.

  ⚠️ **لا يُخزَّن ما يدلّ على هوية** — لا اسم لاعب ولا معرّف جهاز، تماشياً مع
  سياسة `app_events`. البلاغ يحمل السؤال لا صاحبه.
*/

const REPORT_REASONS = [
  { key: 'wrong_answer', ic: '❌', label: 'الإجابة غلط' },
  { key: 'wrong_question', ic: '❓', label: 'السؤال غامض أو ناقص' },
  { key: 'duplicate', ic: '👯', label: 'سؤال مكرّر' },
  { key: 'media', ic: '🖼️', label: 'الصورة أو المقطع ما يشتغل' },
  { key: 'other', ic: '✍️', label: 'شيء ثانٍ' },
];

const REPORT_QUEUE_KEY = 'mr_pending_reports';
const RATED_GAMES_KEY = 'mr_rated_games';

/* ============================= الطابور المحلي ============================= */

// سقف الطابور: جهاز يلعب شهراً بلا إنترنت يجب ألّا يملأ التخزين ببلاغات
const REPORT_QUEUE_MAX = 40;

function queueReport(row) {
  const q = loadJSON(REPORT_QUEUE_KEY, []);
  if (!Array.isArray(q)) { saveJSON(REPORT_QUEUE_KEY, [row]); return; }
  q.push(row);
  saveJSON(REPORT_QUEUE_KEY, q.slice(-REPORT_QUEUE_MAX));
}

/*
  يُفرَّغ الطابور عند التحميل. الحذف **بعد** نجاح الإدراج لا قبله: لو مسحنا
  أولاً وفشل الرفع ضاع البلاغ نهائياً — وهو ما جاء الطابور ليمنعه.
*/
async function flushReportQueue() {
  if (!supa) return 0;

  const q = loadJSON(REPORT_QUEUE_KEY, []);
  if (!Array.isArray(q) || !q.length) return 0;

  try {
    const { error } = await supa.from('question_reports').insert(q);
    if (error) throw error;
    saveJSON(REPORT_QUEUE_KEY, []);
    return q.length;
  } catch (e) {
    console.warn('تعذّر تفريغ طابور البلاغات:', e);
    return 0;
  }
}

/* ============================= بلاغ عن سؤال ============================= */

// السؤال المعروض الآن — نقرأه من المخزون لا من الشاشة، فالشاشة قد تكون
// خلف قفل «شاهد وأجب» ولا تعرض نصّ السؤال أصلاً
function currentReportTarget() {
  if (!current?.cat) return null;

  const key = typeof currentQuestionKey === 'function' ? currentQuestionKey() : null;
  const item = key ? questionCache[key] : null;
  if (!item) return null;

  return {
    category: String(current.cat.name || '').slice(0, 120),
    difficulty: DIFFKEY[current.row] || null,
    question: String(item.question || '').slice(0, 600),
    answer: String(item.answer || '').slice(0, 600),
  };
}

function openQuestionReport() {
  const target = currentReportTarget();
  if (!target) {
    uiAlert('افتح سؤالاً أولاً حتى تبلّغ عنه');
    return;
  }

  Sound.click();

  const overlay = createElement('div', { class: 'ui-modal-overlay' });
  const box = createElement('div', { class: 'ui-modal report-modal' }, `
    <div class="ui-modal-msg">🚩 بلّغ عن هذا السؤال</div>
    <div class="report-q">${escapeHtml(target.question)}</div>
    <div class="report-reasons">
      ${REPORT_REASONS.map(r => `
        <button type="button" class="report-reason" data-key="${r.key}">
          <span class="rr-ic">${r.ic}</span>${escapeHtml(r.label)}
        </button>
      `).join('')}
    </div>
    <input type="text" class="ui-modal-input report-note" id="reportNote"
           maxlength="200" placeholder="تفصيل إضافي (اختياري)…">
    <div class="ui-modal-actions">
      <button class="btn-main btn-ghost" data-act="cancel">إلغاء</button>
      <button class="btn-main btn-primary" data-act="send" disabled>إرسال البلاغ</button>
    </div>
  `);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  let chosen = null;
  const sendBtn = box.querySelector('[data-act="send"]');

  box.querySelectorAll('.report-reason').forEach(btn => {
    btn.onclick = () => {
      chosen = btn.dataset.key;
      box.querySelectorAll('.report-reason').forEach(b => b.classList.toggle('sel', b === btn));
      sendBtn.disabled = false;
      Sound.select();
    };
  });

  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
  };

  box.querySelector('[data-act="cancel"]').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  box.onkeydown = (e) => { if (e.key === 'Escape') close(); };

  sendBtn.onclick = async () => {
    if (!chosen) return;
    const label = REPORT_REASONS.find(r => r.key === chosen)?.label || chosen;
    const note = box.querySelector('#reportNote')?.value.trim().slice(0, 400) || null;
    close();
    await sendQuestionReport({ ...target, reason: label, note });
  };
}

async function sendQuestionReport(row) {
  // نطمئن اللاعب فوراً: البلاغ محفوظ عنده حتى لو تعذّر رفعه الآن
  uiAlert('✅ وصلنا بلاغك — شكراً لك');
  Sound.select();

  if (!supa) { queueReport(row); return; }

  try {
    const { error } = await supa.from('question_reports').insert(row);
    if (error) throw error;
    trackEvent?.('question_reported');
  } catch (e) {
    console.warn('تعذّر رفع البلاغ، حُفظ محلياً:', e);
    queueReport(row);
  }
}

/* ============================= تقييم الجولة ============================= */

/*
  مفتاح الجولة يمنع تكرار السؤال على نفس الجلسة. ليس معرّفاً للاعب — مجرّد
  بصمة نتيجة ووقت، محلية بالكامل ولا تُرسل مع التقييم.
*/
function currentGameKey() {
  return `${activeRound}-${scores.A}-${scores.B}-${roundLog.length}`;
}

function alreadyRated(key) {
  const rated = loadJSON(RATED_GAMES_KEY, []);
  return Array.isArray(rated) && rated.includes(key);
}

function markRated(key) {
  const rated = loadJSON(RATED_GAMES_KEY, []);
  const list = Array.isArray(rated) ? rated : [];
  list.push(key);
  saveJSON(RATED_GAMES_KEY, list.slice(-30));
}

// تُنادى من `showEndScreen`
function renderEndRating() {
  const box = document.getElementById('endRating');
  if (!box) return;

  const key = currentGameKey();

  // لا نلحّ: من قيّم هذه الجولة لا يُسأل مرة ثانية
  if (alreadyRated(key)) {
    box.innerHTML = '<div class="rate-done">⭐ شكراً على تقييمك</div>';
    return;
  }

  box.innerHTML = `
    <div class="rate-title">كيف كانت الجولة؟</div>
    <div class="rate-stars" id="rateStars">
      ${[1, 2, 3, 4, 5].map(n => `
        <button type="button" class="rate-star" data-n="${n}" aria-label="${n} من 5">★</button>
      `).join('')}
    </div>
    <div class="rate-hint" id="rateHint">اضغط النجوم</div>
  `;

  let picked = 0;
  const stars = [...box.querySelectorAll('.rate-star')];
  const hint = box.querySelector('#rateHint');
  const WORDS = ['', 'ما عجبتني', 'عادية', 'حلوة', 'ممتازة', 'خيالية 🔥'];

  const paint = n => stars.forEach(s => s.classList.toggle('on', Number(s.dataset.n) <= n));

  stars.forEach(s => {
    const n = Number(s.dataset.n);
    s.onmouseenter = () => { if (!picked) { paint(n); hint.textContent = WORDS[n]; } };
    s.onclick = () => {
      picked = n;
      paint(n);
      hint.textContent = WORDS[n];
      Sound.select();
      askRatingNote(n, key);
    };
  });

  box.querySelector('#rateStars').onmouseleave = () => {
    if (!picked) { paint(0); hint.textContent = 'اضغط النجوم'; }
  };
}

async function askRatingNote(stars, key) {
  const box = document.getElementById('endRating');

  // تقييم منخفض يستحقّ سؤالاً: «وش الناقص؟» أنفع من نجمتين بلا سبب
  let note = null;
  if (stars <= 3) {
    note = await uiPrompt('وش الناقص؟ (اختياري)');
    if (note === null) note = '';   // ألغى — نُرسل التقييم بلا ملاحظة
  }

  markRated(key);
  if (box) box.innerHTML = '<div class="rate-done">⭐ شكراً على تقييمك</div>';

  sendGameRating(stars, note);
}

async function sendGameRating(stars, note) {
  if (!supa) return;   // التقييم لا يستحق طابوراً — قيمته في وقته

  try {
    const { error } = await supa.from('game_ratings').insert({
      stars,
      note: note ? String(note).trim().slice(0, 400) || null : null,
      mode: isOnlineGame() ? 'online' : 'local',
      questions: roundLog.length || null,
    });
    if (error) throw error;
    trackEvent?.('game_rated');
  } catch (e) {
    console.warn('تعذّر إرسال التقييم:', e);
  }
}

/* ============================= لوحة الإدارة ============================= */

let loadedReports = [];

async function loadFeedback() {
  const box = document.getElementById('reportsBox');
  const sum = document.getElementById('ratingsSummary');
  if (!supa) {
    if (box) box.innerHTML = '<p class="fb-empty">لا اتصال بالسحابة</p>';
    return;
  }

  if (box) box.innerHTML = '<p class="fb-empty">جاري التحميل…</p>';

  try {
    const [{ data: reports, error: rErr }, { data: ratings, error: gErr }] = await Promise.all([
      supa.from('question_reports').select('*').order('resolved').order('created_at', { ascending: false }).limit(200),
      supa.from('game_ratings').select('stars, note, mode, created_at').order('created_at', { ascending: false }).limit(200),
    ]);
    if (rErr) throw rErr;
    if (gErr) throw gErr;

    loadedReports = reports || [];
    renderReports();
    renderRatings(ratings || [], sum);
  } catch (e) {
    console.warn('تعذّر تحميل الملاحظات:', e);
    // الصندوقان يفشلان معاً (جدولاهما من سكربت واحد)، فترك أحدهما على
    // «اضغط للتحميل» يوهم أنه لم يُحاول أصلاً
    const msg = `<p class="fb-empty">تعذّر التحميل — تأكّد أن
      <code>supabase-feedback.sql</code> شُغِّل.</p>`;
    if (box) box.innerHTML = msg;
    if (sum) sum.innerHTML = msg;
  }
}

function renderReports() {
  const box = document.getElementById('reportsBox');
  if (!box) return;

  if (!loadedReports.length) {
    box.innerHTML = '<p class="fb-empty">ما فيه بلاغات — وهذا خبر طيّب</p>';
    return;
  }

  const open = loadedReports.filter(r => !r.resolved).length;

  box.innerHTML = `
    <div class="fb-count">${open} بلاغ مفتوح من ${loadedReports.length}</div>
    ${loadedReports.map(r => `
      <div class="fb-report${r.resolved ? ' done' : ''}">
        <div class="fb-head">
          <span class="fb-reason">${escapeHtml(r.reason || '')}</span>
          <span class="fb-cat">${escapeHtml(r.category || '')} · ${escapeHtml(r.difficulty || '')}</span>
        </div>
        <div class="fb-q">${escapeHtml(r.question || '')}</div>
        <div class="fb-a">الإجابة المسجّلة: <b>${escapeHtml(r.answer || '—')}</b></div>
        ${r.note ? `<div class="fb-note">“${escapeHtml(r.note)}”</div>` : ''}
        <div class="fb-actions">
          <button class="btn btn-ghost" onclick="toggleReportResolved(${r.id}, ${!r.resolved})">
            ${r.resolved ? '↺ أعِد فتحه' : '✓ عولج'}
          </button>
          <button class="btn btn-ghost" onclick="deleteReport(${r.id})">🗑️ حذف</button>
        </div>
      </div>
    `).join('')}
  `;
}

async function toggleReportResolved(id, resolved) {
  if (!supa) return;
  try {
    const { error } = await supa.from('question_reports').update({ resolved }).eq('id', id);
    if (error) throw error;
    const row = loadedReports.find(r => r.id === id);
    if (row) row.resolved = resolved;
    // نُعيد الفرز محلياً: المعالَج ينزل تحت كما يفعل الاستعلام
    loadedReports.sort((a, b) => (a.resolved - b.resolved)
      || String(b.created_at).localeCompare(String(a.created_at)));
    renderReports();
  } catch (e) {
    uiAlert('تعذّر التحديث');
  }
}

async function deleteReport(id) {
  if (!supa) return;
  if (!await uiConfirm('حذف هذا البلاغ نهائياً؟')) return;
  try {
    const { error } = await supa.from('question_reports').delete().eq('id', id);
    if (error) throw error;
    loadedReports = loadedReports.filter(r => r.id !== id);
    renderReports();
  } catch (e) {
    uiAlert('تعذّر الحذف');
  }
}

function renderRatings(rows, box) {
  if (!box) return;

  if (!rows.length) {
    box.innerHTML = '<p class="fb-empty">ما فيه تقييمات بعد</p>';
    return;
  }

  const avg = rows.reduce((s, r) => s + Number(r.stars || 0), 0) / rows.length;
  const dist = [5, 4, 3, 2, 1].map(n => ({ n, c: rows.filter(r => r.stars === n).length }));
  const notes = rows.filter(r => r.note).slice(0, 8);

  box.innerHTML = `
    <div class="fb-avg">
      <div class="fb-avg-num">${avg.toFixed(1)}</div>
      <div class="fb-avg-label">من 5 · ${rows.length} تقييماً</div>
    </div>
    <div class="fb-dist">
      ${dist.map(d => `
        <div class="fb-dist-row">
          <span class="fbd-n">${d.n} ★</span>
          <span class="fbd-bar"><i style="width:${rows.length ? (d.c / rows.length * 100).toFixed(1) : 0}%"></i></span>
          <span class="fbd-c">${d.c}</span>
        </div>
      `).join('')}
    </div>
    ${notes.length ? `<div class="fb-notes-title">ملاحظات اللاعبين</div>
      ${notes.map(n => `<div class="fb-note">${n.stars}★ — “${escapeHtml(n.note)}”</div>`).join('')}` : ''}
  `;
}
