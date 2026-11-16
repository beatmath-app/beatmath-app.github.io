// MTG combat drill engine (MVP: vanilla + flying/reach, no new cards, no tricks)
// Side 0 = 自分, side 1 = 相手. Values are from 自分's perspective.
const WIN = 1000;

function canBlock(blk, att) {
  if (att.fly) return blk.fly || blk.reach;
  return true;
}

// ---------- 戦闘ダメージの共通処理（基本用・インスタント用の両エンジンで使う） ----------
// step: 0 = 先制なしの1回だけ, 1 = 先制ダメージ, 2 = 通常ダメージ（先制の後）
function ccDeals(c, step) { return step === 0 ? true : step === 1 ? (c.fs || c.ds) : (!c.fs || c.ds); }
function ccNeed(b, dmg, dt) { return dt ? 1 : Math.max(1, b.T - dmg); }   // 致死ダメージ（割り振り用。破壊不能・軽減は考慮しない）
// att[i]: {P,T,dmg,dt,tr,ll,ind,prev,fs,ds,alive,blocked}  blk[j]: {P,T,dmg,dt,ll,ind,prev,fs,ds,alive,target}
// 返り値: 攻撃側のダメージ割り振りの選び方ごとの結果
function ccCombat(att, blk) {
  let anyFS = false;
  for (const a of att) if (a.alive && (a.fs || a.ds)) anyFS = true;
  for (const b of blk) if (b.alive && (b.fs || b.ds)) anyFS = true;
  let states = [{ aDmg: att.map(a => a.dmg), bDmg: blk.map(b => b.dmg), aDT: att.map(() => false), bDT: blk.map(() => false),
    aAlive: att.map(a => a.alive), bAlive: blk.map(b => b.alive), toPlayer: 0, gain: [0, 0] }];
  for (const step of (anyFS ? [1, 2] : [0])) {
    const next = [];
    for (const st of states) for (const o of ccStep(att, blk, st, step)) next.push(o);
    states = next;
  }
  return states;
}
function ccStep(att, blk, st, step) {
  const aAdd = att.map(() => 0), aDTn = att.map(() => false);
  let gainA = 0, gainD = 0, toP = 0;
  for (let j = 0; j < blk.length; j++) {               // ブロッカー → 攻撃クリーチャー
    const b = blk[j];
    if (!st.bAlive[j] || !ccDeals(b, step) || b.P <= 0) continue;
    const i = b.target;
    if (!st.aAlive[i] || att[i].prev) continue;
    aAdd[i] += b.P; if (b.dt) aDTn[i] = true; if (b.ll) gainD += b.P;
  }
  const choiceLists = [];
  for (let i = 0; i < att.length; i++) {               // 攻撃クリーチャー → ブロッカー／プレイヤー
    const a = att[i];
    if (!st.aAlive[i] || !ccDeals(a, step) || a.P <= 0) continue;
    if (!a.blocked) { toP += a.P; if (a.ll) gainA += a.P; continue; }
    const L = [];
    for (let j = 0; j < blk.length; j++) if (blk[j].target === i && st.bAlive[j]) L.push(j);
    if (!L.length) { if (a.tr) { toP += a.P; if (a.ll) gainA += a.P; } continue; }   // ブロッカーが全滅：トランプルなら全部通る
    choiceLists.push({ i, opts: ccAssign(a, L, blk, st) });
  }
  let combos = [[]];
  for (const cl of choiceLists) { const nx = []; for (const c of combos) for (const o of cl.opts) nx.push(c.concat([[cl.i, o]])); combos = nx; }
  return combos.map(combo => {
    const aDmg = st.aDmg.slice(), bDmg = st.bDmg.slice(), aDT = st.aDT.slice(), bDT = st.bDT.slice();
    const aAlive = st.aAlive.slice(), bAlive = st.bAlive.slice();
    let tp = st.toPlayer + toP, gA = st.gain[0] + gainA, gD = st.gain[1] + gainD;
    for (let i = 0; i < att.length; i++) { aDmg[i] += aAdd[i]; if (aDTn[i]) aDT[i] = true; }
    for (const [i, o] of combo) {
      const a = att[i];
      for (const [j, n] of o.to) { if (n <= 0 || blk[j].prev) continue; bDmg[j] += n; if (a.dt) bDT[j] = true; if (a.ll) gA += n; }
      if (o.player) { tp += o.player; if (a.ll) gA += o.player; }
    }
    for (let i = 0; i < att.length; i++) if (aAlive[i] && !att[i].ind && (aDmg[i] >= att[i].T || aDT[i])) aAlive[i] = false;
    for (let j = 0; j < blk.length; j++) if (bAlive[j] && !blk[j].ind && (bDmg[j] >= blk[j].T || bDT[j])) bAlive[j] = false;
    return { aDmg, bDmg, aDT, bDT, aAlive, bAlive, toPlayer: tp, gain: [gA, gD] };
  });
}
// 複数（または1体）にブロックされた攻撃クリーチャーのダメージの割り振り方
function ccAssign(a, L, blk, st) {
  const P = a.P;
  const need = L.map(j => ccNeed(blk[j], st.bDmg[j], a.dt));
  const sumNeed = need.reduce((x, y) => x + y, 0);
  if (a.tr && P >= sumNeed) return [{ to: L.map((j, k) => [j, need[k]]), player: P - sumNeed }];   // トランプル：全員に致死を割り振って残りを通す
  if (L.length === 1) return [{ to: [[L[0], P]], player: 0 }];
  const kill = L.map(j => !blk[j].ind && !blk[j].prev);
  const n = L.length, feas = [];
  for (let m = 1; m < (1 << n); m++) {
    let s = 0, ok = true;
    for (let k = 0; k < n; k++) if (m >> k & 1) { if (!kill[k]) { ok = false; break; } s += need[k]; }
    if (ok && s <= P) feas.push({ m, s });
  }
  const maxi = feas.filter(x => !feas.some(y => y.m !== x.m && (y.m & x.m) === x.m));
  const res = [];
  for (const { m, s } of maxi) {
    const base = []; for (let k = 0; k < n; k++) if (m >> k & 1) base.push([L[k], need[k]]);
    const left = P - s, others = [];
    for (let k = 0; k < n; k++) if (!(m >> k & 1) && kill[k]) others.push(k);
    if (left > 0 && others.length) for (const k of others) res.push({ to: base.concat([[L[k], left]]), player: 0 });
    else res.push({ to: base, player: 0 });
  }
  if (!res.length) { const k = kill.indexOf(true); res.push({ to: [[L[k >= 0 ? k : 0], P]], player: 0 }); }
  return res;
}
// クリーチャーの盤面価値（評価関数）— 両エンジン共通
function ccValue(c, p, t) {
  return 6 * p + 4 * t + (c.fly ? 4 : 0) + (c.fs ? 3 : 0) + (c.ds ? 6 : 0) + (c.dt ? 4 : 0) + (c.tr ? 2 : 0) + (c.me ? 2 : 0)
    + (c.vg ? 2 : 0) + (c.ll ? 3 : 0) + (c.ind ? 5 : 0) + (c.hx ? 1 : 0) + (c.wd || 0) - (c.df ? 6 : 0);
}
function ccMenaceOK(attList, assign, nAtt) {
  for (let j = 0; j < nAtt; j++) {
    if (!attList[j].me) continue;
    let n = 0; for (const x of assign) if (x === j) n++;
    if (n === 1) return false;
  }
  return true;
}

