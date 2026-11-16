import assert from 'node:assert/strict';
globalThis.window=new EventTarget();
globalThis.localStorage=(()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};})();
globalThis.setInterval=()=>0;
let credentials, visible=[], legacy=[], folder='';
globalThis.google={accounts:{oauth2:{initTokenClient(c){credentials=c;return {requestAccessToken(){c.callback({access_token:'test-token',expires_in:3600,scope:c.scope});}}}}}};
globalThis.fetch=async (u,o={})=>{
 const url=new URL(u);
 if(url.pathname.includes('/upload/')){const body=o.body.split('Content-Type: application/json; charset=UTF-8\r\n\r\n')[2].split('\r\n--')[0];visible.unshift(JSON.parse(body));return Response.json({id:'saved'});}
 if(url.pathname.endsWith('/files') && o.method==='POST'){folder='folder123';return Response.json({id:folder});}
 if(url.pathname.endsWith('/files')){const q=url.searchParams.get('q');if(q?.includes('mimeType'))return Response.json({files:folder?[{id:folder}]:[]});const a=url.searchParams.get('spaces')==='appDataFolder'?legacy:visible;return Response.json({files:a.map((v,i)=>({id:(url.searchParams.get('spaces')==='appDataFolder'?'legacy':'visible')+i}))});}
 const id=url.pathname.split('/').pop();return Response.json(id.startsWith('legacy')?legacy[Number(id.slice(6))]:visible[Number(id.slice(7))]);
};
const {state,save}=await import('../js/store.js');
const {learningSnapshot}=await import('../js/cloud-records.js');
const service=await import('../js/drive-sync.js');
legacy=[learningSnapshot(state)];
await service.prepareDrive();await service.signInDrive();
await new Promise(resolve=>setTimeout(resolve,40));
assert.equal(folder,'folder123');assert.equal(visible.length,1,'legacy backup copied to visible folder');
assert.deepEqual(visible[0],legacy[0]);
state.words.push({w:'take'});save(true);await service.syncDrive();
assert.equal(visible[0].data.words[0].w,'take');assert(!JSON.stringify(visible[0]).includes('test-token'));
let latest;const unsub=service.subscribeDrive(s=>latest=s);assert.equal(latest.folder,'folder123');assert.equal(latest.connected,true);unsub();
service.disconnectDrive();console.log('Legacy migration, visible folder, automatic save scheduling and Drive sync verified');

