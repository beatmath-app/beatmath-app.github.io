const E = require('../engine2.js'), U = E._t;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const A = (P, T, x = {}) => Object.assign({ P, T, dmg: 0, dt: false, tr: false, ll: false, ind: false, prev: false, fs: false, ds: false, alive: true, blocked: true }, x);
const B = (P, T, target, x = {}) => Object.assign({ P, T, dmg: 0, dt: false, ll: false, ind: false, prev: false, fs: false, ds: false, alive: true, target }, x);
const best = (outs, f) => outs.some(f);
// --- 戦闘の共通処理 ---
{ const o = U.ccCombat([A(2, 2, { fs: true })], [B(2, 2, 0)]); ok(o.every(r => r.aAlive[0] && !r.bAlive[0]), '先制攻撃 2/2 が 2/2 に一方的に勝つ'); }
{ const o = U.ccCombat([A(2, 2, { ds: true, blocked: false })], []); ok(o[0].toPlayer === 4, '二段攻撃：ブロックされなければ2回（4点）'); }
{ const o = U.ccCombat([A(2, 2, { ds: true })], [B(3, 3, 0)]); ok(o.every(r => !r.aAlive[0] && !r.bAlive[0]), '二段攻撃 2/2 vs 3/3：2回目で倒すが反撃で相打ち'); }
{ const o = U.ccCombat([A(1, 1, { dt: true })], [B(5, 5, 0)]); ok(o.every(r => !r.aAlive[0] && !r.bAlive[0]), '接死 1/1 が 5/5 と相打ち'); }
{ const o = U.ccCombat([A(2, 2, { dt: true, tr: true })], [B(4, 4, 0)]); ok(o.length === 1 && o[0].toPlayer === 1 && !o[0].bAlive[0], '接死＋トランプル：1点で倒して1点通す'); }
{ const o = U.ccCombat([A(5, 5, { tr: true })], [B(2, 2, 0)]); ok(o[0].toPlayer === 3, 'トランプル 5/5 vs 2/2：3点通る'); }
{ const o = U.ccCombat([A(3, 3, { ds: true, tr: true })], [B(2, 2, 0)]); ok(o[0].toPlayer === 4 && !o[0].bAlive[0], '二段攻撃＋トランプル：先制で倒して2回目は全部通る（1+3）'); }
{ const o = U.ccCombat([A(5, 5, { tr: true })], [B(2, 2, 0, { ind: true })]); ok(o[0].toPlayer === 3 && o[0].bAlive[0], 'トランプル vs 破壊不能：致死2点を割り振って3点通る（ブロッカーは生存）'); }
{ const o = U.ccCombat([A(3, 3, { ll: true, blocked: false })], []); ok(o[0].gain[0] === 3, '絆魂：ブロックされず3点→3点回復'); }
{ const o = U.ccCombat([A(3, 3, { ll: true })], [B(1, 1, 0)]); ok(o[0].gain[0] === 3, '絆魂：1/1に割り振った3点ぶん回復'); }
{ const o = U.ccCombat([A(1, 1)], [B(2, 2, 0, { ll: true })]); ok(o[0].gain[1] === 2, '絆魂のブロッカーも回復'); }
{ const o = U.ccCombat([A(5, 5)], [B(2, 2, 0, { ind: true })]); ok(o[0].bAlive[0], '破壊不能のブロッカーは死なない'); }
{ const o = U.ccCombat([A(2, 2, { fs: true })], [B(1, 1, 0, { dt: true })]); ok(o.every(r => r.aAlive[0] && !r.bAlive[0]), '先制攻撃は接死ブロッカーを先に倒す'); }
{ const o = U.ccCombat([A(4, 4, { dt: true })], [B(3, 3, 0), B(3, 3, 0), B(3, 3, 0)]); ok(o.some(r => r.bAlive.every(a => !a)), '接死 4/4：トリプルブロックを1点ずつで全滅させられる'); }
{ const o = U.ccCombat([A(2, 2, { ll: true })], [B(3, 3, 0, { prev: true })]); ok(o[0].gain[0] === 0, '軽減されたダメージでは絆魂は回復しない'); }
// --- 基本用エンジン（盤面の探索） ---
const V = (board, life, tapped = 0, ply = 6) => { const s = U.makeVanilla(board, ply); const st = { a: [(1 << board.me.length) - 1, (1 << board.op.length) - 1], life, turn: 0, tapped }; return { s, st, opts: s.rootOptions(st) }; };
{ const r = V({ me: [{ p: 3, t: 3, me: true }], op: [{ p: 1, t: 1 }] }, [20, 3]); ok(r.opts.find(o => o.attackers.length === 1).value > 900, '威迫：1体ではブロックできず3点で勝ち'); }
{ const r = V({ me: [{ p: 3, t: 3, df: true }], op: [{ p: 1, t: 1 }] }, [20, 1]); ok(r.opts.length === 1, '防衛は攻撃できない（選択肢は攻撃しないのみ）'); }
{ const r = V({ me: [{ p: 1, t: 4, vg: true }], op: [{ p: 3, t: 1 }] }, [3, 2]); ok(r.opts.find(o => o.attackers.length === 1).value > 900, '警戒 1/4：攻撃しても反撃の3/1をブロックでき、次のターンに勝ち'); }
{ const r = V({ me: [{ p: 1, t: 4 }], op: [{ p: 3, t: 1 }] }, [3, 2]); const v = r.opts.find(o => o.attackers.length === 1).value; ok(v < -900, '（比較）警戒なしだと同じ攻撃で反撃を受けて負け'); }
// --- インスタント用エンジン ---
const R = (board, life, hand, lands, hc, tapped = 0) => E.rootOptions(board, life, hand, lands, tapped, 8, 4, hc).opts;
{ const o = R({ me: [{ p: 1, t: 1 }], op: [{ p: 3, t: 3 }] }, [20, 1], [['C0'], []], [2, 0], [{ side: 0, p: 2, t: 2, haste: true, flash: false, cost: 2 }]);
  const w = o.find(x => x.cast === 'C0' && x.attackers.includes(1) && x.attackers.includes(0));
  const top = Math.max(...o.map(x => x.value));
  ok(w && w.value === top && o.filter(x => x.value === top).length === 1, '速攻クリーチャーを戦闘前に唱えて2体で攻撃→このターンに勝ち（唯一の最善）'); }
{ const o = R({ me: [{ p: 3, t: 3 }], op: [] }, [20, 3], [[], ['C0']], [0, 3], [{ side: 1, p: 1, t: 4, flash: true, haste: false, cost: 3 }]);
  const a = o.find(x => x.attackers.length === 1); ok(a && a.value < 900 && a.line.some(e => e.t === 'enter' && e.side === 1), '相手の瞬速クリーチャーが攻撃後に出てブロック'); }
{ const st = E.initialState({ me: [{ p: 2, t: 2 }], op: [{ p: 3, t: 3, hx: true }] }, [20, 20], [['ABRADE'], []], [2, 0], 0); st.phase = 'w4'; st.win = { prio: 0, passes: 0, stack: [] };
  ok(U.castOptions(st, 0).length === 0, '呪禁：相手の呪文の対象にならない'); }
{ U.setHandCreatures({ me: [], op: [] }, []);
  const st = E.initialState({ me: [{ p: 2, t: 2 }], op: [{ p: 3, t: 3, wd: 2 }] }, [20, 20], [['ABRADE'], []], [3, 0], 0); st.phase = 'w4'; st.win = { prio: 0, passes: 0, stack: [] };
  ok(U.castOptions(st, 0).length === 0, '護法2：削剥(2)は4マナないと対象にできない'); st.mana[0] = 4; ok(U.castOptions(st, 0).length === 1, '護法2：4マナなら唱えられる'); }
{ U.setHandCreatures({ me: [{ p: 1, t: 1 }], op: [] }, [{ side: 0, p: 2, t: 2, flash: true, haste: false, cost: 3 }]);
  const st = E.initialState({ me: [{ p: 1, t: 1 }], op: [{ p: 2, t: 2 }] }, [20, 20], [['ABRADE', 'C0'], []], [3, 0], 0); st.phase = 'w4'; st.win = { prio: 0, passes: 0, stack: [] };
  const os = U.castOptions(st, 0); ok(os.some(o => o.card === 'C0') && os.some(o => o.card === 'ABRADE'), 'マナ3：削剥(2)と瞬速(3)のどちらも唱えられる');
  st.mana[0] -= 3; ok(U.castOptions(st, 0).length === 0, 'どちらか一方を唱えるともう一方は唱えられない'); }
{ U.setHandCreatures({ me: [], op: [] }, []);
  const st = E.initialState({ me: [{ p: 1, t: 1, dt: true, ll: true }], op: [{ p: 6, t: 6 }] }, [5, 20], [['BITE'], []], [2, 0], 0); const ev = [];
  U.resolveSpell(st, { c: 'BITE', by: 0, tg: [[0, 0], [1, 0]] }, ev); ok(!st.cr[1][0].alive && st.life[0] === 6, '噛み締め：接死で6/6を倒し、絆魂で1点回復'); }
{ U.setHandCreatures({ me: [], op: [] }, []);
  const st = E.initialState({ me: [{ p: 5, t: 5, ind: true }], op: [] }, [20, 20], [[], []], [0, 0], 0); const ev = [];
  U.resolveSpell(st, { c: 'DOWNFALL', by: 1, tg: [[0, 0]] }, ev); ok(st.cr[0][0].alive, '破壊不能（固定）：英雄の破滅で死なない'); }
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
