/* User-initiated, non-destructive Drive sync for the Windows local app. */
import { state } from './store.js';
import { openModal, esc } from './ui.js';
import { learningSnapshot, compareSnapshots, applyLearningSnapshot } from './cloud-records.js';
import { createDriveClient } from './drive-api.js';

const BASELINE = 'echolab.drive.baseline.v1';
const ROLLBACK = 'echolab.drive.restore-backup.v1';
const CLIENT_PATH = '%LOCALAPPDATA%\\EchoLab\\google-oauth.json';

async function local(action) {
  const res = await fetch(`/api/drive/${action}`, { method:'POST', headers:{'X-EchoLab-Drive':'1'}, cache:'no-store' });
  let body; try { body = await res.json(); } catch { throw new Error('请先重新启动 EchoLab 本地服务。'); }
  if (!res.ok) throw new Error(body.error || 'Google Drive 服务暂不可用。');
  return body;
}
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
  let currentToken='', busy=false, timer=0, stopped=false;
  const show=(message)=>{ if(!stopped) status.textContent=message; };
  function buttons(connected) { connect.hidden=connected; sync.hidden=!connected; disconnect.hidden=!connected; }
  async function refresh() {
    try { const result=await local('token'); currentToken=result.accessToken || ''; buttons(Boolean(currentToken)); show(currentToken ? '已连接 Google Drive。可手动同步学习记录。' : '尚未连接。学习记录保存在本机。'); return Boolean(currentToken); }
    catch { currentToken=''; buttons(false); show('请重启 EchoLab；连接需要 Windows 本地服务。'); return false; }
  }
  async function executeSync() {
    if (busy) return; busy=true; sync.disabled=true;
    try {
      show('正在检查云端记录…');
      const auth=await local('token'); if (!auth.accessToken) throw new Error('Google 账号未连接，请重新连接。');
      const drive=createDriveClient(auth.accessToken); const list=await drive.list();
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
  connect.addEventListener('click', async()=>{
    const popup=window.open('about:blank','_blank');
    connect.disabled=true; show('正在准备 Google 授权…');
    try { const result=await local('start'); if(!result.url?.startsWith('https://accounts.google.com/')) throw new Error('授权地址无效。'); if(popup) popup.location.href=result.url; else { show('浏览器阻止了弹窗，请允许弹窗后重试。'); return; } show('请在新窗口中完成 Google 授权，然后返回这里。'); }
    catch(e) { popup?.close(); show(`${e.message || '无法开始授权。'} 请确认客户端配置文件已放到 ${CLIENT_PATH}`); }
    finally { connect.disabled=false; }
  });
  sync.addEventListener('click',executeSync);
  disconnect.addEventListener('click', async()=>{ try { await local('disconnect'); localStorage.removeItem(BASELINE); currentToken=''; buttons(false); show('已在本机断开连接，云端备份仍然保留。'); } catch(e) {show(e.message);} });
  if (recover) {
    recover.hidden = !localStorage.getItem(ROLLBACK);
    recover.addEventListener('click', () => openModal({ title:'找回恢复前的记录？', body:'<p>将恢复上一次从云端同步前保存的本机学习记录。当前记录会作为新的本地恢复副本保存。</p>', actions:[{label:'取消'}, {label:'确认恢复',primary:true,onClick:()=>{ try { restore(JSON.parse(localStorage.getItem(ROLLBACK))); } catch { show('无法恢复本地记录。'); } }}] }));
  }
  const onFocus=()=>{ if(!busy) refresh(); }; window.addEventListener('focus',onFocus);
  refresh();
  return ()=>{stopped=true;clearTimeout(timer);window.removeEventListener('focus',onFocus);};
}
