/* ==========================================================================
   room-net.js — النقل وحده: الرومات والشات والمزامنة عبر دوال Supabase
   --------------------------------------------------------------------------
   لا يعرف شيئاً عن قواعد اللعبة ولا يلمس اللوحة. يعطي `rooms.js` ما وصل،
   ويأخذ منه ما يُرسَل. مبنيّ على نفس نموذج `net.js` في «صراع الحروف».

   ⚠️ **لا يلمس هذا الملف أي جدول مباشرة.** كل شيء عبر دوال `mr_*` وهي
   `SECURITY DEFINER` تفحص توكن العضوية (راجع `supabase-rooms-secure.sql`).
   الجداول نفسها RLS مفعّلة بصفر سياسات والصلاحية منزوعة عن `anon`.

   لماذا لم يبقَ `postgres_changes`
   --------------------------------
   Realtime يطبّق RLS بهوية المشترك. وبعد أن صارت الجداول بصفر سياسات لن
   يصل المشترك أي صف — وهذا مقصود لا عطل. البديل هو ما تفعله «صراع الحروف»:

       بثّ للسرعة، واستطلاع للحقيقة.

   البثّ على قناة `mr-<code>` يصل فوراً فتتحرّك الشاشة بلا انتظار، ثم
   `mr_snapshot` تؤكّد من الجدول. البثّ لا يُؤتمن على الحقائق — القناة
   مفتوحة لمن يعرف الكود والخادم لا يفحص العضوية فيها — لكنه لم يعد
   يستطيع أن يكذب أكثر من ثانية.
   ========================================================================== */

