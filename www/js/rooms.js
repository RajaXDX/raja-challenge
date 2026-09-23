/* ============================= ROOM MANAGEMENT ============================= */

// متغيرات حالة الروم
let currentRoom = null;  // معلومات الروم الحالي
let currentPlayer = null; // معلومات اللاعب الحالي
let roomPlayers = [];     // لاعبو الروم الحالي
let roomChatMessages = []; // رسائل الشات
let roomGameState = null; // حالة اللعبة الحالية
let roomSubscriptions = {}; // Realtime subscriptions

// الكود يولّده الخادم الآن (`mr_new_code`)، وهذان لم يعودا مستعملين.

/* ============================= ROOM CREATION ============================= */

/* ⚠️ لا شيء تحت هذا السطر يلمس جدولاً مباشرة. كل الوصول عبر `RoomNet`
   وهي تنادي دوال `mr_*` في قاعدة البيانات، وهي وحدها من يفحص العضوية.
   راجع `supabase-rooms-secure.sql` — الجداول RLS مفعّلة بصفر سياسات. */

// يترجم صورة الخادم إلى المتغيّرات العامة التي يعتمد عليها باقي اللعبة،
// حتى لا يحتاج `game.js` ولا الواجهة أن يعرفا شيئاً عن تغيّر طبقة النقل.
function absorbRoom(data) {
  if (!data || data.error) return false;

  currentRoom = {
    id: data.id, code: data.code, name: data.name,
    mode: data.mode, status: data.status,
    categories_selected: data.categories_selected || []
  };

  roomPlayers = (data.players || []).filter(p => p.status === 'active');

  const mine = roomPlayers.find(p => p.player_id === RoomNet.meId());
  currentPlayer = {
    id: RoomNet.meId(),
    player_id: RoomNet.meId(),
    name: mine?.player_name || '',
    team: mine?.team ?? null,
    is_host: RoomNet.isHost(),
    score: mine?.score || 0
  };

  if (data.state) {
    roomGameState = {
      state_data: data.state.state_data,
      scores: data.state.scores,
      current_round: data.state.current_round
    };
  }
  return true;
}

/* ============================= ROOM CREATION ============================= */

async function createRoom(roomName, mode = 'online', playerName = '') {
  if (!supa) {
    uiAlert('❌ قاعدة البيانات غير متصلة');
    return null;
  }

  const data = await RoomNet.createRoom(roomName, playerName || 'المضيف', selectedCats || []);

  if (data.error) {
    uiAlert(roomErrorText(data.error));
    log(`❌ خطأ في إنشاء الروم: ${data.error}`, 'error');
    return null;
  }

  absorbRoom(data);
  log(`✅ تم إنشاء روم جديدة: ${currentRoom.code}`, 'success');
  trackEvent('room_created');
  bumpRoomsCreated();
  saveRoomSession();
  return currentRoom;
}

/* ============================= ROOM JOINING ============================= */

// رسائل الخطأ تأتي رموزاً من الخادم لا نصوصاً — النصّ شأن الواجهة،
// والخادم لا يجب أن يقرّر ما يُقال للاعب.
function roomErrorText(code) {
  switch (code) {
    case 'not_found':  return '❌ الروم غير موجود';
    case 'ended':      return '❌ هذه الروم انتهت';
    case 'kicked':     return '❌ تم إخراجك من هذه الروم';
    case 'started':    return '❌ اللعبة بدأت بالفعل، لا يمكن الانضمام الآن';
    case 'full':       return '❌ الروم ممتلئة';
    case 'not_host':   return '❌ فقط صاحب الروم يمكنه هذا';
    case 'not_member': return '❌ لست في هذه الروم';
    case 'bad_token':  return '❌ تعذّر إثبات هوية الجهاز';
    case 'no_schema':  return '❌ إعداد قاعدة البيانات ناقص — شغّل supabase-rooms-secure.sql';
    case 'offline':
    case 'network':    return '❌ تعذّر الاتصال بالخادم';
    default:           return '❌ تعذّرت العملية';
  }
}

