/* ============================= PRIVACY & PLAYER CARDS ============================= */
/*
  خصوصية الملف الشخصي وعرض إحصاءات اللاعبين.

  الخصوصية مفروضة في قاعدة البيانات لا في الواجهة: جدول profiles صار مغلقاً
  أمام القراءة المباشرة، والوصول يمرّ عبر دوال تُعيد ما يُسمح به فقط. إخفاء
  الأرقام في الواجهة وحده كان سيترك أي شخص يستعلم مباشرة ويراها.

  يتطلّب تشغيل supabase-privacy.sql.
*/

const PRIVACY_LABELS = {
  public:  { ic: '🌍', name: 'عام',      desc: 'إحصاءاتك تظهر للجميع وفي لوحة الصدارة' },
  friends: { ic: '🤝', name: 'للأصدقاء', desc: 'إحصاءاتك تظهر لأصدقائك فقط' },
  private: { ic: '🔒', name: 'خاص',      desc: 'إحصاءاتك لك وحدك' }
};

/* ---- تغيير خصوصية حسابي ---- */

async function setMyPrivacy(level) {
  if (!supa || !isSignedIn()) return;
  if (!PRIVACY_LABELS[level]) return;

  try {
    const { error } = await supa.from('profiles')
      .update({ privacy: level }).eq('id', currentProfile.id);

    if (error) throw error;

    currentProfile.privacy = level;
    Sound.select();
    renderPrivacyControl();
    uiAlert(`${PRIVACY_LABELS[level].ic} حسابك صار ${PRIVACY_LABELS[level].name}`);
  } catch (e) {
    uiAlert('تعذّر تغيير الخصوصية — تأكد من تشغيل supabase-privacy.sql');
  }
}

function renderPrivacyControl() {
  const box = document.getElementById('privacyBox');
  if (!box) return;

  const current = currentProfile?.privacy || 'public';

  box.innerHTML = `
    <div class="privacy-title">👁️ من يشوف إحصاءاتي؟</div>
    <div class="privacy-options">
      ${Object.entries(PRIVACY_LABELS).map(([key, v]) => `
        <button class="privacy-btn${key === current ? ' active' : ''}"
                onclick="setMyPrivacy('${key}')">
          <span class="privacy-ic">${v.ic}</span>
          <span class="privacy-name">${v.name}</span>
        </button>`).join('')}
    </div>
    <div class="privacy-desc">${PRIVACY_LABELS[current].desc}</div>
  `;
}

/* ---- بطاقة لاعب ---- */

async function showPlayerCard(username) {
  const box = document.getElementById('playerCardBox');
  if (!supa || !username || !box) return;

  box.innerHTML = '<p class="pc-loading">جاري التحميل...</p>';

  try {
    const { data, error } = await supa.rpc('get_player_card', {
      target_username: normalizeUsername(username)
    });
    const card = Array.isArray(data) ? data[0] : data;

    if (error) {
      box.innerHTML = '<p class="pc-error">تعذّر العرض — تأكد من تشغيل supabase-privacy.sql</p>';
      return;
    }

    if (!card) {
      box.innerHTML = `<p class="pc-error">ما لقيت لاعباً باسم «${escapeHtml(username)}»</p>`;
      return;
    }

    // أسماء أعمدة الإخراج مسبوقة بـ out_ لتفادي التباسها بأعمدة الجدول
    // داخل plpgsql — الالتباس كان يمنع إنشاء الدالة أصلاً
    const uname = card.out_username ?? card.username;
    const priv  = card.out_privacy  ?? card.privacy;

    const rel = card.is_me ? '(أنت)' : (card.is_friend ? '🤝 صديقك' : '');

    // visible تأتي من قاعدة البيانات لا من حساب في المتصفح
    box.innerHTML = card.visible ? `
      <div class="player-card">
        <div class="pc-name">👤 ${escapeHtml(uname)} <span class="pc-rel">${rel}</span></div>
        <div class="pc-stats">
          <div><span>🎮</span><b>${Number(card.games_played) || 0}</b><small>جولة</small></div>
          <div><span>🏆</span><b>${Number(card.games_won) || 0}</b><small>فوز</small></div>
          <div><span>⭐</span><b>${Number(card.total_score) || 0}</b><small>نقطة</small></div>
          <div><span>🚪</span><b>${Number(card.rooms_created) || 0}</b><small>روم</small></div>
        </div>
      </div>` : `
      <div class="player-card">
        <div class="pc-name">👤 ${escapeHtml(uname)} <span class="pc-rel">${rel}</span></div>
        <div class="pc-private">🔒 ${priv === 'friends'
          ? 'يشارك إحصاءاته مع أصدقائه فقط'
          : 'هذا الحساب خاص'}</div>
      </div>`;
  } catch (e) {
    box.innerHTML = '<p class="pc-error">تعذّر العرض</p>';
  }
}