function makeSolver(board, maxPly) {
  // board: {me:[creature], op:[creature]}  creature: {p,t,fly,reach,fs,ds,dt,tr,me,vg,ll,ind,df,hx,wd}
  const sides = [board.me, board.op];
  const memo = new Map();
  let nodes = 0;

  function heuristic(st) {
    let v = 0;
    for (const side of [0, 1]) {
      const cs = sides[side], sg = side === 0 ? 1 : -1;
      for (let i = 0; i < cs.length; i++) if (st.a[side] >> i & 1) v += sg * ccValue(cs[i], cs[i].p, cs[i].t);
    }
    v += 3 * (st.life[0] - st.life[1]);
    return Math.max(-400, Math.min(400, v));
  }

  function key(st, ply) {
    return st.a[0] + ',' + st.a[1] + ',' + st.life[0] + ',' + st.life[1] + ',' + st.turn + ',' + st.tapped + ',' + ply;
  }

  // blocks[k] = attackers のインデックス（-1 = ブロックしない）を、使えるブロッカーごとに列挙
  function forEachBlock(st, attackers, cb) {
    const att = st.turn, def = 1 - att;
    const dcs = sides[def], acs = sides[att];
    const avail = [];
    for (let i = 0; i < dcs.length; i++) if ((st.a[def] >> i & 1) && !(st.tapped >> i & 1)) avail.push(i);
    const attList = attackers.map(i => acs[i]);
    const assign = new Array(avail.length).fill(-1);
    let stop = false;
    function rec(k) {
      if (stop) return;
      if (k === avail.length) {
        if (!ccMenaceOK(attList, assign, attackers.length)) return;
        if (cb(avail, assign) === false) stop = true;
        return;
      }
      assign[k] = -1; rec(k + 1);
      for (let j = 0; j < attackers.length; j++) {
        if (vCanBlockFlat(dcs[avail[k]], attList[j])) { assign[k] = j; rec(k + 1); if (stop) return; }
      }
      assign[k] = -1;
    }
    rec(0);
  }
  function vCanBlockFlat(b, a) { return canBlock(b, a); }

  const flat = (c, extra) => Object.assign({ P: c.p, T: c.t, dmg: 0, dt: !!c.dt, tr: !!c.tr, ll: !!c.ll, ind: !!c.ind, prev: false, fs: !!c.fs, ds: !!c.ds, alive: true }, extra);

  // 戦闘を解決 → 結果の局面の一覧（攻撃側のダメージ割り振りの選択ごと）
  function resolve(st, attackers, avail, assign) {
    const att = st.turn, def = 1 - att;
    const acs = sides[att], dcs = sides[def];
    const A = attackers.map((ai, j) => flat(acs[ai], { blocked: assign.some(x => x === j) }));
    const B = [], bIdx = [];
    avail.forEach((bi, k) => { if (assign[k] >= 0) { B.push(flat(dcs[bi], { target: assign[k] })); bIdx.push(bi); } });
    const outs = ccCombat(A, B);
    const seen = new Set(), res = [];
    for (const o of outs) {
      let deadAtt = 0, deadDef = 0;
      attackers.forEach((ai, j) => { if (!o.aAlive[j]) deadAtt |= 1 << ai; });
      bIdx.forEach((bi, j) => { if (!o.bAlive[j]) deadDef |= 1 << bi; });
      const a = [st.a[0], st.a[1]];
      a[att] &= ~deadAtt; a[def] &= ~deadDef;
      const life = [st.life[0], st.life[1]];
      life[def] -= o.toPlayer; life[att] += o.gain[0]; life[def] += o.gain[1];
      const k = a[0] + ',' + a[1] + ',' + life[0] + ',' + life[1];
      if (seen.has(k)) continue; seen.add(k);
      let tapped = 0;
      attackers.forEach(ai => { if (!acs[ai].vg) tapped |= 1 << ai; });   // 警戒は攻撃してもタップしない
      const gainAbs = [0, 0]; gainAbs[att] = o.gain[0]; gainAbs[def] = o.gain[1];
      res.push({ a, life, turn: def, tapped: tapped & a[att], dmg: o.toPlayer, deadAtt, deadDef, gainAbs });
    }
    return res;
  }

  function attackSubsets(st) {
    const att = st.turn, cs = sides[att];
    const elig = [];
    for (let i = 0; i < cs.length; i++) if ((st.a[att] >> i & 1) && !cs[i].df) elig.push(i);   // 防衛は攻撃できない
    const res = [];
    for (let m = 0; m < (1 << elig.length); m++) {
      const list = [];
      for (let k = 0; k < elig.length; k++) if (m >> k & 1) list.push(elig[k]);
      res.push(list);
    }
    return res;
  }

  // alpha-beta with transposition table. value from 自分's perspective.
  function value(st, ply, alpha = -Infinity, beta = Infinity) {
    if (st.life[1] <= 0) return WIN - ply;
    if (st.life[0] <= 0) return -WIN + ply;
    if (ply >= maxPly) return heuristic(st);
    const k = key(st, ply);
    const e = memo.get(k);
    if (e) {
      if (e.f === 0) return e.v;
      if (e.f === 1 && e.v >= beta) return e.v;
      if (e.f === 2 && e.v <= alpha) return e.v;
    }
    nodes++;
    const maxer = st.turn === 0;
    const subs = attackSubsets(st);
    if (e && e.b !== undefined && e.b < subs.length) { const t = subs[e.b]; subs[e.b] = subs[0]; subs[0] = t; }
    let a = alpha, b = beta, best = maxer ? -Infinity : Infinity, bestSub = null;
    for (const s of subs) {
      const v = attackValue(st, ply, s, a, b);
      if (maxer) { if (v > best) { best = v; bestSub = s; } if (best > a) a = best; }
      else { if (v < best) { best = v; bestSub = s; } if (best < b) b = best; }
      if (a >= b) break;
    }
    const f = best <= alpha ? 2 : best >= beta ? 1 : 0;
    memo.set(k, { v: best, f, b: attackSubsets(st).findIndex(x => x.join() === bestSub.join()) });
    return best;
  }

  function attackValue(st, ply, attackers, alpha = -Infinity, beta = Infinity) {
    const maxer = st.turn === 0;
    let worst = maxer ? Infinity : -Infinity;
    let a = alpha, b = beta;
    forEachBlock(st, attackers, (avail, assign) => {
      const outs = resolve(st, attackers, avail, assign);
      let ov = maxer ? -Infinity : Infinity;
      let a2 = a, b2 = b;
      for (const o of outs) {
        const v = value(o, ply + 1, a2, b2);
        if (maxer) { if (v > ov) ov = v; if (ov > a2) a2 = ov; }
        else { if (v < ov) ov = v; if (ov < b2) b2 = ov; }
        if (a2 >= b2) break;
      }
      if (maxer) { if (ov < worst) worst = ov; if (worst < b) b = worst; }
      else { if (ov > worst) worst = ov; if (worst > a) a = worst; }
      if (a >= b) return false;
    });
    return worst;
  }

  function line(st, ply, attackers, limit = 12) {
    const steps = [];
    let cur = st, p = ply, atk = attackers;
    while (steps.length < limit) {
      if (cur.life[0] <= 0 || cur.life[1] <= 0 || p >= maxPly) break;
      if (!atk) {
        const maxer = cur.turn === 0;
        let best = maxer ? -Infinity : Infinity, bestA = [];
        for (const a of attackSubsets(cur)) {
          const v = attackValue(cur, p, a);
          if (maxer ? v > best : v < best) { best = v; bestA = a; }
        }
        atk = bestA;
      }
      const maxer = cur.turn === 0;
      let worst = maxer ? Infinity : -Infinity, pick = null;
      forEachBlock(cur, atk, (avail, assign) => {
        const outs = resolve(cur, atk, avail, assign);
        let ov = maxer ? -Infinity : Infinity, oo = null;
        for (const o of outs) {
          const v = value(o, p + 1);
          if (maxer ? v > ov : v < ov) { ov = v; oo = o; }
        }
        if (maxer ? ov < worst : ov > worst) { worst = ov; pick = { avail: avail.slice(), assign: assign.slice(), out: oo }; }
      });
      const blocks = [];
      pick.avail.forEach((b, k) => { if (pick.assign[k] >= 0) blocks.push([b, atk[pick.assign[k]]]); });
      steps.push({ side: cur.turn, attackers: atk, blocks, dmg: pick.out.dmg, deadAtt: pick.out.deadAtt, deadDef: pick.out.deadDef, gainAbs: pick.out.gainAbs, life: pick.out.life.slice(), value: worst });
      cur = pick.out; p++; atk = null;
    }
    return steps;
  }

  function rootOptions(st) {
    return attackSubsets(st).map(a => ({ attackers: a, value: attackValue(st, 0, a) }));
  }

  return { value, attackValue, rootOptions, line, stats: () => ({ nodes, memo: memo.size }) };
}