async function joinRoom(roomCode, playerName) {
  if (!supa) {
    uiAlert('❌ قاعدة البيانات غير متصلة');
    return false;
  }

  const data = await RoomNet.joinRoom(String(roomCode || '').toUpperCase().trim(), playerName);

  if (data.error) {
    uiAlert(roomErrorText(data.error));
    return false;
  }

  absorbRoom(data);
  saveRoomSession();
  await loadChatMessages();
  log(`✅ دخلت إلى الروم: ${currentRoom.code}`, 'success');
  return true;
}

/* ============================= ROOM SHARING ============================= */

// رابط يفتح الروم مباشرة بدل إملاء الكود صوتياً وكتابته يدوياً
function getRoomLink() {
  if (!currentRoom) return '';
  const base = location.origin + location.pathname;
  return `${base}?room=${currentRoom.code}`;
}

function getRoomShareText() {
  return `تعال العب معنا «تحدي رجا» 🎮\nكود الروم: ${currentRoom?.code}\n${getRoomLink()}`;
}

function shareRoomWhatsApp() {
  if (!currentRoom) return;
  Sound.click();
  window.open('https://wa.me/?text=' + encodeURIComponent(getRoomShareText()), '_blank');
}

async function copyRoomLink() {
  if (!currentRoom) return;
  Sound.click();

  const link = getRoomLink();
  const btn = document.getElementById('copyLinkBtn');
  const done = () => {
    if (!btn) return;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="btn-icon">✅</span><span>تم النسخ</span>';
    setTimeout(() => { btn.innerHTML = original; }, 1800);
  };

  try {
    await navigator.clipboard.writeText(link);
    done();
  } catch (e) {
    // بديل للمتصفحات التي تمنع الحافظة بدون HTTPS
    const tmp = document.createElement('textarea');
    tmp.value = link;
    tmp.style.position = 'fixed';
    tmp.style.opacity = '0';
    document.body.appendChild(tmp);
    tmp.select();
    try { document.execCommand('copy'); done(); }
    catch (err) { uiPrompt('انسخ الرابط:', link); }
    tmp.remove();
  }
}

const PENDING_ROOM_KEY = 'mr_pending_room';

// يُستدعى مبكراً جداً — قبل بوابة الحساب — لأن البوابة قد توقف التنفيذ،
// وحينها كان كود الروم يضيع فيصل المدعوّ إلى الصفحة الرئيسية بلا روم.
function stashPendingRoomCode() {
  const code = new URLSearchParams(location.search).get('room');
  if (!code) return;

  // ننظّف الرابط حتى لا يتكرر الدخول عند التحديث
  history.replaceState(null, '', location.pathname);
  try { sessionStorage.setItem(PENDING_ROOM_KEY, code.toUpperCase().trim()); } catch (e) { /* تجاهل */ }
}

function takePendingRoomCode() {
  try {
    const code = sessionStorage.getItem(PENDING_ROOM_KEY);
    if (code) sessionStorage.removeItem(PENDING_ROOM_KEY);
    return code;
  } catch (e) { return null; }
}

// يفتح شاشة الدخول بالكود جاهزاً إن كان هناك رابط روم محفوظ
async function handleRoomLinkOnLoad() {
  const code = takePendingRoomCode();
  if (!code) return false;

  goToRooms();
  const input = document.getElementById('roomCodeInput');
  if (input) input.value = code.toUpperCase().trim();

  const nameInput = document.getElementById('playerNameInput');
  if (nameInput) {
    const saved = loadJSON(ROOM_SESSION_KEY, null);
    if (saved?.playerName) nameInput.value = saved.playerName;
    nameInput.focus();
  }

  log(`🔗 رابط روم: ${code}`, 'info');
  return true;
}