function searchPlayerCard() {
  const name = document.getElementById('playerSearchInput')?.value?.trim();
  if (!name) return;
  Sound.click();
  showPlayerCard(name);
}

/* ---- لوحة الصدارة ---- */

async function showLeaderboard() {
  const box = document.getElementById('leaderboardBox');
  if (!box) return;

  box.innerHTML = '<p class="pc-loading">جاري التحميل...</p>';

  try {
    const { data, error } = await supa.rpc('leaderboard', { limit_n: 20 });
    if (error) throw error;

    const rows = data || [];
    if (!rows.length) {
      box.innerHTML = '<p class="pc-loading">ما فيه نتائج بعد — العبوا جولة!</p>';
      return;
    }

    const medal = i => ['🥇', '🥈', '🥉'][i] || String(i + 1);

    box.innerHTML = `
      <div class="lb-list">
        ${rows.map((r, i) => `
          <div class="lb-row${r.username === currentProfile?.username ? ' me' : ''}">
            <span class="lb-rank">${medal(i)}</span>
            <span class="lb-name">${escapeHtml(r.username)}</span>
            <span class="lb-score">⭐ ${Number(r.total_score) || 0}</span>
            <span class="lb-wins">🏆 ${Number(r.games_won) || 0}</span>
          </div>`).join('')}
      </div>
      <p class="lb-note">تظهر الحسابات العامة فقط</p>`;
  } catch (e) {
    box.innerHTML = '<p class="pc-error">تعذّر التحميل — تأكد من تشغيل supabase-privacy.sql</p>';
  }
}

/* ---- شاشة الملف الشخصي ---- */

/*
  أداء هذا الجهاز حسب الفئة.

  ⚠️ العنوان «أداء هذا الجهاز» مقصود: في الوضع المحلي يتشارك الفريقان جهازاً
  واحداً فلا تُنسب الإجابة لشخص. تسميتها «أداؤك» تُوهم بدقّة لا وجود لها.
*/
function renderCategoryStats() {
  const box = document.getElementById('catStatsBox');
  if (!box) return;

  const rows = typeof getCategoryStats === 'function' ? getCategoryStats(3) : [];

  if (!rows.length) {
    box.innerHTML = `
      <div class="profile-section-title">🎯 أداء هذا الجهاز حسب الفئة</div>
      <div class="cat-stats-empty">
        العبوا بضعة أسئلة وبتظهر هنا أقوى فئاتكم وأضعفها.
        <div class="cat-stats-hint">تحتاج 3 محاولات على الأقل في الفئة</div>
      </div>`;
    return;
  }

  // ⚠️ لا نقسم إلى «أقوى/أضعف» إلا إذا كان في القائمة ما يكفي لقسمين
  // متمايزين. بفئتين كانت الثانية — ولو 0% — تُعرض تحت «الأقوى».
  const split = rows.length >= 4;
  const best = split ? rows.slice(0, 3) : rows;
  const worst = split ? rows.slice(-3).reverse().filter(r => !best.includes(r)) : [];

  const line = (r) => `
    <div class="cat-stat">
      <div class="cat-stat-head">
        <span class="cat-stat-name">${escapeHtml(r.name)}</span>
        <span class="cat-stat-pct">${r.pct}%</span>
      </div>
      <div class="cat-stat-bar"><span style="width:${r.pct}%"></span></div>
      <div class="cat-stat-sub">${r.correct} من ${r.tries}</div>
    </div>`;

  box.innerHTML = `
    <div class="profile-section-title">🎯 أداء هذا الجهاز حسب الفئة</div>
    ${best.length ? `<div class="cat-stats-label">${split ? '💪 الأقوى' : '📊 حسب الفئة'}</div>
                     ${best.map(line).join('')}` : ''}
    ${worst.length ? `<div class="cat-stats-label">📚 تحتاج مراجعة</div>
                      ${worst.map(line).join('')}` : ''}
    <button class="cat-stats-reset" onclick="clearCategoryStats()">مسح هذه الإحصاءات</button>`;
}

async function clearCategoryStats() {
  if (!await uiConfirm('مسح أداء هذا الجهاز حسب الفئة؟')) return;
  resetCategoryStats();
  renderCategoryStats();
}

async function goToProfile() {
  if (!requireAccount('الإحصاءات تُحفظ في حسابك — سجّل الدخول لتشوفها')) return;
  Sound.click();
  showScreen('screen-profile');
  renderPrivacyControl();
  renderCategoryStats();

  const box = document.getElementById('playerCardBox');
  if (box) box.innerHTML = '';

  showLeaderboard();
}
