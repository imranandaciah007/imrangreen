import json,requests,time
d={x['id']:x for x in json.load(open('docs.json'))}
r=json.load(open('results.json'))
for n,x in enumerate(r):
  if 'error' in x and '429' in x['error']:
    time.sleep(8)
    try: r[n]=requests.post('http://localhost:8080/api/tmp-fin-read',json=[d[x['id']]],timeout=200).json()[0]
    except Exception as e: pass
    json.dump(r,open('results.json','w')); print(n,'error' in r[n],flush=True)
print('DONE',flush=True)
