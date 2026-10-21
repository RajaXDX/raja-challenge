/* ============================= CHAT SYSTEM ============================= */

let chatOpen = false;
let unreadCount = 0;

/* ---- شارة الرسائل غير المقروءة ---- */

function renderUnreadBadge() {
  // ⚠️ الشارة توضع في الغلاف لا داخل <button>: العناصر المطلقة داخل الأزرار
  // لا تُحترم أبعادها في بعض المحركات، فكانت الشارة تنكمش إلى 9×9.
  const wrap = document.getElementById('chatFabWrap');
  if (!wrap) return;

  let badge = wrap.querySelector('.chat-badge');

  if (unreadCount <= 0) {
    badge?.remove();
    return;
  }

  if (!badge) {
    badge = createElement('span', { class: 'chat-badge' });
    wrap.appendChild(badge);
  }
  badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
}

// تُستدعى عند وصول رسالة جديدة. لا نعدّ رسائل الشخص نفسه،
// ولا نعدّ شيئاً واللوحة مفتوحة أمامه.
function noteIncomingMessage(message) {
  if (chatOpen) return;
  if (message?.player_id && message.player_id === currentPlayer?.player_id) return;
  if (isChatBlocked(message)) return;
  unreadCount++;
  renderUnreadBadge();
}

function clearUnread() {
  unreadCount = 0;
  renderUnreadBadge();
}

/* ============================= الإشراف: بلاغ وحظر وتنقية ============================= */
/*
  شرط App Store (بند 1.2) لأي تطبيق فيه نص يكتبه المستخدمون لغيرهم:
  تنقية الألفاظ، وبلاغ عن المحتوى، وحظر المسيء — والثلاثة بيد اللاعب نفسه.

  الحظر **محلي على الجهاز**: يُخفي رسائل اللاعب عن صاحب الجهاز وحده، فلا
  يحتاج جدولاً ولا صلاحيات، ولا يكشف للمحظور أنه حُظر. والحظر الفعلي من
  الخدمة يبقى للإدارة عبر `bans.js`.

  البلاغ يُكتب في `question_reports` نفسه بفئة `CHAT_REPORT_CATEGORY`، فيظهر
  في تبويب البلاغات بلوحة الإدارة بلا جدول ولا سكربت SQL جديد.
*/
const CHAT_BLOCK_KEY = 'mr_chat_blocked';
const CHAT_REPORT_CATEGORY = '💬 بلاغ شات';

function chatBlockedList() {
  const list = loadJSON(CHAT_BLOCK_KEY, []);
  return Array.isArray(list) ? list : [];
}

function isChatBlocked(msg) {
  return !!msg?.player_id && chatBlockedList().some(b => b.id === msg.player_id);
}

// ألفاظ بذيئة شائعة. القصيرة تُطابق كلمةً كاملة فقط حتى لا تُشوَّه كلمات
// بريئة تحتويها؛ والطويلة المميّزة تُطابق أينما وردت (تلتقط التصاريف).
const CHAT_BAD_WHOLE = ['زب', 'كس', 'طيز', 'خرا', 'نيك', 'تفو', 'dick', 'shit', 'cunt', 'fuck'];
const CHAT_BAD_ANY = ['قحب', 'شرموط', 'منيوك', 'منيك', 'متناك', 'كسمك', 'كس امك', 'يلعن', 'fuck', 'bitch', 'pussy', 'asshole'];
// ⚠️ بلا lookbehind `(?<!…)`: لا يعمل في سفاري قبل iOS 16.4 والتطبيق يدعم
// iOS 14 — والخطأ هنا خطأ تحليل يُسقط chat.js كاملاً. الحرف السابق يُلتقط
// في مجموعة ويُعاد كما هو.
const CHAT_BAD_RE = new RegExp(
  `(${CHAT_BAD_ANY.join('|')})|(^|[^\\p{L}])(${CHAT_BAD_WHOLE.join('|')})(?![\\p{L}])`, 'giu');

