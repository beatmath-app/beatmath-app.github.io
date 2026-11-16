const E=require('./engine2.js'); const fs=require('fs');
const [,,out,...jobs]=process.argv; // jobs like easy:40 hard:20
for(const j of jobs){ const [lv,n]=j.split(':');
  for(let i=0;i<+n;i++){ const p=E.generateRead(lv,240000); if(p){ fs.appendFileSync(out, JSON.stringify(p)+'\n'); console.log(lv,i,p.tries,p.ms); } }
}
