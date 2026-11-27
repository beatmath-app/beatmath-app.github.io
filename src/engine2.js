// MTG combat drill engine v2: public instants (Foundations), priority/stack, first strike.
// Side 0 = 自分, side 1 = 相手. Values from 自分's perspective.
'use strict';
const WIN = 1000;

// kind: buff = own creature, harm = opponent creature, bite = own+opp
const CARDS = {
  GG:      { ja: '巨大化', en: 'Giant Growth', mana: '{G}', cost: 1, kind: 'buff', desc: 'クリーチャー1体を+3/+3（ターン終了時まで）' },
  STAB:    { ja: '突き刺し', en: 'Stab', mana: '{B}', cost: 1, kind: 'harm', desc: 'クリーチャー1体を-2/-2（ターン終了時まで）' },
  SURE:    { ja: '確実な一撃', en: 'Sure Strike', mana: '{1}{R}', cost: 2, kind: 'buff', desc: 'クリーチャー1体を+3/+0し、先制攻撃を与える（ターン終了時まで）' },
  JOUST:   { ja: '突き通し', en: 'Joust Through', mana: '{W}', cost: 1, kind: 'harm', desc: '攻撃中かブロック中のクリーチャー1体に3点ダメージ。あなたは1点のライフを得る' },
  ABRADE:  { ja: '削剥', en: 'Abrade', mana: '{1}{R}', cost: 2, kind: 'harm', desc: 'クリーチャー1体に3点ダメージ（または、アーティファクト1つを破壊）' },
  BURST:   { ja: '噴出の稲妻', en: 'Burst Lightning', mana: '{R}', cost: 1, kind: 'harm', desc: '任意の対象に2点ダメージ。キッカー{4}を払っていれば4点' },
  DIVINE:  { ja: '神聖なる反発', en: 'Divine Resilience', mana: '{W}', cost: 1, kind: 'buff', desc: '自分のクリーチャー1体に破壊不能（ターン終了時まで）。キッカー{2}{W}なら好きな数の自分のクリーチャーに' },
  FLIGHT:  { ja: '束の間の飛行', en: 'Fleeting Flight', mana: '{W}', cost: 1, kind: 'buff', desc: 'クリーチャー1体に+1/+1カウンターを置き、飛行を与える（ターン終了時まで）。このターン、それが受ける戦闘ダメージをすべて軽減' },
  DISTRACT:{ ja: '一瞬の散漫', en: 'Fleeting Distraction', mana: '{U}', cost: 1, kind: 'harm', desc: 'クリーチャー1体を-1/-0（ターン終了時まで）。カードを1枚引く' },
  DOWNFALL:{ ja: '英雄の破滅', en: "Hero's Downfall", mana: '{1}{B}{B}', cost: 3, kind: 'harm', desc: 'クリーチャーかプレインズウォーカー1体を破壊' },
  BITE:    { ja: '噛み締め', en: 'Bite Down', mana: '{1}{G}', cost: 2, kind: 'bite', desc: '自分のクリーチャー1体が、相手のクリーチャー1体にパワーに等しいダメージを与える' },
  VEIL:    { ja: '蛇皮のヴェール', en: 'Snakeskin Veil', mana: '{G}', cost: 1, kind: 'buff', desc: '自分のクリーチャー1体に+1/+1カウンターを置き、呪禁を与える（ターン終了時まで）' },
  WINGS:   { ja: '壊れた翼', en: 'Broken Wings', mana: '{2}{G}', cost: 3, kind: 'harm', desc: 'アーティファクト、エンチャント、飛行を持つクリーチャーのうち1つを破壊' },
  MOVE:    { ja: '次の一手', en: 'Make Your Move', mana: '{2}{W}', cost: 3, kind: 'harm', desc: 'アーティファクト、エンチャント、パワー4以上のクリーチャーのうち1つを破壊' },
  REBUKE:  { ja: '光明の叱責', en: 'Luminous Rebuke', mana: '{4}{W}', cost: 5, kind: 'harm', desc: 'クリーチャー1体を破壊。タップ状態のクリーチャーが対象なら{3}安くなる' },
};
const CARD_IDS = Object.keys(CARDS);

