import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=await mkdtemp(path.join(tmpdir(),'echolab-auth-test-'));
const psQuote = s => "'" + s.replaceAll("'", "''") + "'";
let child;
try {
  for (const name of ['serve.ps1','update.ps1']) await copyFile(path.join(root,'tools',name),path.join(dir,name));
  let oauth=await readFile(path.join(root,'tools','google-drive.ps1'),'utf8');
  for (const [key,name] of [['DriveClientProtectedPath','missing-client.dat'],['DriveClientPath','client.json'],['DriveTokenPath','token.dat']]) {
    oauth=oauth.replace(new RegExp('^\\$script:'+key+' = .*$','m'),`$script:${key} = ${psQuote(path.join(dir,name))}`);
  }
  await writeFile(path.join(dir,'google-drive.ps1'), '\ufeff'+oauth.replace(/^\ufeff/,''),'utf8');
  await writeFile(path.join(dir,'client.json'),JSON.stringify({installed:{client_id:'369284980666-33pkholrvbdslhaoaormd15dph9artfp.apps.googleusercontent.com',client_secret:'fixture-secret-not-real'}}));
  const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const origin=`http://127.0.0.1:${port}`;
  child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(dir,'serve.ps1'),'-Root',root,'-Port',String(port),'-NoBrowser'],{windowsHide:true,stdio:'ignore'});
  let ready=false;
  for(let i=0;i<50;i++){try{await fetch(origin);ready=true;break}catch{await new Promise(r=>setTimeout(r,100));}}
  assert(ready,'test server did not start');
  const request=(pathname,body,requestOrigin=origin)=>fetch(origin+pathname,{method:'POST',headers:{Origin:requestOrigin,'X-EchoLab-Drive':'1','Content-Type':'application/json'},body});
  let r=await request('/api/drive/start','{}','https://example.com');assert.equal(r.status,403);
  r=await fetch(origin+'/tools/google-drive.ps1');assert.equal(r.status,403);
  r=await fetch(origin+'/t%6fols/google-drive.ps1');assert.equal(r.status,403);
  r=await request('/api/drive/start','{}');assert.equal(r.status,200);const {url}=await r.json();const auth=new URL(url);
  assert.equal(auth.origin,'https://accounts.google.com');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
  assert.equal(auth.searchParams.get('scope'),'https://www.googleapis.com/auth/drive.appdata');assert(!url.includes('fixture-secret-not-real'));
  r=await fetch(origin+'/api/drive/callback?state=invalid&code=invalid');assert.equal(r.status,400);
  console.log('Built-in OAuth configuration, backend protection, origin and state checks verified');
} finally {
  child?.kill();
  await new Promise(r=>setTimeout(r,200));
  await rm(dir,{recursive:true,force:true});
}
