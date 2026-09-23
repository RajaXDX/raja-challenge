/* ============================= FRIENDS ============================= */
/*
  إضافة صديق باسم المستخدم.

  العلاقة صفّ واحد بين طرفين لا صفّان، وحالتها pending ثم accepted.
  الصلاحيات مفروضة في قاعدة البيانات: كل طرف يرى علاقاته هو فقط، والقبول
  حقّ المُرسَل إليه وحده. يتطلّب تشغيل supabase-friends.sql.
*/

let friendsCache = { accepted: [], incoming: [], outgoing: [] };

/* ---- إرسال طلب ---- */

async function addFriendByUsername(rawName) {
  if (!supa) return { error: 'قاعدة البيانات غير متصلة' };
  if (!isSignedIn()) return { error: 'سجّل الدخول أولاً' };

  const name = normalizeUsername(rawName);
  if (!name) return { error: 'اكتب اسم المستخدم' };
  if (name === currentProfile.username) return { error: 'لا يمكنك إضافة نفسك' };

  try {
    // بعد إغلاق قراءة profiles، البحث يمرّ عبر دالة تُعيد المعرّف والاسم فقط
    const { data: found, error: findError } = await supa.rpc('find_player', { target_username: name });
    const target = Array.isArray(found) ? found[0] : found;

    if (findError) {
      if (/schema cache|does not exist/i.test(findError.message)) {
        return { error: 'ميزة الأصدقاء غير مفعّلة بعد — شغّل supabase-friends.sql' };
      }
      return { error: 'تعذّر البحث' };
    }
    if (!target) return { error: `ما لقيت حساباً باسم «${rawName}»` };

    // الدالة تتولّى الحالات كلها، ومنها أن يكون هو أرسل لك أولاً
    const { data: result, error } = await supa.rpc('request_friend', { target_id: target.id });
    if (error) {
      // رسالة Postgres الخام لا تعني اللاعب بشيء
      if (/schema cache|does not exist/i.test(error.message)) {
        return { error: 'ميزة الأصدقاء غير مفعّلة بعد — شغّل supabase-friends.sql' };
      }
      return { error: error.message };
    }

    const messages = {
      sent: `📨 أُرسل الطلب إلى «${target.username}»`,
      accepted: `🤝 صرتم أصدقاء! «${target.username}» كان أرسل لك طلباً`,
      already_sent: 'أرسلت له طلباً من قبل — بانتظار قبوله',
      already_friends: 'أنتم أصدقاء بالفعل'
    };

    return { ok: true, result, message: messages[result] || 'تم' };
  } catch (e) {
    console.error('addFriendByUsername', e);
    return { error: 'حدث خطأ غير متوقع' };
  }
}

/* ---- جلب القوائم ---- */

async function loadFriends() {
  if (!supa || !isSignedIn()) return friendsCache;

  try {
    // دالة واحدة تُعيد العلاقات مع أسماء الأطراف — الضمّ لم يعد ممكناً
    // من المتصفح بعد إغلاق قراءة profiles
    const { data, error } = await supa.rpc('list_my_friends');
    if (error) throw error;

    const rows = data || [];

    const decorate = r => ({
      id: r.row_id,
      userId: r.other_id,
      username: r.username || 'لاعب محذوف',
      privacy: r.privacy,
      gamesWon: r.games_won,
      gamesPlayed: r.games_played,
      totalScore: r.total_score
    });

    friendsCache = {
      accepted: rows.filter(r => r.direction === 'friend').map(decorate),
      incoming: rows.filter(r => r.direction === 'incoming').map(decorate),
      outgoing: rows.filter(r => r.direction === 'outgoing').map(decorate)
    };

    return friendsCache;
  } catch (e) {
    console.warn('تعذّر جلب الأصدقاء:', e);
    return friendsCache;
  }
}

/* ---- الرد على الطلبات ---- */

async function acceptFriend(rowId) {
  try {
    const { error } = await supa
      .from('friendships')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', rowId);
    if (error) throw error;

    Sound.award?.();
    await renderFriendsScreen();
  } catch (e) {
    uiAlert(`❌ تعذّر القبول: ${e.message || ''}`);
  }
}

async function removeFriendship(rowId, username, isRequest) {
  const question = isRequest
    ? `رفض طلب «${username}»؟`
    : `إزالة «${username}» من أصدقائك؟`;
  if (!await uiConfirm(question)) return;

  try {
    const { error } = await supa.from('friendships').delete().eq('id', rowId);
    if (error) throw error;
    await renderFriendsScreen();
  } catch (e) {
    uiAlert(`❌ تعذّرت العملية: ${e.message || ''}`);
  }
}

/* ---- الواجهة ---- */

async function goToFriends() {
  Sound.click();
  showScreen('screen-friends');
  await renderFriendsScreen();
}

async function submitAddFriend() {
  const input = document.getElementById('friendUsernameInput');
  const msg = document.getElementById('friendAddMessage');
  const btn = document.getElementById('friendAddBtn');
  if (!input) return;

  const show = (text, isError) => {
    if (msg) { msg.textContent = text; msg.className = 'auth-message' + (isError ? ' error' : ''); }
  };

  show('', false);
  if (btn) btn.disabled = true;
  const res = await addFriendByUsername(input.value);
  if (btn) btn.disabled = false;

  if (res.error) return show(res.error, true);

  show(res.message, false);
  input.value = '';
  await renderFriendsScreen(true);
}

