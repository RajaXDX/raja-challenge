/* ============================= ABOUT / شرح اللعبة ============================= */
/*
  شاشة `screen-about`: شرح اللعبة في أربعة أقسام (طريقة اللعب، الأدوات،
  اللغات، الفئات والأسئلة).

  ⚠️ **لا رقم مكتوب بيدٍ في قسم البنك.** كان `showAbout` القديم مجرّد
  رسالة منبثقة تحسب المجموع لحظياً، وهذا هو الشيء الوحيد الذي يستحقّ
  البقاء من ذاك السلوك: أي عدد فئات أو أسئلة يُكتب نصّاً في HTML يصير
  كذباً بعد أول إضافة. القسم كلّه يُبنى من `QBANK` و`CATEGORIES` عند كل
  فتح، فيبقى صادقاً بلا صيانة.

  📌 نصوص وسائل المساعدة تُقرأ من `LIFELINES` في `game.js` لا تُنسخ هنا،
  حتى لا يتفرّق الشرح عن اللعبة إذا عُدِّلت وسيلة أو أُضيفت.

  📌 هذا الملف يُحمَّل **بعد** `js/utils.js` فيَجُبّ `showAbout` القديمة
  فيه — وقد حُذفت من هناك، ولم يبقَ إلا تعليق يشير إلى هنا.
*/

const ABOUT_DIFFS = [
  { key: 'easy',   label: 'سهل',   pts: 100 },
  { key: 'medium', label: 'متوسط', pts: 250 },
  { key: 'hard',   label: 'صعب',   pts: 400 },
];

function showAbout() {
  Sound.click();
  showScreen('screen-about');
  renderAbout();
}

function renderAbout() {
  bindAboutTabs();
  renderAboutLifelines();
  renderAboutBank();
}

/* ---- التبويبات ---- */
// قسم واحد ظاهر في كل مرة: الشرح طويل، وعرضه كاملاً على الجوال يدفن آخره
function bindAboutTabs() {
  const toc = document.getElementById('aboutToc');
  if (!toc || toc.dataset.bound === '1') return;
  toc.dataset.bound = '1';

  toc.querySelectorAll('.about-tab').forEach(btn => {
    btn.onclick = () => openAboutSection(btn.dataset.sec);
  });
}

function openAboutSection(sec) {
  Sound.click();

  document.querySelectorAll('#aboutToc .about-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.sec === sec);
  });
  document.querySelectorAll('.about-sec').forEach(s => {
    s.classList.toggle('active', s.id === `about-${sec}`);
  });

  // القارئ يتوقّع أن يبدأ القسم الجديد من أوّله لا من موضع القسم السابق
  document.getElementById('aboutToc')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---- وسائل المساعدة ---- */
function renderAboutLifelines() {
  const box = document.getElementById('aboutLifelines');
  if (!box) return;

  box.innerHTML = (typeof LIFELINES !== 'undefined' ? LIFELINES : []).map(l => `
    <div class="about-ll">
      <span class="all-ic">${l.ic}</span>
      <div>
        <div class="all-name">${escapeHtml(l.name)}</div>
        <div class="all-desc">${escapeHtml(l.desc)}</div>
      </div>
    </div>
  `).join('');
}

/* ---- بنك الأسئلة ---- */

// عدّ حيّ: فئات البنك، وأسئلتها بالمستويات، وأنواعها
function aboutBankSummary() {
  const bank = (typeof QBANK !== 'undefined' && QBANK) ? QBANK : {};
  const cats = (typeof CATEGORIES !== 'undefined' && Array.isArray(CATEGORIES)) ? CATEGORIES : [];
  const iconOf = name => cats.find(c => c && c.name === name)?.ic || '';

  const types = { text: 0, image: 0, video: 0, audio: 0 };
  const rows = [];
  let total = 0;

  Object.entries(bank).forEach(([name, levels]) => {
    const row = { name, ic: iconOf(name), easy: 0, medium: 0, hard: 0, total: 0 };

    ABOUT_DIFFS.forEach(d => {
      const list = (levels && levels[d.key]) || [];
      row[d.key] = list.length;
      row.total += list.length;

      list.forEach(q => {
        if (q?.video) types.video++;
        else if (q?.audio) types.audio++;
        else if (q?.image) types.image++;
        else types.text++;
      });
    });

    total += row.total;
    rows.push(row);
  });

  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ar'));

  return { rows, total, types, catCount: rows.length, fileCount: (typeof QBANK_FILES !== 'undefined' ? QBANK_FILES.length : 0) };
}

