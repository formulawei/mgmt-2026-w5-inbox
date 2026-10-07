/* 模型測試：只需要 Node.js，不需要瀏覽器。執行：node test_w5_model.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/\/\*MODEL-START\*\/([\s\S]*?)\/\*MODEL-END\*\//);
assert(m, '找不到模型區塊');
const ctx = vm.createContext({ console });
vm.runInContext(m[1] + '\nthis.api={W,A,ACT,WORLD_IDS,payoff,startSim,mature,eligible,check,execute,simulate,trySimulate,bestExtension,BENCH,clone,totals,openActions};', ctx);
const { W, A, ACT, WORLD_IDS, payoff, startSim, mature, eligible, check, execute, simulate, trySimulate, bestExtension, BENCH, clone } = ctx.api;

/* vm 環境產生的陣列與主程式的原型不同，改以 JSON 字串比較 */
const eq = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);

const demo = [['data', 'talent'], ['pilot', 'listen'], ['platformSale', 'coop', 'service']];

// 1. 教師示範路徑的現金：84、60、120
const d = simulate(demo, 'dh');
eq(d.ledger.map(l => l.after.cash), [84, 60, 120]);
assert.strictEqual(d.sim.caps.skill, 2);

// 2. 成本、人力與各情境收入沿用原稿數值
const table = { data: [18, 3], talent: [16, 2], listen: [8, 1], service: [12, 2], pilot: [28, 3], modular: [30, 3], maint: [20, 2], platformSale: [24, 3], moduleSale: [18, 2], maintSale: [14, 2], coop: [10, 1] };
assert.strictEqual(A.length, 11);
for (const a of A) eq([a.cost, a.eng], table[a.id], a.id);
const pay = { service: [22, 16, 22, 16], platformSale: [54, 28, 18, 10], moduleSale: [36, 22, 36, 22], maintSale: [28, 34, 28, 34], coop: [20, 16, 28, 22] };
for (const [id, v] of Object.entries(pay)) eq(['dh', 'dc', 'th', 'tc'].map(w => payoff(ACT[id], w)), v, id);

// 3. 能力下一回合才成熟
const first = execute(startSim(), ['data', 'talent'], 1, 'dh');
assert.strictEqual(first.sim.caps.data, 0);
assert(check(['pilot'], first.sim), '尚未成熟時不應可選平台試辦');
mature(first.sim, 2);
assert.strictEqual(check(['pilot'], first.sim), '');

// 4. 人力與現金限制
assert(check(['data', 'talent', 'service'], startSim()), '人力 7 應被拒絕');
const low = startSim(); low.cash = 10;
assert(check(['service'], low), '現金不足應被拒絕');
assert.strictEqual(check(['nope'], startSim()), 'invalid');
assert.strictEqual(check(['service', 'service'], startSim()), 'invalid');

// 5. 壓力測試：同一路徑在冷市況第 3 回合資金不足
const cold = trySimulate(demo, 'dc');
assert.strictEqual(cold.failAt, 3);
assert.strictEqual(cold.sim.cash, 40);
assert.throws(() => simulate(demo, 'dc'));

// 6. 客戶關係：沒有服務既有客戶的回合減 1，最低為 0
eq(d.ledger.map(l => l.after.caps.relation), [2, 1, 3]);
eq(simulate(BENCH.service.picks, 'dh').ledger.map(l => l.after.caps.relation), [4, 5, 6]);
eq(simulate(BENCH.idle.picks, 'dh').ledger.map(l => l.after.caps.relation), [2, 1, 0]);
const zero = startSim(); zero.caps.relation = 0;
assert.strictEqual(execute(zero, [], 1, 'dh').after.caps.relation, 0);

// 7. 基準路徑與延伸試算
assert.strictEqual(simulate(BENCH.service.picks, 'dh').sim.cash, 170);
assert.strictEqual(simulate(BENCH.idle.picks, 'dh').sim.cash, 140);
assert.strictEqual(bestExtension(d.sim, 'dh').net, 50);
assert.strictEqual(bestExtension(simulate(BENCH.service.picks, 'dh').sim, 'dh').net, 10);
// 第 3 回合才投入的能力，在延伸試算（2032）中視為已成熟
const late = simulate([['talent'], ['service'], ['maint']], 'tc');
assert.strictEqual(late.sim.caps.maint, 0);
assert(bestExtension(late.sim, 'tc').ids.includes('maintSale'));

// 8. 窮舉所有可行路徑：路徑數與最高現金須與原稿模型一致，且現金不為負
const subsets = sim => {
  const ok = A.filter(a => !eligible(a, sim)), out = [];
  for (let k = 0; k < (1 << ok.length); k++) { const ids = ok.filter((_, i) => (k >> i) & 1).map(a => a.id); if (!check(ids, sim)) out.push(ids); }
  return out;
};
const expect = { dh: [2583, 170], dc: [2352, 122], th: [2589, 182], tc: [2371, 122] };
for (const w of WORLD_IDS) {
  let n = 0, best = -1, min = 1e9;
  const s0 = mature(startSim(), 1);
  for (const a1 of subsets(s0)) { const s1 = clone(s0); execute(s1, a1, 1, w); mature(s1, 2);
    for (const a2 of subsets(s1)) { const s2 = clone(s1); execute(s2, a2, 2, w); mature(s2, 3);
      for (const a3 of subsets(s2)) { const s3 = clone(s2); execute(s3, a3, 3, w); n++; best = Math.max(best, s3.cash); min = Math.min(min, s3.cash); } } }
  eq([n, best], expect[w], w);
  assert(min >= 0, w + ' 出現負現金');
}

// 9. 物件原型上的名稱不是有效的行動或情境
eq(check(['constructor'], startSim()), 'invalid');
eq(check(['__proto__'], startSim()), 'invalid');
assert.strictEqual(W.constructor, undefined);
assert.strictEqual(ACT.toString, undefined);

// 10. 有限樹練習的附註：「不建構能力」的兩期淨現金（只接既有客製服務）在四種情境都高於兩個分支
for (const w of WORLD_IDS) {
  const net = id => payoff(ACT[id], w) - ACT[id].cost;
  const none = net('service'), pilot = -ACT.pilot.cost + Math.max(net('platformSale'), net('service')), maint = -ACT.maint.cost + Math.max(net('maintSale'), net('service'));
  assert(none > pilot && none > maint, w + ' 的附註不成立');
}

// 11. 每個情境與行動都有中英文名稱
for (const w of WORLD_IDS) { assert(W[w].n[0] && W[w].n[1]); assert.strictEqual(W[w].r2.length, 3); assert.strictEqual(W[w].r3.length, 3); }
for (const a of A) for (const k of ['name', 'short', 'desc']) assert(a[k][0] && a[k][1], a.id + '.' + k);

console.log('PASS model: 示範路徑現金 84/60/120、原稿數值、成熟時間、人力與現金限制、冷市況不可行、客戶關係、基準與延伸試算、全路徑窮舉、原型名稱防護、有限樹附註。');