async function renderFriendsScreen(keepMessage) {
  const box = document.getElementById('friendsBox');
  if (!box) return;

  if (!keepMessage) {
    const msg = document.getElementById('friendAddMessage');
    if (msg) { msg.textContent = ''; msg.className = 'auth-message'; }
  }

  box.innerHTML = '<p style="color:#9FB8AB">جاري التحميل...</p>';
  const f = await loadFriends();

  /* ⚠️ الاسم يمرّ عبر data-* لا داخل onclick.
     السبب دقيق ويسهل الوقوع فيه: escapeHtml يحوّل ' إلى &#39;، والمتصفح
     يفكّ هذا الترميز قبل أن يسلّم النص لمحرّك JavaScript. فاسم مستخدم مثل
     `x');alert(1);//` كان يخرج من escapeHtml سليماً في المصدر، ثم يعود
     اقتباساً حقيقياً داخل onclick فيغلق الوسيط ويشغّل ما بعده — عند كل من
     يفتح قائمة أصدقائه. escapeHtml وحده لا يحمي سياق JS داخل خاصية HTML.
     الأسماء تُتحقّق في المتصفح، لكن الكتابة المباشرة على الـAPI تتجاوز ذلك،
     فالحارس الصحيح هو ألا نبني كوداً من نصّ المستخدم أصلاً. */
  const row = (item, kind) => `
    <div class="friend-row">
      <div class="friend-main">
        <div class="friend-name">👤 ${escapeHtml(item.username)}</div>
        ${kind === 'accepted'
          ? `<div class="friend-meta">🎮 ${item.gamesPlayed} جولة · 🏆 ${item.gamesWon} فوز</div>`
          : ''}
      </div>
      <div class="friend-actions">
        ${kind === 'incoming'
          ? `<button class="btn btn-answer" data-friend-act="accept" data-id="${Number(item.id)}">✅ قبول</button>
             <button class="btn btn-skip" data-friend-act="remove" data-id="${Number(item.id)}" data-name="${escapeHtml(item.username)}" data-request="1">✖️ رفض</button>`
          : kind === 'outgoing'
          ? `<span class="friend-pending">⏳ بانتظار الرد</span>
             <button class="btn btn-ghost" data-friend-act="remove" data-id="${Number(item.id)}" data-name="${escapeHtml(item.username)}" data-request="1">سحب</button>`
          : `<button class="btn btn-ghost" data-friend-act="remove" data-id="${Number(item.id)}" data-name="${escapeHtml(item.username)}" data-request="0">إزالة</button>`}
      </div>
    </div>`;

  const section = (title, items, kind) => items.length
    ? `<div class="friends-section">
         <h4>${title} <span class="friends-count">${items.length}</span></h4>
         ${items.map(i => row(i, kind)).join('')}
       </div>`
    : '';

  const empty = !f.incoming.length && !f.outgoing.length && !f.accepted.length;

  box.innerHTML = empty
    ? `<p class="friends-empty">ما عندك أصدقاء بعد.<br>اكتب اسم مستخدم صديقك فوق وأضفه.</p>`
    : section('📨 طلبات وصلتك', f.incoming, 'incoming')
      + section('🤝 أصدقاؤك', f.accepted, 'accepted')
      + section('⏳ طلبات أرسلتها', f.outgoing, 'outgoing');

  updateFriendRequestsBadge(f.incoming.length);
}

/* مستمع واحد مفوَّض على الحاوية بدل onclick على كل زر: الحاوية تُعاد بناؤها
   عند كل تحديث، والتفويض يبقى صالحاً بلا إعادة ربط. والأهم أن الاسم يصل
   قيمةً من dataset لا نصّاً مُدمَجاً في كود. */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-friend-act]');
  if (!btn || !document.getElementById('friendsBox')?.contains(btn)) return;

  if (btn.dataset.friendAct === 'accept') {
    acceptFriend(Number(btn.dataset.id));
  } else {
    removeFriendship(Number(btn.dataset.id), btn.dataset.name || '', btn.dataset.request === '1');
  }
});

// شارة على زر الأصدقاء في الشاشة الرئيسية
function updateFriendRequestsBadge(count) {
  const btn = document.getElementById('friendsHomeBtn');
  if (!btn) return;

  let badge = btn.querySelector('.home-badge');
  if (!count) { badge?.remove(); return; }

  if (!badge) {
    badge = createElement('span', { class: 'home-badge' });
    btn.appendChild(badge);
  }
  badge.textContent = count > 9 ? '9+' : String(count);
}

// تُستدعى بعد الدخول: تُظهر عدد الطلبات المعلّقة بلا فتح الشاشة
async function refreshFriendBadge() {
  if (!supa || !isSignedIn()) return;
  const f = await loadFriends();
  updateFriendRequestsBadge(f.incoming.length);
}