/* ============================= SESSION PERSISTENCE ============================= */

// نحفظ هوية الجلسة حتى يعود اللاعب تلقائياً بعد تحديث الصفحة أو انقطاع الشبكة
const ROOM_SESSION_KEY = 'mr_room_session';

function saveRoomSession() {
  if (!currentRoom || !currentPlayer) return;
  saveJSON(ROOM_SESSION_KEY, {
    roomCode: currentRoom.code,
    playerName: currentPlayer.name,
    savedAt: Date.now()
  });
}

function clearRoomSession() {
  try { localStorage.removeItem(ROOM_SESSION_KEY); } catch (e) { /* تجاهل */ }
}

// تُستدعى عند تحميل الصفحة: ترجع اللاعب لرومه إن كانت ما زالت قائمة
async function restoreRoomSession() {
  if (!supa) return false;

  const saved = loadJSON(ROOM_SESSION_KEY, null);
  if (!saved?.roomCode) return false;

  // جلسة أقدم من 6 ساعات نعتبرها منتهية
  if (Date.now() - (saved.savedAt || 0) > 6 * 60 * 60 * 1000) {
    clearRoomSession();
    return false;
  }

  const ok = await joinRoom(saved.roomCode, saved.playerName);
  if (!ok) {
    clearRoomSession();
    return false;
  }

  await getRoomPlayers();

  // إن كانت اللعبة جارية نرجعه للوحة مباشرة، لا لشاشة الانتظار
  const resumed = await fetchAndApplyGameState();
  if (!resumed) goToRoomSetup();

  log('🔄 تمت العودة إلى الروم السابقة', 'success');
  return true;
}

// يجلب آخر حالة لعبة محفوظة للروم ويطبّقها (للاعب العائد وسط جولة)
async function fetchAndApplyGameState() {
  if (!supa || !currentRoom) return false;

  const st = RoomNet.state();
  const state = st?.state_data;
  if (!state) return false;
  if (state.phase !== 'playing' && state.phase !== 'ended') return false;

  applyRemoteGameState(state);
  return true;
}

/* ============================= ROOM LEAVING ============================= */

async function leaveRoom() {
  if (!currentRoom) return;

  await RoomNet.leave();

  if (typeof hideChatUI === 'function') hideChatUI();

  // خروج مقصود → لا نعيده تلقائياً عند التحديث
  clearRoomSession();

  currentRoom = null;
  currentPlayer = null;
  roomPlayers = [];
  roomChatMessages = [];
  roomGameState = null;
  lastAppliedVersion = -1;
  lastRosterSig = '';

  log('✅ خرجت من الروم', 'success');
}

/* ============================= ROOM INFO ============================= */

// القائمة تصل مع كل صورة من الخادم، فلا حاجة لاستعلام منفصل.
// نستطلع لو لم تصل بعد (أول نداء بعد استعادة جلسة مثلاً).
async function getRoomPlayers() {
  if (!currentRoom) return [];
  if (!roomPlayers.length) await RoomNet.poll(true);
  return roomPlayers;
}

async function assignPlayerToTeam(playerId, team) {
  if (!currentRoom || !currentPlayer?.is_host) {
    uiAlert('❌ فقط صاحب الروم يمكنه توزيع الفرق');
    return false;
  }

  if (!['A', 'B'].includes(team)) {
    uiAlert('❌ الفريق يجب أن يكون A أو B');
    return false;
  }

  // ⚠️ الفحص أعلاه للواجهة وحدها. الحارس الحقيقي في `mr_set_team`:
  // ترفض من ليس مضيفاً مهما قال المتصفح.
  const data = await RoomNet.setTeam(playerId, team);
  if (data.error) {
    uiAlert(roomErrorText(data.error));
    return false;
  }

  absorbRoom(data);
  updatePlayersList();
  log(`✅ تم توزيع اللاعب على الفريق ${team}`, 'success');
  return true;
}