// ---------- キーワード付与（生成用） ----------
const KW_POOL_BASIC = [['fs', 3], ['ds', 1], ['dt', 3], ['tr', 3], ['me', 2], ['vg', 3], ['ll', 3], ['ind', 1], ['df', 2]];
const KW_POOL_SPELL = KW_POOL_BASIC.concat([['hx', 2], ['wd', 2]]);
function pickWeighted(pool) {
  const tot = pool.reduce((s, x) => s + x[1], 0);
  let r = Math.random() * tot;
  for (const [k, w] of pool) { if ((r -= w) < 0) return k; }
  return pool[pool.length - 1][0];
}
// c にキーワードを付ける（kwP: 1つ目が付く確率、kwMax: 最大個数）
function addKeywords(c, kwP, kwMax, pool) {
  let n = 0;
  while (n < kwMax && Math.random() < (n === 0 ? kwP : kwP * 0.35)) {
    const k = pickWeighted(pool);
    if (c[k] || (k === 'ds' && c.fs) || (k === 'fs' && c.ds)) continue;
    if (k === 'df' && (c.vg || c.me || c.tr || c.ds || c.p > 3)) continue;
    if (c.df && (k === 'vg' || k === 'me' || k === 'tr' || k === 'ds')) continue;
    if (k === 'wd') c.wd = Math.random() < 0.6 ? 1 : 2; else c[k] = true;
    n++;
  }
  return c;
}

