import json,requests
d=json.load(open('docs.json')); out=[]
for i in range(0,len(d),4):
  try: out+=requests.post('http://localhost:8080/api/tmp-fin-read',json=d[i:i+4],timeout=300).json()
  except Exception as e: out+=[{"id":x["id"],"error":str(e)[:100]} for x in d[i:i+4]]
  json.dump(out,open('results.json','w')); print(i,flush=True)
print('DONE',flush=True)
