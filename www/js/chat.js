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
  unreadCount++;
  renderUnreadBadge();
}

function clearUnread() {
  unreadCount = 0;
  renderUnreadBadge();
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

  // ⚠️ لا نرسل اسم المُرسِل. الخادم يقرأه من صفّ اللاعب في الجدول
  // (`mr_send_chat`) — وإلا انتحل أي عضو اسم غيره وهو داخل الروم فعلاً.
  const data = await RoomNet.sendChat(messageText.trim());

  if (data.error) {
    log(`❌ خطأ في إرسال الرسالة: ${data.error}`, 'error');
    if (data.error === 'not_member') uiAlert('❌ لست في هذه الروم');
    return false;
  }

  const input = document.getElementById('chatInput');
  if (input) input.value = '';

  return true;
}

/* ============================= ADD REACTION ============================= */

/* ⚠️ التفاعل صار عملية ذرّية في الخادم تضيف/تزيل **معرّف المنادي وحده**.
   الكود القديم كان يقرأ الرسالة، يعدّل كامل حقل `reactions` في المتصفح،
   ثم يكتبه كاملاً — أي أن أي شخص يقدر يزوّر تفاعلات باسم غيره أو يمحو
   تفاعلات الجميع. وحتى بين لاعبين شريفين، تفاعلان في نفس اللحظة كان
   أحدهما يمحو الآخر (قراءة‑ثم‑كتابة بلا قفل). */
async function addReaction(messageId, emoji) {
  if (!currentRoom || !currentPlayer) return false;

  const data = await RoomNet.react(messageId, emoji);
  if (data.error) {
    console.error('Add reaction error:', data.error);
    return false;
  }
  return true;
}

/* ============================= LOAD CHAT MESSAGES ============================= */

async function loadChatMessages() {
  if (!currentRoom) return [];

  RoomNet.resetChatCursor();
  roomChatMessages = [];
  await RoomNet.fetchChat();     // يملأ `roomChatMessages` عبر onChat
  renderChatMessages();

  return roomChatMessages;
}

/* ============================= RENDER CHAT ============================= */

function renderChatMessages() {
  const chatContainer = document.getElementById('roomChatMessages');
  if (!chatContainer) return;

  chatContainer.innerHTML = '';

  roomChatMessages.forEach(msg => {
    const messageEl = createElement('div', {
      class: 'chat-message',
      'data-msg-id': msg.id || ''
    }, `
      <div class="chat-msg-header">
        <span class="chat-sender">${escapeHtml(msg.player_name)}</span>
        <span class="chat-time">${formatTime(msg.created_at)}</span>
      </div>
      <div class="chat-text">${escapeHtml(msg.message)}</div>
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
