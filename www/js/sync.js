/* ============================= CLOUD SYNC FUNCTIONS ============================= */

let syncSubscription = null;

// تدمج فئات السحابة مع الفئات المحلية بدل استبدالها.
// السبب: كانت السحابة تكتب فوق القائمة بالكامل، فأي شخص يصل للوحة الإدارة
// (ورمزها كان مكشوفاً في الكود) يقدر يمسح فئات كل اللاعبين لحظياً.
// الدمج يعني أن الحذف لا ينتشر، وأقصى ما يحدث هو إضافة فئات جديدة.
function mergeCategories(incoming) {
  if (!Array.isArray(incoming)) return 0;

  let added = 0;
  incoming.forEach(cat => {
    const name = (cat?.name || '').trim();
    if (!name) return;
    if (CATEGORIES.some(c => c.name === name)) return;
    CATEGORIES.push({ name, ic: cat.ic || '✨' });
    added++;
  });

  return added;
}

// دالة المزامنة الرئيسية
async function pushToCloud() {
  if (!supa) {
    log('Supabase not connected', 'warning');
    return false;
  }

  try {
    setSyncStatus('syncing');

    // تصدير الفئات
    const { error: catError } = await supa
      .from('game_settings')
      .upsert(
        {
          id: 'categories',
          data: CATEGORIES,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'id' }
      );

    if (catError) throw catError;

    // تصدير النقاط
    const { error: pointsError } = await supa
      .from('game_settings')
      .upsert(
        {
          id: 'points',
          data: POINTS,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'id' }
      );

    if (pointsError) throw pointsError;

    // تصدير بنك الأسئلة
    const { error: bankError } = await supa
      .from('game_settings')
      .upsert(
        {
          id: 'question_bank',
          data: QBANK,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'id' }
      );

    if (bankError) throw bankError;

    setSyncStatus('synced');
    log('Data synced to cloud successfully', 'success');
    return true;
  } catch (error) {
    console.error('Cloud sync failed:', error);
    setSyncStatus('error');
    log('Cloud sync failed: ' + error.message, 'error');
    return false;
  }
}

// سحب البيانات من السحابة عند البداية
async function pullFromCloudOnce() {
  if (!supa) {
    log('Supabase not connected', 'warning');
    return;
  }

  try {
    setSyncStatus('syncing');

    // الثلاثة بالتوازي بدل التسلسل (كانت ثلاث رحلات شبكة متتابعة قبل ظهور اللعبة)
    const [
      { data: catData, error: catError },
      { data: pointsData, error: pointsError },
      { data: bankData, error: bankError }
    ] = await Promise.all([
      supa.from('game_settings').select('data').eq('id', 'categories').single(),
      supa.from('game_settings').select('data').eq('id', 'points').single(),
      supa.from('game_settings').select('data').eq('id', 'question_bank').single()
    ]);

    if (!catError && Array.isArray(catData?.data) && catData.data.length > 0) {
      mergeCategories(catData.data);
      saveJSON('mr_categories', CATEGORIES);
    }

    if (!pointsError && Array.isArray(pointsData?.data) && pointsData.data.length > 0) {
      POINTS = pointsData.data;
      saveJSON('mr_points', POINTS);
    }

    // ندمج بيانات السحابة داخل البنك الحالي بدل استبداله،
    // حتى لا تمحو نسخة سحابية قديمة الأسئلة المحمّلة من ملفات المشروع
    if (!bankError && bankData?.data && Object.keys(bankData.data).length > 0) {
      mergeIntoQuestionBank(QBANK, bankData.data);
      syncCategoriesWithBank();
      saveJSON('mr_bank', QBANK);
      saveJSON('mr_categories', CATEGORIES);
    }

    setSyncStatus('synced');
    log('Data pulled from cloud successfully', 'success');
  } catch (error) {
    console.error('Cloud pull failed:', error);
    setSyncStatus('error');
    log('Cloud pull failed: ' + error.message, 'error');
  }
}

// الاستماع للتغييرات في الوقت الفعلي
function listenToCloudChanges() {
  if (!supa) return;

  // الاستماع لتغييرات game_settings
  syncSubscription = supa
    .channel('game_settings_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_settings' },
      (payload) => {
        if (payload.new) {
          const { id, data } = payload.new;

          switch (id) {
            case 'categories':
              if (Array.isArray(data) && data.length > 0) {
                mergeCategories(data);
                saveJSON('mr_categories', CATEGORIES);
                if (document.querySelector('#screen-categories.active')) {
                  renderCatGrid();
                }
              }
              break;

            case 'points':
              if (Array.isArray(data) && data.length > 0) {
                POINTS = data;
                saveJSON('mr_points', POINTS);
                if (document.querySelector('#screen-game.active')) {
                  renderBoard();
                }
              }
              break;

            case 'question_bank':
              if (data && Object.keys(data).length > 0) {
                mergeIntoQuestionBank(QBANK, data);
                syncCategoriesWithBank();
                saveJSON('mr_bank', QBANK);
                saveJSON('mr_categories', CATEGORIES);
                updateTotalStats();
              }
              break;
          }

          setSyncStatus('synced');
          log('Cloud data updated', 'success');
        }
      }
    )
    .subscribe();

  log('Listening to cloud changes', 'success');
}