/* ============================= KICK PLAYER ============================= */

async function kickPlayer(playerId, playerName) {
  if (!currentRoom || !currentPlayer?.is_host) {
    uiAlert('❌ فقط صاحب الروم يمكنه طرد اللاعبين');
    return false;
  }

  if (playerId === currentPlayer.player_id) {
    uiAlert('❌ لا يمكنك طرد نفسك');
    return false;
  }

  if (!await uiConfirm(`طرد ${playerName || 'هذا اللاعب'} من الروم؟`)) return false;

  const data = await RoomNet.kick(playerId);
  if (data.error) {
    uiAlert(roomErrorText(data.error));
    return false;
  }

  absorbRoom(data);
  updatePlayersList();
  log(`👋 تم طرد ${playerName || playerId}`, 'success');
  return true;
}

// يُستدعى على جهاز اللاعب نفسه عندما يُطرد
async function handleKickedOut() {
  unsubscribeFromRoom();
  if (typeof hideChatUI === 'function') hideChatUI();

  // المطرود لا يُعاد تلقائياً عند تحديث الصفحة
  clearRoomSession();

  currentRoom = null;
  currentPlayer = null;
  roomPlayers = [];
  roomChatMessages = [];
  roomGameState = null;
  lastAppliedVersion = -1;
  lastRosterSig = '';

  uiAlert('👋 تم إخراجك من الروم');
  showScreen('screen-home');
}

async function updateRoomGameState(updateData) {
  if (!currentRoom) return false;

  const data = await RoomNet.pushState(
    updateData.state_data ?? RoomNet.state()?.state_data ?? {},
    updateData.scores ?? null,
    updateData.current_round ?? null
  );

  if (data?.error) {
    console.error('Update game state error:', data.error);
    return false;
  }
  return true;
}

async function updatePlayerScore(team, points) {
  if (!currentRoom) return false;

  await RoomNet.setTeamScore(team, points);

  const currentScores = roomGameState?.scores || { A: 0, B: 0 };
  currentScores[team] = points;
  await updateRoomGameState({ scores: currentScores });

  return true;
}

/* ============================= REALTIME SUBSCRIPTIONS ============================= */

/* الاشتراك صار في `RoomNet`: بثّ للسرعة واستطلاع للحقيقة.
   هذه الدوال تربط ما يصل من هناك بواجهة اللعبة — وهي نفس المعالِجات
   التي كانت معلّقة على `postgres_changes` قبل إغلاق الجداول. */

let roomHandlersBound = false;

/* ⚠️ الاستطلاع يصل كل أربع ثوانٍ سواء تغيّر شيء أم لا، بخلاف
   `postgres_changes` الذي كان لا يوقظنا إلا عند تغيّر فعلي. فلو أعدنا
   الرسم مع كل صورة لأعدنا بناء اللوحة خمس عشرة مرة في الدقيقة —
   وميضٌ دائم وفقدٌ لحالة الواجهة بلا سبب. لذلك نقارن قبل أن نرسم. */
let lastAppliedVersion = -1;
let lastRosterSig = '';

function rosterSignature() {
  return roomPlayers
    .map(p => `${p.player_id}:${p.team || '-'}:${p.score || 0}:${p.player_name}`)
    .join('|');
}

