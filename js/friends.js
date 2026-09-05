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
  if (!requireAccount('الأصدقاء يحتاجون حساب — بهم تُرسل الدعوات وتُقبل')) return;
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

  box.innerHTML = '<p style="color:var(--muted)">جاري التحميل...</p>';
  const f = await loadFriends();

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
          ? `<button class="btn btn-answer" onclick="acceptFriend(${item.id})">✅ قبول</button>
             <button class="btn btn-skip" onclick="removeFriendship(${item.id}, '${escapeHtml(item.username).replace(/'/g, "\\'")}', true)">✖️ رفض</button>`
          : kind === 'outgoing'
          ? `<span class="friend-pending">⏳ بانتظار الرد</span>
             <button class="btn btn-ghost" onclick="removeFriendship(${item.id}, '${escapeHtml(item.username).replace(/'/g, "\\'")}', true)">سحب</button>`
          : `<button class="btn btn-ghost" onclick="removeFriendship(${item.id}, '${escapeHtml(item.username).replace(/'/g, "\\'")}', false)">إزالة</button>`}
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

/* ============================= ROOM INVITES ============================= */
/*
  دعوة صديق إلى الروم. الدعوة تصل داخل اللعبة لحظياً عبر Realtime.

  شرط الصداقة مفروض في الدالة داخل قاعدة البيانات لا هنا — ولا توجد سياسة
  INSERT على الجدول أصلاً، فلا يستطيع أحد إغراق لاعب بالدعوات.

  يتطلّب تشغيل supabase-invites.sql.
*/

let inviteSubscription = null;

// فتح قائمة الأصدقاء للاختيار منهم
async function openInvitePicker() {
  if (!currentRoom) return;

  const box = document.getElementById('invitePickerBox');
  if (!box) return;

  const open = box.style.display !== 'none';
  if (open) { box.style.display = 'none'; return; }

  Sound.click();
  box.style.display = 'block';
  box.innerHTML = '<p class="pc-loading">جاري التحميل...</p>';

  await loadFriends();
  const friends = friendsCache.accepted || [];

  if (!friends.length) {
    box.innerHTML = `
      <p class="invite-empty">ما عندك أصدقاء بعد.</p>
      <button class="btn btn-ghost" onclick="goToFriends()">🤝 أضف أصدقاء</button>`;
    return;
  }

  box.innerHTML = `
    <div class="invite-title">اختر من تدعو:</div>
    <div class="invite-list">
      ${friends.map(f => `
        <div class="invite-row" id="inviteRow-${escapeHtml(f.userId)}">
          <span class="invite-name">👤 ${escapeHtml(f.username)}</span>
          <button class="btn btn-answer invite-btn"
                  onclick="inviteFriendToRoom('${escapeHtml(f.userId)}', '${escapeHtml(f.username).replace(/'/g, "\'")}')">
            📨 دعوة
          </button>
        </div>`).join('')}
    </div>`;
}

async function inviteFriendToRoom(userId, username) {
  if (!currentRoom) return;

  const row = document.getElementById(`inviteRow-${userId}`);
  const btn = row?.querySelector('.invite-btn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    const { data, error } = await supa.rpc('invite_friend', {
      target_id: userId,
      r_id: currentRoom.id,
      r_code: currentRoom.code
    });

    if (error) throw error;

    if (btn) {
      btn.textContent = data === 'already_invited' ? '✓ مدعوّ' : '✅ أُرسلت';
      btn.classList.add('sent');
    }
    Sound.award();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '📨 دعوة'; }
    uiAlert(`❌ ${e.message || 'تعذّر إرسال الدعوة'}`);
  }
}

/* ---- استقبال الدعوات ---- */

// لافتة تظهر أعلى الشاشة عند وصول دعوة
function showInviteBanner(inviteId, roomCode, fromName) {
  document.getElementById('inviteBanner')?.remove();

  const banner = createElement('div', { id: 'inviteBanner', class: 'invite-banner' }, `
    <div class="ib-text">🎮 <b>${escapeHtml(fromName)}</b> يدعوك لروم <code>${escapeHtml(roomCode)}</code></div>
    <div class="ib-actions">
      <button class="btn btn-answer" onclick="acceptInvite(${Number(inviteId)}, '${escapeHtml(roomCode)}')">دخول</button>
      <button class="btn btn-ghost" onclick="dismissInvite(${Number(inviteId)})">لاحقاً</button>
    </div>
  `);

  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('show'));
  Sound.open();

  // تختفي وحدها بعد دقيقة حتى لا تبقى معلّقة
  setTimeout(() => banner.remove(), 60000);
}

async function acceptInvite(inviteId, roomCode) {
  document.getElementById('inviteBanner')?.remove();
  Sound.click();

  try { await supa.from('room_invites').delete().eq('id', inviteId); } catch (e) { /* غير مهم */ }

  if (currentRoom) await leaveRoom();

  const ok = await joinRoom(roomCode, getPlayerDisplayName());
  if (ok) {
    await getRoomPlayers();
    goToRoomSetup();
  }
}

async function dismissInvite(inviteId) {
  document.getElementById('inviteBanner')?.remove();
  try { await supa.from('room_invites').delete().eq('id', inviteId); } catch (e) { /* غير مهم */ }
}

// دعوات وصلت والمستخدم غير متصل — نعرضها عند الدخول
async function checkPendingInvites() {
  if (!supa || !isSignedIn()) return;

  try {
    const { data, error } = await supa.rpc('my_invites');
    if (error || !data?.length) return;

    const inv = data[0];
    showInviteBanner(inv.invite_id, inv.room_code, inv.from_name);
  } catch (e) { /* لا يعطّل شيئاً */ }
}

// الاستماع اللحظي للدعوات الجديدة
function subscribeToInvites() {
  if (!supa || !currentProfile || inviteSubscription) return;

  try {
    inviteSubscription = supa
      .channel(`invites_${currentProfile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'room_invites',
        filter: `to_user=eq.${currentProfile.id}`
      }, async (payload) => {
        const inv = payload.new;
        // نجلب اسم الداعي عبر الدالة — profiles مغلق
        const { data } = await supa.rpc('my_invites');
        const match = (data || []).find(d => d.invite_id === inv.id);
        showInviteBanner(inv.id, inv.room_code, match?.from_name || 'صديقك');
      })
      .subscribe();
  } catch (e) {
    console.warn('تعذّر الاشتراك في الدعوات:', e);
  }
}

function unsubscribeFromInvites() {
  if (inviteSubscription) {
    supa?.removeChannel(inviteSubscription);
    inviteSubscription = null;
  }
}