const maskWord = w => '•'.repeat([...w].length);

function cleanChatText(text) {
  return String(text || '').replace(CHAT_BAD_RE,
    (m, any, pre, whole) => any ? maskWord(any) : pre + maskWord(whole));
}

async function reportChatMessage(msgId) {
  const msg = roomChatMessages.find(m => String(m.id) === String(msgId));
  if (!msg) return;
  if (!await uiConfirm(`إبلاغ الإدارة عن رسالة «${msg.player_name}»؟`, 'أبلغ', 'إلغاء')) return;

  const row = {
    category: CHAT_REPORT_CATEGORY,
    question: String(msg.message || '').slice(0, 600),
    answer: String(msg.player_name || '').slice(0, 600),
    reason: 'رسالة مسيئة في الشات',
    note: `روم ${currentRoom?.code || '—'} · معرّف المرسل ${msg.player_id || '—'}`.slice(0, 400),
  };
  // نفس مسار بلاغات الأسئلة: يُطمئن فوراً ويحفظ محلياً لو تعذّر الرفع
  await sendQuestionReport(row);

  if (await uiConfirm(`تبي تحظر «${msg.player_name}» بعد؟ ما راح تشوف رسائله.`, 'احظره', 'لا')) {
    blockChatSender(msg, true);
  }
}

async function blockChatSender(msgOrId, skipConfirm = false) {
  const msg = typeof msgOrId === 'object' ? msgOrId
    : roomChatMessages.find(m => String(m.id) === String(msgOrId));
  if (!msg?.player_id) return;
  if (!skipConfirm && !await uiConfirm(
    `حظر «${msg.player_name}»؟\n\nما راح تشوف رسائله في الشات على هذا الجهاز، وتقدر تلغي الحظر من رأس الشات.`,
    'احظر', 'إلغاء')) return;

  const list = chatBlockedList().filter(b => b.id !== msg.player_id);
  list.push({ id: msg.player_id, name: msg.player_name || '' });
  saveJSON(CHAT_BLOCK_KEY, list);
  renderChatMessages();
}

async function unblockAllChat() {
  const list = chatBlockedList();
  if (!list.length) return;
  const names = list.map(b => b.name || '؟').join('، ');
  if (!await uiConfirm(`إلغاء حظر: ${names}؟`, 'ألغِ الحظر', 'إلغاء')) return;
  saveJSON(CHAT_BLOCK_KEY, []);
  renderChatMessages();
}

function renderChatBlockedBtn() {
  const btn = document.getElementById('chatBlockedBtn');
  if (!btn) return;
  const n = chatBlockedList().length;
  btn.style.display = n ? '' : 'none';
  btn.textContent = `🚫 ${n}`;
}

/* ============================= SEND MESSAGE ============================= */

async function sendChatMessage(messageText) {
  if (!currentRoom || !currentPlayer) {
    uiAlert('❌ يجب أن تكون في روم أولاً');
    return false;
  }

  if (!messageText || messageText.trim().length === 0) {
    return false;
  }

  try {
    const { error } = await supa
      .from('room_chat')
      .insert({
        room_id: currentRoom.id,
        player_id: currentPlayer.player_id,
        player_name: currentPlayer.name,
        message: cleanChatText(messageText.trim()),
        reactions: {}
      });

    if (error) throw error;

    // مسح حقل الإدخال
    const input = document.getElementById('chatInput');
    if (input) input.value = '';

    return true;
  } catch (error) {
    console.error('Send message error:', error);
    log(`❌ خطأ في إرسال الرسالة: ${error.message}`, 'error');
    return false;
  }
}

/* ============================= ADD REACTION ============================= */

