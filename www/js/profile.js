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

async function goToProfile() {
  Sound.click();
  showScreen('screen-profile');
  renderPrivacyControl();

  const box = document.getElementById('playerCardBox');
  if (box) box.innerHTML = '';

  // قسم الحذف للمسجّلين وحدهم — لا معنى له لمن يلعب بلا حساب
  const del = document.getElementById('deleteAccountSection');
  if (del) del.style.display = isSignedIn() ? '' : 'none';

  showLeaderboard();
}

/* ---- حذف الحساب ---- */

/* ⚠️ شرط قبول في App Store (بند 5.1.1(v)): من أنشأ حساباً داخل التطبيق
   يجب أن يستطيع حذفه من داخله. كانت لدينا `admin_delete_player` للإدارة
   وحدها، فلا سبيل للاعب أن يحذف حسابه إطلاقاً — وهو رفض مؤكَّد.

   الحذف نفسه يتم في القاعدة عبر `delete_my_account`، وهي لا تأخذ معرّفاً
   بل تحذف `auth.uid()` وحده — فلا يمكن استعمالها لحذف حساب غيرك مهما
   أُرسل لها من المتصفح. */
async function deleteMyAccount() {
  if (!supa || !isSignedIn()) return;

  const name = currentProfile?.username || '';
  const sure = await uiConfirm(
    `حذف حساب «${name}» نهائياً؟

` +
    'تُحذف إحصاءاتك وصداقاتك معه، ولا يمكن التراجع.',
    'نعم، احذف', 'إلغاء'
  );
  if (!sure) return;

  // تأكيد ثانٍ بكتابة الاسم: الحذف لا رجعة فيه، وضغطة واحدة بالخطأ تكفي
  // لإتلاف حساب بإحصاءات سنة.
  const typed = await uiPrompt(`للتأكيد اكتب اسم المستخدم: ${name}`);
  if (typed === null) return;
  if (normalizeUsername(typed) !== normalizeUsername(name)) {
    uiAlert('❌ الاسم غير مطابق — لم يُحذف شيء');
    return;
  }

  try {
    const { error } = await supa.rpc('delete_my_account');
    if (error) throw error;

    await supa.auth.signOut();
    currentProfile = null;
    uiAlert('✅ حُذف حسابك');
    location.reload();
  } catch (e) {
    uiAlert(`❌ تعذّر الحذف: ${e.message || ''}`);
    console.error('deleteMyAccount', e);
  }
}
