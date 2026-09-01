/* ============================= SERVICE WORKER ============================= */
/*
  يجعل اللعبة تُثبَّت على الجوال وتعمل بلا إنترنت في الوضع المحلي.

  ⚠️ **الشبكة أولاً ثم الكاش** — لا العكس.

  هذا المشروع يعتمد كلياً على `?v=` في `index.html` لإيصال أي تعديل للمتصفحات
  (راجع الملاحظة 8). سياسة «الكاش أولاً» كانت ستُبطل ذلك: يبقى اللاعب على
  نسخة قديمة من JS إلى الأبد، بلا رسالة خطأ، ويستحيل عليه تشخيصها. ومع
  الشبكة أولاً يظل المتصل يأخذ الأحدث دائماً، ولا يُستعمل الكاش إلا حين
  ينقطع الاتصال — وهو بالضبط ما نريده.

  ولا نلمس نداءات Supabase إطلاقاً: مزامنة وحالة لعب لحظية، وتقديم نسخة
  مخزّنة منها أسوأ من الفشل الصريح.
*/

// ارفع الرقم عند تغيير قائمة `SHELL` — `activate` يمسح ما سواه فيُعاد التخزين نظيفاً
const CACHE = 'raja-v19';

// هيكل التطبيق: ما يكفي لفتح اللعبة والوضع المحلي بلا شبكة
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/responsive.css',
  './js/supabase-config.js',
  './js/utils.js',
  './js/auth.js',
  './js/bans.js',
  './js/friends.js',
  './js/profile.js',
  './js/game.js',
  './js/admin.js',
  './js/sync.js',
  './js/rooms.js',
  './js/chat.js',
  './assets/logo.png',
  './data/questions.json',
  './data/questions-part2.json',
  './data/questions-part2-continued.json',
  './data/questions-part3.json',
  './data/questions-part4.json',
  './data/questions-part5.json',
  './data/questions-part6.json',
  './data/questions-part7.json',
  './data/questions-part8.json',
  './data/questions-part9.json',
  './data/questions-part10.json',
  './data/questions-part11.json',
  './data/questions-part12.json',
  './data/questions-part13.json',
  './data/questions-part14.json',
  './data/questions-part15.json',
  './data/retired-questions.json',
  './data/retired-categories.json',

  // صور «منو المشهور»: الفئة كلها صور، فبدونها تنكسر تماماً بلا إنترنت
  './assets/famous/ronaldo.jpg',
  './assets/famous/mbs.jpg',
  './assets/famous/mohammed-abdu.jpg',
  './assets/famous/mr-bean.jpg',
  './assets/famous/zayed.jpg',
  './assets/famous/elon-musk.jpg',
  './assets/famous/einstein.jpg',
  './assets/famous/putin.jpg',
  './assets/famous/steve-jobs.jpg',
  './assets/famous/saddam.jpg',
  './assets/famous/ali-clay.jpg',
  './assets/famous/churchill.jpg',
  './assets/famous/saud-alfaisal.jpg',
  './assets/famous/mo-salah.jpg',
  './assets/famous/mussolini.jpg',

  // شعارات عالمية بالصور — نفس السبب
  './assets/logos/apple.jpg',
  './assets/logos/premier-league.jpg',
  './assets/logos/disney.jpg',
  './assets/logos/microsoft.jpg',
  './assets/logos/netflix.jpg',
  './assets/logos/osn.jpg',
  './assets/logos/adidas.jpg',
  './assets/logos/lg.jpg',
  './assets/logos/playstation.jpg',
  './assets/logos/puma.jpg',
  './assets/logos/tesla.jpg',
  './assets/logos/gucci.jpg',
  './assets/logos/windows.jpg',
  './assets/logos/paypal.jpg',
  './assets/logos/lacoste.jpg',
  './assets/logos/nestle.jpg',
  './assets/logos/nvidia.jpg',

  // شعارات سعودية بالصور — الفئة صارت صوراً بحتة، فبدونها تنكسر بلا إنترنت
  './assets/sa-logos/aramco.jpg',
  './assets/sa-logos/alrajhi.jpg',
  './assets/sa-logos/saudi-riyal.jpg',
  './assets/sa-logos/almarai.jpg',
  './assets/sa-logos/jarir.jpg',
  './assets/sa-logos/moe.jpg',
  './assets/sa-logos/moh.jpg',
  './assets/sa-logos/red-sea.jpg',
  './assets/sa-logos/snb.jpg',
  './assets/sa-logos/sec.jpg',
  './assets/sa-logos/alinma.jpg',
  './assets/sa-logos/sipchem.jpg',
  './assets/sa-logos/mobily.jpg',
  './assets/sa-logos/mof.jpg',
  './assets/sa-logos/riyad-bank.jpg',
  './assets/sa-logos/tabby.jpg',
  './assets/sa-logos/roshn.jpg',
  './assets/sa-logos/maaden.jpg',
  './assets/sa-logos/mofa.jpg',
  './assets/sa-logos/mos.jpg',
  './assets/sa-logos/mot.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // ملف واحد مفقود يجب ألا يُفشل التثبيت كله
    await Promise.all(SHELL.map(url =>
      cache.add(url).catch(() => { /* نتجاوزه */ })
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase وأي نطاق خارجي: لا اعتراض إطلاقاً
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // نخزّن الناجح فقط — وصفحة خطأ مخزّنة أسوأ من لا شيء
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      // انقطع الاتصال: نقدّم آخر نسخة ناجحة
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;

      // تنقّل بلا نسخة مخزّنة → صفحة البداية
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html', { ignoreSearch: true });
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