const RoomNet = (function () {

  const TOKEN_KEY = 'mr_room_token';
  const POLL_MS   = 4000;

  let room    = null;   // آخر صورة من الخادم (بلا توكنات)
  let code    = null;
  let meId    = null;   // player_id الخاص بي
  let isHost  = false;
  let version = 0;
  let channel = null;
  let pollTimer = null;

  let lastChatAt = null;   // ختم آخر رسالة وصلتنا — نطلب الجديد فقط

  // نسختنا الحالية جاءت من بثّ لم يؤكّده الجدول بعد. ما دامت مرفوعة،
  // الجدول يفوز عند الاختلاف — فالبثّ يرسله أي عارف بالكود، بينما
  // `mr_push_state` تفحص التوكن.
  let unconfirmed = false;
  let confirmTimer = null;

  let onRoom  = () => {};
  let onChat  = () => {};
  let onError = () => {};

  /* ---------------------------------------------------------- الهوية */

  /* توكن الجهاز = عضويتك. يُولَّد مرة ويبقى، فتحديث الصفحة يعيدك لمقعدك
     وفريقك بدل أن يُدخلك لاعباً جديداً.
     ⚠️ `crypto.randomUUID` غير متاحة على http بلا شهادة في بعض المتصفحات،
     والاختبار المحلي يمرّ على http. */
  function token() {
    let t = null;
    try { t = localStorage.getItem(TOKEN_KEY); } catch (e) { /* تجاهل */ }
    if (!t) {
      t = (crypto.randomUUID ? crypto.randomUUID()
        : 'mr-' + Date.now().toString(36) + '-' +
          Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
      try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* تجاهل */ }
    }
    return t;
  }

  /* --------------------------------------------------------- النداء */

  async function rpc(fn, args) {
    if (!supa) return { error: 'offline' };
    try {
      const { data, error } = await supa.rpc(fn, args);
      if (error) {
        console.error('RPC ' + fn + ':', error.message);
        return { error: /function|schema cache/i.test(error.message)
          ? 'no_schema' : 'network' };
      }
      return data || { error: 'empty' };
    } catch (e) {
      console.error('RPC ' + fn + ' استثناء:', e);
      return { error: 'network' };
    }
  }

  function adopt(data) {
    if (!data || data.error) return data;
    unconfirmed = false;              // هذه جاءت من الجدول، فهي المرجع
    room = data;
    code = data.code || code;
    if (data.you) meId = data.you;
    if (typeof data.is_host === 'boolean') isHost = data.is_host;
    // نأخذ الأعلى لا الوارد: ردّ متأخر قد يحمل نسخة أقدم مما عندنا
    version = Math.max(version, data.state?.version || 0);
    onRoom(room);
    return data;
  }

  function confirmSoon() {
    clearTimeout(confirmTimer);
    // ~ثانية: تكفي لوصول كتابة الباثّ الشرعي للجدول، فلا نراجع على فراغ
    confirmTimer = setTimeout(() => { confirmTimer = null; poll(); }, 900);
  }

  /* -------------------------------------------------------- الرومات */

  async function createRoom(roomName, playerName, cats) {
    const data = await rpc('mr_create_room', {
      p_room_name: roomName, p_player_name: playerName,
      p_token: token(), p_cats: cats || []
    });
    if (data.error) return data;
    version = 0; lastChatAt = null;
    adopt(data);
    await subscribe(data.code);
    return data;
  }

  async function joinRoom(roomCode, playerName) {
    const data = await rpc('mr_join_room', {
      p_code: roomCode, p_player_name: playerName, p_token: token()
    });
    if (data.error) return data;
    version = data.state?.version || 0;
    lastChatAt = null;
    adopt(data);
    await subscribe(data.code);
    ping('roster');   // ليرى الباقون من دخل فوراً لا بعد دورة استطلاع
    return data;
  }

  async function leave() {
    const c = code;
    if (c) await rpc('mr_leave', { p_code: c, p_token: token() });
    ping('roster');
    unsubscribe();
    room = null; code = null; meId = null; isHost = false;
    version = 0; lastChatAt = null;
  }

  /* ------------------------------------------------------- الاتصال */

  async function subscribe(c) {
    unsubscribe();
    if (!supa || !c) return;

    channel = supa.channel('mr-' + c, { config: { broadcast: { self: false } } });

    channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (!payload) return;
      // نسخة أقدم أو مساوية تُهمَل: البثّ قد يصل بغير ترتيبه، وتطبيق
      // القديمة يُرجع المباراة خطوة للوراء أمام اللاعبين
      if ((payload.version || 0) <= version) return;
      version = payload.version;
      room = Object.assign({}, room, {
        state: Object.assign({}, room?.state, payload.state)
      });
      unconfirmed = true;
      onRoom(room);
      confirmSoon();
    });

    /* تغيّر في القائمة أو رسالة جديدة. لا نبثّ المحتوى نفسه — البثّ لا
       يُؤتمن على الحقائق، ومن يبثّها قد يكذب. نبثّ **إشارة** والطرف
       الآخر يسأل الخادم. */
    channel.on('broadcast', { event: 'roster' }, () => poll(true));
    channel.on('broadcast', { event: 'chat' },   () => fetchChat());

    await channel.subscribe();

    clearInterval(pollTimer);
    pollTimer = setInterval(() => { poll(); fetchChat(); }, POLL_MS);
  }

  function ping(event) {
    if (channel) channel.send({ type: 'broadcast', event, payload: { at: Date.now() } });
  }

  function unsubscribe() {
    clearInterval(pollTimer); pollTimer = null;
    clearTimeout(confirmTimer); confirmTimer = null;
    unconfirmed = false;
    if (channel && supa) { supa.removeChannel(channel); channel = null; }
  }

  /* ⚠️ لا نستطلع والصفحة في الخلفية: متصفح الجوال يجمّد المؤقتات،
     والنداءات المتراكمة تنفجر دفعة واحدة عند العودة. و`force` للإشارات. */
  async function poll(force) {
    if (!code) return;
    if (document.hidden && force !== true) return;

    const data = await rpc('mr_snapshot', { p_code: code, p_token: token() });
    if (data.error) {
      if (data.error === 'not_found' || data.error === 'not_member') {
        unsubscribe();
        onError(data.error);
      }
      return;
    }

    const incoming = data.state?.version || 0;
    if (incoming < version) {
      if (unconfirmed) {
        // بثّ رفع نسختنا ولم يصل الجدول شيء يطابقه بعد مهلة المراجعة.
        // إمّا بثّ مزوَّر من خارج الروم، وإمّا كتابة فُقدت. الجدول هو
        // المرجع في الحالتين — ونُنزل العدّاد وإلا رفض كل دفع لاحق.
        version = incoming;
        adopt(data);
        return;
      }
      // عندنا أحدث ممّا في الجدول (بثّنا نحن سبق كتابتنا) — لا نتراجع
      const keep = room?.state;
      room = Object.assign({}, data, { state: keep });
      if (data.you) meId = data.you;
      if (typeof data.is_host === 'boolean') isHost = data.is_host;
      onRoom(room);
      return;
    }
    adopt(data);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && code) { poll(); fetchChat(); }
  });

  /* ---------------------------------------------------------- الدفع */

  /* نبثّ أولاً ثم نكتب: البثّ هو ما يراه الباقون، والكتابة للبقاء.
     انتظار الكتابة يؤخّر ظهور الحركة عندهم بلا سبب. */
  async function pushState(stateData, scores, round) {
    if (!code) return { error: 'no_room' };

    version += 1;
    unconfirmed = false;   // دفعنا نحن يمرّ بـ`mr_push_state` وهي تفحص التوكن

    const payload = {
      version,
      state: { state_data: stateData, scores, current_round: round, version }
    };
    room = Object.assign({}, room, { state: payload.state });
    if (channel) channel.send({ type: 'broadcast', event: 'state', payload });

    const data = await rpc('mr_push_state', {
      p_code: code, p_token: token(), p_state: stateData,
      p_scores: scores ?? null, p_round: round ?? null, p_version: version
    });

    // رُفضت لقِدَمها: غيرنا كتب قبلنا. نأخذ نسخته بدل أن نصرّ على نسختنا.
    if (data && !data.error && data.stale) {
      version = data.state?.version || version;
      adopt(data);
    }
    return data;
  }

  async function setStatus(status) {
    const data = await rpc('mr_set_status', { p_code: code, p_token: token(), p_status: status });
    if (!data.error) { adopt(data); ping('roster'); }
    return data;
  }

  async function setTeam(playerId, team) {
    const data = await rpc('mr_set_team', {
      p_code: code, p_token: token(), p_player_id: playerId, p_team: team
    });
    if (!data.error) { adopt(data); ping('roster'); }
    return data;
  }

  async function setTeamScore(team, score) {
    const data = await rpc('mr_set_team_score', {
      p_code: code, p_token: token(), p_team: team, p_score: score
    });
    if (!data.error) ping('roster');
    return data;
  }

  async function kick(playerId) {
    const data = await rpc('mr_kick', {
      p_code: code, p_token: token(), p_player_id: playerId
    });
    if (!data.error) { adopt(data); ping('roster'); }
    return data;
  }

  /* ---------------------------------------------------------- الشات */

  async function fetchChat() {
    if (!code) return [];
    const data = await rpc('mr_chat', {
      p_code: code, p_token: token(), p_after: lastChatAt
    });
    if (data.error) return [];

    const msgs = data.messages || [];
    if (msgs.length) {
      // الدالة تُعيدها مرتّبة تصاعدياً، وآخرها هو أحدث ما عندنا
      lastChatAt = msgs[msgs.length - 1].created_at;
      onChat(msgs);
    }
    return msgs;
  }

  async function sendChat(text) {
    if (!code) return { error: 'no_room' };
    const data = await rpc('mr_send_chat', {
      p_code: code, p_token: token(), p_message: text
    });
    if (!data.error && data.message) {
      // نعرضها عندنا فوراً، ونُشعر الباقين ليسألوا الخادم
      lastChatAt = data.message.created_at;
      onChat([data.message]);
      ping('chat');
    }
    return data;
  }

  async function react(messageId, emoji) {
    if (!code) return { error: 'no_room' };
    const data = await rpc('mr_react', {
      p_code: code, p_token: token(),
      p_message_id: String(messageId), p_emoji: emoji
    });
    if (!data.error) {
      lastChatAt = null;      // نعيد جلب الدفعة لتصل التفاعلات المحدَّثة
      await fetchChat();
      ping('chat');
    }
    return data;
  }

  /* ---------------------------------------------------------- قراءة */

  return {
    createRoom, joinRoom, leave, poll,
    pushState, setStatus, setTeam, setTeamScore, kick,
    sendChat, fetchChat, react,
    unsubscribe,

    token,
    isIn()      { return !!code; },
    room()      { return room; },
    code()      { return code; },
    meId()      { return meId; },
    isHost()    { return isHost; },
    players()   { return (room && room.players) || []; },
    state()     { return (room && room.state) || null; },
    resetChatCursor() { lastChatAt = null; },

    set onRoom(fn)  { onRoom = fn; },
    set onChat(fn)  { onChat = fn; },
    set onError(fn) { onError = fn; },
  };
})();