// أرقام غربية بفاصلة الآلاف — هي ما تعرضه اللوحة والنقاط والتذييل،
// و`ar-EG` كانت ستُخرج أرقاماً هندية تخالف بقية اللعبة
const aboutNum = n => Number(n || 0).toLocaleString('en-US');

function renderAboutBank() {
  const s = aboutBankSummary();

  const stats = document.getElementById('aboutStats');
  if (stats) {
    stats.innerHTML = `
      ${aboutStat(s.catCount, 'فئة في البنك')}
      ${aboutStat(s.total, 'سؤال')}
      ${aboutStat(3, 'مستويات لكل فئة')}
      ${aboutStat(18, 'سؤالاً في الجولة')}
    `;
  }

  const typesBox = document.getElementById('aboutTypes');
  if (typesBox) {
    // النوع الذي لا وجود له في البنك لا يُعرض بصفر — الصفر يوحي بعطل لا بغياب
    const defs = [
      { k: 'text',  ic: '📝', name: 'سؤال نصّي',   desc: 'نصّ وإجابة، وربّما إيموجي يزيّنه' },
      { k: 'image', ic: '🖼️', name: 'سؤال بصورة',  desc: 'أعلام وخرائط وشعارات وصور قديمة' },
      { k: 'video', ic: '🎬', name: 'سؤال بمقطع',  desc: 'يُشاهَد أولاً ثم يبدأ وقت الإجابة' },
      { k: 'audio', ic: '🔊', name: 'سؤال بصوت',   desc: 'مقطع صوتي يُسمع ثم يُجاب عنه' },
    ];

    typesBox.innerHTML = defs
      .filter(d => s.types[d.k] > 0)
      .map(d => `
        <div class="about-type">
          <span class="at-ic">${d.ic}</span>
          <div class="at-num">${aboutNum(s.types[d.k])}</div>
          <div class="at-name">${d.name}</div>
          <div class="at-desc">${d.desc}</div>
        </div>
      `).join('');
  }

  const table = document.getElementById('aboutCatTable');
  if (table) {
    table.innerHTML = `
      <thead>
        <tr>
          <th>الفئة</th>
          ${ABOUT_DIFFS.map(d => `<th>${d.label}<span class="th-pts">${d.pts}</span></th>`).join('')}
          <th>المجموع</th>
        </tr>
      </thead>
      <tbody>
        ${s.rows.map(r => `
          <tr>
            <td class="ct-name">${r.ic ? `<span class="ct-ic">${r.ic}</span>` : ''}${escapeHtml(r.name)}</td>
            ${ABOUT_DIFFS.map(d => `<td class="${r[d.key] ? '' : 'ct-zero'}">${aboutNum(r[d.key])}</td>`).join('')}
            <td class="ct-total">${aboutNum(r.total)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td>${aboutNum(s.catCount)} فئة</td>
          ${ABOUT_DIFFS.map(d => `<td>${aboutNum(s.rows.reduce((a, r) => a + r[d.key], 0))}</td>`).join('')}
          <td class="ct-total">${aboutNum(s.total)}</td>
        </tr>
      </tfoot>
    `;
  }
}

function aboutStat(num, label) {
  return `<div class="about-stat"><div class="as-num">${aboutNum(num)}</div><div class="as-label">${label}</div></div>`;
}