async function addReaction(messageId, emoji) {
  if (!supa) return false;

  try {
    // جلب الرسالة
    const { data: message, error: fetchError } = await supa
      .from('room_chat')
      .select('reactions')
      .eq('id', messageId)
      .single();

    if (fetchError) throw fetchError;

    const reactions = message?.reactions || {};

    // إضافة أو إزالة التفاعل
    if (!reactions[emoji]) {
      reactions[emoji] = [];
    }

    if (!reactions[emoji].includes(currentPlayer.player_id)) {
      reactions[emoji].push(currentPlayer.player_id);
    } else {
      // إزالة التفاعل إذا كان موجوداً
      reactions[emoji] = reactions[emoji].filter(
        id => id !== currentPlayer.player_id
      );

      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    }

    // تحديث الرسالة
    const { error: updateError } = await supa
      .from('room_chat')
      .update({ reactions })
      .eq('id', messageId);

    if (updateError) throw updateError;

    return true;
  } catch (error) {
    console.error('Add reaction error:', error);
    return false;
  }
}

/* ============================= LOAD CHAT MESSAGES ============================= */

async function loadChatMessages() {
  if (!currentRoom) return [];

  try {
    const { data, error } = await supa
      .from('room_chat')
      .select('*')
      .eq('room_id', currentRoom.id)
      .order('created_at', { ascending: true })
      .limit(50); // آخر 50 رسالة

    if (error) throw error;

    roomChatMessages = data || [];
    renderChatMessages();

    return roomChatMessages;
  } catch (error) {
    console.error('Load chat messages error:', error);
    return [];
  }
}

/* ============================= RENDER CHAT ============================= */