// ---------- vanilla solver (v1, used when both hands are empty) ----------
function vCanBlock(blk, att) {
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

function makeVanilla(board, maxPly) {   // engine.js の makeSolver と同じ（打ち切りはモジュールの deadline）
  // board: {me:[creature], op:[creature]}  creature: {p,t,fly,reach,fs,ds,dt,tr,me,vg,ll,ind,df,hx,wd}
  const sides = [board.me, board.op];
  const memos = new Map();   // 読みの深さごとの memo
  let memo = new Map();      // 読みの深さの限界や手順に依存する値（手数つきのキー）
  memos.set(maxPly, memo);
  const memoX = new Map();   // 限界にも手順にも依存しない値（手数なしのキー、勝敗は相対手数で保存）
  let capHit = false;       // 読みの深さの限界に当たったか
  let nodes = 0;
  const skey = st => st.a[0] + ',' + st.a[1] + ',' + st.life[0] + ',' + st.life[1] + ',' + st.turn + ',' + st.tapped;
  const toRel = (v, p) => v >= 900 ? v + p : v <= -900 ? v - p : v;
  const fromRel = (v, p) => v >= 900 ? v - p : v <= -900 ? v + p : v;

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
  function vCanBlockFlat(b, a) { return vCanBlock(b, a); }

  const flat = (c, extra) => Object.assign({ P: c.p, T: c.t, dmg: 0, dt: !!c.dt, tr: !!c.tr, ll: !!c.ll, ind: !!c.ind, prev: false, fs: !!c.fs, ds: !!c.ds, alive: true }, extra);

  // 戦闘の結果（誰が死に、何点通り、何点回復するか）は能力値が変わらないので、攻撃とブロックの組み合わせごとに覚えて使い回す
  const combatCache = new Map();
  function combatOuts(att, attackers, avail, assign) {
    let ck = att + ':' + attackers.join('.') + ':';
    for (let k = 0; k < avail.length; k++) if (assign[k] >= 0) ck += avail[k] + '>' + assign[k] + ',';
    let outs = combatCache.get(ck);
    if (outs) return outs;
    const def = 1 - att, acs = sides[att], dcs = sides[def];
    const A = attackers.map((ai, j) => flat(acs[ai], { blocked: assign.some(x => x === j) }));
    const B = [], bIdx = [];
    avail.forEach((bi, k) => { if (assign[k] >= 0) { B.push(flat(dcs[bi], { target: assign[k] })); bIdx.push(bi); } });
    const seen = new Set(); outs = [];
    for (const o of ccCombat(A, B)) {
      let deadAtt = 0, deadDef = 0;
      attackers.forEach((ai, j) => { if (!o.aAlive[j]) deadAtt |= 1 << ai; });
      bIdx.forEach((bi, j) => { if (!o.bAlive[j]) deadDef |= 1 << bi; });
      // 結果の局面が同じになるもの（残るクリーチャーとライフが同じ）は最初の1つだけ
      const k = deadAtt + ',' + deadDef + ',' + o.gain[0] + ',' + (o.gain[1] - o.toPlayer);
      if (seen.has(k)) continue; seen.add(k);
      outs.push({ deadAtt, deadDef, toPlayer: o.toPlayer, gain: o.gain });
    }
    combatCache.set(ck, outs);
    return outs;
  }
  // 戦闘を解決 → 結果の局面の一覧（攻撃側のダメージ割り振りの選択ごと）
  function resolve(st, attackers, avail, assign) {
    const att = st.turn, def = 1 - att;
    const acs = sides[att];
    let tapped = 0;
    attackers.forEach(ai => { if (!acs[ai].vg) tapped |= 1 << ai; });   // 警戒は攻撃してもタップしない
    return combatOuts(att, attackers, avail, assign).map(o => {
      const a = [st.a[0], st.a[1]];
      a[att] &= ~o.deadAtt; a[def] &= ~o.deadDef;
      const life = [st.life[0], st.life[1]];
      life[def] -= o.toPlayer; life[att] += o.gain[0]; life[def] += o.gain[1];
      const gainAbs = [0, 0]; gainAbs[att] = o.gain[0]; gainAbs[def] = o.gain[1];
      return { a, life, turn: def, tapped: tapped & a[att], dmg: o.toPlayer, deadAtt: o.deadAtt, deadDef: o.deadDef, gainAbs, pp: !attackers.length };
    });
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
  // 局面の値 ＝「攻撃しない」と「いずれかで攻撃する」の良いほう。
  // 相手が攻撃しなかった直後（st.pp）にこちらも攻撃しないと、同じ局面のくり返し（にらみ合い）として決着つかず。
  // 同じ局面では同じ判断をする前提なので、問題の選択肢として選んだ最初の「攻撃しない」も数える。
  function value(st, ply, alpha = -Infinity, beta = Infinity) {
    if (st.life[1] <= 0) return WIN - ply;
    if (st.life[0] <= 0) return -WIN + ply;
    if (ply >= maxPly) { capHit = true; return heuristic(st); }
    const maxer = st.turn === 0;
    let best = st.pp ? heuristic(st) : attackValue(st, ply, [], alpha, beta);
    let a = alpha, b = beta;
    if (maxer) { if (best > a) a = best; } else { if (best < b) b = best; }
    if (a >= b) return best;
    const av = bestAttack(st, ply, a, b);
    return maxer ? Math.max(best, av) : Math.min(best, av);
  }

  // 攻撃する選択肢（空でない攻撃の組み合わせ）の中での最善。直前に攻撃しなかったかどうかに依存しないので、それを除いたキーで保存
  function bestAttack(st, ply, alpha, beta) {
    const sk = skey(st);
    const k = sk + ',' + ply;
    let e = memoX.get(sk), ev;
    if (e) ev = fromRel(e.v, ply);
    else { e = memo.get(k); if (e) ev = e.v; }
    if (e) {
      if (e.f === 0 || (e.f === 1 && ev >= beta) || (e.f === 2 && ev <= alpha)) {
        if (e.cap) capHit = true;
        return ev;
      }
    }
    if ((++nodes & 1023) === 0 && deadline && Date.now() > deadline) throw ABORT;
    const sCap = capHit;
    capHit = false;
    const maxer = st.turn === 0;
    const subs = attackSubsets(st).filter(x => x.length);
    if (e && e.b >= 0 && e.b < subs.length) { const t = subs[e.b]; subs[e.b] = subs[0]; subs[0] = t; }
    let a = alpha, b = beta, best = maxer ? -Infinity : Infinity, bestSub = null;
    for (const s of subs) {
      const v = attackValue(st, ply, s, a, b);
      if (maxer) { if (v > best) { best = v; bestSub = s; } if (best > a) a = best; }
      else { if (v < best) { best = v; bestSub = s; } if (best < b) b = best; }
      if (a >= b) break;
    }
    const myCap = capHit;
    capHit = sCap || myCap;
    const f = best <= alpha ? 2 : best >= beta ? 1 : 0;
    const bi = bestSub ? attackSubsets(st).filter(x => x.length).findIndex(x => x.join() === bestSub.join()) : -1;
    if (!myCap) memoX.set(sk, { v: toRel(best, ply), f, b: bi });   // 深さの限界に依存しない値
    else memo.set(k, { v: best, f, b: bi, cap: true });
    return best;
  }

  function attackValue(st, ply, attackers, alpha = -Infinity, beta = Infinity) {
    // 相手が攻撃しなかった直後に、こちらも攻撃しない → お互い動かない局面のくり返し（にらみ合い）で決着つかず
    if (!attackers.length && st.pp) return heuristic(st);
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

  // 読み筋（解説用）。深く読むと時間がかかることがあるので budgetMs で打ち切り、最後の手に cut を付ける
  function line(st, ply, attackers, limit = 12, budgetMs = 2000) {
    const saved = deadline;
    deadline = Date.now() + budgetMs;
    const steps = [];
    try { lineInner(st, ply, attackers, limit, steps); }
    catch (e) { if (e !== ABORT) throw e; if (steps.length) steps[steps.length - 1].cut = true; capHit = false; }
    finally { deadline = saved; }
    return steps;
  }
  function lineInner(st, ply, attackers, limit, steps) {
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
      if (!atk.length && cur.pp) {   // お互いに攻撃しない → にらみ合いで決着つかず
        steps.push({ side: cur.turn, attackers: [], blocks: [], dmg: 0, deadAtt: 0, deadDef: 0, gainAbs: [0, 0], life: cur.life.slice(), value: heuristic(cur), loop: true });
        break;
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

  // 読みの深さを変える（手数に依存しない memoX はそのまま使い回す）
  function setDepth(d) {
    maxPly = d; memo = memos.get(d) || new Map(); memos.set(d, memo);
    capHit = false;
  }
  // 外から1局面だけ評価：値と、深さの限界に当たったか
  function top(st, ply) { capHit = false; const v = value(st, ply); return { v, capped: capHit }; }
  return { value, top, attackValue, rootOptions, line, setDepth, capped: () => capHit, stats: () => ({ nodes, memo: memo.size, memoX: memoX.size }) };
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

// ---------- creature helpers ----------
// c.k = 盤面上の固定キーワード {fs,ds,dt,tr,me,vg,ll,ind,df,hx,wd,hs}、c.fs/c.ind/c.hex/c.tfly/c.prev = 呪文による一時的な効果
function P(c) { return Math.max(0, c.p + c.ctr + c.tp); }
function T(c) { return c.t + c.ctr + c.tt; }
function flies(c) { return c.fly || c.tfly; }
function isInd(c) { return c.ind || c.k.ind; }
function isHex(c) { return c.hex || c.k.hx; }
function canBlock(b, a) { return flies(a) ? (flies(b) || b.reach) : true; }
const KW_KEYS = ['fs', 'ds', 'dt', 'tr', 'me', 'vg', 'll', 'ind', 'df', 'hx', 'wd', 'hs'];
function kwOf(b) { const k = {}; for (const x of KW_KEYS) if (b[x]) k[x] = b[x]; return k; }
function newCreature(b) {
  return { p: b.p, t: b.t, fly: !!b.fly, reach: !!b.reach, k: kwOf(b), alive: true, inHand: false, sick: false, tap: false,
    ctr: 0, tp: 0, tt: 0, dmg: 0, dtHit: false, fs: false, ind: false, hex: false, prev: false, tfly: false };
}
let HC = {};   // 手札のクリーチャー: id('C0'...) → {side, slot, p, t, ..., flash, haste, cost}
function cardCost(id) { return HC[id] ? HC[id].cost : CARDS[id].cost; }
function isCreatureCard(id) { return !!HC[id]; }

// クリーチャーの複製（newCreature と同じ項目を直接書き写す。Object.assign より速く、ゴミも出にくい。k は共有して変更しない）
function cloneCr(c) {
  return { p: c.p, t: c.t, fly: c.fly, reach: c.reach, k: c.k, alive: c.alive, inHand: c.inHand, sick: c.sick, tap: c.tap,
    ctr: c.ctr, tp: c.tp, tt: c.tt, dmg: c.dmg, dtHit: c.dtHit, fs: c.fs, ind: c.ind, hex: c.hex, prev: c.prev, tfly: c.tfly };
}
function clone(s) {
  return {
    ply: s.ply, act: s.act, life: s.life.slice(), hand: [s.hand[0].slice(), s.hand[1].slice()], lands: s.lands, mana: s.mana.slice(), phase: s.phase,
    quiet: s.quiet, pp: s.pp,
    cr: [s.cr[0].map(cloneCr), s.cr[1].map(cloneCr)],
    atk: s.atk, blk: s.blk ? s.blk.slice() : null,
    win: s.win ? { prio: s.win.prio, passes: s.win.passes, stack: s.win.stack.map(x => ({ c: x.c, by: x.by, tg: x.tg.slice(), kick: x.kick })) } : null,
  };
}

function inCombat(s, side, i) {
  if (s.phase !== 'w2' && s.phase !== 'w3' && s.phase !== 'w4') return false;
  if (!s.atk) return false;
  if (side === s.act) return !!(s.atk >> i & 1);
  return s.blk && s.blk[i] >= 0;
}

// ---------- state-based actions ----------
function sba(s, ev) {
  for (let side = 0; side < 2; side++) {
    s.cr[side].forEach((c, i) => {
      if (!c.alive) return;
      const t = T(c);
      if (t <= 0 || ((c.dmg >= t || c.dtHit) && !isInd(c))) { c.alive = false; ev.push({ t: 'die', side, i }); }
    });
  }
}

// ---------- 唱えられる呪文 ----------
// 返り値: [{card, tg, kick, cost}]  tg: [side, idx] または ['P', side]
function castOptions(s, by) {
  const hand = s.hand[by];
  if (!hand.length) return [];
  const res = [];
  const seen = new Set();
  for (const id of hand) {
    if (seen.has(id)) continue; seen.add(id);
    if (isCreatureCard(id)) creatureOptions(s, by, id, res);
    else instantOptions(s, by, id, res);
  }
  return res;
}

function creatureOptions(s, by, id, res) {
  const H = HC[id];
  const stackEmpty = !s.win || s.win.stack.length === 0;
  if (!stackEmpty || H.cost > s.mana[by]) return;
  const ph = s.phase;
  if (H.flash) {
    // 瞬速：相手の攻撃後（ブロックに使う）か、ターン終了時
    if ((ph === 'w2' && by !== s.act) || ph === 'w4') res.push({ card: id, tg: [], cost: H.cost });
  } else {
    // それ以外（速攻など）：自分のメインフェイズ（戦闘前 w1 か 戦闘後 w4）
    if (by === s.act && (ph === 'w1' || ph === 'w4')) res.push({ card: id, tg: [], cost: H.cost });
  }
}

function wardCost(s, by, tg) {
  let w = 0;
  for (const t of tg) if (t[0] !== 'P' && t[0] !== by) w += s.cr[t[0]][t[1]].k.wd || 0;
  return w;
}

function instantOptions(s, by, id, out) {
  const C = CARDS[id], M = s.mana[by], opp = 1 - by;
  const stackEmpty = !s.win || s.win.stack.length === 0;
  const ph = s.phase;
  if (ph === 'w1' && stackEmpty) return;   // 戦闘前メインの窓は「速攻クリーチャーを唱える」専用
  // タイミングの枝刈り（結果が同じになる重複タイミングを除く）
  const trickTime = !stackEmpty || ph === 'w3' || (id === 'FLIGHT' && ph === 'w2');
  const own = [], foe = [];
  s.cr[by].forEach((c, i) => { if (c.alive) own.push(i); });
  s.cr[opp].forEach((c, i) => {
    if (!c.alive || isHex(c)) return;
    if (stackEmpty && ph === 'w2') { if (!(opp === s.act ? (s.atk >> i & 1) : !c.tap)) return; }
    if (stackEmpty && ph === 'w3' && !inCombat(s, opp, i)) return;
    foe.push(i);
  });
  const res = [];
  const add = (tg, base, kick) => { const cost = base + wardCost(s, by, tg); if (cost <= M) res.push({ card: id, tg, kick: !!kick, cost }); };
  // 相手のクリーチャーを強めて、自分の除去の対象にする組み合わせ（巨大化・確実な一撃→次の一手、束の間の飛行→壊れた翼）。
  // 手札にその除去があり、両方を唱えるマナがあるときだけ候補にする
  const comboOn = (killer, ok) => {
    if (!s.hand[by].includes(killer)) return;
    for (const i of foe) {
      const c = s.cr[opp][i];
      if (ok(c) && C.cost + CARDS[killer].cost + 2 * (c.k.wd || 0) <= M) add([[opp, i]], C.cost);
    }
  };
  // 相手の呪文に対応して自分のクリーチャーを弱め、次の一手（パワー4以上が対象）を立ち消えにする
  const shrinkOwn = d => {
    if (stackEmpty) return;
    for (const x of s.win.stack) {
      if (x.by !== opp || x.c !== 'MOVE') continue;
      for (const t of x.tg) {
        if (t[0] !== by) continue;
        const c = s.cr[by][t[1]];
        if (c.alive && P(c) - d < 4 && !(id === 'STAB' && T(c) - 2 <= c.dmg)) add([[by, t[1]]], C.cost);
      }
    }
  };
  switch (id) {
    case 'GG': case 'SURE': case 'FLIGHT': case 'VEIL':
      if (trickTime) for (const i of own) add([[by, i]], C.cost);
      if (id === 'GG' || id === 'SURE') comboOn('MOVE', c => P(c) < 4 && P(c) + 3 >= 4);
      if (id === 'FLIGHT') comboOn('WINGS', c => !flies(c));
      break;
    case 'DIVINE':
      if (!trickTime) break;
      if (M >= 4 && own.length > 1) add(own.map(i => [by, i]), 4, true);
      else for (const i of own) add([[by, i]], C.cost);
      break;
    case 'DISTRACT':
      if (trickTime) for (const i of foe) add([[opp, i]], C.cost);
      shrinkOwn(1);
      break;
    case 'STAB': case 'ABRADE': case 'DOWNFALL':
      for (const i of foe) add([[opp, i]], C.cost);
      if (id === 'STAB') shrinkOwn(2);
      break;
    case 'JOUST':
      for (const i of foe) if (inCombat(s, opp, i)) add([[opp, i]], C.cost);
      break;
    case 'BURST': {
      for (const i of foe) { const w = s.cr[opp][i].k.wd || 0; const kick = M >= 5 + w; add([[opp, i]], kick ? 5 : 1, kick); }
      const kick = M >= 5, dmg = kick ? 4 : 2;
      if (s.life[opp] <= dmg) add([['P', opp]], kick ? 5 : 1, kick); // プレイヤーへは致死のときだけ
      break;
    }
    case 'BITE':
      for (const a of own) if (P(s.cr[by][a]) > 0) for (const i of foe) add([[by, a], [opp, i]], C.cost);
      break;
    case 'WINGS':
      for (const i of foe) if (flies(s.cr[opp][i])) add([[opp, i]], C.cost);
      break;
    case 'MOVE':
      for (const i of foe) if (P(s.cr[opp][i]) >= 4) add([[opp, i]], C.cost);
      break;
    case 'REBUKE':
      for (const i of foe) add([[opp, i]], s.cr[opp][i].tap ? 2 : 5);
      break;
  }
  for (const r of res) out.push(r);
}

function legalTarget(s, by, id, tg) {
  if (tg[0] === 'P') return true;
  const [side, i] = tg, c = s.cr[side][i];
  if (!c.alive) return false;
  if (isHex(c) && side !== by) return false;
  if (id === 'JOUST' && !inCombat(s, side, i)) return false;
  if (id === 'WINGS' && !flies(c)) return false;
  if (id === 'MOVE' && P(c) < 4) return false;
  return true;
}

function resolveSpell(s, x, ev) {
  const id = x.c, by = x.by;
  if (isCreatureCard(id)) {
    const H = HC[id], c = s.cr[H.side][H.slot];
    c.alive = true; c.inHand = false; c.sick = true; c.tap = false;
    ev.push({ t: 'resolve', by, c: id }); ev.push({ t: 'enter', side: H.side, i: H.slot });
    return;
  }
  const ok = x.tg.map(tg => legalTarget(s, by, id, tg));
  if (!ok.some(Boolean) || (id === 'BITE' && !ok[1])) { ev.push({ t: 'fizzle', by, c: id }); return; }
  ev.push({ t: 'resolve', by, c: id });
  const cr = tg => s.cr[tg[0]][tg[1]];
  const tg0 = x.tg[0];
  switch (id) {
    case 'GG': { const c = cr(tg0); c.tp += 3; c.tt += 3; break; }
    case 'STAB': { const c = cr(tg0); c.tp -= 2; c.tt -= 2; break; }
    case 'SURE': { const c = cr(tg0); c.tp += 3; c.fs = true; break; }
    case 'JOUST': { cr(tg0).dmg += 3; s.life[by] += 1; ev.push({ t: 'gain', side: by, n: 1 }); break; }
    case 'ABRADE': { cr(tg0).dmg += 3; break; }
    case 'BURST': {
      const d = x.kick ? 4 : 2;
      if (tg0[0] === 'P') { s.life[tg0[1]] -= d; ev.push({ t: 'face', side: tg0[1], n: d }); }
      else cr(tg0).dmg += d;
      break;
    }
    case 'DIVINE': x.tg.forEach((tg, k) => { if (ok[k]) cr(tg).ind = true; }); break;
    case 'FLIGHT': { const c = cr(tg0); c.ctr += 1; c.tfly = true; c.prev = true; break; }
    case 'DISTRACT': { cr(tg0).tp -= 1; break; }
    case 'VEIL': { const c = cr(tg0); c.ctr += 1; c.hex = true; break; }
    case 'BITE': {
      if (!ok[0]) break;
      const src = cr(tg0), tgt = cr(x.tg[1]), n = P(src);
      if (n > 0) {
        tgt.dmg += n;
        if (src.k.dt) tgt.dtHit = true;                                    // 接死
        if (src.k.ll) { s.life[by] += n; ev.push({ t: 'gain', side: by, n }); }   // 絆魂
      }
      break;
    }
    case 'DOWNFALL': case 'WINGS': case 'MOVE': case 'REBUKE': {
      const c = cr(tg0);
      if (!isInd(c)) { c.alive = false; ev.push({ t: 'die', side: tg0[0], i: tg0[1] }); }
      break;
    }
  }
  sba(s, ev);
}

// ---------- 戦闘ダメージ（共通処理 ccCombat を使う） ----------
function combatDamage(s0) {
  const act = s0.act, def = 1 - act;
  const A = s0.cr[act], D = s0.cr[def];
  const aIdx = [], bIdx = [];
  A.forEach((c, i) => { if (s0.atk >> i & 1) aIdx.push(i); });
  const att = aIdx.map(i => {
    const c = A[i];
    return { P: P(c), T: T(c), dmg: c.dmg, dt: !!c.k.dt, tr: !!c.k.tr, ll: !!c.k.ll, ind: isInd(c), prev: c.prev, fs: c.fs || !!c.k.fs, ds: !!c.k.ds,
      alive: c.alive, blocked: s0.blk.some(x => x === i) };
  });
  const blk = [];
  D.forEach((c, j) => {
    if (s0.blk[j] < 0) return;
    bIdx.push(j);
    blk.push({ P: P(c), T: T(c), dmg: c.dmg, dt: !!c.k.dt, ll: !!c.k.ll, ind: isInd(c), prev: c.prev, fs: c.fs || !!c.k.fs, ds: !!c.k.ds,
      alive: c.alive, target: aIdx.indexOf(s0.blk[j]) });
  });
  const outs = ccCombat(att, blk);
  const seen = new Set(), res = [];
  for (const o of outs) {
    const ns = clone(s0), ev = [];
    aIdx.forEach((i, k) => { const c = ns.cr[act][i]; c.dmg = o.aDmg[k]; if (o.aDT[k]) c.dtHit = true; if (c.alive && !o.aAlive[k]) { c.alive = false; ev.push({ t: 'die', side: act, i }); } });
    bIdx.forEach((j, k) => { const c = ns.cr[def][j]; c.dmg = o.bDmg[k]; if (o.bDT[k]) c.dtHit = true; if (c.alive && !o.bAlive[k]) { c.alive = false; ev.push({ t: 'die', side: def, i: j }); } });
    if (o.toPlayer) { ns.life[def] -= o.toPlayer; ev.push({ t: 'face', side: def, n: o.toPlayer, combat: true }); }
    if (o.gain[0]) { ns.life[act] += o.gain[0]; ev.push({ t: 'gain', side: act, n: o.gain[0], ll: true }); }
    if (o.gain[1]) { ns.life[def] += o.gain[1]; ev.push({ t: 'gain', side: def, n: o.gain[1], ll: true }); }
    sba(ns, ev);
    const k = keyOf(ns);
    if (seen.has(k)) continue; seen.add(k);
    res.push({ s: ns, ev });
  }
  return res;
}

// ---------- flow ----------
function endTurn(s, ev) {
  // お互いに2ターン続けて何もしなかった（攻撃も呪文もなし）→ 同じ局面のくり返し（にらみ合い）で決着つかず
  if (s.quiet && s.pp) s.loopDraw = true;
  s.pp = s.quiet; s.quiet = true;
  for (const side of [0, 1]) for (const c of s.cr[side]) { c.tp = c.tt = c.dmg = 0; c.dtHit = c.fs = c.ind = c.hex = c.prev = c.tfly = false; }
  s.act = 1 - s.act; s.ply++;
  for (const c of s.cr[s.act]) { c.tap = false; c.sick = false; }     // アンタップ・召喚酔いが解ける
  s.mana[s.act] = s.lands[s.act];                                      // 土地もアンタップ
  s.atk = 0; s.blk = null; s.win = null;
  s.phase = 'w1'; // 戦闘前メイン（速攻クリーチャー用）。戦闘前のインスタントは「前のターンの終了時(w4)」に統合
  ev.push({ t: 'turn', act: s.act });
}

function openWindow(s, phase) { s.phase = phase; s.win = { prio: s.act, passes: 0, stack: [] }; }

function nextPhase(s, ev) {
  switch (s.phase) {
    case 'w1': s.win = null; s.phase = 'atk'; break;
    case 'w2': s.win = null; s.phase = 'blk'; break;
    case 'w3': s.win = null; s.phase = 'dmg'; break;
    case 'w4': endTurn(s, ev); break;
  }
}

function terminal(s) {
  if (s.life[1] <= 0) return WIN - s.ply;
  if (s.life[0] <= 0) return -WIN + s.ply;
  return null;
}

function canAttack(c) { return c.alive && !c.tap && !c.k.df && (!c.sick || c.k.hs); }
function handCount(s) { return s.hand[0].length + s.hand[1].length; }

// 決定が必要な局面まで自動で進める
function advance(s, ev, maxPly) {
  for (let guard = 0; guard < 100; guard++) {
    const tv = terminal(s);
    if (tv !== null) { s.val = tv; return s; }
    if (s.loopDraw) { s.val = heuristic(s); s.stalemate = true; return s; }
    if (s.ply >= maxPly) { s.val = heuristic(s); s.leaf = true; return s; }
    switch (s.phase) {
      case 'w1': case 'w2': case 'w3': case 'w4': {
        if (!s.win) {
          if (s.phase === 'w1' && vanillaHook && !disableVanilla && s.ply > 0 && (handCount(s) === 0 || s.ply >= trickPly)) {
            let v = vanillaHook(s);
            if (Math.abs(v) < 900) v += 12 * (s.hand[0].length - s.hand[1].length);
            s.val = v; s.vanilla = true; s.approx = handCount(s) > 0; return s;
          }
          openWindow(s, s.phase);
        }
        const w = s.win;
        if (w.passes >= 2) {
          if (w.stack.length === 0) { nextPhase(s, ev); continue; }
          const x = w.stack.pop();
          resolveSpell(s, x, ev);
          w.passes = 0; w.prio = s.act;
          continue;
        }
        if (castOptions(s, w.prio).length === 0) { w.passes++; w.prio = 1 - w.prio; continue; }
        s.dec = w.prio; return s;
      }
      case 'atk': {
        if (!s.cr[s.act].some(canAttack)) { s.atk = 0; s.phase = 'w4'; s.win = null; continue; }
        s.dec = s.act; return s;
      }
      case 'blk': {
        const def = 1 - s.act;
        const attackersAlive = s.cr[s.act].some((c, i) => (s.atk >> i & 1) && c.alive);
        const blockers = s.cr[def].some(c => c.alive && !c.tap);
        if (!attackersAlive || !blockers) { s.blk = s.cr[def].map(() => -1); s.phase = 'w3'; s.win = null; ev.push({ t: 'blk', pairs: [] }); continue; }
        s.dec = def; return s;
      }
      case 'dmg': {
        s.dec = s.act; return s;
      }
    }
  }
  throw new Error('advance loop');
}

let vanillaHook = null;
let disableVanilla = false;   // テスト用：基本用エンジンへの切り替えを止める
let deadline = 0; const ABORT = { abort: true };
let trickPly = 10; // このターン数以降は手札を無視したバニラ探索で近似（各難易度で maxPly と同じにして、常にインスタントを考慮）
const vanillaCache = new Map();
function vanillaSides(s) {
  return [0, 1].map(side => s.cr[side].map(c => Object.assign({}, c.k, { p: Math.max(0, c.p + c.ctr), t: c.t + c.ctr, fly: c.fly, reach: c.reach })));
}
function vanillaState(s) {
  const mask = side => s.cr[side].reduce((m, c, i) => c.alive ? m | 1 << i : m, 0);
  const def = 1 - s.act;
  const tapped = s.cr[def].reduce((m, c, i) => c.alive && c.tap ? m | 1 << i : m, 0);
  return { a: [mask(0), mask(1)], life: s.life.slice(), turn: s.act, tapped, pp: s.pp };
}
function vanillaValue(s, maxPly) {
  const sides = vanillaSides(s);
  const bk = JSON.stringify(sides) + maxPly;
  let solver = vanillaCache.get(bk);
  if (!solver) { solver = makeVanilla({ me: sides[0], op: sides[1] }, maxPly); vanillaCache.set(bk, solver); if (vanillaCache.size > 2000) vanillaCache.clear(); }
  const r = solver.top(vanillaState(s), s.ply);
  s.vcap = r.capped;
  const v = r.v;
  if (v >= 900) return v + 1;
  if (v <= -900) return v - 1;
  return v;
}

// 決定局面の子：[{ev, s}]
// 次の手の一覧。局面は必要になったときに作る（枝刈りで読まない手のコピー・先送りを省くため）。手の順番は変えない
function childThunks(s, maxPly) {
  const out = [];
  const mk = build => out.push(() => { const [ns, ev] = build(); delete ns.dec; return { ev, s: advance(ns, ev, maxPly) }; });
  switch (s.phase) {
    case 'w1': case 'w2': case 'w3': case 'w4': {
      const p = s.win.prio;
      mk(() => { const ns = clone(s); ns.win.passes++; ns.win.prio = 1 - p; return [ns, []]; });
      for (const o of castOptions(s, p)) {
        mk(() => {
          const ns = clone(s);
          ns.hand[p].splice(ns.hand[p].indexOf(o.card), 1);
          ns.mana[p] -= o.cost;
          ns.win.stack.push({ c: o.card, by: p, tg: o.tg, kick: !!o.kick });
          ns.win.prio = 1 - p; ns.win.passes = 1; ns.quiet = false;
          return [ns, [{ t: 'cast', by: p, c: o.card, tg: o.tg, kick: !!o.kick, resp: s.win.stack.length > 0 }]];
        });
      }
      break;
    }
    case 'atk': {
      const A = s.cr[s.act];
      const avail = []; A.forEach((c, i) => { if (canAttack(c)) avail.push(i); });
      for (let m = 0; m < (1 << avail.length); m++) {
        mk(() => {
          const ns = clone(s); let mask = 0;
          avail.forEach((i, j) => { if (m >> j & 1) { mask |= 1 << i; if (!ns.cr[s.act][i].k.vg) ns.cr[s.act][i].tap = true; } });
          ns.atk = mask; if (mask) ns.quiet = false;
          ns.phase = mask ? 'w2' : 'w4'; ns.win = null;
          return [ns, [{ t: 'atk', side: s.act, mask }]];
        });
      }
      break;
    }
    case 'blk': {
      const def = 1 - s.act, D = s.cr[def], A = s.cr[s.act];
      const bl = []; D.forEach((c, i) => { if (c.alive && !c.tap) bl.push(i); });
      const at = []; A.forEach((c, i) => { if ((s.atk >> i & 1) && c.alive) at.push(i); });
      const asg = D.map(() => -1);
      const menaceOK = () => at.every(a => !A[a].k.me || asg.filter(x => x === a).length !== 1);
      const rec = k => {
        if (k === bl.length) {
          if (!menaceOK()) return;   // 威迫：1体だけではブロックできない
          const blk = asg.slice();
          mk(() => {
            const ns = clone(s); ns.blk = blk; ns.phase = 'w3'; ns.win = null;
            const pairs = []; blk.forEach((a, b) => { if (a >= 0) pairs.push([b, a]); });
            return [ns, [{ t: 'blk', pairs }]];
          });
          return;
        }
        asg[bl[k]] = -1; rec(k + 1);
        for (const a of at) if (canBlock(D[bl[k]], A[a])) { asg[bl[k]] = a; rec(k + 1); }
        asg[bl[k]] = -1;
      };
      rec(0);
      break;
    }
    case 'dmg': {
      for (const o of combatDamage(s)) mk(() => { const ns = o.s; ns.phase = 'w4'; ns.win = null; return [ns, o.ev]; });
      break;
    }
  }
  return out;
}
function children(s, maxPly) { return childThunks(s, maxPly).map(f => f()); }

function heuristic(s) {
  let v = 0;
  for (const side of [0, 1]) {
    const sg = side === 0 ? 1 : -1;
    for (const c of s.cr[side]) if (c.alive) v += sg * ccValue(Object.assign({ fly: c.fly }, c.k), c.p + c.ctr, c.t + c.ctr);
    v += sg * 12 * s.hand[side].length;
  }
  v += 3 * (s.life[0] - s.life[1]);
  return Math.max(-400, Math.min(400, v));
}

function keyOf(s, noPly) { return s.phase + (noPly ? '' : s.ply) + keyRest(s); }
// 局面の記録用の文字列（手数より後ろの部分）
function keyRest(s) {
  let k = (s.quiet ? 'q' : '') + (s.pp ? 'p' : '') + '|' + s.act + '|' + s.life[0] + ',' + s.life[1] + '|' + s.hand[0].join('.') + ',' + s.hand[1].join('.') + '|' + s.mana[0] + ',' + s.mana[1] + '|' + s.atk + '|' + (s.blk ? s.blk.join('.') : '') + '|';
  for (const side of [0, 1]) for (const c of s.cr[side]) {
    k += c.alive ? (c.tap ? 'T' : 'U') + (c.sick ? 's' : '') + c.ctr + ',' + c.tp + ',' + c.tt + ',' + c.dmg + (c.dtHit ? 'd' : '') + (c.fs ? 'f' : '') + (c.ind ? 'i' : '') + (c.hex ? 'h' : '') + (c.prev ? 'p' : '') + (c.tfly ? 'y' : '') + ';' : 'x;';
  }
  if (s.win) k += '|' + s.win.prio + s.win.passes + s.win.stack.map(x => x.c + x.by + JSON.stringify(x.tg)).join('/');
  return k;
}

// 記録する値（評価値・上限下限の印・最善手の番号）を数値1つにまとめる（オブジェクトを作らずメモリ掃除を減らす）
const PK_B = 4096, PK_V = 1048576;
function packE(v, f, b) {
  return Number.isInteger(v) && v > -PK_V && v < PK_V && b < PK_B ? ((v + PK_V) * 4 + f) * PK_B + b : { v, f, b };
}
function unpackB(r) { return typeof r === 'number' ? r % PK_B : r.b; }
function unpackF(r) { return typeof r === 'number' ? ((r - r % PK_B) / PK_B) % 4 : r.f; }
function unpackV(r) { if (typeof r !== 'number') return r.v; const t = (r - r % PK_B) / PK_B; return (t - t % 4) / 4 - PK_V; }
function makeSolver(maxPly, tp) {
  trickPly = tp !== undefined ? tp : maxPly;
  vanillaHook = s => vanillaValue(s, maxPly);
  const memos = new Map();
  let memo = new Map();      // 深さの限界（や近似）に依存する値：手数つきのキー
  memos.set(maxPly, memo);
  const memoX = new Map();   // 深さの限界に依存しない値：手数なしのキー、勝敗は相対手数で保存
  let capHit = false;
  let nodes = 0;
  const toRel = (v, p) => v >= 900 ? v + p : v <= -900 ? v - p : v;
  const fromRel = (v, p) => v >= 900 ? v - p : v <= -900 ? v + p : v;
  function search(s, alpha = -Infinity, beta = Infinity) {
    if (s.val !== undefined) {
      if (s.leaf || s.approx || s.vcap) capHit = true;
      return s.val;
    }
    const rest = keyRest(s), kx = s.phase + rest;   // 記録用の文字列は1回だけ作る
    let k, has = false, ev, ef = 0, eb = 0, ecap = false;
    const rx = memoX.get(kx);
    if (rx !== undefined) { has = true; ev = fromRel(unpackV(rx), s.ply); ef = unpackF(rx); eb = unpackB(rx); }
    else {
      k = s.phase + s.ply + rest;
      const rm = memo.get(k);
      if (rm !== undefined) { has = true; ev = unpackV(rm); ef = unpackF(rm); eb = unpackB(rm); ecap = true; }
    }
    if (has) {
      if (ef === 0 || (ef === 1 && ev >= beta) || (ef === 2 && ev <= alpha)) {
        if (ecap) capHit = true;
        return ev;
      }
    }
    nodes++;
    if ((nodes & 2047) === 0 && deadline && Date.now() > deadline) throw ABORT;
    const sCap = capHit;
    capHit = false;
    const maxer = s.dec === 0;
    const ch = childThunks(s, maxPly);   // 局面は読む直前に作る
    if (has && eb < ch.length) { const t = ch[eb]; ch[eb] = ch[0]; ch[0] = t; }
    let a = alpha, b = beta, best = maxer ? -Infinity : Infinity, bi = 0;
    for (let j = 0; j < ch.length; j++) {
      const v = search(ch[j]().s, a, b);
      if (maxer ? v > best : v < best) { best = v; bi = j; }
      if (maxer) { if (best > a) a = best; } else { if (best < b) b = best; }
      if (a >= b) break;
    }
    const myCap = capHit;
    capHit = sCap || myCap;
    const f = best <= alpha ? 2 : best >= beta ? 1 : 0;
    let orig = bi;
    if (has && eb < ch.length) { if (bi === 0) orig = eb; else if (bi === eb) orig = 0; }
    if (!myCap) memoX.set(kx, packE(toRel(best, s.ply), f, orig));
    else memo.set(k === undefined ? s.phase + s.ply + rest : k, packE(best, f, orig));
    return best;
  }
  // 読みの深さを変える（深さに依存しない memoX はそのまま使い回す）
  function setDepth(d) {
    maxPly = d; memo = memos.get(d) || new Map(); memos.set(d, memo);
    capHit = false;
    if (tp === undefined) trickPly = d;
    vanillaHook = s => vanillaValue(s, maxPly);
  }
  // 読み筋（解説用）。時間がかかりすぎたら打ち切って 'cut' を付ける
  function line(s, limit = 400, budgetMs = 2000) {
    const saved = deadline;
    deadline = Date.now() + budgetMs;
    const evs = [];
    try { lineInner(s, limit, evs); }
    catch (e) { if (e !== ABORT) throw e; evs.push({ t: 'cut' }); capHit = false; }
    finally { deadline = saved; }
    return evs;
  }
  // 最善手（同点なら最初に見つけたもの）でそのターンの終わりまで進めたときの盤面の点数（読み筋の同点の選び分け用）
  function settle(st) {
    let cur = st;
    for (let n = 0; n < 80 && cur.val === undefined && !cur.vanilla && cur.ply === st.ply; n++) {
      const ch = children(cur, maxPly), maxer = cur.dec === 0;
      let b = maxer ? -Infinity : Infinity, pk = ch[0];
      for (const c of ch) { const v = search(c.s); if (maxer ? v > b : v < b) { b = v; pk = c; } }
      cur = pk.s;
    }
    return cur.val !== undefined && Math.abs(cur.val) >= 900 ? cur.val : heuristic(cur);
  }
  function lineInner(s, limit, evs) {
    let cur = s;
    for (let n = 0; n < limit; n++) {
      if (cur.vanilla) { if (cur.approx) evs.push({ t: 'approx' }); evs.push(...vanillaLine(cur, maxPly)); break; }
      if (cur.val !== undefined) { evs.push({ t: cur.leaf ? 'horizon' : 'end', val: cur.val }); break; }
      const ch = children(cur, maxPly);
      const maxer = cur.dec === 0;
      const vals = ch.map(c => search(c.s));
      const best = maxer ? Math.max(...vals) : Math.min(...vals);
      const ties = ch.filter((c, j) => vals[j] === best);
      // 同じ結果になる手が複数あるときは、そのターンの終わりの盤面の点数が手番の人にとって良いほうを表示する
      let pick = ties[0];
      if (ties.length > 1) {
        let bs = maxer ? -Infinity : Infinity;
        for (const c of ties) { const v = settle(c.s); if (maxer ? v > bs : v < bs) { bs = v; pick = c; } }
      }
      evs.push(...pick.ev);
      cur = pick.s;
    }
    return evs;
  }
  return { search, line, setDepth, capped: () => capHit, resetCap: () => { capHit = false; }, depth: () => maxPly, children: s => children(s, maxPly), stats: () => ({ nodes, memo: memo.size, memoX: memoX.size }) };
}

// 基本用エンジンで続きの展開を作り、イベント形式に変換
function vanillaLine(s, maxPly) {
  const sides = vanillaSides(s);
  const solver = makeVanilla({ me: sides[0], op: sides[1] }, maxPly);
  const steps = solver.line(vanillaState(s), s.ply, null, 40);
  return v1StepsToEvents(steps, true);
}
function v1StepsToEvents(steps, firstHasNoTurn) {
  const evs = [];
  let first = true;
  for (const x of steps) {
    if (!first || !firstHasNoTurn) { if (!first) evs.push({ t: 'turn', act: x.side }); }
    first = false;
    const mask = x.attackers.reduce((m, i) => m | 1 << i, 0);
    evs.push({ t: 'atk', side: x.side, mask });
    if (mask) {
      evs.push({ t: 'blk', pairs: x.blocks.map(([b, a]) => [b, a]) });
      for (let i = 0; i < 8; i++) if (x.deadAtt >> i & 1) evs.push({ t: 'die', side: x.side, i });
      for (let i = 0; i < 8; i++) if (x.deadDef >> i & 1) evs.push({ t: 'die', side: 1 - x.side, i });
      if (x.dmg) evs.push({ t: 'face', side: 1 - x.side, n: x.dmg, combat: true });
      if (x.gainAbs) for (const sd of [0, 1]) if (x.gainAbs[sd]) evs.push({ t: 'gain', side: sd, n: x.gainAbs[sd], ll: true });
    }
    if (x.life[0] <= 0 || x.life[1] <= 0) { evs.push({ t: 'end' }); return evs; }
    if (x.cut) { evs.push({ t: 'cut' }); return evs; }
  }
  evs.push({ t: 'horizon' });
  return evs;
}

// hc: 手札クリーチャーの定義 [{side, p, t, (キーワード), flash, haste, cost}] → id 'C0','C1'...
function setHandCreatures(board, hc) {
  HC = {};
  const n = [board.me.length, board.op.length];
  (hc || []).forEach((d, i) => { HC['C' + i] = Object.assign({}, d, { slot: n[d.side]++ }); });
}
function initialState(board, life, hand, lands, tappedOp) {
  const s = {
    ply: 0, act: 0, life: life.slice(), hand: [hand[0].slice(), hand[1].slice()], lands: lands.slice(), mana: lands.slice(), phase: 'atk',
    quiet: true, pp: false,   // quiet: このターンまだ誰も攻撃も呪文もしていない / pp: 前のターンがそうだった
    cr: [board.me.map(newCreature), board.op.map(newCreature)], atk: 0, blk: null, win: null,
  };
  for (const id of Object.keys(HC)) {
    const H = HC[id], c = newCreature(Object.assign({}, H, { hs: H.haste }));
    c.alive = false; c.inHand = true;
    s.cr[H.side][H.slot] = c;
  }
  s.cr[1].forEach((c, i) => { if (tappedOp >> i & 1) c.tap = true; });
  return s;
}

// ルート：自分のターンの攻撃宣言（速攻クリーチャーを戦闘前に唱えるかどうかも含む）
// budgetMs を指定すると、maxPly まで時間の許すかぎり深く読み直す（最初の深さ BASE_PLY は必ず読み切る）
const BASE_PLY = 10, DEPTHS2 = [10, 20, 30, 40, 60];
function rootOptions(board, life, hand, lands, tappedOp, maxPly, tp, hc, budgetMs = 0, lazy = false) {
  setHandCreatures(board, hc);
  const depths = budgetMs ? DEPTHS2.filter(d => d < maxPly).concat([maxPly]) : [maxPly];
  const solver = makeSolver(depths[0], tp);
  const s0 = initialState(board, life, hand, lands, tappedOp);
  const variants = [{ cast: null, s: s0, pre: [] }];
  for (const id of new Set(s0.hand[0])) {
    const H = HC[id];
    if (!H || H.flash || H.cost > s0.mana[0]) continue;
    const s1 = clone(s0);
    s1.hand[0].splice(s1.hand[0].indexOf(id), 1);
    s1.mana[0] -= H.cost; s1.quiet = false;
    const c = s1.cr[0][H.slot]; c.alive = true; c.inHand = false; c.sick = true;
    variants.push({ cast: id, s: s1, pre: [{ t: 'cast', by: 0, c: id, tg: [] }, { t: 'resolve', by: 0, c: id }, { t: 'enter', side: 0, i: H.slot }] });
  }
  const evalAll = d => {
    const opts = [];
    for (const vt of variants) {
      const pre = [];
      const st = advance(clone(vt.s), pre, d);
      if (st.val !== undefined || st.phase !== 'atk' || st.act !== 0 || st.ply !== 0) {
        // 攻撃できるクリーチャーがいない：選択肢は「攻撃しない」だけ
        opts.push({ cast: vt.cast, attackers: [], value: st.val !== undefined ? st.val : solver.search(st), _ch: { ev: [{ t: 'atk', side: 0, mask: 0 }].concat(pre), s: st }, _pre: vt.pre });
        continue;
      }
      for (const ch of solver.children(st)) {
        const mask = ch.ev[0].mask;
        const attackers = []; for (let i = 0; i < 8; i++) if (mask >> i & 1) attackers.push(i);
        opts.push({ cast: vt.cast, attackers, value: solver.search(ch.s), _ch: ch, _pre: vt.pre });
      }
    }
    return opts;
  };
  const outer = deadline, t0 = Date.now();
  let res = null;
  for (const d of depths) {
    solver.setDepth(d); solver.resetCap();
    if (res) deadline = outer ? Math.min(outer, t0 + budgetMs) : t0 + budgetMs;
    try { res = { opts: evalAll(d), depth: d }; }
    catch (e) { if (e !== ABORT || !res) throw e; break; }
    finally { deadline = outer; }
    if (!solver.capped()) break;   // 深さの限界に一度も当たらずに読み切れた
  }
  solver.setDepth(res.depth);
  const opts = res.opts;
  // 読み筋（解説）。lazy のときは後から lineOf(optKey) で作る（生成を速くするため）
  const src = new Map(opts.map(o => [optKey(o), { pre: o._pre, ch: o._ch }]));
  for (const o of opts) { delete o._ch; delete o._pre; }
  const lineOf = key => {
    const x = src.get(key);
    setHandCreatures(board, hc); solver.setDepth(res.depth);   // 別の問題を解いた後でも、この問題の設定に戻す
    return x.pre.concat(x.ch.ev, solver.line(x.ch.s));
  };
  if (!lazy) for (const o of opts) o.line = lineOf(optKey(o));
  return { opts, solver, maxPly: res.depth, lineOf };
}


// ---------- classification & generation ----------
function classify(v) {
  if (v >= 900) { const p = WIN - v; return p % 2 === 0 ? { cls: 'win', n: p / 2 + 1, mine: true } : { cls: 'win', n: (p + 1) / 2, mine: false }; }
  if (v <= -900) { const p = v + WIN; return p % 2 === 1 ? { cls: 'loss', n: (p + 1) / 2, mine: false } : { cls: 'loss', n: p / 2 + 1, mine: true }; }
  return { cls: 'open', n: 0 };
}
function gradeOptions(opts) {
  const best = Math.max(...opts.map(o => o.value));
  const bc = classify(best);
  for (const o of opts) {
    const c = classify(o.value); o.c = c;
    if (bc.cls === 'win') o.grade = o.value === best ? 'best' : c.cls === 'win' ? 'slow' : c.cls === 'open' ? 'open' : 'loss';
    else if (bc.cls === 'open') o.grade = c.cls === 'open' ? (best - o.value <= 30 ? 'best' : 'open') : 'loss';
    else o.grade = o.value === best ? 'best' : 'loss';
  }
  return bc;
}

const LEVELS = {
  easy:   { me: [1, 2], op: [1, 2], life: [2, 7],  flyP: 0.2, tapP: 0.15, handP: [0.5, 0.8], creatureP: [0.2, 0.25], kwP: 0.25, kwMax: 1, maxPly: 60, trickPly: 60 },
  normal: { me: [2, 3], op: [1, 2], life: [2, 9],  flyP: 0.2, tapP: 0.2,  handP: [0.7, 0.8], creatureP: [0.3, 0.3],  kwP: 0.4,  kwMax: 2, maxPly: 60, trickPly: 60, swap: true },
  hard:   { me: [2, 3], op: [2, 3], life: [3, 10], flyP: 0.2, tapP: 0.25, handP: [0.8, 0.8], creatureP: [0.35, 0.3], kwP: 0.5,  kwMax: 2, maxPly: 60, trickPly: 60, maxTotal: 5 },
};
function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function randCreature(flyP, kwP = 0, kwMax = 0) {
  const p = rint(1, 5);
  const t = Math.max(1, Math.min(6, p + rint(-2, 2)));
  const fly = Math.random() < flyP;
  return addKeywords({ p, t, fly, reach: !fly && Math.random() < 0.1 }, kwP, kwMax, KW_POOL_SPELL);
}
// 手札のクリーチャー（速攻か瞬速）。コストはP/Tとキーワードから決める
const HAND_KW = [['fly', 3], ['fs', 2], ['dt', 2], ['tr', 2], ['me', 1], ['vg', 1], ['ll', 2], ['hx', 1]];
function randHandCreature(side) {
  const p = rint(1, 4), t = rint(1, 4);
  const c = { side, p, t, flash: Math.random() < 0.5 };
  c.haste = !c.flash;
  let nk = 0;
  if (Math.random() < 0.4) { const k = pickWeighted(HAND_KW); c[k] = true; nk = 1; }
  c.cost = Math.max(1, Math.min(5, Math.ceil((p + t) / 2) + nk));
  return c;
}
const optKey = o => (o.cast || '') + ':' + o.attackers.join();
function instCost(id) { return CARDS[id].cost; }

// ---------- 解く（フィルタなし。問題IDからの復元にも使う） ----------
// spec: { level, board, life, tapped, hand:[[ids],[ids]], lands, hc:[手札クリーチャー定義], scen? }
const SOLVE_BUDGET = 8000;
// 手札なしの基本エンジンで、時間の許すかぎり深く読む
function vanillaDeep(board, st, maxPly, budgetMs) {
  const depths = DEPTHS2.filter(d => d < maxPly).concat([maxPly]);
  const vs = makeVanilla(board, depths[0]);
  const outer = deadline, t0 = Date.now();
  let opts = null;
  for (const d of depths) {
    vs.setDepth(d);
    if (opts) deadline = outer ? Math.min(outer, t0 + budgetMs) : t0 + budgetMs;
    try { opts = vs.rootOptions(st); }
    catch (e) { if (e !== ABORT || !opts) throw e; break; }
    finally { deadline = outer; }
    if (!vs.capped()) break;
  }
  return opts;
}
function solveFdn(spec, tp, lazy = false) {
  vanillaCache.clear();
  const L = LEVELS[spec.level];
  const { board, life, hand, lands, tapped } = spec;
  const hc = spec.hc || [];
  const nm = board.me.length, no = board.op.length;
  const st = { a: [(1 << nm) - 1, (1 << no) - 1], life: life.slice(), turn: 0, tapped };
  const naive = vanillaDeep(board, st, tp ? BASE_PLY : L.maxPly, 3000);   // 手札がなかったときの答え（比較用）
  const nbest = Math.max(...naive.map(o => o.value));
  const naiveBest = naive.filter(o => o.value === nbest).map(o => o.attackers);
  // tp あり：手札を tp ターンだけ考える速い近似（生成時のふるい）。なし：最大 L.maxPly まで時間の許すかぎり深く
  const r = tp ? rootOptions(board, life, hand, lands, tapped, BASE_PLY, tp, hc, 0, true)
               : rootOptions(board, life, hand, lands, tapped, L.maxPly, undefined, hc, SOLVE_BUDGET, lazy);
  const opts = r.opts;
  const bc = gradeOptions(opts);
  const p = {
    mode: 'fdn', level: spec.level, board, life, hand, lands, tapped, hc, maxPly: r.maxPly, best: bc, naiveBest,
    opts: opts.map(o => ({ cast: o.cast, attackers: o.attackers, value: o.value, grade: o.grade, c: o.c, line: o.line })),
  };
  if (lazy) p.lineFn = r.lineOf;   // 読み筋を後から作る関数（ワーカー内だけで使う）
  return p;
}

function solveRead(spec, tp, lazy = false) {
  vanillaCache.clear();
  const L = READ_LEVELS[spec.level];
  const { board, life, hand, lands, tapped, scen } = spec;
  const hc = spec.hc || [];
  const probs = scen.map(() => 100 / scen.length); // 候補は均等確率
  let depth = Infinity;
  const lineOfs = [];
  const per = scen.map(h => {
    const r = tp ? rootOptions(board, life, [hand[0], h ? [h] : []], lands, tapped, BASE_PLY, tp, hc, 0, true)
                 : rootOptions(board, life, [hand[0], h ? [h] : []], lands, tapped, L.maxPly, undefined, hc, Math.round(SOLVE_BUDGET / scen.length), lazy);
    depth = Math.min(depth, r.maxPly); lineOfs.push(r.lineOf);
    gradeOptions(r.opts);
    return r.opts;
  });
  const keys = per[0].map(optKey);
  const options = keys.map(k => {
    const cells = per.map(opts => { const o = opts.find(x => optKey(x) === k); return { c: o.c, score: scoreOf(o.c), line: o.line }; });
    const ev = cells.reduce((s, c, i) => s + c.score * probs[i] / 100, 0);
    const o0 = per[0].find(o => optKey(o) === k);
    return { cast: o0.cast, attackers: o0.attackers, cells, ev: Math.round(ev * 1000) / 1000 };
  });
  const maxEv = gradeRead(options);
  const p = { mode: 'read', level: spec.level, board, life, tapped, hand: [hand[0], []], lands, hc, scen, probs, maxPly: depth, maxEv, opts: options };
  if (lazy) p.lineFn = (key, si) => lineOfs[si](key);
  return p;
}

function randBoard(L) {
  let nm = rint(L.me[0], L.me[1]), no = rint(L.op[0], L.op[1]);
  if (L.swap && Math.random() < 0.5) [nm, no] = [no, nm];
  if (L.maxTotal && nm + no > L.maxTotal) { if (Math.random() < 0.5) nm--; else no--; }
  const board = { me: [], op: [] };
  for (let i = 0; i < nm; i++) board.me.push(randCreature(L.flyP, L.kwP, L.kwMax));
  for (let i = 0; i < no; i++) board.op.push(randCreature(L.flyP, L.kwP, L.kwMax));
  board.me.sort((a, b) => b.p - a.p || b.t - a.t);
  board.op.sort((a, b) => b.p - a.p || b.t - a.t);
  let tapped = 0;
  if (Math.random() < L.tapP) for (let i = 0; i < no; i++) if (Math.random() < 0.5 && !board.op[i].df) tapped |= 1 << i;
  if (tapped === (1 << no) - 1) tapped = 0;
  return { board, tapped };
}

// 自分の手札（インスタント＋クリーチャーなら、土地はどちらか片方しか唱えられない枚数）
function randMyHand(L, hc) {
  const hand = [];
  let inst = null, cre = null;
  if (Math.random() < L.handP[0]) inst = CARD_IDS[rint(0, CARD_IDS.length - 1)];
  if (Math.random() < L.creatureP[0]) cre = randHandCreature(0);
  if (inst && cre && inst === 'REBUKE') inst = null;   // 光明の叱責はコストが変わるので組み合わせない
  let lands;
  if (inst && cre) {
    const a = instCost(inst), b = cre.cost;
    const lo = Math.max(a, b), hi = Math.min(5, a + b - 1);
    if (lo > hi) return null;
    lands = rint(lo, hi);
  } else if (inst || cre) {
    const c = inst ? (CARDS[inst].cost === 5 ? 2 : CARDS[inst].cost) : cre.cost;
    lands = Math.random() < 0.85 ? rint(Math.min(5, c), 5) : rint(1, 5);
  } else lands = rint(1, 5);
  if (inst) hand.push(inst);
  if (cre) { hand.push('C' + hc.length); hc.push(cre); }
  return { hand, lands };
}

// ---------- 生成（ランダム盤面 → 解く → フィルタ） ----------
function tryPuzzle(levelName, lazy = false) {
  const L = LEVELS[levelName];
  const { board, tapped } = randBoard(L);
  const hc = [];
  const mine = randMyHand(L, hc);
  if (!mine) return null;
  const opHand = [];
  let opLands = rint(1, 5);
  if (Math.random() < L.handP[1]) {
    if (Math.random() < L.creatureP[1]) { const c = randHandCreature(1); opHand.push('C' + hc.length); hc.push(c); opLands = Math.random() < 0.85 ? rint(c.cost, 5) : opLands; }
    else { const id = CARD_IDS[rint(0, CARD_IDS.length - 1)]; opHand.push(id); const c = CARDS[id].cost === 5 ? 2 : CARDS[id].cost; opLands = Math.random() < 0.85 ? rint(Math.min(5, c), 5) : opLands; }
  }
  if (!mine.hand.length && !opHand.length) return null;
  const life = [rint(L.life[0], L.life[1]), rint(L.life[0], L.life[1])];
  const spec = { level: levelName, board, life, hand: [mine.hand, opHand], lands: [mine.lands, opLands], tapped, hc };
  // まず手札を4ターンだけ考える速い探索でふるいにかけ、通ったものだけ10ターン全部インスタントを考えて解き直す
  for (const tp of [PRE_TRICK, 0]) {
    let p;
    deadline = Date.now() + (tp ? 15000 : 30000);
    try { p = solveFdn(spec, tp, lazy); }
    catch (e) { if (e === ABORT) return null; throw e; } finally { deadline = 0; }
    if (!fdnOK(p)) return null;
    if (!tp) return p;
  }
}
const PRE_TRICK = 4;
function fdnOK(p) {
  const opts = p.opts;
  if (opts.length < 2 || p.best.cls !== 'win') return false;   // 勝てる手がない問題は出さない
  if (opts.filter(o => o.grade === 'best').length / opts.length > 0.5) return false;
  // 手札を無視した答えが間違いになる問題だけ
  const nb = p.naiveBest.map(a => a.join());
  return opts.some(o => !o.cast && nb.includes(o.attackers.join()) && o.grade !== 'best');
}

function generate(levelName, budgetMs = 20000, lazy = false) {
  const t0 = Date.now(); let tries = 0;
  while (Date.now() - t0 < budgetMs) { tries++; const p = tryPuzzle(levelName, lazy); if (p) { p.tries = tries; p.ms = Date.now() - t0; return p; } }
  return null;
}

// ---------- 読みモード（相手の手札1枚が候補のどれか・均等） ----------
const READ_LEVELS = {
  easy:   { me: [2, 2], op: [1, 2], life: [2, 8],  flyP: 0.2, tapP: 0.15, handP: [0.35, 0], creatureP: [0.2, 0.25], kwP: 0.25, kwMax: 1, nCards: 1, maxPly: 60, trickPly: 60 },
  normal: { me: [2, 3], op: [1, 2], life: [2, 9],  flyP: 0.2, tapP: 0.2,  handP: [0.5, 0],  creatureP: [0.25, 0.3], kwP: 0.4,  kwMax: 2, nCards: 2, maxPly: 60, trickPly: 60, swap: true },
  hard:   { me: [2, 3], op: [2, 3], life: [3, 10], flyP: 0.2, tapP: 0.25, handP: [0.5, 0],  creatureP: [0.3, 0.3],  kwP: 0.5,  kwMax: 2, nCards: 3, maxPly: 60, trickPly: 60, maxTotal: 5 },
};
function scoreOf(c) { return c.cls === 'win' ? 1 : c.cls === 'loss' ? 0 : 0.5; }
// どの候補でも一度も勝てない手（決着つかず・負けだけ）は、期待値が高くても正解にしない
const canWin = o => o.cells.some(c => c.c.cls === 'win');
function gradeRead(options) {
  const elig = options.filter(canWin);
  const pool = elig.length ? elig : options;   // どの手も勝てない（古い問題IDの復元だけで起こる）ときは期待値だけで比べる
  const maxEv = Math.max(...pool.map(o => o.ev));
  for (const o of options) {
    const ok = !elig.length || canWin(o);
    o.grade = ok && o.ev >= maxEv - 0.05 ? 'best' : ok && o.ev >= maxEv - 0.15 ? 'slow' : 'loss';
  }
  return maxEv;
}

function tryRead(levelName, lazy = false) {
  const L = READ_LEVELS[levelName];
  const { board, tapped } = randBoard(L);
  const life = [rint(L.life[0], L.life[1]), rint(L.life[0], L.life[1])];
  const hc = [];
  const mine = randMyHand(L, hc);
  if (!mine) return null;
  const opLands = rint(1, 5);
  const myFly = board.me.some(c => c.fly), myBig = board.me.some(c => c.p >= 4);
  const pool = CARD_IDS.filter(id => (id === 'REBUKE' ? opLands >= 2 : CARDS[id].cost <= opLands)
    && !(id === 'WINGS' && !myFly) && !(id === 'MOVE' && !myBig));
  const cards = [];
  for (let guard = 0; cards.length < L.nCards && guard < 50; guard++) {
    if (Math.random() < L.creatureP[1]) {
      const c = randHandCreature(1);
      if (c.cost > opLands) continue;
      cards.push('C' + hc.length); hc.push(c);
    } else {
      if (!pool.length) continue;
      const id = pool[rint(0, pool.length - 1)];
      if (!cards.includes(id)) cards.push(id);
    }
  }
  if (cards.length < L.nCards) return null;
  const scen = cards.concat([null]);
  const spec = { level: levelName, board, life, tapped, hand: [mine.hand, []], lands: [mine.lands, opLands], scen, hc };
  for (const tp of [PRE_TRICK, 0]) {
    let p;
    deadline = Date.now() + (tp ? 25000 : 60000);
    try { p = solveRead(spec, tp, lazy); }
    catch (e) { if (e === ABORT) return null; throw e; } finally { deadline = 0; }
    if (!readOK(p, scen)) return null;
    if (!tp) return p;
  }
}
function readOK(p, scen) {
  const options = p.opts;
  if (options.length < 2) return false;
  if (!options.some(canWin)) return false;               // どの手でも勝てない
  const maxEv = gradeRead(options), minEv = Math.min(...options.map(o => o.ev));
  if (maxEv < 0.3 || maxEv - minEv < 0.25) return false;
  // 候補ごとに「結果が最善の手」が割れていること（全候補で最善になる手がない）
  const bestSets = scen.map((_, i) => { const m = Math.max(...options.map(o => o.cells[i].score)); return new Set(options.filter(o => o.cells[i].score === m).map(optKey)); });
  if (options.some(o => bestSets.every(s => s.has(optKey(o))))) return false;
  return options.filter(o => o.grade === 'best').length / options.length <= 0.5;
}
function generateRead(levelName, budgetMs = 30000, lazy = false) {
  const t0 = Date.now(); let tries = 0;
  while (Date.now() - t0 < budgetMs) { tries++; const p = tryRead(levelName, lazy); if (p) { p.tries = tries; p.ms = Date.now() - t0; return p; } }
  return null;
}

if (typeof module !== 'undefined') module.exports = { CARDS, CARD_IDS, makeSolver, initialState, advance, rootOptions, WIN, P, T, classify, gradeOptions, generate, generateRead, solveFdn, solveRead, LEVELS, READ_LEVELS, _t: { gradeRead, canWin, resolveSpell, castOptions, combatDamage, sba, clone, newCreature, setHandCreatures, makeVanilla, ccCombat, setNoVanilla: v => { disableVanilla = v; }, readOK, fdnOK } };