function bindRoomHandlers() {
  if (roomHandlersBound) return;
  roomHandlersBound = true;

  RoomNet.onRoom = (data) => {
    const before = currentPlayer?.player_id;
    absorbRoom(data);

    // لم أعد ضمن اللاعبين النشطين → طُردت أو أُغلقت الروم
    if (before && !roomPlayers.some(p => p.player_id === before)) {
      handleKickedOut();
      return;
    }

    const ver = data.state?.version ?? -1;
    if (ver !== lastAppliedVersion) {
      lastAppliedVersion = ver;
      // نطبّق حالة اللعب أولاً (تبني الجولات) ثم نحدّث العرض،
      // وإلا حاول العرض الرسم قبل وصول بيانات الجولات
      try {
        const sd = data.state?.state_data;
        if (sd && Object.keys(sd).length) applyRemoteGameState(sd);
        updateGameDisplay();
      } catch (e) {
        console.error('تعذّر تطبيق حالة اللعبة:', e);
      }
    }

    const sig = rosterSignature();
    if (sig !== lastRosterSig) {
      lastRosterSig = sig;
      try { updatePlayersList(); } catch (e) { console.error(e); }
    }
  };

  RoomNet.onChat = (messages) => {
    messages.forEach(msg => {
      const known = roomChatMessages.findIndex(m => m.id === msg.id);
      if (known >= 0) { roomChatMessages[known] = msg; return; }   // تفاعل محدَّث
      roomChatMessages.push(msg);
      displayChatMessage(msg);
      noteIncomingMessage(msg);
      if (msg.player_id !== currentPlayer?.player_id) Sound.open();
    });
  };

  RoomNet.onError = (code) => {
    if (code === 'not_member') { handleKickedOut(); return; }
    if (code === 'not_found') {
      clearRoomSession();
      uiAlert('❌ انتهت هذه الروم');
      showScreen('screen-home');
    }
  };
}

// تُترك بالاسم القديم حتى لا يتغيّر ما يناديها في بقية الملفات
function subscribeToRoom() { bindRoomHandlers(); }

function unsubscribeFromRoom() {
  RoomNet.unsubscribe();
  log('✅ تم إلغاء الاشتراك في الروم', 'info');
}

/* ============================= UTILITY FUNCTIONS ============================= */

/* ⚠️ توليد الكود انتقل إلى الخادم (`mr_new_code`).
   لم يكن الأمر تنظيماً فقط: التوليد في المتصفح كان بلا فحص تصادم، فتصادمُه
   يُظهر للاعب خطأ قاعدة بيانات خاماً. والخادم يعيد التوليد حتى يجد كوداً
   حرّاً، وأبجديته بلا 0/O و1/I لأن الكود يُقال بالصوت.

   و`getDeviceId` زال معه: العضوية صارت بتوكن سرّي في `RoomNet.token()`
   لا بمعرّف جهاز كان يُرسل للجميع في كل صفّ لاعب — وهو بحدّ ذاته تسريب. */

// نربط معالِجات النقل فور تحميل الملف: استعادة الجلسة قد تسبق أي تفاعل،
// وبلا ربط مبكر تصل أول صورة من الخادم ولا أحد يستمع لها.
bindRoomHandlers();

/* ============================= UI UPDATE FUNCTIONS ============================= */

function updateGameDisplay() {
  if (!roomGameState) return;

  const scoreA = document.getElementById('scoreA');
  const scoreB = document.getElementById('scoreB');

  if (scoreA) scoreA.textContent = roomGameState.scores?.A || 0;
  if (scoreB) scoreB.textContent = roomGameState.scores?.B || 0;

  renderBoard();
}

