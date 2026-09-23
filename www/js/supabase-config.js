/* ============================= SUPABASE CONFIGURATION ============================= */

// ⚠️ بيانات Supabase من Project Settings
const SUPABASE_URL = "https://rqcltlleqpppeywxbkpo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Wtm3EsnJl5CGa8or1egt1g_ZLj_qw6N";

// تهيئة Supabase
let supa = null;

function initSupabase() {
  try {
    if (typeof supabase === 'undefined') {
      console.warn('Supabase library not loaded');
      return false;
    }

    supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase initialized');
    return true;
  } catch (error) {
    console.error('❌ Supabase initialization failed:', error);
    return false;
  }
}

// محاولة الاتصال بـ Supabase
async function testSupabaseConnection() {
  if (!supa) return false;

  try {
    // ⚠️ نفحص `game_settings` لا `categories`: جدول `categories` لا وجود له
    // في أي من ملفات الإعداد، فكان الفحص يفشل دائماً بـ 404 ويُظهر
    // «📴 وضع محلي» حتى والمزامنة تعمل فعلاً — مؤشّر يكذب على اللاعب.
    // `game_settings` موجود، وقراءته مفتوحة للجميع بالسياسة، فهو الفحص الصحيح.
    const { error } = await supa.from('game_settings').select('id').limit(1);

    if (error) {
      console.warn('⚠️ Supabase connection warning:', error.message);
      return false;
    }

    console.log('✅ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection test failed:', error);
    return false;
  }
}

// محاولة الاتصال عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  if (initSupabase()) {
    testSupabaseConnection().then(connected => {
      if (connected) {
        setSyncStatus('synced');
      } else {
        setSyncStatus('offline');
      }
    });
  }
});

/* ============================= CLOUD SYNC FUNCTIONS ============================= */

function setSyncStatus(status) {
  const el = document.getElementById('syncStatus');
  if (!el) return;

  switch (status) {
    case 'synced':
      el.textContent = '☁️ متزامن';
      el.style.color = 'var(--teamA)';
      break;
    case 'syncing':
      el.textContent = '🔄 جاري المزامنة...';
      el.style.color = 'var(--muted)';
      break;
    case 'error':
      el.textContent = '⚠️ خطأ بالمزامنة';
      el.style.color = 'var(--clay)';
      break;
    default:
      el.textContent = '📴 وضع محلي';
      el.style.color = 'var(--muted)';
  }
}

// دالة عامة للحصول على البيانات من Supabase
async function getFromSupabase(table, query = null) {
  if (!supa) return null;

  try {
    let qb = supa.from(table).select('*');

    if (query) {
      Object.keys(query).forEach(key => {
        qb = qb.eq(key, query[key]);
      });
    }

    const { data, error } = await qb;

    if (error) {
      console.error(`Error fetching ${table}:`, error);
      return null;
    }

    return data;
  } catch (error) {
    console.error(`Exception fetching ${table}:`, error);
    return null;
  }
}

// دالة عامة لحفظ البيانات على Supabase
async function saveToSupabase(table, record) {
  if (!supa) {
    console.warn('Supabase not initialized');
    return false;
  }

  try {
    setSyncStatus('syncing');

    const { data, error } = await supa
      .from(table)
      .upsert([record], { onConflict: 'id' });

    if (error) {
      console.error(`Error saving to ${table}:`, error);
      setSyncStatus('error');
      return false;
    }

    setSyncStatus('synced');
    return true;
  } catch (error) {
    console.error(`Exception saving to ${table}:`, error);
    setSyncStatus('error');
    return false;
  }
}

// دالة لحذف بيانات من Supabase
async function deleteFromSupabase(table, id) {
  if (!supa) return false;

  try {
    setSyncStatus('syncing');

    const { error } = await supa.from(table).delete().eq('id', id);

    if (error) {
      console.error(`Error deleting from ${table}:`, error);
      setSyncStatus('error');
      return false;
    }

    setSyncStatus('synced');
    return true;
  } catch (error) {
    console.error(`Exception deleting from ${table}:`, error);
    setSyncStatus('error');
    return false;
  }
}

// الاستماع لتغييرات البيانات (Realtime)
function subscribeToTable(table, callback) {
  if (!supa) return null;

  return supa
    .channel(`${table}_changes`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: table },
      payload => callback(payload)
    )
    .subscribe();
}

// إيقاف الاستماع
function unsubscribeFromTable(subscription) {
  if (subscription) {
    supa?.removeChannel(subscription);
  }
}
