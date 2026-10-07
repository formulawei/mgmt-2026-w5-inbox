/* 瀏覽器全流程測試。需要 Playwright 與 Chromium：
   npm i playwright && npx playwright install chromium && node test_w5_e2e.js
   截圖與下載檔會放在系統暫存資料夾。 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const URL0 = 'file://' + path.resolve(__dirname, 'index.html');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'w5-e2e-'));
const ZH = '我們會先檢查假設與證據，再決定投入的順序。';
const PLAN = [['data', 'talent'], ['pilot', 'listen'], ['platformSale', 'coop', 'service']];
const BELIEF = ['unsure', 'dh', 'dh'];
const T0 = ['assumption', 'external', 'resource', 'time', 'trigger'];
const CJK = /[㐀-鿿]/;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const inView = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; }, sel);
  await page.goto(URL0);

  // 1. 未填欄位就按開始：錯誤要出現在畫面上，而且不會進入回合
  assert(await page.locator('[data-view=round]').isDisabled());
  await page.locator('#start').click();
  assert((await page.locator('#err-start').textContent()).includes('4'));
  assert(await inView('#toast.on'), '錯誤提示應出現在可視範圍');
  assert.strictEqual(await page.locator('textarea.bad').count(), 4);
  assert.strictEqual(await page.evaluate(() => state.brief.started), undefined);

  // 2. 暖身分類
  await page.locator('[data-act=warm][data-i="0"][data-v=in]').click();
  await page.locator('[data-act=warm][data-i="1"][data-v=in]').click();
  assert.strictEqual(await page.locator('.wcard.right').count(), 1);
  assert.strictEqual(await page.locator('.wcard.wrong').count(), 1);

  // 3. 回溯規劃後開始
  for (const k of ['individual', 'vision', 'milestone', 'now']) await page.locator('#f-' + k).fill(ZH);
  assert.strictEqual(await page.locator('#err-start').textContent(), '');
  await page.locator('#start').click();
  await page.reload();
  assert(await page.locator('[data-view=round]').isEnabled(), '重新載入後應保留進度');
  assert.strictEqual(await page.evaluate(() => state.view), 'round');

  for (let r = 1; r <= 3; r++) {
    for (const id of PLAN[r - 1]) await page.locator(`[data-action=${id}]`).check();
    if (r === 1) {
      assert(await page.locator('[data-action=pilot]').isDisabled(), '前置能力未成熟時不可選');
      await page.locator('[data-action=service]').check();
      assert((await page.locator('#budget').getAttribute('class')).includes('err'));
      assert((await page.locator('#budget').textContent()).includes('人力'));
      assert.strictEqual(await page.locator('#m-slots i.over').count(), 6);
      await page.locator('#baseline').click();
      assert((await page.locator('#err-baseline').textContent()).includes('人力'), '超過人力時不能保存初判');
      await page.locator('[data-action=service]').uncheck();
      assert.strictEqual(await page.locator('#m-eng').textContent(), '5 / 6');
      assert.strictEqual(await page.locator('#m-close').textContent(), '74–84');
      assert.strictEqual(await page.locator('#capmap .node.planned').count(), 2);
      // 未選情境判斷、未填理由都要擋下
      await page.locator('#baseline').click();
      assert((await page.locator('#err-baseline').textContent()).includes('未來'));
    }
    await page.locator(`[data-act=belief][data-id=${BELIEF[r - 1]}]`).click();
    if (r === 1) assert.strictEqual(await page.locator('#err-baseline').textContent(), '', '選好情境判斷後錯誤訊息應清除');
    if (r === 2) { assert.strictEqual(await page.locator('#m-base').textContent(), '+18', '第 2 回合起只顯示已知的基本營運淨流入'); assert.strictEqual(await page.locator('#m-close').textContent(), '60'); }
    if (r === 1) { await page.locator('#baseline').click(); assert.strictEqual(await page.locator('textarea.bad').count(), 5); }
    for (const k of T0) await page.locator('#f-' + k).fill(ZH);
    await page.locator('#baseline').click();
    const prompt = await page.locator('#prompt').textContent();
    const names = await page.evaluate(() => A.map(a => a.name[0]));
    assert.strictEqual(names.length, 11);
    for (const n of names) assert(prompt.includes(n), '提示詞缺少行動：' + n);
    assert(!prompt.includes('{"') && !prompt.includes('undefined'), '提示詞不應出現原始 JSON 或 undefined');
    assert(prompt.includes(ZH));
    if (r === 1) {
      await page.locator('#commit').click();
      assert((await page.locator('#err-commit').textContent()).includes('AI'), '沒有 AI 回答時不能提交');
      // T0 保存後調整行動，初判不被覆蓋
      await page.locator('[data-action=listen]').check();
      assert((await page.locator('#diff').textContent()).includes('新增'));
      assert.strictEqual(await page.evaluate(() => state.draft.baseline.selected.length), 2);
      await page.locator('[data-action=listen]').uncheck();
    }
    await page.locator('#f-ai').fill('AI：建議估計一個不存在的市場機率。');
    await page.locator('#f-judgment').fill(ZH);
    await page.locator('#f-finalRationale').fill(ZH);
    await page.locator('#commit').click();
    assert.strictEqual(await page.evaluate(() => state.records.length), r);
    assert.strictEqual(await page.evaluate(() => state.view), 'history');
    assert.strictEqual(await page.locator('#settle-' + r + ' svg.chart').count(), 1, '結算要有瀑布圖');
    if (r === 1) await page.screenshot({ path: path.join(OUT, 'settle-r1.png'), fullPage: true });
    if (r < 3) await page.locator('#nextRound').first().click();
  }

  // 4. 成果頁；換頁後鍵盤焦點落在新頁面的標題
  await page.locator('#toFinal').first().click();
  assert.strictEqual(await page.evaluate(() => document.activeElement.tagName), 'H1');
  assert.strictEqual(await page.evaluate(() => simulate(picks(), state.world).sim.cash), 120);
  assert.strictEqual(await page.evaluate(() => simulate(picks(), state.world).sim.caps.skill), 2);
  let main = await page.locator('main').textContent();
  for (const t of ['現金不足', '機會成本', '期限之外', '策略規劃的本質']) assert(main.includes(t), '成果頁缺少：' + t);
  assert(await page.locator('[data-view=round]').isDisabled());
  // 逆向歸納逐步求解
  for (let i = 0; i < 3; i++) await page.locator('[data-act=treeNext]').click();
  assert((await page.locator('#tree').textContent()).includes('max = +2'));
  await page.locator('[data-act=treeWorld][data-id=tc]').click();
  for (let i = 0; i < 3; i++) await page.locator('[data-act=treeNext]').click();
  assert((await page.locator('#tree').textContent()).includes('max = 0'));
  // 路徑試算不得更動已提交的紀錄
  await page.locator('[data-act=labWorld][data-id=dc]').click();
  assert((await page.locator('#lab').textContent()).includes('第 3 回合不可行'));
  await page.locator('[data-act=labPick][data-r="2"][data-id=platformSale]').click();
  assert.strictEqual(await page.locator('#lab .lab-sum.err').count(), 0, '調整後的試算路徑應可行');
  assert.deepStrictEqual(await page.evaluate(() => picks()), PLAN);
  await page.locator('#f-exit').fill('</script><img src=x onerror="window.pwned=1">');
  await page.locator('#f-cmp').fill(ZH);
  await page.screenshot({ path: path.join(OUT, 'final-desktop.png'), fullPage: true });

  // 5. 語言切換：英文版各分頁不應殘留中文（使用者輸入與語言按鈕除外）
  await page.locator('#langBtn').click();
  assert.strictEqual(await page.locator('html').getAttribute('lang'), 'en');
  for (const v of ['brief', 'history', 'final', 'teacher', 'sources']) {
    await page.locator(`[data-view=${v}]`).first().click();
    const left = await page.evaluate(z => {
      const c = document.querySelector('main').cloneNode(true);
      c.querySelectorAll('textarea,details').forEach(e => e.remove());
      return c.innerText.split('\n').filter(l => /[㐀-鿿]/.test(l) && !l.includes(z.slice(0, 6)));
    }, ZH);
    assert.deepStrictEqual(left, [], '英文版「' + v + '」殘留中文：' + left.slice(0, 3).join(' | '));
  }
  assert(!CJK.test(await page.locator('#nav').textContent()));
  assert.strictEqual(await page.evaluate(() => need()), 20, '英文版每欄至少 20 個字元');
  await page.reload();
  assert.strictEqual(await page.evaluate(() => state.records.length), 3);
  assert.strictEqual(await page.evaluate(() => state.lang), 'en');
  await page.locator('#langBtn').click();

  // 6. 四種匯出
  const files = {};
  for (const id of ['exportJson', 'exportMd', 'exportHtml', 'downloadApp']) {
    const ev = page.waitForEvent('download');
    await page.locator('#' + id).click();
    const d = await ev; files[id] = path.join(OUT, d.suggestedFilename()); await d.saveAs(files[id]);
  }
  const exported = JSON.parse(fs.readFileSync(files.exportJson, 'utf8'));
  assert.strictEqual(exported.version, 2);
  assert.strictEqual(exported.records.length, 3);
  assert.strictEqual(exported.final.exit, '</script><img src=x onerror="window.pwned=1">');
  const md = fs.readFileSync(files.exportMd, 'utf8');
  assert(md.includes('84') && md.includes('120') && md.includes('數位擴張') && !md.includes('{"'));

  // 7. 可繼續操作的網頁：內含紀錄、不執行使用者輸入的標記
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p2 = await c2.newPage(); p2.on('pageerror', e => errors.push('portable: ' + e));
  await p2.goto('file://' + files.downloadApp);
  assert.strictEqual(await p2.evaluate(() => state.final.exit), exported.final.exit);
  assert.strictEqual(await p2.evaluate(() => window.pwned), undefined);
  assert.strictEqual(await p2.evaluate(() => simulate(picks(), state.world).sim.cash), 120);
  // 無效檔案不得覆蓋進度
  await p2.locator('#importFile').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"bad":1}') });
  await p2.waitForSelector('#toast.on.err');
  assert.strictEqual(await p2.evaluate(() => state.records.length), 3);
  const tampered = JSON.parse(JSON.stringify(exported)); tampered.records[0].selected = ['pilot'];
  await p2.locator('#importFile').setInputFiles({ name: 'tampered.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tampered)) });
  await p2.waitForTimeout(200);
  assert.deepStrictEqual(await p2.evaluate(() => picks()[0]), ['data', 'talent'], '前置能力不符的紀錄應拒絕還原');

  // 8. 手機寬度：各分頁沒有水平溢出；回合頁的資源面板固定在底部
  for (const v of ['brief', 'history', 'final', 'teacher', 'sources']) {
    await p2.locator(`[data-view=${v}]`).first().click();
    assert(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '手機版水平溢出：' + v);
  }
  await p2.screenshot({ path: path.join(OUT, 'sources-mobile.png'), fullPage: true });

  // 9. 另一個瀏覽器環境還原 JSON；並測試第 1 版格式的備份
  const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p3 = await c3.newPage(); p3.on('pageerror', e => errors.push('restore: ' + e)); p3.on('dialog', d => d.accept());
  await p3.goto(URL0 + '#w=tc');
  assert.strictEqual(await p3.evaluate(() => state.world), 'tc', '網址參數應設定事件路徑');
  for (const k of ['individual', 'vision', 'milestone', 'now']) await p3.locator('#f-' + k).fill(ZH);
  await p3.locator('#start').click();
  assert(await p3.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '手機版回合頁水平溢出');
  assert.strictEqual(await p3.evaluate(() => getComputedStyle(document.getElementById('panel')).position), 'fixed');
  await p3.locator('[data-action=service]').check();
  await p3.screenshot({ path: path.join(OUT, 'round-mobile.png') });
  await p3.locator('[data-view=teacher]').click();
  await p3.locator('[data-act=world][data-id=dh]').click({ force: true });
  assert.strictEqual(await p3.evaluate(() => state.world), 'tc', '開始後事件路徑不得更改');
  await p3.locator('#importFile').setInputFiles(files.exportJson);
  await p3.waitForFunction(() => state.records.length === 3);
  assert.strictEqual(await p3.evaluate(() => state.world), 'dh');
  assert.strictEqual(await p3.evaluate(() => simulate(picks(), state.world).sim.cash), 120);
  const why = Object.fromEntries(T0.map(k => [k, ZH]));
  const v1 = { version: 1, lang: 'zh', view: 'history', world: 'dh', brief: { vision: ZH, started: 'yes' }, round: 2, final: {},
    records: [{ selected: PLAN[0], text: { ai: 'x', judgment: ZH, finalRationale: ZH }, baseline: { selected: PLAN[0], text: why }, offline: false }],
    draft: { selected: ['pilot'], text: {}, baseline: null, offline: false } };
  await p3.locator('#importFile').setInputFiles({ name: 'v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(v1)) });
  await p3.waitForFunction(() => state.records.length === 1);
  assert.strictEqual(await p3.evaluate(() => state.version), 2);
  assert.deepStrictEqual(await p3.evaluate(() => state.draft.selected), ['pilot']);

  // 10. 重新開始
  await p3.locator('#resetGame').click();
  assert.strictEqual(await p3.evaluate(() => state.records.length), 0);
  assert.strictEqual(await p3.evaluate(() => state.view), 'brief');

  // 11. 回歸測試：物件原型上的名稱不得被當成情境或行動；過長文字不得清空進度；網址參數與分頁同步
  const c4 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p4 = await c4.newPage(); p4.on('pageerror', e => errors.push('regress: ' + e)); p4.on('dialog', d => d.accept());
  await p4.goto(URL0 + '#w=constructor');
  assert.strictEqual(await p4.evaluate(() => state.world), 'dh');
  for (const bad of ['constructor', '__proto__', 'toString']) {
    const f = JSON.parse(JSON.stringify(exported)); f.world = bad;
    await p4.locator('#importFile').setInputFiles({ name: 'w.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(f)) });
    await p4.waitForSelector('#toast.on.err');
    assert.strictEqual(await p4.evaluate(() => state.world), 'dh', '不應接受情境 ' + bad);
    assert.strictEqual(await p4.evaluate(() => state.records.length), 0);
  }
  const f2 = JSON.parse(JSON.stringify(exported)); f2.records[0].selected = ['data', 'talent', 'constructor'];
  await p4.locator('#importFile').setInputFiles({ name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(f2)) });
  await p4.waitForTimeout(200);
  assert.strictEqual(await p4.evaluate(() => state.records.length), 0, '不應接受不存在的行動代號');
  const f3 = JSON.parse(JSON.stringify(exported)); f3.records[1].text = {};
  await p4.locator('#importFile').setInputFiles({ name: 'i.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(f3)) });
  await p4.waitForTimeout(200);
  assert.strictEqual(await p4.evaluate(() => state.records.length), 0, '缺少 T2 理由的回合不應還原');
  // 網址參數：同一分頁改變 # 參數也要生效
  await p4.evaluate(() => { location.hash = 'w=tc&lang=en'; });
  await p4.waitForFunction(() => state.world === 'tc' && state.lang === 'en');
  await p4.locator('[data-view=teacher]').click();
  await p4.locator('[data-act=world][data-id=th]').click();
  await p4.reload();
  assert.strictEqual(await p4.evaluate(() => state.world), 'th', '開始前在頁面上改的路徑，重新載入後應保留');
  await p4.locator('#langBtn').click();
  // 過長文字：截斷保留，重新載入兩次後進度仍在
  await p4.locator('#importFile').setInputFiles(files.exportJson);
  await p4.waitForFunction(() => state.records.length === 3);
  await p4.evaluate(() => { state.final.exit = 'x'.repeat(120000); state.records[0].baseline.text.time = '時'.repeat(120000); save(); });
  await p4.reload(); await p4.reload();
  assert.strictEqual(await p4.evaluate(() => state.records.length), 3, '過長文字不應讓進度被清空');
  assert.strictEqual(await p4.evaluate(() => state.final.exit.length), 50000);
  // 兩個分頁：另一個分頁提交後，這個分頁同步，不會用舊狀態覆蓋
  const p5 = await c4.newPage(); p5.on('pageerror', e => errors.push('tab2: ' + e)); p5.on('dialog', d => d.accept());
  await p5.goto(URL0);
  await p5.locator('#resetGame').click();
  await p4.waitForFunction(() => state.records.length === 0);
  await p4.locator('[data-view=brief]').click();
  await p4.locator('#f-individual').fill(ZH);
  await p5.waitForFunction(z => state.brief.individual === z, ZH);
  await c4.close();

  assert.deepStrictEqual(errors, []);
  console.log('PASS e2e: 欄位驗證與可見的錯誤提示、暖身、三回合 T0→T1→T2、資源限制、提示詞 11 項行動、結算圖、現金 120、逆向歸納、路徑試算、中英文切換無殘留、四種匯出、可攜版防注入、JSON 還原與拒絕、第 1 版備份、網址路徑參數、手機版面、重新開始、原型名稱防護、過長文字、分頁同步。');
  console.log('截圖與下載檔：' + OUT);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