function updatePlayersList() {
  if (!currentPlayer?.is_host) {
    // العرض العادي للاعبين (بدون توزيع)
    const playersList = document.getElementById('playersReadyUI');
    if (!playersList) return;

    const listDiv = document.getElementById('roomPlayersList2');
    if (listDiv) {
      listDiv.innerHTML = '';
      roomPlayers.forEach(player => {
        const playerDiv = createElement('div', { class: 'player-item' }, `
          <span class="player-name">${escapeHtml(player.player_name || '')}</span>
          <span class="player-team">${player.team === 'A' || player.team === 'B' ? `فريق ${player.team}` : '⏳ بانتظار التوزيع'}</span>
          <span class="player-score">${Number(player.score) || 0}</span>
        `);
        listDiv.appendChild(playerDiv);
      });
    }
    document.getElementById('playersReadyUI').style.display = 'block';
    document.getElementById('teamDistributionUI').style.display = 'none';
    updateStartGateUI();
  } else {
    // واجهة التوزيع للـ Host فقط
    const distUI = document.getElementById('teamDistributionUI');
    if (distUI) distUI.style.display = 'block';
    document.getElementById('playersReadyUI').style.display = 'none';
    updateStartGateUI();

    const playersList = document.getElementById('roomPlayersList');
    if (playersList) {
      playersList.innerHTML = '';
      roomPlayers.forEach(player => {
        const isMe = player.player_id === currentPlayer.player_id;
        const safeName = escapeHtml(player.player_name || '');
        const playerDiv = createElement('div', { class: 'player-item' }, `
          <span class="player-name">${safeName}${isMe ? ' (أنت)' : ''}</span>
          <div class="team-buttons">
            <button class="team-btn ${player.team === 'A' ? 'selected' : ''}"
              onclick="assignPlayerToTeam('${player.player_id}', 'A')">فريق أ</button>
            <button class="team-btn ${player.team === 'B' ? 'selected' : ''}"
              onclick="assignPlayerToTeam('${player.player_id}', 'B')">فريق ب</button>
            ${isMe ? '' : `<button class="kick-btn" title="طرد من الروم"
              onclick="kickPlayer('${player.player_id}', '${safeName.replace(/'/g, "\\'")}')">🚫 طرد</button>`}
          </div>
        `);
        playersList.appendChild(playerDiv);
      });
    }
  }
}

function displayChatMessage(message) {
  const chatContainer = document.getElementById('roomChatMessages');
  if (!chatContainer) return;

  // منع تكرار نفس الرسالة إذا وصل الحدث أكثر من مرة
  if (message.id && chatContainer.querySelector(`[data-msg-id="${message.id}"]`)) {
    return;
  }

  const messageEl = createElement('div', {
    class: 'chat-message',
    'data-msg-id': message.id || ''
  }, `
    <div class="chat-msg-header">
      <span class="chat-sender">${escapeHtml(message.player_name)}</span>
    </div>
    <div class="chat-text">${escapeHtml(message.message)}</div>
    ${message.reactions && Object.keys(message.reactions).length > 0 ? `
      <div class="chat-reactions">
        ${Object.entries(message.reactions).map(([emoji, players]) =>
          `<span class="reaction">${emoji} ${players.length}</span>`
        ).join('')}
      </div>
    ` : ''}
  `);

  chatContainer.appendChild(messageEl);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ملاحظة: escapeHtml انتقلت إلى js/utils.js — فهي أداة عامة، و utils.js
// يُحمَّل أولاً ويستخدمها بنفسه في نوافذ الحوار.

/* ============================= START BUTTON GATE ============================= */

// يحدّث زر «ابدأ اللعبة» وسببَ تعطيله. الشروط نفسها المفروضة في
// startGameOnline() — هذه للتوضيح البصري لا للأمان.
function updateStartGateUI() {
  const btn = document.getElementById('startGameBtn');
  const hint = document.getElementById('startGateHint');
  if (!btn) return;

  if (!currentPlayer?.is_host) {
    btn.style.display = 'none';
    if (hint) hint.textContent = '';
    return;
  }

  btn.style.display = '';

  const withoutTeam = roomPlayers.filter(p => !p.team);
  const teamA = roomPlayers.filter(p => p.team === 'A');
  const teamB = roomPlayers.filter(p => p.team === 'B');

  let reason = '';
  if (roomPlayers.length < 2) reason = '⏳ بانتظار دخول لاعب آخر';
  else if (withoutTeam.length) reason = `⏳ وزّع: ${withoutTeam.map(p => p.player_name).join('، ')}`;
  else if (!teamA.length || !teamB.length) reason = '⏳ كل فريق يحتاج لاعباً واحداً على الأقل';

  btn.disabled = !!reason;
  if (hint) hint.textContent = reason;
}
