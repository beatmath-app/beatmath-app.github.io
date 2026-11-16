import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('hosted', exist_ok=True)
import json, glob
bank={'easy':[],'normal':[],'hard':[]}
for f in sorted(glob.glob('bank/*.jsonl')):
    for line in open(f):
        line=line.strip()
        if not line: continue
        p=json.loads(line)
        for k in ('tries','ms','trickPly'): p.pop(k,None)
        for o in p['opts']:
            for c in o['cells']: c.pop('value',None)
        bank[p['level']].append(p)
bj=json.dumps(bank,ensure_ascii=False,separators=(',',':'))
assert '</script' not in bj
t3=open('template3.html').read()
base=t3[t3.index('<style>')+7:t3.index('</style>')]
t=open('template4.html').read().replace('/*BASECSS*/',base); e1=open('engine.js').read(); e2=open('engine2.js').read()
assert '</script' not in e1+e2
full=t.replace('/*BANK*/',bj).replace('/*ENGINE1*/',e1).replace('/*ENGINE2*/',e2)
open('index.html','w').write(full)
head=open('hosted_head.html').read()
open('hosted/index.html','w').write(full.replace('<!--HEAD_EXTRA-->',head,1))
print({k:len(v) for k,v in bank.items()}, 'bank KB', len(bj.encode())//1024)