// ---------- classification & generation ----------
// value v → {cls:'win'|'loss'|'open', n}  (n = 何回目の攻撃で決着)
function classify(v) {
  if (v >= 900) { const p = 999 - v; return { cls: 'win', n: p / 2 + 1 }; }
  if (v <= -900) { const p = v + 999; return { cls: 'loss', n: (p + 1) / 2 }; }
  return { cls: 'open', n: 0 };
}

// grade each option: best / ok(勝てるが遅い) / draw / loss
function gradeOptions(opts) {
  const best = Math.max(...opts.map(o => o.value));
  const bc = classify(best);
  for (const o of opts) {
    const c = classify(o.value);
    o.c = c;
    if (bc.cls === 'win') o.grade = o.value === best ? 'best' : c.cls === 'win' ? 'slow' : c.cls === 'open' ? 'open' : 'loss';
    else if (bc.cls === 'open') o.grade = c.cls === 'open' ? 'best' : 'loss';
    else o.grade = o.value === best ? 'best' : 'loss';
  }
  return bc;
}

const LEVELS = {
  easy:   { me: [2, 3], op: [1, 2], maxPly: 8,  life: [2, 8],  flyP: 0.25, tapP: 0.15, kwP: 0.3,  kwMax: 1 },
  normal: { me: [2, 3], op: [2, 3], maxPly: 10, life: [2, 12], flyP: 0.2,  tapP: 0.25, kwP: 0.45, kwMax: 2 },
  hard:   { me: [3, 4], op: [2, 4], maxPly: 10, life: [3, 14], flyP: 0.2,  tapP: 0.3,  kwP: 0.55, kwMax: 2, maxTotal: 6 },
};