// إيقاف الاستماع
function stopListeningToCloud() {
  if (syncSubscription) {
    supa?.removeChannel(syncSubscription);
    syncSubscription = null;
  }
}

// تهيئة المزامنة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', async () => {
  if (supa) {
    // جلب البيانات الأولية
    await pullFromCloudOnce();

    // بعد سحب السحابة نعيد دمج ملفات المشروع حتى لا تضيع الأسئلة الجديدة
    // إذا وصلت بيانات السحابة بعد التحميل الأولي
    await syncBundledQuestionBank();

    // بدء الاستماع للتغييرات
    listenToCloudChanges();

    // نحفظ كود الروم من الرابط قبل البوابة، وإلا ضاع عند طلب تسجيل الدخول
    stashPendingRoomCode();

    // بوابة الحساب: بلا حساب لا دخول لروم ولا استعادة جلسة
    const allowed = await initAuthGate();
    if (!allowed) { updateTotalStats(); trackVisitOnce(); return; }

    // رابط روم في العنوان له الأولوية على استعادة الجلسة القديمة
    try {
      const fromLink = await handleRoomLinkOnLoad();
      if (!fromLink) await restoreRoomSession();
    } catch (e) {
      console.warn('تعذّرت معالجة رابط/جلسة الروم:', e);
    }
  }

  updateTotalStats();
  trackVisitOnce();
});

// إيقاف الاستماع عند غلق الصفحة
window.addEventListener('beforeunload', () => {
  stopListeningToCloud();
});

/* ============================= ONLINE MODE SYNC ============================= */

// ملاحظة: الاشتراك في تحديثات الروم (الحالة/الشات/اللاعبين) يتم في مكان واحد فقط:
// subscribeToRoom() داخل js/rooms.js — كان هنا اشتراك ثانٍ على نفس الجداول
// يسبب تنفيذ كل حدث مرتين (كل رسالة شات كانت تظهر مكرّرة).

/* ============================= ANALYTICS ============================= */
/* قياس بسيط لمعرفة أثر النشر. لا يُسجَّل أي شيء يخصّ هوية اللاعب —
   لا اسم ولا رسالة ولا معرّف جهاز. فقط الحدث ومصدر الزيارة ونوع الجهاز.
   يتطلّب تشغيل supabase-analytics.sql مرة واحدة. */

function detectVisitSource() {
  // ?src= له الأولوية (نضعه في الروابط التي ننشرها)، ثم المُحيل
  const explicit = new URLSearchParams(location.search).get('src');
  if (explicit) return explicit.slice(0, 40);

  const ref = document.referrer || '';
  if (!ref) return 'direct';

  try {
    const host = new URL(ref).hostname.replace(/^www\./, '');
    const known = {
      'wa.me': 'whatsapp', 'whatsapp.com': 'whatsapp',
      'x.com': 'twitter', 't.co': 'twitter', 'twitter.com': 'twitter',
      'instagram.com': 'instagram', 'tiktok.com': 'tiktok',
      'snapchat.com': 'snapchat', 'youtube.com': 'youtube',
      'google.com': 'google'
    };
    for (const k in known) if (host.endsWith(k)) return known[k];
    return host.slice(0, 40);
  } catch (e) {
    return 'unknown';
  }
}

async function trackEvent(event, source = null) {
  if (!supa) return;

  try {
    await supa.from('app_events').insert({
      event,
      source: source || detectVisitSource(),
      device: window.innerWidth <= 768 ? 'mobile' : 'desktop'
    });
  } catch (e) {
    // القياس لا يجوز أن يعطّل اللعب أبداً
    console.debug('تعذّر تسجيل الحدث:', e?.message);
  }
}

// زيارة واحدة لكل جلسة تصفّح، لا لكل تحديث صفحة
function trackVisitOnce() {
  try {
    if (sessionStorage.getItem('mr_visit_tracked')) return;
    sessionStorage.setItem('mr_visit_tracked', '1');
  } catch (e) { /* التخزين محجوب — نسجّل على أي حال */ }
  trackEvent('visit');
}
