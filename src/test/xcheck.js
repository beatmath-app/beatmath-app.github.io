// 手札なしの盤面で、基本用エンジンとインスタント用エンジン（基本用への切り替えを止めた状態）の評価値が一致するか
const E = require('../engine2.js'), U = E._t;
function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
const KW = ['fs', 'ds', 'dt', 'tr', 'me', 'vg', 'll', 'ind', 'df'];
function cr() { const p = rnd(1, 4), t = rnd(1, 4); const c = { p, t, fly: Math.random() < 0.2 }; if (!c.fly) c.reach = Math.random() < 0.1;
  for (let k = 0; k < 2; k++) if (Math.random() < 0.5) { const x = KW[rnd(0, KW.length - 1)]; c[x] = true; } if (c.fs && c.ds) delete c.fs; if (c.df) { delete c.vg; delete c.me; delete c.tr; delete c.ds; } return c; }
U.setNoVanilla(true);
let n = 0, bad = 0;
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const board = { me: Array.from({ length: rnd(1, 2) }, cr), op: Array.from({ length: rnd(1, 2) }, cr) };
  const life = [rnd(1, 6), rnd(1, 6)], tapped = Math.random() < 0.2 ? 1 : 0;
  const ply = 6;
  const v1 = U.makeVanilla(board, ply);
  const st = { a: [(1 << board.me.length) - 1, (1 << board.op.length) - 1], life: life.slice(), turn: 0, tapped };
  const o1 = v1.rootOptions(st).map(o => ({ k: o.attackers.join(), v: o.value >= 900 ? o.value + 1 : o.value <= -900 ? o.value - 1 : o.value }));
  const o2 = E.rootOptions(board, life, [[], []], [0, 0], tapped, ply, 99, []).opts.map(o => ({ k: o.attackers.join(), v: o.value }));
  n++;
  for (const a of o1) { const b = o2.find(x => x.k === a.k); if (!b || b.v !== a.v) { bad++; if (bad <= 3) console.log('MISMATCH', JSON.stringify(board), life, tapped, a, b); break; } }
}
console.log('boards', n, 'mismatch', bad);