function renderChatMessages() {
  const chatContainer = document.getElementById('roomChatMessages');
  if (!chatContainer) return;

  chatContainer.innerHTML = '';

  const myId = currentPlayer?.player_id;
  roomChatMessages.forEach(msg => {
    if (isChatBlocked(msg)) return;
    const mine = !!myId && msg.player_id === myId;
    const msgId = escapeHtml(String(msg.id || ''));
    const modBtns = (!mine && msg.id) ? `
        <span class="chat-mod">
          <button class="chat-mod-btn" title="إبلاغ" aria-label="إبلاغ عن الرسالة" onclick="reportChatMessage('${msgId}')">🚩</button>
          <button class="chat-mod-btn" title="حظر" aria-label="حظر المرسل" onclick="blockChatSender('${msgId}')">🚫</button>
        </span>` : '';
    const messageEl = createElement('div', {
      class: 'chat-message',
      'data-msg-id': msg.id || ''
    }, `
      <div class="chat-msg-header">
        <span class="chat-sender">${escapeHtml(msg.player_name)}</span>
        <span class="chat-time">${formatTime(msg.created_at)}</span>${modBtns}
      </div>
      <div class="chat-text">${escapeHtml(cleanChatText(msg.message))}</div>
      ${msg.reactions && Object.keys(msg.reactions).length > 0 ? `
        <div class="chat-reactions">
          ${Object.entries(msg.reactions).map(([emoji, players]) =>
            `<button class="reaction-btn" onclick="addReaction('${msg.id}', '${emoji}')"
              title="${players.join(', ')}">
              ${emoji} <span>${players.length}</span>
            </button>`
          ).join('')}
        </div>
      ` : ''}
    `);

    chatContainer.appendChild(messageEl);
  });

  renderChatBlockedBtn();

  // التمرير إلى آخر رسالة
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

/* ============================= TOGGLE CHAT ============================= */

function toggleChat() {
  let chatPanel = document.getElementById('chatPanel');
  if (!chatPanel) {
    createChatPanel();
    chatPanel = document.getElementById('chatPanel');
    if (!chatPanel) return;
  }

  chatOpen = !chatOpen;
  const wrap = document.getElementById('chatFabWrap');

  if (chatOpen) {
    chatPanel.classList.add('open');
    clearUnread();
    if (wrap) wrap.classList.add('hidden');
    // لا نركّز على الحقل في الجوال حتى لا تقفز لوحة المفاتيح فوق المحتوى
    if (window.innerWidth > 768) {
      document.getElementById('chatInput')?.focus();
    }
  } else {
    chatPanel.classList.remove('open');
    if (wrap) wrap.classList.remove('hidden');
  }
}

/* ============================= CREATE CHAT PANEL ============================= */

function createChatPanel() {
  const isNew = !document.getElementById('chatPanel');

  if (isNew) {
    const panel = createElement('div', { id: 'chatPanel', class: 'chat-panel' }, `
      <div class="chat-panel-header">
        <h3>💬 الشات</h3>
        <button class="chat-blocked-btn" id="chatBlockedBtn" title="المحظورون — اضغط لإلغاء الحظر"
                onclick="unblockAllChat()" style="display:none"></button>
        <button class="chat-close" onclick="toggleChat()">✕</button>
      </div>
      <div class="chat-messages" id="roomChatMessages"></div>
      <div class="chat-input-area">
        <input type="text" id="chatInput" class="chat-input" placeholder="Enter للإرسال...">
        <button class="chat-send-btn" id="chatSendBtn">إرسال</button>
      </div>
    `);

    document.body.appendChild(panel);

    // الاستماع للـ Enter و click button
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');

    const sendMsg = () => {
      const msg = chatInput.value;
      if (msg.trim()) {
        sendChatMessage(msg);
        chatInput.value = '';
      }
    };

    if (chatInput) {
      // Enter للإرسال
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMsg();
        }
      });

      // تحديث حالة الزر عند الكتابة
      chatInput.addEventListener('input', (e) => {
        const btn = document.getElementById('chatSendBtn');
        if (btn) {
          btn.style.opacity = e.target.value.trim() ? '1' : '0.5';
          btn.style.cursor = e.target.value.trim() ? 'pointer' : 'not-allowed';
        }
      });
    }

    // الزر يرسل أيضاً
    if (chatSendBtn) {
      chatSendBtn.addEventListener('click', sendMsg);
    }

    createChatToggleButton();
    loadChatMessages();
  }

  // اللوحة تبدأ مغلقة حتى لا تغطي محتوى الشاشة (خصوصاً على الجوال)
  // الفتح يتم بالضغط على الزر العائم 💬
  const wrap = document.getElementById('chatFabWrap');
  if (wrap) {
    wrap.classList.remove('hidden');
    wrap.style.display = 'block';
  }
}

/* ============================= CHAT TOGGLE BUTTON (FAB) ============================= */

function createChatToggleButton() {
  if (document.getElementById('chatFabWrap')) return;

  const wrap = createElement('div', { id: 'chatFabWrap', class: 'chat-fab-wrap' });

  const fab = createElement('button', {
    id: 'chatFab',
    class: 'chat-fab',
    title: 'الشات'
  }, '💬');

  fab.onclick = () => toggleChat();
  wrap.appendChild(fab);
  document.body.appendChild(wrap);
}

function hideChatUI() {
  unreadCount = 0;
  renderUnreadBadge();
  const panel = document.getElementById('chatPanel');
  const wrap = document.getElementById('chatFabWrap');
  if (panel) panel.classList.remove('open');
  if (wrap) {
    wrap.classList.remove('hidden');
    wrap.style.display = 'none';
  }
  chatOpen = false;
}

/* ============================= EMOJI PICKER (بسيط) ============================= */

function showEmojiPicker(messageId) {
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '💯', '✨'];

  const picker = document.createElement('div');
  picker.className = 'emoji-picker';

  emojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.onclick = () => {
      addReaction(messageId, emoji);
      picker.remove();
    };
    picker.appendChild(btn);
  });

  document.body.appendChild(picker);

  setTimeout(() => picker.remove(), 5000);
}

/* ============================= UTILITY FUNCTIONS ============================= */

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}