function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function randCreature(flyP, kwP = 0, kwMax = 0, pool = KW_POOL_BASIC) {
  const p = rint(1, 5);
  const t = Math.max(1, Math.min(6, p + rint(-2, 2)));
  const fly = Math.random() < flyP;
  const c = { p, t, fly, reach: !fly && Math.random() < 0.1 };
  return addKeywords(c, kwP, kwMax, pool);
}

function tryPuzzle(levelName) {
  const L = LEVELS[levelName];
  let nm = rint(L.me[0], L.me[1]), no = rint(L.op[0], L.op[1]);
  if (L.maxTotal && nm + no > L.maxTotal) { if (Math.random() < 0.5) nm--; else no--; }
  const board = { me: [], op: [] };
  for (let i = 0; i < nm; i++) board.me.push(randCreature(L.flyP, L.kwP, L.kwMax));
  for (let i = 0; i < no; i++) board.op.push(randCreature(L.flyP, L.kwP, L.kwMax));
  board.me.sort((a, b) => b.p - a.p || b.t - a.t);
  board.op.sort((a, b) => b.p - a.p || b.t - a.t);
  let tapped = 0;
  if (Math.random() < L.tapP) for (let i = 0; i < no; i++) if (Math.random() < 0.5 && !board.op[i].df) tapped |= 1 << i;
  if (board.me.every(c => c.df)) return null;
  const st = { a: [(1 << nm) - 1, (1 << no) - 1], life: [rint(L.life[0], L.life[1]), rint(L.life[0], L.life[1])], turn: 0, tapped };
  const solver = makeSolver(board, L.maxPly);
  const opts = solver.rootOptions(st);
  const bc = gradeOptions(opts);
  // --- filters ---
  if (bc.cls === 'loss') return null;                     // 何をしても負け
  const nBest = opts.filter(o => o.grade === 'best').length;
  if (nBest / opts.length > 0.4) return null;             // 正解が多すぎる
  const nElig = board.me.filter(c => !c.df).length;
  const all = opts.find(o => o.attackers.length === nElig);
  const none = opts.find(o => o.attackers.length === 0);
  if (all.grade === 'best' && none.grade !== 'best' && Math.random() < 0.6) return null; // 全員攻撃が正解の問題は減らす
  if (all.grade === 'best' && none.grade === 'best') return null;
  if (none.grade === 'best' && Math.random() < 0.7) return null; // 「攻撃しない」が正解の問題は少なめ
  if (bc.cls === 'win') {
    const bad = opts.filter(o => o.grade === 'open' || o.grade === 'loss').length;
    if (bad === 0) return null;                           // どれでも勝てる
    if (bc.n === 1 && Math.random() < 0.5) return null;   // 即死問題は少なめ
  } else {
    if (!opts.some(o => o.grade === 'loss')) return null;
  }
  return { level: levelName, board, st, best: bc, maxPly: L.maxPly,
    opts: opts.map(o => ({ attackers: o.attackers, value: o.value, grade: o.grade, c: o.c, line: solver.line(st, 0, o.attackers, 12) })) };
}

function generate(levelName, budgetMs = 4000) {
  const t0 = Date.now();
  let tries = 0;
  while (Date.now() - t0 < budgetMs) {
    tries++;
    const p = tryPuzzle(levelName);
    if (p) { p.tries = tries; return p; }
  }
  return null;
}

// Explain a chosen attack: principal variation
function explain(puzzle, attackers) {
  const s = makeSolver(puzzle.board, puzzle.maxPly);
  return s.line(puzzle.st, 0, attackers, 12);
}

if (typeof module !== 'undefined') module.exports = { makeSolver, WIN, classify, gradeOptions, generate, explain, LEVELS };
