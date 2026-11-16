/* User-initiated, non-destructive Drive sync for the Windows local app. */
import { state } from './store.js';
import { openModal, esc } from './ui.js';
import { learningSnapshot, compareSnapshots, applyLearningSnapshot } from './cloud-records.js';
import { createDriveClient } from './drive-api.js';
import { createGoogleWebAuth } from './google-web-auth.js';
import { GOOGLE_WEB_CLIENT_ID } from './google-web-config.js';

const BASELINE = 'echolab.drive.baseline.v1';
const ROLLBACK = 'echolab.drive.restore-backup.v1';
function readBaseline() { try { const x=localStorage.getItem(BASELINE); return x ? JSON.parse(x) : null; } catch { return null; } }
function saveBaseline(snapshot) { localStorage.setItem(BASELINE, JSON.stringify(snapshot)); }
function restore(snapshot) {
  // Keep an independent local recovery copy before applying cloud data.
  const next = JSON.parse(JSON.stringify(state));
  applyLearningSnapshot(next, snapshot);
  localStorage.setItem(ROLLBACK, JSON.stringify(learningSnapshot(state)));
  localStorage.setItem('echolab.v1', JSON.stringify(next));
  try { saveBaseline(snapshot); } catch { /* Data is saved; next sync will ask before resolving differences. */ }
  location.reload();
}

export function mountDriveSettings(root) {
  const status=root.querySelector('#driveStatus'), connect=root.querySelector('#driveConnect'), sync=root.querySelector('#driveSync'), disconnect=root.querySelector('#driveDisconnect'), recover=root.querySelector('#driveRecover');
  if (!status) return () => {};
  let busy=false, stopped=false, ready=false;
  const show=(message)=>{ if(!stopped) status.textContent=message; };
  function buttons(connected) { connect.hidden=connected; sync.hidden=!connected; disconnect.hidden=!connected; }
  const auth=createGoogleWebAuth({clientId:GOOGLE_WEB_CLIENT_ID, onChange:connected=>{ if(!stopped) buttons(connected); }});
  async function prepare() {
    connect.disabled=true; show('正在准备 Google 登录…');
    try { await auth.prepare(); ready=true; connect.disabled=false; show('尚未连接。学习记录保存在本机。'); }
    catch(e) { ready=false; connect.disabled=false; show(e.message || 'Google 登录暂不可用，请重试。'); }
  }
  async function executeSync() {
    if (busy) return; busy=true; sync.disabled=true;
    try {
      show('正在检查云端记录…');
      const token=auth.currentToken(); if (!token) throw new Error('Google 登录已过期，请重新登录。');
      const drive=createDriveClient(token); const list=await drive.list();
      const remote=list.length ? await drive.read(list[0].id) : null;
      const localSnapshot=learningSnapshot(state); const choice=compareSnapshots(localSnapshot, remote, readBaseline()).action;
      if(choice==='unchanged'){ saveBaseline(localSnapshot); show('本机和云端记录一致。'); }
      else if(choice==='upload'){ await drive.create(localSnapshot); saveBaseline(localSnapshot); show('学习记录已备份到 Google Drive。'); }
      else {
        show('本机与云端记录不同，请选择如何处理。');
        openModal({ title:'选择要保留的学习记录', body:`<p>本机和 Google Drive 中都有不同的学习记录。请选择要同步的版本；云端已有备份不会被删除。</p><p>选择云端版本前，会在本机留一份恢复前的记录。</p>${list[0]?.modifiedTime ? `<p>云端备份时间：${esc(new Date(list[0].modifiedTime).toLocaleString())}</p>` : ''}`, actions:[
          {label:'取消'},
          {label:'使用云端记录',onClick:()=>{ try { restore(remote); } catch { show('无法保存本地恢复副本，未修改本机记录。'); } }},
          {label:'上传本机记录',primary:true,onClick:()=>{ (async()=>{ try { const snapshot=learningSnapshot(state); await drive.create(snapshot); saveBaseline(snapshot); show('本机记录已备份到 Google Drive。'); } catch(e){show(e.message || '同步失败，记录仍保存在本机。');} })(); }}
        ]});
      }
    } catch(e) { show(e.message || '同步失败，记录仍保存在本机。'); }
    finally { busy=false; sync.disabled=false; }
  }
  connect.addEventListener('click', ()=>{
    if (!ready) { prepare(); return; }
    connect.disabled=true; show('请在登录窗口中完成 Google 授权。');
    auth.signIn().then(()=>{
      localStorage.removeItem(BASELINE);
      show('已连接 Google Drive。可手动同步学习记录。');
    }).catch(e=>show(e.message || 'Google 登录未完成，请重试。')).finally(()=>{ connect.disabled=false; });
  });
  sync.addEventListener('click',executeSync);
  disconnect.addEventListener('click', ()=>{ auth.disconnect(); localStorage.removeItem(BASELINE); show('已在本机断开连接，云端备份仍然保留。'); });
  if (recover) {
    recover.hidden = !localStorage.getItem(ROLLBACK);
    recover.addEventListener('click', () => openModal({ title:'找回恢复前的记录？', body:'<p>将恢复上一次从云端同步前保存的本机学习记录。当前记录会作为新的本地恢复副本保存。</p>', actions:[{label:'取消'}, {label:'确认恢复',primary:true,onClick:()=>{ try { restore(JSON.parse(localStorage.getItem(ROLLBACK))); } catch { show('无法恢复本地记录。'); } }}] }));
  }
  buttons(false); prepare();
  return ()=>{stopped=true;};
}
