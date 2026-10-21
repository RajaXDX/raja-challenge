// يلتقط لقطات المتجر بمقاسات آيفون الدقيقة. يحتاج: npm i puppeteer-core@23.11.1
// وسيرفر محلي على 8152 للمستودع. التشغيل: node tools/store-shots.js store/screenshots-out
const puppeteer = require('puppeteer-core');
const OUT = process.argv[2];
const DEVICES = [
  { tag: '6.9', w: 440, h: 956 },   // 1320×2868
  { tag: '6.5', w: 414, h: 896 },   // 1242×2688
];
const CATS = ['السعودية','معلومات عامة','جغرافيا 🌎','عالم الحيوان','الالغاز 🧩','لهجات سعودية'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--hide-scrollbars'] });
  for (const d of DEVICES) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
    await page.setViewport({ width: d.w, height: d.h, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:8152/', { waitUntil: 'networkidle0' });
    await sleep(2500);
    const snap = async (n) => { await page.screenshot({ path: `${OUT}/${d.tag}-${n}.png` }); console.log(d.tag, n); };

    // ١. اللوحة
    await page.evaluate((CATS) => {
      selectedCats = CATS.map(n => CATEGORIES.find(c => c.name === n));
      teamSetup.A.name = 'الصقور'; teamSetup.B.name = 'النخبة';
      startGame();
      stateUsed[0][0][0] = true; stateUsed[0][1][0] = true; stateUsed[0][2][1] = true;
      stateUsed[0][3][0] = true; stateUsed[0][4][2] = true;
      scores = { A: 750, B: 500 }; activeTeam = 'B';
      updateGameUI(); renderBoard(); renderTurnIndicator?.(); scrollTo(0, 0);
    }, CATS);
    await sleep(3500);
    await page.evaluate(() => document.querySelectorAll('.toast, .announce, .start-announce').forEach(e => e.remove()));
    await snap('1-board');

    // ٢. سؤال مفتوح
    await page.evaluate(() => openQuestion(0, 1));
    await sleep(1500);
    await snap('2-question');
    await page.evaluate(() => { stopQuestionTimer(); closeQuestion(); });
    await sleep(600);

    // ٣. اختيار الفئات
    await page.evaluate(() => { showScreen('screen-categories'); renderCatGrid(); updateSelStatus(); scrollTo(0, 0); });
    await sleep(1200);
    await snap('3-categories');

    // ٤. النتيجة النهائية
    await page.evaluate(() => { scores = { A: 2150, B: 1700 }; showEndScreen(); scrollTo(0, 0); });
    await sleep(5000);
    await page.evaluate(() => document.querySelectorAll('.confetti, .confetti-piece, [class*=confetti]').forEach(e => e.remove()));
    await sleep(300);
    await snap('4-end');
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
