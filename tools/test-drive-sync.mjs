import assert from 'node:assert/strict';
globalThis.window=new EventTarget();
globalThis.localStorage=(()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};})();
globalThis.setInterval=()=>0;
let visible=[], hidden=[], folder='folder123', folderQueries=0;
globalThis.google={accounts:{oauth2:{initTokenClient(c){return {requestAccessToken(){c.callback({access_token:'test-token',expires_in:3600,scope:c.scope});}}}}}};
globalThis.fetch=async (u,o={})=>{
 const url=new URL(u);
 if(url.pathname.endsWith('/about'))return Response.json({user:{permissionId:'account123'}});
 if(url.pathname.includes('/upload/')){const parts=o.body.split('Content-Type: application/json; charset=UTF-8\r\n\r\n');const metadata=JSON.parse(parts[1].split('\r\n--')[0]);const body=JSON.parse(parts[2].split('\r\n--')[0]);assert.deepEqual(metadata.parents,['appDataFolder']);hidden.unshift({body,appProperties:metadata.appProperties});return Response.json({id:'saved'});}
 if(url.pathname.endsWith('/files')){const q=url.searchParams.get('q');if(q?.includes('mimeType')){folderQueries++;return Response.json({files:folder?[{id:folder}]:[]});}const isHidden=url.searchParams.get('spaces')==='appDataFolder',a=isHidden?hidden:visible;return Response.json({files:a.map((v,i)=>({id:(isHidden?'hidden':'visible')+i,appProperties:v.appProperties}))});}
 const id=url.pathname.split('/').pop();return Response.json((id.startsWith('hidden')?hidden[Number(id.slice(6))]:visible[Number(id.slice(7))]).body);
};
const {state,save}=await import('../js/store.js');
const {learningSnapshot}=await import('../js/cloud-records.js');
const service=await import('../js/drive-sync.js');
visible=[{body:learningSnapshot(state)}];
await service.prepareDrive();await service.signInDrive();
await new Promise(resolve=>setTimeout(resolve,40));
assert.equal(hidden.length,1,'visible backup copied to hidden app-data');
assert.deepEqual(hidden[0].body,visible[0].body);assert.equal(hidden[0].appProperties.visibleMigration,'done');
let info=JSON.parse(localStorage.getItem('echolab.drive.sync-info.v1'));
assert.equal(info.account,'account123');assert(info.time>0);assert.equal(info.bytes,new TextEncoder().encode(JSON.stringify(hidden[0].body)).byteLength);
state.words.push({w:'take'});save(true);await service.syncDrive();
assert.equal(hidden[0].body.data.words[0].w,'take');assert.equal(folderQueries,1,'visible folder is not consulted after migration');
info=JSON.parse(localStorage.getItem('echolab.drive.sync-info.v1'));assert.equal(info.bytes,new TextEncoder().encode(JSON.stringify(hidden[0].body)).byteLength);
assert(!JSON.stringify(hidden[0]).includes('test-token'));
let latest;const unsub=service.subscribeDrive(s=>latest=s);assert.equal(latest.connected,true);unsub();
service.disconnectDrive();console.log('Visible-to-hidden migration, automatic sync, account isolation and token exclusion verified');
