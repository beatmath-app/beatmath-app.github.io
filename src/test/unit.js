const E=require('../engine2.js'), U=E._t;
let fails=0; const ok=(c,m)=>{ if(!c){fails++;console.log('FAIL',m);} else console.log('ok  ',m); };
U.setHandCreatures({me:[],op:[]},[]);
const H=h=>h.map(x=>x?[x]:[]);
function st(me,op,opt={}){ const s=E.initialState({me,op},opt.life||[20,20],H(opt.hand||[null,null]),opt.lands||[5,5],0); Object.assign(s,opt.s||{}); return s; }
const C=(p,t,x={})=>Object.assign({p,t},x);
// 1 fizzle: GG on A, Abrade resolves first and kills A
{ const s=st([C(2,2)],[C(3,3)]); const ev=[]; U.resolveSpell(s,{c:'ABRADE',by:1,tg:[[0,0]]},ev); U.resolveSpell(s,{c:'GG',by:0,tg:[[0,0]]},ev);
  ok(!s.cr[0][0].alive && ev.some(e=>e.t==='fizzle'&&e.c==='GG'),'対応の削剥で巨大化が立ち消え'); }
// 2 GG in response to Abrade saves
{ const s=st([C(2,2)],[C(3,3)]); const ev=[]; U.resolveSpell(s,{c:'GG',by:0,tg:[[0,0]]},ev); U.resolveSpell(s,{c:'ABRADE',by:1,tg:[[0,0]]},ev);
  ok(s.cr[0][0].alive,'削剥に対応して巨大化で生存'); }
// 3 Veil makes Stab fizzle
{ const s=st([C(2,2)],[C(3,3)]); const ev=[]; U.resolveSpell(s,{c:'VEIL',by:0,tg:[[0,0]]},ev); U.resolveSpell(s,{c:'STAB',by:1,tg:[[0,0]]},ev);
  ok(s.cr[0][0].alive && E.T(s.cr[0][0])===3 && ev.some(e=>e.t==='fizzle'),'蛇皮のヴェール(呪禁)で突き刺しが立ち消え'); }
// 4 indestructible: survives damage & destroy, dies to -X/-X
{ const s=st([C(2,2)],[C(3,3)]); const ev=[]; U.resolveSpell(s,{c:'DIVINE',by:0,tg:[[0,0]]},ev); U.resolveSpell(s,{c:'ABRADE',by:1,tg:[[0,0]]},ev); U.resolveSpell(s,{c:'DOWNFALL',by:1,tg:[[0,0]]},ev);
  ok(s.cr[0][0].alive,'破壊不能はダメージ・破壊で死なない'); U.resolveSpell(s,{c:'STAB',by:1,tg:[[0,0]]},ev); ok(!s.cr[0][0].alive,'破壊不能でもタフネス0以下で死ぬ'); }
// 5 Make Your Move needs power>=4 on resolution
{ const s=st([C(4,4)],[C(3,3)]); const ev=[]; s.cr[0][0].tp-=1; U.resolveSpell(s,{c:'MOVE',by:1,tg:[[0,0]]},ev); ok(s.cr[0][0].alive && ev.some(e=>e.t==='fizzle'),'次の一手：解決時パワー3なら立ち消え'); }
// 6 first strike blocker kills attacker before it deals damage
{ const s=st([C(4,4)],[C(2,2)]); s.cr[0][0].tap=true; s.atk=1; s.blk=[0]; s.phase='dmg'; s.cr[1][0].tp+=3; s.cr[1][0].fs=true;
  const outs=U.combatDamage(s); const r=outs[0].s; ok(!r.cr[0][0].alive && r.cr[1][0].alive,'確実な一撃のブロッカー(5/2先制)が4/4を一方的に倒す'); }
// 7 Fleeting Flight prevents combat damage to it
{ const s=st([C(2,2)],[C(5,5)]); s.atk=1; s.blk=[0]; s.phase='dmg'; const ev=[]; U.resolveSpell(s,{c:'FLIGHT',by:0,tg:[[0,0]]},ev);
  const r=U.combatDamage(s)[0].s; ok(r.cr[0][0].alive && E.T(r.cr[0][0])===3,'束の間の飛行：戦闘ダメージ軽減で生存、+1/+1カウンター'); }
// 8 Joust only on attacking/blocking creature
{ const s=st([C(2,2),C(2,2)],[C(3,3)],{hand:[null,'JOUST']}); s.atk=1; s.blk=[-1]; s.phase='w3'; s.win={prio:1,passes:0,stack:[]};
  const o=U.castOptions(s,1); ok(o.length===1 && o[0].tg[0][1]===0,'突き通しは攻撃中のクリーチャーのみ対象'); }
// 9 Burst kicker with 5 lands → 4 dmg, face only if lethal
{ const s=st([C(2,2)],[C(4,4)],{hand:['BURST',null],lands:[5,1],life:[20,4]}); s.phase='w4'; s.win={prio:0,passes:0,stack:[]};
  const o=U.castOptions(s,0); ok(o.every(x=>x.kick) && o.some(x=>x.tg[0][0]==='P'),'噴出の稲妻：土地5でキッカー4点、致死ならプレイヤーも対象'); }
// 10 double block: 5/5 attacker with 1 dmg already on 3/3 blocker → can kill both 3/3(needs2) and 3/3(3)
{ const s=st([C(5,5)],[C(3,3),C(3,3)]); s.atk=1; s.blk=[0,0]; s.phase='dmg'; s.cr[1][0].dmg=1;
  const outs=U.combatDamage(s); ok(outs.some(o=>!o.s.cr[1][0].alive&&!o.s.cr[1][1].alive),'ダブルブロック：ダメージ割り振りで両方倒せる（現行ルール）'); }
// 11 Rebuke cost 2 only vs tapped
{ const s=st([C(3,3),C(3,3)],[C(1,1)],{hand:[null,'REBUKE'],lands:[1,2]}); s.cr[0][0].tap=true; s.atk=1; s.phase='w2'; s.win={prio:1,passes:0,stack:[]};
  const o=U.castOptions(s,1); ok(o.length===1&&o[0].tg[0][1]===0,'光明の叱責：タップ状態なら2マナ（アンタップには5マナ）'); }
console.log(fails?`${fails} FAILED`:'ALL PASS');
